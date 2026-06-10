import { Router, Request, Response } from 'express';
import express from 'express';
import https from 'https';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { asyncHandler, ApiError } from '../../lib/http';
import { createPaytrToken, verifyPaytrCallback, PaytrConfig } from '../payment/paytr';
import { getTami, tamiInitAuth, tamiComplete3ds, verifyTamiCallback } from '../tami/tami.service';
import { botReply, offeredTicket } from '../bot/engine';
import { summarizeTicket } from '../bot/llm';
import { promoteReserved, campaignAdjust } from '../store/live.routes';
import { nextOrderNo } from '../store/store.routes';

const router = Router();

// Instagram kullanıcı adı gerçekten var mı? -> 'exists' | 'missing' | 'unknown'
// - Format hatalıysa kesin 'missing' (kayıt reddedilir).
// - Canlı kontrol: RapidAPI "Instagram Scraper Stable" üzerinden yapılır (INSTAGRAM_RAPIDAPI_KEY).
//   Var: 200 + JSON içinde username/pk. Yok: 200 + { error: "...does not exist..." }.
//   Anahtar yoksa / API erişilemezse / kota dolarsa -> 'unknown' (kayıt engellenmez, fail-open).
// - Aynı kullanıcı adı tekrar sorgulanmaz (önbellek) -> kota korunur.
const igCache = new Map<string, { state: 'exists' | 'missing'; exp: number }>();
const IG_TTL_EXISTS = 1000 * 60 * 60 * 24 * 30; // var olanlar 30 gün
const IG_TTL_MISSING = 1000 * 60 * 30;          // olmayanlar 30 dk (sonradan açılabilir)

// IPv4'e zorlanmış HTTPS POST (sunucunun IPv6 rotası RapidAPI'ye takılıyor; family:4 ile çözülür)
function httpsPostForm(host: string, path: string, headers: Record<string, string>, body: string, timeoutMs: number): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { method: 'POST', host, path, family: 4, headers: { ...headers, 'Content-Length': Buffer.byteLength(body) }, timeout: timeoutMs },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode || 0, text: data }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

async function instagramKullaniciVarMi(raw: string): Promise<'exists' | 'missing' | 'unknown'> {
  const u = String(raw || '').trim().replace(/^@+/, '').toLowerCase();
  // Format kontrolü: 1-30 karakter, yalnız harf/rakam/nokta/alt çizgi; ardışık nokta yok; nokta ile başlamaz/bitmez
  if (!/^[a-z0-9._]{1,30}$/.test(u) || /\.\./.test(u) || u.startsWith('.') || u.endsWith('.')) return 'missing';
  const cached = igCache.get(u);
  if (cached && cached.exp > Date.now()) return cached.state;
  const key = (process.env.INSTAGRAM_RAPIDAPI_KEY || '').trim();
  if (!key) return 'unknown'; // anahtar tanımlı değilse kontrol pasif
  const host = (process.env.INSTAGRAM_RAPIDAPI_HOST || 'instagram-scraper-stable-api.p.rapidapi.com').trim();
  const path = (process.env.INSTAGRAM_RAPIDAPI_PATH || '/ig_get_fb_profile_v3.php').trim();
  try {
    const resp = await httpsPostForm(
      host, path,
      { 'Content-Type': 'application/x-www-form-urlencoded', 'x-rapidapi-host': host, 'x-rapidapi-key': key },
      'username_or_url=' + encodeURIComponent(u),
      9000,
    );
    if (resp.status === 200) {
      let j: any = null;
      try { j = JSON.parse(resp.text); } catch { j = null; }
      if (j && typeof j === 'object') {
        if (j.username || j.pk || j.id) { igCache.set(u, { state: 'exists', exp: Date.now() + IG_TTL_EXISTS }); return 'exists'; }
        if (j.error) { igCache.set(u, { state: 'missing', exp: Date.now() + IG_TTL_MISSING }); return 'missing'; }
      }
      return 'unknown';
    }
    // 401/403 (abonelik), 429 (kota), 5xx -> kesin değil
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

async function getPaytr(tenantId: string): Promise<{ config: PaytrConfig; testMode: boolean } | null> {
  const s = await prisma.integrationSetting.findFirst({ where: { tenantId, provider: 'paytr', enabled: true } });
  if (!s) return null;
  const c: any = s.config || {};
  if (!c.merchant_id || !c.merchant_key || !c.merchant_salt) return null;
  return { config: { merchant_id: c.merchant_id, merchant_key: c.merchant_key, merchant_salt: c.merchant_salt }, testMode: s.mode !== 'LIVE' };
}

// Aktif planlar (acilis sayfasi) - bireysel modda plan yok
router.get('/plans', asyncHandler(async (_req: Request, res: Response) => {
  res.json([]);
}));

// ───── Online Magaza Vitrini ─────
async function loadStore(slug: string) {
  const store = await prisma.storeSetting.findFirst({ where: { slug, active: true } });
  if (!store) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: store.tenantId }, select: { name: true } });
  let products = await prisma.product.findMany({
    where: { tenantId: store.tenantId, onlineMagaza: true, aktif: true },
    select: { id: true, ad: true, satisFiyat: true, eskiFiyat: true, oneCikan: true, images: true, aciklama: true, marka: true, cinsiyet: true, stokAdeti: true, kategoriId: true, createdAt: true, variations: { select: { ad: true, deger: true, stok: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
  });
  // Stok biten ürünleri mağaza vitrininden gizle (varyasyonlu ise toplam varyasyon stoğu, değilse stokAdeti)
  products = products.filter((p) => {
    const vars = p.variations || [];
    const stok = vars.length > 0 ? vars.reduce((s, v) => s + (v.stok || 0), 0) : (p.stokAdeti || 0);
    return stok > 0;
  });
  const order: string[] = Array.isArray(store.productOrder) ? (store.productOrder as any) : [];
  if (order.length) {
    products = products.sort((a, b) => {
      const ia = order.indexOf(a.id); const ib = order.indexOf(b.id);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }
  const categories = await prisma.productCategory.findMany({ where: { tenantId: store.tenantId }, select: { id: true, ad: true, image: true } });
  // Ürün puanları (onaylı yorumların ortalaması + adedi)
  const pids = products.map((p) => p.id);
  let ratings: Record<string, { avg: number; count: number }> = {};
  if (pids.length) {
    const gr = await prisma.productReview.groupBy({ by: ['productId'], where: { tenantId: store.tenantId, onayli: true, productId: { in: pids } }, _avg: { puan: true }, _count: { _all: true } });
    ratings = Object.fromEntries(gr.map((g) => [g.productId, { avg: g._avg.puan || 0, count: g._count._all }]));
  }
  const productsRated = products.map((p) => ({ ...p, puan: Math.round((ratings[p.id]?.avg || 0) * 10) / 10, puanSayi: ratings[p.id]?.count || 0 }));
  return { store, tenant, products: productsRated, categories };
}

router.get('/store/:slug', asyncHandler(async (req: Request, res: Response) => {
  const data = await loadStore(req.params.slug);
  if (!data) throw new ApiError(404, 'Magaza bulunamadi veya yayinda degil');
  res.json({
    name: data.tenant?.name || 'Magaza',
    logoText: data.store.logoText || data.tenant?.name,
    hero: { title: data.store.heroTitle, subtitle: data.store.heroSubtitle, image: data.store.heroImage, video: data.store.heroVideo },
    slides: Array.isArray(data.store.slides) ? data.store.slides : [],
    stories: Array.isArray(data.store.stories) ? data.store.stories : [],
    widgets: Array.isArray(data.store.widgets) ? data.store.widgets : [],
    topMenu: Array.isArray(data.store.topMenu) ? data.store.topMenu : [],
    config: data.store.config || {},
    freeShipThreshold: data.store.freeShipThreshold || 0,
    puanOrani: data.store.puanOrani || 0,
    products: data.products,
    categories: data.categories,
  });
}));

// Birincil mağaza (kök sayfa için): aktif ilk mağaza
router.get('/primary-store', asyncHandler(async (_req: Request, res: Response) => {
  const s = await prisma.storeSetting.findFirst({ where: { active: true, slug: { not: null } }, orderBy: { createdAt: 'asc' } });
  let magaza = '';
  if (s) { const t = await prisma.tenant.findUnique({ where: { id: s.tenantId }, select: { name: true } }); magaza = s.logoText || t?.name || ''; }
  res.json({ slug: s?.slug || null, magaza });
}));

// ───────── Müşteri Üyeliği (mağaza) ─────────
const shopToken = (customerId: string, tenantId: string) => jwt.sign({ customerId, tenantId, type: 'shopper' }, env.JWT_SECRET, { expiresIn: '60d' } as any);
async function shopAuth(req: Request, tenantId: string) {
  const h = req.headers.authorization || ''; const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!tok) return null;
  try { const p: any = jwt.verify(tok, env.JWT_SECRET); if (p.type !== 'shopper' || p.tenantId !== tenantId) return null; return p.customerId as string; } catch { return null; }
}
const digits = (s: string) => (s || '').replace(/\D/g, '');

router.post('/store/:slug/uye-kayit', asyncHandler(async (req: Request, res: Response) => {
  const store = await prisma.storeSetting.findFirst({ where: { slug: req.params.slug, active: true } });
  if (!store) throw new ApiError(404, 'Magaza bulunamadi');
  const t = store.tenantId;
  const { ad, telefon, sifre, instagram, email } = req.body || {};
  if (!ad || !telefon || !sifre) throw new ApiError(422, 'Ad, telefon ve şifre zorunlu');
  const tel = digits(telefon);
  // Mevcut müşteriyi telefonla bul (önceki siparişlerle eşleşsin)
  const all = await prisma.customer.findMany({ where: { tenantId: t } });
  let c = all.find((x) => digits(x.telefon || '') === tel && tel.length >= 7) || null;
  const passwordHash = await bcrypt.hash(String(sifre), 10);
  if (c) {
    if (c.passwordHash) throw new ApiError(409, 'Bu telefon zaten kayıtlı. Giriş yapın.');
    c = await prisma.customer.update({ where: { id: c.id }, data: { passwordHash, ad: ad || c.ad, instagram: instagram || c.instagram, email: email || c.email } });
  } else {
    const count = await prisma.customer.count({ where: { tenantId: t } });
    c = await prisma.customer.create({ data: { tenantId: t, musteriNo: 1000 + count + 1, ad, telefon, instagram: instagram || null, email: email || null, passwordHash, not: 'Mağaza üyesi' } });
  }
  res.status(201).json({ token: shopToken(c.id, t), musteri: { id: c.id, ad: c.ad, telefon: c.telefon, instagram: c.instagram, bakiye: c.bakiye, musteriNo: c.musteriNo } });
}));

router.post('/store/:slug/uye-giris', asyncHandler(async (req: Request, res: Response) => {
  const store = await prisma.storeSetting.findFirst({ where: { slug: req.params.slug, active: true } });
  if (!store) throw new ApiError(404, 'Magaza bulunamadi');
  const t = store.tenantId;
  const { telefon, sifre } = req.body || {};
  const tel = digits(telefon);
  const all = await prisma.customer.findMany({ where: { tenantId: t } });
  const c = all.find((x) => digits(x.telefon || '') === tel && tel.length >= 7);
  if (!c || !c.passwordHash) throw new ApiError(401, 'Telefon veya şifre hatalı');
  const ok = await bcrypt.compare(String(sifre || ''), c.passwordHash);
  if (!ok) throw new ApiError(401, 'Telefon veya şifre hatalı');
  res.json({ token: shopToken(c.id, t), musteri: { id: c.id, ad: c.ad, telefon: c.telefon, instagram: c.instagram, bakiye: c.bakiye, musteriNo: c.musteriNo } });
}));

router.get('/store/:slug/hesabim', asyncHandler(async (req: Request, res: Response) => {
  const store = await prisma.storeSetting.findFirst({ where: { slug: req.params.slug, active: true } });
  if (!store) throw new ApiError(404, 'Magaza bulunamadi');
  const cid = await shopAuth(req, store.tenantId);
  if (!cid) throw new ApiError(401, 'Oturum geçersiz');
  const c = await prisma.customer.findFirst({ where: { id: cid, tenantId: store.tenantId } });
  if (!c) throw new ApiError(404, 'Müşteri bulunamadi');
  const orders = await prisma.storeOrder.findMany({ where: { tenantId: store.tenantId, customerId: cid, durum: { not: 'sepet' } }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({
    musteri: { id: c.id, ad: c.ad, telefon: c.telefon, instagram: c.instagram, email: c.email, adres: c.adres, bakiye: c.bakiye, indirimYuzde: c.indirimYuzde, musteriNo: c.musteriNo },
    siparisler: orders.map((o) => ({ id: o.id, token: o.token, orderNo: o.orderNo, orderYil: o.orderYil, durum: o.durum, kanal: o.kanal, toplam: o.toplam, araToplam: o.araToplam, indirim: o.indirim, tahsilat: o.tahsilat, adres: o.adres, kargoTakip: o.kargoTakip, kargoFirmasi: o.kargoFirmasi, createdAt: o.createdAt, items: o.items })),
  });
}));

// Ürün detayı + yorumlar (mağaza)
router.get('/store/:slug/urun/:id', asyncHandler(async (req: Request, res: Response) => {
  const store = await prisma.storeSetting.findFirst({ where: { slug: req.params.slug, active: true } });
  if (!store) throw new ApiError(404, 'Magaza bulunamadi');
  const p = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: store.tenantId, aktif: true, onlineMagaza: true }, include: { variations: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } });
  if (!p) throw new ApiError(404, 'Ürün bulunamadi');
  const kat = p.kategoriId ? await prisma.productCategory.findFirst({ where: { id: p.kategoriId } }) : null;
  const reviews = await prisma.productReview.findMany({ where: { tenantId: store.tenantId, productId: p.id, onayli: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  const benzer = await prisma.product.findMany({ where: { tenantId: store.tenantId, aktif: true, onlineMagaza: true, kategoriId: p.kategoriId, id: { not: p.id } }, include: { variations: true }, take: 8 });
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.puan, 0) / reviews.length : 0;
  res.json({
    magaza: store.logoText || null,
    urun: { id: p.id, ad: p.ad, satisFiyat: p.satisFiyat, eskiFiyat: p.eskiFiyat, images: p.images, aciklama: p.aciklama, marka: p.marka, kategoriAd: kat?.ad || '', stokAdeti: p.stokAdeti, barkod: p.barkod, variations: (p.variations || []).map((v) => ({ ad: v.ad, deger: v.deger, stok: v.stok, ekFiyat: v.ekFiyat })) },
    yorumlar: reviews, puanOrt: Math.round(avg * 10) / 10, yorumSayi: reviews.length,
    benzer: benzer.filter((b) => { const vs = b.variations || []; const st = vs.length > 0 ? vs.reduce((s, v) => s + (v.stok || 0), 0) : (b.stokAdeti || 0); return st > 0; }).map((b) => ({ id: b.id, ad: b.ad, satisFiyat: b.satisFiyat, eskiFiyat: b.eskiFiyat, images: b.images, marka: b.marka })),
  });
}));
// Ürün görüntüleme logu (davranış analizi)
router.post('/store/:slug/urun/:id/view', asyncHandler(async (req: Request, res: Response) => {
  const store = await prisma.storeSetting.findFirst({ where: { slug: req.params.slug, active: true } });
  if (!store) return res.json({ ok: false });
  const cid = await shopAuth(req, store.tenantId);
  await prisma.productView.create({ data: { tenantId: store.tenantId, productId: req.params.id, customerId: cid || null } }).catch(() => null);
  res.json({ ok: true });
}));
// Canlı ziyaretçi takibi (presence heartbeat + akış olayı)
router.post('/store/:slug/track', asyncHandler(async (req: Request, res: Response) => {
  const store = await prisma.storeSetting.findFirst({ where: { slug: req.params.slug, active: true } });
  if (!store) return res.json({ ok: false });
  const { sessionId, screen, label, type, device } = req.body || {};
  if (!sessionId) return res.json({ ok: false });
  const t = store.tenantId;
  const sid = String(sessionId).slice(0, 60);
  const scr = String(screen || 'browse').slice(0, 32);
  const lbl = label ? String(label).slice(0, 120) : null;
  const dev = device === 'mobil' || device === 'web' ? device : null;
  await prisma.storeVisit.upsert({
    where: { tenantId_sessionId: { tenantId: t, sessionId: sid } },
    update: { screen: scr, label: lbl, ...(dev ? { device: dev } : {}) },
    create: { tenantId: t, sessionId: sid, screen: scr, label: lbl, device: dev },
  }).catch(() => null);
  if (type) {
    await prisma.storeEvent.create({ data: { tenantId: t, sessionId: sid, type: String(type).slice(0, 24), label: lbl } }).catch(() => null);
  }
  res.json({ ok: true });
}));
// Paylaşılabilir barkod kataloğu (süreli indirim geri sayımı dahil)
router.get('/katalog/:slug', asyncHandler(async (req: Request, res: Response) => {
  const store = await prisma.storeSetting.findFirst({ where: { slug: req.params.slug } });
  if (!store) throw new ApiError(404, 'Katalog bulunamadi');
  const items = await prisma.catalogItem.findMany({ where: { tenantId: store.tenantId }, orderBy: { updatedAt: 'desc' }, take: 200 });
  const prods = await prisma.product.findMany({ where: { tenantId: store.tenantId, id: { in: items.map((i) => i.productId) }, aktif: true }, include: { variations: { select: { ad: true, deger: true, stok: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } });
  const pMap = new Map(prods.map((p) => [p.id, p]));
  const now = Date.now();
  const list = items.map((i) => {
    const p: any = pMap.get(i.productId); if (!p) return null;
    const flashAktif = !!(i.flashFiyat && i.flashBitis && new Date(i.flashBitis).getTime() > now);
    return { id: i.id, productId: p.id, ad: p.ad, salesCode: p.salesCode, marka: p.marka, cinsiyet: p.cinsiyet, images: p.images, satisFiyat: p.satisFiyat, eskiFiyat: p.eskiFiyat, stokAdeti: p.stokAdeti, variations: p.variations, flashFiyat: flashAktif ? i.flashFiyat : null, flashBitis: flashAktif ? i.flashBitis : null };
  }).filter(Boolean);
  const cfg: any = store.config || {};
  res.json({ ad: store.logoText || 'Ürün Kataloğu', logo: cfg.logo || store.heroImage || '', slug: store.slug, magazaAktif: store.active, items: list });
}));
// Yorum gönder
router.post('/store/:slug/urun/:id/yorum', asyncHandler(async (req: Request, res: Response) => {
  const store = await prisma.storeSetting.findFirst({ where: { slug: req.params.slug, active: true } });
  if (!store) throw new ApiError(404, 'Magaza bulunamadi');
  const p = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: store.tenantId } });
  if (!p) throw new ApiError(404, 'Ürün bulunamadi');
  const { ad, puan, yorum, gorsel } = req.body || {};
  if (!ad || !String(ad).trim()) throw new ApiError(422, 'Ad zorunlu');
  const r = await prisma.productReview.create({ data: { tenantId: store.tenantId, productId: p.id, ad: String(ad).slice(0, 60), puan: Math.min(5, Math.max(1, Number(puan) || 5)), yorum: yorum ? String(yorum).slice(0, 1000) : null, gorsel: gorsel ? String(gorsel).slice(0, 2_000_000) : null, onayli: true } });
  res.status(201).json(r);
}));

// Sepet siparişi oluştur (videolu mağaza → asistana devir). Stok düşmez, durum 'sepet'.
router.post('/store/:slug/cart-order', asyncHandler(async (req: Request, res: Response) => {
  const store = await prisma.storeSetting.findFirst({ where: { slug: req.params.slug, active: true } });
  if (!store) throw new ApiError(404, 'Magaza bulunamadi');
  const tenantId = store.tenantId;
  const { items, musteri } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(422, 'Sepet boş');
  const prods = await prisma.product.findMany({ where: { tenantId, id: { in: items.map((x: any) => x.productId) }, aktif: true }, include: { variations: true } });
  const pMap = new Map(prods.map((p) => [p.id, p]));
  const orderItems: any[] = []; let ara = 0;
  for (const it of items) {
    const p: any = pMap.get(it.productId); if (!p) continue;
    const adet = Math.max(1, Number(it.adet) || 1);
    let fiyat = p.satisFiyat;
    if (it.varyasyon) { const v = (p.variations || []).find((x: any) => x.deger === it.varyasyon); if (v) fiyat += v.ekFiyat || 0; }
    ara += fiyat * adet;
    orderItems.push({ productId: p.id, ad: p.ad + (it.varyasyon ? ` (${it.varyasyon})` : ''), varyasyon: it.varyasyon || null, adet, fiyat });
  }
  if (orderItems.length === 0) throw new ApiError(422, 'Geçerli ürün yok');
  const kamp = await campaignAdjust(prisma, tenantId, orderItems);
  // müşteri (opsiyonel hızlı kayıt)
  let customerId: string | null = null; let handle: string | null = null;
  if (musteri && (musteri.telefon || musteri.instagram || musteri.ad)) {
    const ccount = await prisma.customer.count({ where: { tenantId } });
    const c = await prisma.customer.create({ data: { tenantId, musteriNo: 1000 + ccount + 1, ad: musteri.ad || musteri.instagram || musteri.telefon || 'Mağaza Müşterisi', telefon: musteri.telefon || null, instagram: musteri.instagram || null, not: 'Videolu mağaza' } });
    customerId = c.id; handle = musteri.instagram || musteri.ad || null;
  }
  const token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  const order = await prisma.storeOrder.create({ data: { tenantId, ...(await nextOrderNo(prisma, tenantId)), kanal: 'online', durum: 'sepet', token, customerId, musteriHandle: handle, items: orderItems, araToplam: kamp.araToplam, indirim: kamp.indirim, kampanyalar: kamp.kampanyalar, toplam: kamp.toplam } });
  res.status(201).json({ token: order.token, sohbet: store.slug });
}));

// Sepet önizleme: kampanya + kupon indirimini canlı hesapla (ödeme öncesi gösterim)
router.post('/store/:slug/cart-preview', asyncHandler(async (req: Request, res: Response) => {
  const store = await prisma.storeSetting.findFirst({ where: { slug: req.params.slug, active: true } });
  if (!store) throw new ApiError(404, 'Magaza bulunamadi');
  const tenantId = store.tenantId;
  const { items, discountCode } = req.body || {};
  const bos = { araToplam: 0, kampanyaIndirim: 0, kampanyalar: [], kuponIndirim: 0, kuponGecerli: false, kuponKod: null as string | null, toplam: 0, freeShipThreshold: store.freeShipThreshold || 0 };
  if (!Array.isArray(items) || items.length === 0) return res.json(bos);
  const prods = await prisma.product.findMany({ where: { tenantId, id: { in: items.map((x: any) => x.productId) }, aktif: true }, include: { variations: true } });
  const pMap = new Map(prods.map((p) => [p.id, p]));
  const orderItems: any[] = [];
  for (const it of items) {
    const p: any = pMap.get(it.productId); if (!p) continue;
    const adet = Math.max(1, Number(it.adet) || 1);
    let fiyat = p.satisFiyat;
    if (it.varyasyon) { const v = (p.variations || []).find((x: any) => x.deger === it.varyasyon); if (v) fiyat += v.ekFiyat || 0; }
    orderItems.push({ productId: p.id, ad: p.ad, adet, fiyat });
  }
  if (orderItems.length === 0) return res.json(bos);
  const ara = orderItems.reduce((s, it) => s + it.fiyat * it.adet, 0);
  const kamp = await campaignAdjust(prisma, tenantId, orderItems);
  let kuponIndirim = 0; let kuponGecerli = false; let kuponKod: string | null = null;
  if (discountCode) {
    const d = await prisma.discountCode.findFirst({ where: { tenantId, code: String(discountCode).toUpperCase(), aktif: true } });
    if (d) { kuponGecerli = true; kuponKod = d.code; kuponIndirim = d.tip === 'yuzde' ? (ara * d.deger) / 100 : d.deger; }
  }
  const indirim = Math.min(ara, (kamp.indirim || 0) + kuponIndirim);
  const toplam = Math.max(0, ara - indirim);
  res.json({ araToplam: ara, kampanyaIndirim: kamp.indirim || 0, kampanyalar: kamp.kampanyalar || [], kuponIndirim: Math.min(ara - (kamp.indirim || 0), kuponIndirim), kuponGecerli, kuponKod, toplam, freeShipThreshold: store.freeShipThreshold || 0 });
}));

// Siparis olustur (public)
router.post('/store/:slug/order', asyncHandler(async (req: Request, res: Response) => {
  const data = await loadStore(req.params.slug);
  if (!data) throw new ApiError(404, 'Magaza bulunamadi');
  const tenantId = data.store.tenantId;
  const { customer, items, discountCode } = req.body || {};
  if (!customer?.ad || !customer?.telefon) throw new ApiError(422, 'Ad ve telefon zorunludur');
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(422, 'Sepet bos');

  // Fiyatlari DB'den dogrula
  const prodMap = new Map(data.products.map((p) => [p.id, p]));
  const orderItems: any[] = [];
  let araToplam = 0;
  for (const it of items) {
    const p = prodMap.get(it.productId);
    if (!p) continue;
    const adet = Math.max(1, Number(it.adet) || 1);
    araToplam += p.satisFiyat * adet;
    const adAd = it.varyasyon ? `${p.ad} (${it.varyasyon})` : p.ad;
    orderItems.push({ productId: p.id, ad: adAd, varyasyon: it.varyasyon || null, adet, fiyat: p.satisFiyat, stokDusuldu: true });
  }
  if (orderItems.length === 0) throw new ApiError(422, 'Gecerli urun yok');

  // Indirim: kupon + aktif kampanyalar
  let indirim = 0;
  if (discountCode) {
    const d = await prisma.discountCode.findFirst({ where: { tenantId, code: String(discountCode).toUpperCase(), aktif: true } });
    if (d) indirim = d.tip === 'yuzde' ? (araToplam * d.deger) / 100 : d.deger;
  }
  const result = await prisma.$transaction(async (tx) => {
    // Stok kontrolü + düşüm
    for (const oi of orderItems) {
      const p = prodMap.get(oi.productId)!;
      if (oi.varyasyon) {
        const v = await tx.productVariation.findFirst({ where: { productId: oi.productId, tenantId, deger: oi.varyasyon } });
        if (!v || v.stok < oi.adet) throw new ApiError(400, `Stok yetersiz: ${p.ad} (${oi.varyasyon})`);
        await tx.productVariation.update({ where: { id: v.id }, data: { stok: { decrement: oi.adet } } });
      } else if ((p.stokAdeti || 0) < oi.adet) {
        throw new ApiError(400, `Stok yetersiz: ${p.ad}`);
      }
      await tx.product.update({ where: { id: oi.productId }, data: { stokAdeti: { decrement: oi.adet } } });
    }
    const kamp = await campaignAdjust(tx, tenantId, orderItems);
    indirim = Math.min(araToplam, indirim + (kamp.indirim || 0));
    const toplam = Math.max(0, araToplam - indirim);
    // Mükerrer müşteri önleme: aynı telefon zaten varsa onu kullan
    const telN = String(customer.telefon || '').replace(/\D/g, '');
    const mevcutlar = await tx.customer.findMany({ where: { tenantId } });
    let cust = mevcutlar.find((c) => telN.length >= 7 && (c.telefon || '').replace(/\D/g, '') === telN) || null;
    if (!cust) {
      cust = await tx.customer.create({
        data: { tenantId, musteriNo: 1000 + mevcutlar.length + 1, ad: customer.ad, telefon: customer.telefon, email: customer.email || null, adres: customer.adres || null, not: 'Online magaza siparisi' },
      });
    } else if (!cust.adres && customer.adres) {
      await tx.customer.update({ where: { id: cust.id }, data: { adres: customer.adres } });
    }
    const order = await tx.storeOrder.create({
      data: { tenantId, ...(await nextOrderNo(tx, tenantId)), customerId: cust.id, kanal: 'online', durum: 'yeni', items: orderItems, araToplam, indirim, toplam, not: customer.not || null },
    });
    return order;
  });
  const toplam = result.toplam;

  // PayTR yapilandirildiysa odeme tokeni uret
  const paytr = await getPaytr(tenantId);
  if (paytr) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
    const basket: [string, string, number][] = orderItems.map((it) => [String(it.ad).slice(0, 60), it.fiyat.toFixed(2), it.adet]);
    const tok = await createPaytrToken({
      config: paytr.config,
      testMode: paytr.testMode,
      merchantOid: result.id.replace(/[^a-zA-Z0-9]/g, ''),
      email: customer.email || `siparis-${result.id}@diljar.com`,
      amountKurus: Math.round(toplam * 100),
      userName: customer.ad,
      userAddress: customer.adres || '-',
      userPhone: customer.telefon,
      userIp: ip,
      okUrl: `${env.APP_DOMAIN}/?payment=success`,
      failUrl: `${env.APP_DOMAIN}/?payment=fail`,
      basket,
    });
    if (tok.ok) {
      // merchant_oid eslemesi icin orderId'yi sadelesmis haliyle sakla
      await prisma.storeOrder.update({ where: { id: result.id }, data: { not: `paytr_oid:${result.id.replace(/[^a-zA-Z0-9]/g, '')}` } });
      return res.status(201).json({ ok: true, orderId: result.id, toplam, paytr: true, iframeUrl: `https://www.paytr.com/odeme/guvenli/${tok.token}` });
    }
    // token alinamazsa normal siparis olarak devam (test/credential hatasi)
    return res.status(201).json({ ok: true, orderId: result.id, toplam, paytrError: tok.reason });
  }

  const tamiAvailable = !!(await getTami(tenantId));
  res.status(201).json({ ok: true, orderId: result.id, toplam, tamiAvailable });
}));

// PayTR bildirim (callback) — PayTR sunucusu buraya POST eder
router.post('/paytr/callback', express.urlencoded({ extended: false }), asyncHandler(async (req: Request, res: Response) => {
  const body: any = req.body || {};
  const oid: string = body.merchant_oid || '';
  // merchant_oid sadelesmis hali; not alaninda paytr_oid:<oid> ile eslestir
  const order = await prisma.storeOrder.findFirst({ where: { not: `paytr_oid:${oid}` } });
  if (!order) { res.send('OK'); return; }
  const paytr = await getPaytr(order.tenantId);
  if (!paytr || !verifyPaytrCallback(paytr.config, body)) { res.send('OK'); return; }
  if (body.status === 'success') {
    const already = (order.gelirKaydedilen || 0) > 0;
    await prisma.$transaction(async (tx) => {
      await tx.storeOrder.update({ where: { id: order.id }, data: { durum: 'hazirlaniyor', tahsilat: order.toplam, gelirKaydedilen: order.toplam, odemeYontemi: 'Kredi Kartı (PayTR)', not: 'Odeme alindi (PayTR)' } });
      if (!already && (order.toplam || 0) > 0) {
        const now = new Date();
        const no = order.orderNo ? `${order.orderYil}-${String(order.orderNo).padStart(3, '0')}` : order.id.slice(-5);
        await tx.hareket.create({ data: { tenantId: order.tenantId, tarih: now.toISOString().slice(0, 10), saat: now.toTimeString().slice(0, 5), aciklama: `Online ödeme (PayTR) #${no}`, tutar: order.toplam, tip: 'gelir', kategori: 'Online Satış', createdBy: null } });
      }
    });
  } else {
    await prisma.storeOrder.update({ where: { id: order.id }, data: { durum: 'iptal', not: 'Odeme basarisiz (PayTR)' } });
  }
  res.send('OK');
}));

// ───── Chatbot (public) ─────
async function tenantBySlug(slug: string): Promise<string | null> {
  const s = await prisma.storeSetting.findFirst({ where: { slug } });
  return s?.tenantId || null;
}

router.get('/chat/:slug', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await tenantBySlug(req.params.slug);
  if (!tenantId) throw new ApiError(404, 'Bulunamadi');
  const cfg = await prisma.botConfig.findUnique({ where: { tenantId } });
  res.json({ active: cfg ? cfg.active : false, name: cfg?.name || 'Asistan', greeting: cfg?.greeting || 'Merhaba! Size nasıl yardımcı olabilirim?' });
}));

router.post('/chat/:slug/start', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await tenantBySlug(req.params.slug);
  if (!tenantId) throw new ApiError(404, 'Bulunamadi');
  const cfg = await prisma.botConfig.findUnique({ where: { tenantId } });
  const session = await prisma.chatSession.create({ data: { tenantId, musteriAd: req.body?.musteriAd || null, musteriTipi: req.body?.musteriTipi || null, instagram: req.body?.instagram || null, telefon: req.body?.telefon || null } });
  const greeting = cfg?.greeting || 'Merhaba! Size nasıl yardımcı olabilirim?';
  await prisma.chatMessage.create({ data: { tenantId, sessionId: session.id, role: 'bot', content: greeting } });
  const messages = await prisma.chatMessage.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: 'asc' } });
  res.json({ sessionId: session.id, name: cfg?.name || 'Asistan', messages });
}));

router.post('/chat/:slug/message', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await tenantBySlug(req.params.slug);
  if (!tenantId) throw new ApiError(404, 'Bulunamadi');
  const { sessionId, content } = req.body || {};
  const session = await prisma.chatSession.findFirst({ where: { id: sessionId, tenantId } });
  if (!session) throw new ApiError(404, 'Oturum yok');
  const text = String(content || '').trim();
  if (!text) throw new ApiError(422, 'Mesaj gerekli');

  await prisma.chatMessage.create({ data: { tenantId, sessionId, role: 'user', content: text } });

  // Kayit numarasi ile durum sorgusu
  const noMatch = text.toUpperCase().replace(/[^A-Z0-9]/g, '').match(/DT[A-Z0-9]{4,7}/);
  if (noMatch) {
    const tk = await prisma.destekTalebi.findFirst({ where: { tenantId, no: noMatch[0] } });
    if (tk) {
      const durumTxt = tk.durum === 'cozuldu' ? 'Çözüldü ✅' : tk.durum === 'islemde' ? 'İşlemde 🔧' : 'Açık (inceleniyor)';
      const reply = `📋 Kayıt ${tk.no} — Durum: ${durumTxt}.\n${tk.yanit ? 'Yetkili notu: ' + tk.yanit : 'Henüz bir not eklenmedi; en kısa sürede dönüş yapılacaktır.'}`;
      await prisma.chatMessage.create({ data: { tenantId, sessionId, role: 'bot', content: reply } });
      const messages = await prisma.chatMessage.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } });
      return res.json({ messages });
    }
  }

  // Gorsel mesajda LLM'e kisa metin gonder (token sismesini onle)
  const isImage = text.startsWith('data:image');
  const botInput = isImage ? 'Müşteri bir görsel (fotoğraf) gönderdi.' : text;

  // Ticket onay durumu (kural motoru icin) — oturumda saklanan bayrak
  const offered = !!session.pendingTicket;

  // Sohbet gecmisi (LLM baglami)
  const histMsgs = await prisma.chatMessage.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' }, take: 20 });
  const history = histMsgs.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));

  const ctx = { tenantId, session: { musteriAd: session.musteriAd, instagram: session.instagram, telefon: session.telefon }, appOrigin: env.APP_DOMAIN || `${req.protocol}://${req.get('host')}`, cartToken: req.body?.cartToken ? String(req.body.cartToken) : null };
  const r = await botReply(tenantId, botInput, offered, history, ctx);

  // Cevaplanamayan soruyu eksik (gap) olarak kaydet
  if (r.unanswered && !isImage) {
    const anahtar = text.toLowerCase().trim().slice(0, 80);
    try {
      await prisma.botGap.upsert({
        where: { tenantId_anahtar: { tenantId, anahtar } },
        update: { adet: { increment: 1 }, ornek: text.slice(0, 300) },
        create: { tenantId, anahtar, ornek: text.slice(0, 300) },
      });
    } catch { /* */ }
  }

  if (r.createTicket) {
    const full = await prisma.chatMessage.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' }, take: 40 });
    const hist = full.map((m) => ({ role: m.role, content: m.content }));
    const sum = await summarizeTicket(tenantId, hist);
    const konusma = hist.map((m) => `${m.role === 'user' ? 'Müşteri' : m.role === 'agent' ? 'Yetkili' : 'Bot'}: ${String(m.content).startsWith('data:image') ? '[görsel ekledi]' : m.content}`).join('\n');
    const intake = `Müşteri: ${session.musteriAd || '-'} | Tip: ${session.musteriTipi === 'mevcut' ? 'Mevcut alışveriş' : session.musteriTipi === 'yeni' ? 'Yeni müşteri' : '-'} | Instagram: ${session.instagram || '-'} | Tel: ${session.telefon || '-'}`;
    const baslik = (sum?.baslik || 'Müşteri destek talebi').slice(0, 80);
    const no = 'DT' + Math.random().toString(36).slice(2, 7).toUpperCase();
    await prisma.destekTalebi.create({
      data: {
        tenantId, no,
        musteriAd: session.musteriAd || 'Müşteri',
        baslik,
        konu: (sum?.ozet || baslik).slice(0, 200),
        detay: `${intake}\n\n${sum?.ozet ? 'Özet: ' + sum.ozet + '\n\n' : ''}--- Sohbet ---\n${konusma}`,
        durum: 'acik',
        kaynak: 'chatbot',
      },
    });
    r.reply = `${r.reply}\n\n📋 Kayıt Numaranız: ${no}\nDurumunuzu öğrenmek için bu numarayı bana yazmanız yeterli.`;
  }

  await prisma.chatMessage.create({ data: { tenantId, sessionId, role: 'bot', content: r.reply } });
  await prisma.chatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date(), pendingTicket: !!r.offerTicket && !r.createTicket } });
  const messages = await prisma.chatMessage.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } });
  res.json({ messages });
}));

router.get('/chat/:slug/messages', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await tenantBySlug(req.params.slug);
  if (!tenantId) throw new ApiError(404, 'Bulunamadi');
  const sessionId = String(req.query.sessionId || '');
  const messages = await prisma.chatMessage.findMany({ where: { sessionId, tenantId }, orderBy: { createdAt: 'asc' } });
  res.json({ messages });
}));

// ───── Uyelik formu (public) ─────
const igNorm = (s: string) => (s || '').toLowerCase().replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/^@/, '').trim();

router.post('/uye/:slug', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await tenantBySlug(req.params.slug);
  if (!tenantId) throw new ApiError(404, 'Bulunamadi');
  const { ad, instagram, telefon, adres } = req.body || {};
  if (!ad || !instagram || !telefon) throw new ApiError(422, 'Ad soyad, Instagram ve telefon zorunludur');
  const igClean = String(instagram).trim().replace(/^@+/, '');
  // Mükerrer kontrol: aynı Instagram (veya telefon) zaten kayıtlıysa yeni kayıt AÇMA.
  const igN = igNorm(igClean);
  const telN = String(telefon).replace(/\D/g, '');
  const mevcutlar = await prisma.customer.findMany({ where: { tenantId } });
  const existing = mevcutlar.find((c) =>
    (igN && igNorm(c.instagram || '') === igN) ||
    (telN.length >= 7 && (c.telefon || '').replace(/\D/g, '') === telN)
  );
  if (existing) {
    // Eksik bilgileri tamamla (üzerine yazma yok), rezerve siparişleri onayla, mükerrer kayıt oluşturma.
    const patch: any = {};
    if (!existing.instagram && igClean) patch.instagram = igClean;
    if (!existing.telefon && telefon) patch.telefon = telefon;
    if ((!existing.ad || igNorm(existing.ad) === igNorm(existing.instagram || '')) && ad) patch.ad = ad;
    if (!existing.adres && adres) patch.adres = adres;
    const cust = Object.keys(patch).length ? await prisma.customer.update({ where: { id: existing.id }, data: patch }) : existing;
    await promoteReserved(tenantId, cust);
    return res.status(200).json({ ok: true, existed: true });
  }
  // Yeni kayıt -> Instagram gerçekten var mı kontrol et
  const igState = await instagramKullaniciVarMi(igClean);
  if (igState === 'missing') throw new ApiError(422, `"${igClean}" adlı Instagram kullanıcısı bulunamadı. Lütfen kullanıcı adınızı kontrol edip tekrar deneyin.`);
  const customer = await prisma.customer.create({ data: { tenantId, musteriNo: 1000 + mevcutlar.length + 1, ad, instagram: igClean, telefon, adres: adres || null, not: 'Üyelik formu' } });
  await promoteReserved(tenantId, customer);
  res.status(201).json({ ok: true });
}));

// ───── Sepet (public link) ─────
const cartModifiable = (durum: string) => durum === 'sepet' || durum === 'yeni';

router.get('/sepet/:token', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token }, include: { customer: true } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  const tenant = await prisma.tenant.findUnique({ where: { id: cart.tenantId }, select: { name: true } });
  const setting = await prisma.storeSetting.findUnique({ where: { tenantId: cart.tenantId } }).catch(() => null);
  const items: any[] = Array.isArray(cart.items) ? (cart.items as any) : [];
  const ids = items.map((it) => it.productId).filter(Boolean);
  const prods = ids.length ? await prisma.product.findMany({ where: { tenantId: cart.tenantId, id: { in: ids } }, select: { id: true, images: true, barkod: true, salesCode: true, sku: true } }) : [];
  const pMap = new Map(prods.map((p) => [p.id, p]));
  const itemsWithImg = items.map((it) => { const p: any = pMap.get(it.productId); return { ...it, img: (Array.isArray(p?.images) ? (p.images as any)[0] : '') || '', barkod: p?.barkod || '', salesCode: p?.salesCode || '', sku: p?.sku || '' }; });
  // Öneriler (canlı yayına özel fırsatlar)
  const oneriRaw = await prisma.product.findMany({ where: { tenantId: cart.tenantId, aktif: true, stokAdeti: { gt: 0 }, id: { notIn: ids.length ? ids : ['_'] } }, orderBy: [{ oneCikan: 'desc' }, { createdAt: 'desc' }], take: 8, include: { variations: true } });
  const oneriler = oneriRaw.map((p) => ({ id: p.id, ad: p.ad, fiyat: p.satisFiyat, eskiFiyat: p.eskiFiyat, img: (Array.isArray(p.images) ? (p.images as any)[0] : '') || '', stok: p.stokAdeti, bedenler: (p.variations || []).filter((v) => v.stok > 0).map((v) => v.deger) }));
  res.json({
    magaza: setting?.logoText || tenant?.name || 'Mağaza',
    slug: setting?.slug || null,
    durum: cart.durum,
    duzenlenebilir: cartModifiable(cart.durum),
    items: itemsWithImg,
    araToplam: cart.araToplam,
    indirim: cart.indirim,
    indirimKodu: cart.indirimKodu || null,
    kargoUcreti: cart.kargoUcreti || 0,
    freeShipThreshold: setting?.freeShipThreshold || 0,
    puanOrani: setting?.puanOrani || 0,
    odemeLinki: cart.odemeLinki || null,
    odemeLinkiSon: cart.odemeLinkiSon || null,
    toplam: cart.toplam,
    createdAt: cart.createdAt,
    adres: cart.adres || cart.customer?.adres || '',
    musteri: cart.customer?.ad || cart.musteriHandle || '',
    telefon: cart.customer?.telefon || '',
    instagram: cart.customer?.instagram || '',
    oneriler,
  });
}));

router.patch('/sepet/:token', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  const adres = req.body?.adres !== undefined ? String(req.body.adres).slice(0, 500) : undefined;
  if (adres !== undefined) await prisma.storeOrder.update({ where: { id: cart.id }, data: { adres } });
  if (cart.customerId && (req.body?.telefon !== undefined || req.body?.musteri !== undefined || adres !== undefined)) {
    const cd: any = {};
    if (req.body?.telefon !== undefined) cd.telefon = String(req.body.telefon).slice(0, 30);
    if (req.body?.musteri !== undefined) cd.ad = String(req.body.musteri).slice(0, 120);
    if (adres !== undefined) cd.adres = adres;
    if (Object.keys(cd).length) await prisma.customer.update({ where: { id: cart.customerId }, data: cd }).catch(() => null);
  }
  res.json({ ok: true });
}));

// Yayın Özeti — canlı yayında çıkan (barkod okutulan) ürünler + filtre seçenekleri
router.get('/sepet/:token/yayin', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  const t = cart.tenantId;
  const period = String(req.query.period || 'tum');
  const now = new Date(); let cutoff: Date | null = null;
  if (period === 'bugun') { cutoff = new Date(now); cutoff.setHours(0, 0, 0, 0); }
  else if (period === 'dun') { cutoff = new Date(now.getTime() - 86400000); cutoff.setHours(0, 0, 0, 0); }
  else if (period === 'hafta') { cutoff = new Date(now.getTime() - 7 * 86400000); }
  const where: any = { tenantId: t, productId: { not: null } };
  if (cutoff) where.createdAt = { gte: cutoff };
  if (period === 'dun') { const end = new Date(now); end.setHours(0, 0, 0, 0); where.createdAt = { gte: cutoff, lt: end }; }
  const los = await prisma.liveOrder.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
  // distinct productId -> ilk (en yeni) görünüm
  const seen = new Map<string, any>();
  for (const lo of los) { if (!lo.productId) continue; if (!seen.has(lo.productId)) seen.set(lo.productId, lo); }
  const pids = [...seen.keys()];
  if (!pids.length) return res.json({ urunler: [], markalar: [], kategoriler: [], cinsiyetler: [] });
  const prods = await prisma.product.findMany({ where: { tenantId: t, id: { in: pids }, aktif: true }, include: { variations: true } });
  const kats = await prisma.productCategory.findMany({ where: { tenantId: t } });
  const katMap = new Map(kats.map((k) => [k.id, k.ad]));
  const urunler = prods.map((p) => {
    const lo = seen.get(p.id);
    const vip = p.satisFiyat >= 1000 ? 5 : p.satisFiyat >= 500 ? 4 : 3;
    return {
      id: p.id, ad: p.ad, fiyat: p.satisFiyat, eskiFiyat: p.eskiFiyat,
      img: (Array.isArray(p.images) ? (p.images as any)[0] : '') || '',
      stok: p.stokAdeti, marka: p.marka || '', cinsiyet: p.cinsiyet || '',
      kategoriId: p.kategoriId, kategoriAd: p.kategoriId ? (katMap.get(p.kategoriId) || '') : '',
      beden: lo?.beden || lo?.variation || '', saat: lo?.createdAt, salesCode: p.salesCode, barkod: p.barkod,
      vipPuan: vip, bedenler: (p.variations || []).filter((v) => v.stok > 0).map((v) => v.deger),
    };
  }).sort((a, b) => new Date(b.saat || 0).getTime() - new Date(a.saat || 0).getTime());
  res.json({
    urunler,
    markalar: [...new Set(urunler.map((u) => u.marka).filter(Boolean))],
    kategoriler: [...new Map(urunler.filter((u) => u.kategoriId).map((u) => [u.kategoriId, u.kategoriAd])).entries()].map(([id, ad]) => ({ id, ad })),
    cinsiyetler: [...new Set(urunler.map((u) => u.cinsiyet).filter(Boolean))],
  });
}));

// ── Public ürün kartı yardımcısı ──
function pubCard(p: any, katMap?: Map<string, string>) {
  const vip = p.satisFiyat >= 1000 ? 5 : p.satisFiyat >= 500 ? 4 : 3;
  return { id: p.id, ad: p.ad, fiyat: p.satisFiyat, eskiFiyat: p.eskiFiyat, img: (Array.isArray(p.images) ? (p.images as any)[0] : '') || '', stok: p.stokAdeti, marka: p.marka || '', cinsiyet: p.cinsiyet || '', kategoriId: p.kategoriId, kategoriAd: katMap && p.kategoriId ? (katMap.get(p.kategoriId) || '') : '', salesCode: p.salesCode, barkod: p.barkod, vipPuan: vip, bedenler: (p.variations || []).filter((v: any) => v.stok > 0).map((v: any) => v.deger) };
}

// ── Kataloglar ──
router.get('/sepet/:token/katalog', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  const t = cart.tenantId;
  const [prods, kats] = await Promise.all([
    prisma.product.findMany({ where: { tenantId: t, aktif: true, onlineMagaza: true }, include: { variations: true }, orderBy: { createdAt: 'desc' } }),
    prisma.productCategory.findMany({ where: { tenantId: t }, orderBy: { ad: 'asc' } }),
  ]);
  const katMap = new Map(kats.map((k) => [k.id, k.ad]));
  const kategoriler = kats.map((k) => { const ps = prods.filter((p) => p.kategoriId === k.id); return { id: k.id, ad: k.ad, adet: ps.length, img: ps[0] ? ((Array.isArray(ps[0].images) ? (ps[0].images as any)[0] : '') || '') : '' }; }).filter((k) => k.adet > 0);
  const markaMap = new Map<string, { marka: string; adet: number; img: string }>();
  for (const p of prods) { if (!p.marka) continue; const m = markaMap.get(p.marka) || { marka: p.marka, adet: 0, img: (Array.isArray(p.images) ? (p.images as any)[0] : '') || '' }; m.adet++; markaMap.set(p.marka, m); }
  // canlıda çıkanlar
  const los = await prisma.liveOrder.findMany({ where: { tenantId: t, productId: { not: null } }, orderBy: { createdAt: 'desc' }, take: 200 });
  const trendIds = [...new Set(los.map((l) => l.productId).filter(Boolean))].slice(0, 12) as string[];
  const trend = trendIds.map((id) => prods.find((p) => p.id === id)).filter(Boolean).map((p) => pubCard(p, katMap));
  res.json({
    kategoriler,
    markalar: [...markaMap.values()].sort((a, b) => b.adet - a.adet),
    trend,
    fiyatiDusenler: prods.filter((p) => p.eskiFiyat && p.eskiFiyat > p.satisFiyat).slice(0, 12).map((p) => pubCard(p, katMap)),
    sonEklenenler: prods.slice(0, 12).map((p) => pubCard(p, katMap)),
  });
}));

// ── Yeni Eklenenler ──
router.get('/sepet/:token/yeni', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  const t = cart.tenantId;
  const kats = await prisma.productCategory.findMany({ where: { tenantId: t } });
  const katMap = new Map(kats.map((k) => [k.id, k.ad]));
  const prods = await prisma.product.findMany({ where: { tenantId: t, aktif: true, onlineMagaza: true }, include: { variations: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ urunler: prods.map((p) => pubCard(p, katMap)), kategoriler: kats.map((k) => ({ id: k.id, ad: k.ad })) });
}));

// Bildirim aboneliği (yeni ürünler için SMS datası)
router.post('/sepet/:token/bildirim', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token }, include: { customer: true } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  const { beden, kategori, ilgi } = req.body || {};
  await prisma.notificationSub.create({ data: { tenantId: cart.tenantId, customerId: cart.customerId || null, musteriAd: cart.customer?.ad || cart.musteriHandle || null, telefon: cart.customer?.telefon || null, beden: beden || null, kategori: kategori || null, ilgi: ilgi || null } });
  res.json({ ok: true });
}));

// ── Siparişlerim ──
router.get('/sepet/:token/siparislerim', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  if (!cart.customerId) return res.json({ siparisler: [], ozet: { toplam: 0, teslim: 0, kargoda: 0, iade: 0 } });
  const orders = await prisma.storeOrder.findMany({ where: { tenantId: cart.tenantId, customerId: cart.customerId }, orderBy: { createdAt: 'desc' }, take: 100 });
  const ids = [...new Set(orders.flatMap((o) => (Array.isArray(o.items) ? (o.items as any) : []).map((it: any) => it.productId)).filter(Boolean))] as string[];
  const prods = ids.length ? await prisma.product.findMany({ where: { tenantId: cart.tenantId, id: { in: ids } }, select: { id: true, images: true } }) : [];
  const imgMap = new Map(prods.map((p) => [p.id, (Array.isArray(p.images) ? (p.images as any)[0] : '') || '']));
  const siparisler = orders.map((o) => ({
    id: o.id, token: o.token, orderNo: o.orderNo, orderYil: o.orderYil, durum: o.durum, toplam: o.toplam, tahsilat: o.tahsilat,
    kargoFirmasi: o.kargoFirmasi, kargoTakip: o.kargoTakip, kargoDurum: o.kargoDurum, createdAt: o.createdAt,
    duzenlenebilir: o.durum === 'sepet' || o.durum === 'yeni',
    items: (Array.isArray(o.items) ? (o.items as any) : []).map((it: any) => ({ ...it, img: imgMap.get(it.productId) || '' })),
  }));
  const ozet = {
    toplam: orders.filter((o) => o.durum !== 'iptal').length,
    teslim: orders.filter((o) => o.durum === 'teslim' || o.durum === 'tamamlandi').length,
    kargoda: orders.filter((o) => o.durum === 'kargoda').length,
    iade: orders.filter((o) => o.durum === 'iptal').length,
  };
  res.json({ siparisler, ozet });
}));

// ── Destek Talepleri (müşteri) ──
router.get('/sepet/:token/destek', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token }, include: { customer: true } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  const where: any = { tenantId: cart.tenantId };
  if (cart.customerId) where.customerId = cart.customerId;
  else where.musteriAd = cart.customer?.ad || cart.musteriHandle || '___';
  const talepler = await prisma.destekTalebi.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json(talepler);
}));
router.post('/sepet/:token/destek', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token }, include: { customer: true } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  const { kategori, konu, detay, gorseller } = req.body || {};
  if (!konu && !kategori) throw new ApiError(422, 'Konu seçin');
  const no = 'DT' + Math.random().toString(36).slice(2, 7).toUpperCase();
  const t = await prisma.destekTalebi.create({ data: {
    tenantId: cart.tenantId, no, customerId: cart.customerId || null, musteriAd: cart.customer?.ad || cart.musteriHandle || 'Müşteri',
    telefon: cart.customer?.telefon || null, kategori: kategori || null, baslik: konu || kategori || 'Destek talebi', konu: konu || null,
    detay: detay || null, gorseller: Array.isArray(gorseller) ? gorseller.slice(0, 5) : undefined, durum: 'acik', kaynak: 'musteri',
  } });
  res.status(201).json(t);
}));

// Sepet linki içinde ürün arama (kod/ad/barkod/kategori) — sadece online mağazaya açık ürünler
router.get('/sepet/:token/search', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json([]);
  // Kategori adı eşleşmesi
  const kats = await prisma.productCategory.findMany({ where: { tenantId: cart.tenantId } });
  const katIds = kats.filter((k) => (k.ad || '').toLowerCase().includes(q)).map((k) => k.id);
  const prods = await prisma.product.findMany({ where: { tenantId: cart.tenantId, aktif: true, onlineMagaza: true }, include: { variations: true }, take: 300 });
  const matched = prods.filter((p) => {
    const f = [p.ad, p.salesCode, p.sku, p.barkod, p.marka];
    return f.some((x) => (x || '').toLowerCase().includes(q)) || (p.kategoriId && katIds.includes(p.kategoriId));
  }).slice(0, 16).map((p) => ({ id: p.id, ad: p.ad, fiyat: p.satisFiyat, eskiFiyat: p.eskiFiyat, img: (Array.isArray(p.images) ? (p.images as any)[0] : '') || '', stok: p.stokAdeti, salesCode: p.salesCode, barkod: p.barkod, bedenler: (p.variations || []).filter((v) => v.stok > 0).map((v) => v.deger) }));
  res.json(matched);
}));

// Sepete ürün ekle (öneriden)
router.post('/sepet/:token/add', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  if (!cartModifiable(cart.durum)) throw new ApiError(400, 'Bu sipariş artık düzenlenemez');
  const p = await prisma.product.findFirst({ where: { id: String(req.body?.productId || ''), tenantId: cart.tenantId, aktif: true }, include: { variations: true } });
  if (!p) throw new ApiError(404, 'Ürün bulunamadi');
  const beden = req.body?.beden ? String(req.body.beden) : '';
  let fiyat = p.satisFiyat;
  if (beden) {
    const v = (p.variations || []).find((x) => x.deger.toLowerCase() === beden.toLowerCase());
    if (!v || v.stok < 1) throw new ApiError(400, 'Stok yetersiz');
    fiyat += v.ekFiyat || 0;
    await prisma.productVariation.update({ where: { id: v.id }, data: { stok: { decrement: 1 } } });
  } else if ((p.stokAdeti || 0) < 1) throw new ApiError(400, 'Stok yetersiz');
  const items: any[] = Array.isArray(cart.items) ? (cart.items as any) : [];
  const ex = items.find((it) => it.productId === p.id && (it.varyasyon || '') === beden);
  if (ex) ex.adet = (ex.adet || 1) + 1;
  else items.push({ productId: p.id, ad: p.ad + (beden ? ` (${beden})` : ''), varyasyon: beden || null, adet: 1, fiyat, stokDusuldu: true });
  await prisma.product.update({ where: { id: p.id }, data: { stokAdeti: { decrement: 1 } } });
  const adj = await campaignAdjust(prisma, cart.tenantId, items);
  await prisma.storeOrder.update({ where: { id: cart.id }, data: { items, araToplam: adj.araToplam, indirim: adj.indirim, kampanyalar: adj.kampanyalar, toplam: Math.max(0, adj.toplam + (cart.kargoUcreti || 0)) } });
  try { await prisma.orderEvent.create({ data: { tenantId: cart.tenantId, orderId: cart.id, kullanici: 'Müşteri', islem: 'Ürün eklendi (sepet linki)', detay: p.ad } }); } catch { /* */ }
  res.json({ ok: true });
}));

// Sepetten ürün çıkar / adet değiştir
router.post('/sepet/:token/item', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  if (!cartModifiable(cart.durum)) throw new ApiError(400, 'Bu sipariş artık düzenlenemez');
  const idx = Number(req.body?.index);
  const delta = req.body?.delta !== undefined ? Number(req.body.delta) : null; // +1 / -1
  const remove = !!req.body?.remove;
  const items: any[] = Array.isArray(cart.items) ? (cart.items as any) : [];
  const it = items[idx];
  if (!it) throw new ApiError(404, 'Ürün yok');
  const restoreStock = async (n: number) => { if (!it.productId || !it.stokDusuldu || n === 0) return; if (it.varyasyon) { const v = await prisma.productVariation.findFirst({ where: { productId: it.productId, tenantId: cart.tenantId, deger: it.varyasyon } }); if (v) await prisma.productVariation.update({ where: { id: v.id }, data: { stok: { increment: n } } }); } await prisma.product.updateMany({ where: { id: it.productId, tenantId: cart.tenantId }, data: { stokAdeti: { increment: n } } }); };
  let newItems = items;
  if (remove) { await restoreStock(it.adet || 1); newItems = items.filter((_, i) => i !== idx); }
  else if (delta !== null) {
    if (delta > 0) { if (it.productId && (await prisma.product.findFirst({ where: { id: it.productId, tenantId: cart.tenantId } }))!.stokAdeti < 1) throw new ApiError(400, 'Stok yetersiz'); if (it.productId && it.stokDusuldu) await prisma.product.updateMany({ where: { id: it.productId, tenantId: cart.tenantId }, data: { stokAdeti: { decrement: 1 } } }); it.adet = (it.adet || 1) + 1; }
    else { if ((it.adet || 1) <= 1) { await restoreStock(1); newItems = items.filter((_, i) => i !== idx); } else { await restoreStock(1); it.adet = (it.adet || 1) - 1; } }
  }
  const adj = await campaignAdjust(prisma, cart.tenantId, newItems);
  if (newItems.length === 0 && cart.durum === 'sepet') {
    // Sepette ürün kalmadı -> açık sepeti iptal et (sil)
    await prisma.liveOrder.updateMany({ where: { storeOrderId: cart.id }, data: { storeOrderId: null } });
    await prisma.storeOrder.delete({ where: { id: cart.id } });
    return res.json({ ok: true, deleted: true });
  }
  await prisma.storeOrder.update({ where: { id: cart.id }, data: { items: newItems, araToplam: adj.araToplam, indirim: adj.indirim, kampanyalar: adj.kampanyalar, toplam: Math.max(0, adj.toplam + (cart.kargoUcreti || 0)) } });
  try { await prisma.orderEvent.create({ data: { tenantId: cart.tenantId, orderId: cart.id, kullanici: 'Müşteri', islem: remove ? 'Ürün çıkarıldı (sepet linki)' : 'Adet güncellendi (sepet linki)', detay: it.ad || '' } }); } catch { /* */ }
  res.json({ ok: true });
}));

// Müşteri ödeme bildirimi
router.post('/sepet/:token/odeme-bildir', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  if (cart.durum === 'sepet') await prisma.storeOrder.update({ where: { id: cart.id }, data: { durum: 'yeni' } });
  try { await prisma.orderEvent.create({ data: { tenantId: cart.tenantId, orderId: cart.id, kullanici: 'Müşteri', islem: 'Ödeme bildirimi yapıldı', detay: `Tutar: ${(cart.toplam || 0).toLocaleString('tr-TR')}₺` } }); } catch { /* */ }
  res.json({ ok: true });
}));

// Sepet için kredi kartı (PayTR) ödeme tokeni üret → iframe URL döner
router.post('/sepet/:token/paytr', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token }, include: { customer: true } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  const items: any[] = Array.isArray(cart.items) ? (cart.items as any) : [];
  if (items.length === 0) throw new ApiError(422, 'Sepet boş');
  const toplam = cart.toplam || 0;
  if (toplam <= 0) throw new ApiError(422, 'Geçersiz tutar');
  const paytr = await getPaytr(cart.tenantId);
  if (!paytr) return res.json({ ok: false, configured: false });
  const oid = cart.id.replace(/[^a-zA-Z0-9]/g, '');
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const basket: [string, string, number][] = items.map((it) => [String(it.ad).slice(0, 60), (it.fiyat || 0).toFixed(2), it.adet || 1]);
  const tok = await createPaytrToken({
    config: paytr.config,
    testMode: paytr.testMode,
    merchantOid: oid,
    email: cart.customer?.email || `sepet-${oid}@diljar.com`,
    amountKurus: Math.round(toplam * 100),
    userName: cart.customer?.ad || cart.musteriHandle || 'Müşteri',
    userAddress: cart.adres || cart.customer?.adres || '-',
    userPhone: cart.customer?.telefon || '-',
    userIp: ip,
    okUrl: `${env.APP_DOMAIN}/sepet/${cart.token}?payment=success`,
    failUrl: `${env.APP_DOMAIN}/sepet/${cart.token}?payment=fail`,
    basket,
  });
  if (tok.ok) {
    await prisma.storeOrder.update({ where: { id: cart.id }, data: { durum: cart.durum === 'sepet' ? 'yeni' : cart.durum, not: `paytr_oid:${oid}` } });
    return res.json({ ok: true, iframeUrl: `https://www.paytr.com/odeme/guvenli/${tok.token}` });
  }
  return res.json({ ok: false, configured: true, error: tok.reason });
}));

// ───────── Tami 3D ödeme: sipariş için ödeme başlat ─────────
const rnd4 = () => String(Math.floor(1000 + Math.random() * 9000));
router.post('/store/:slug/tami/pay', asyncHandler(async (req: Request, res: Response) => {
  const store = await prisma.storeSetting.findFirst({ where: { slug: req.params.slug, active: true } });
  if (!store) throw new ApiError(404, 'Magaza bulunamadi');
  const tami = await getTami(store.tenantId);
  if (!tami) throw new ApiError(400, 'Tami ödeme yapılandırılmamış');
  const { orderId, card } = req.body || {};
  if (!orderId || !card?.number) throw new ApiError(400, 'orderId ve kart bilgileri gerekli');
  const order = await prisma.storeOrder.findFirst({ where: { id: orderId, tenantId: store.tenantId } });
  if (!order) throw new ApiError(404, 'Sipariş bulunamadi');
  if ((order.gelirKaydedilen || 0) > 0) throw new ApiError(400, 'Sipariş zaten ödenmiş');
  const customer = order.customerId ? await prisma.customer.findUnique({ where: { id: order.customerId } }) : null;

  const tamiOid = 'd' + Date.now() + rnd4();
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const adAll = String(customer?.ad || 'Musteri').trim();
  const [name, ...rest] = adAll.split(/\s+/);
  const surName = rest.join(' ') || name;
  const phone = String(customer?.telefon || req.body?.buyer?.telefon || '5300000000').replace(/\D/g, '') || '5300000000';
  const email = customer?.email || req.body?.buyer?.email || `siparis-${order.id}@diljar.com`;
  const addr = customer?.adres || req.body?.buyer?.adres || 'Adres belirtilmedi';
  const address = { address: addr, city: 'Istanbul', country: 'Turkiye', contactName: adAll, companyName: null, zipCode: '34000', phoneNumber: phone, district: '-' };
  const items = (order.items as any[]) || [];
  const basketItems = items.map((it, idx) => ({ itemId: String(it.productId || idx), itemType: 'PHYSICAL', name: String(it.ad || 'Urun').slice(0, 60), category: 'Giyim', subCategory: '-', unitPrice: Number(it.fiyat) || 0, totalPrice: (Number(it.fiyat) || 0) * (Number(it.adet) || 1), numberOfProducts: Number(it.adet) || 1 }));

  const resp = await tamiInitAuth(tami, {
    orderId: tamiOid,
    amount: Number(order.toplam) || 0,
    callbackUrl: `${env.APP_DOMAIN}/api/v1/public/tami/callback`,
    card: { number: String(card.number).replace(/\s/g, ''), cvv: String(card.cvv || ''), expireMonth: Number(card.expireMonth) || 0, expireYear: Number(card.expireYear) || 0, holderName: String(card.holderName || adAll) },
    buyer: { ipAddress: ip, buyerId: String(order.customerId || 'b' + order.id).slice(0, 30), name, surName, identityNumber: null, city: 'Istanbul', country: 'Turkiye', emailAddress: email, phoneNumber: phone, registrationAddress: addr, zipCode: '34000' },
    billingAddress: address,
    shippingAddress: address,
    basket: { basketId: String(order.id).slice(0, 20), basketItems },
  });

  if (resp?.success && resp.threeDSHtmlContent) {
    await prisma.storeOrder.update({ where: { id: order.id }, data: { not: `tami_oid:${tamiOid}` } });
    const html = Buffer.from(resp.threeDSHtmlContent, 'base64').toString('utf8');
    return res.json({ ok: true, html });
  }
  res.status(400).json({ ok: false, message: resp?.errorMessage || 'Tami ödeme başlatılamadı', code: resp?.errorCode });
}));

// ───────── Tami callback (banka 3D sonucu buraya POST eder) ─────────
router.post('/tami/callback', express.urlencoded({ extended: false }), asyncHandler(async (req: Request, res: Response) => {
  const body: any = req.body || {};
  const oid: string = body.orderId || '';
  const fail = `${env.APP_DOMAIN}/?payment=fail`;
  const order = await prisma.storeOrder.findFirst({ where: { not: `tami_oid:${oid}` } });
  if (!order) return res.redirect(fail);
  const tami = await getTami(order.tenantId);
  if (!tami || !verifyTamiCallback(tami.secret, body)) return res.redirect(fail);
  const ok3d = String(body.success) === 'true' || String(body.mdStatus) === '1';
  if (!ok3d) return res.redirect(fail);
  const comp = await tamiComplete3ds(tami, oid);
  if (!comp?.success) return res.redirect(fail);
  if ((order.gelirKaydedilen || 0) <= 0) {
    await prisma.storeOrder.update({ where: { id: order.id }, data: { durum: 'hazirlaniyor', tahsilat: order.toplam, gelirKaydedilen: order.toplam, odemeYontemi: 'Kredi Kartı (Tami)', not: 'Odeme alindi (Tami)' } });
  }
  res.redirect(`${env.APP_DOMAIN}/?payment=success`);
}));

export default router;
