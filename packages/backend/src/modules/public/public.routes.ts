import { Router, Request, Response } from 'express';
import express from 'express';
import https from 'https';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { trackVisitor } from '../store/catalog.live';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { asyncHandler, ApiError } from '../../lib/http';
import { createPaytrToken, verifyPaytrCallback, PaytrConfig } from '../payment/paytr';
import { getIyzico, queryInstallment, initThreeDS, completeThreeDS } from '../payment/iyzico.service';
import { getTami, tamiInitAuth, tamiComplete3ds, verifyTamiCallback } from '../tami/tami.service';
import { botReply, offeredTicket } from '../bot/engine';
import { summarizeTicket } from '../bot/llm';
import { promoteReserved, campaignAdjust, campaignPerItem, promoteWaitingStock, lockedCampaignIds } from '../store/live.routes';
import { nextOrderNo, generateSipNo, logStok, genToken } from '../store/store.routes';
import { cancelLinkedOrder } from '../store/catalog.trigger';
import { queryShipment } from '../cargo/cargo.service';
import { sendSms } from '../sms/netgsm.service';
import { enqueueOrderNotification, resolveStoreWaTargetPhone } from '../whatsapp/wa.service';
import { startWorkflowRuns } from '../whatsapp/wa.workflow';
import { apiSendTemplate } from '../whatsapp/wa.cloud';

// ───── Üyelik SMS doğrulama kodu (bellekte; tek süreç/pm2 fork) ─────
const uyeKodlar = new Map<string, { kod: string; exp: number; lastSent: number; tries: number }>();
const uyeKodKey = (tenantId: string, telN: string) => `${tenantId}:${telN}`;

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
    select: { id: true, ad: true, satisFiyat: true, eskiFiyat: true, oneCikan: true, images: true, aciklama: true, marka: true, cinsiyet: true, stokAdeti: true, kategoriId: true, createdAt: true, variations: { select: { ad: true, deger: true, stok: true, ekFiyat: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
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
  const allCats = await prisma.productCategory.findMany({ where: { tenantId: store.tenantId }, select: { id: true, ad: true, image: true } });
  // Yalnizca yayindaki (onlineMagaza+aktif+stok>0) urunu olan kategorileri dondur
  const usedCatIds = new Set(products.map((p: any) => p.kategoriId).filter(Boolean));
  const categories = allCats.filter((c: any) => usedCatIds.has(c.id));
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
  const cfg: any = data.store.config || {};
  res.json({
    name: data.tenant?.name || 'Magaza',
    logoText: data.store.logoText || data.tenant?.name,
    topBarText: cfg.topBarText || null,
    kuponKodu: cfg.kuponKodu || null,
    kargoText: cfg.kargoText || null,
    topBarSag: cfg.topBarSag || null,
    guvenKargo: cfg.guvenKargo || null,
    guvenKargoAlt: cfg.guvenKargoAlt || null,
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
  res.json({ slug: s?.slug || null, magaza, logoText: magaza, topMenu: Array.isArray(s?.topMenu) ? s?.topMenu : [] });
}));

// ───────── Müşteri Üyeliği (mağaza) ─────────
const shopToken = (customerId: string, tenantId: string) => jwt.sign({ customerId, tenantId, type: 'shopper' }, env.JWT_SECRET, { expiresIn: '60d' } as any);
async function shopAuth(req: Request, tenantId: string) {
  const h = req.headers.authorization || ''; const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!tok) return null;
  try { const p: any = jwt.verify(tok, env.JWT_SECRET); if (p.type !== 'shopper' || p.tenantId !== tenantId) return null; return p.customerId as string; } catch { return null; }
}
const digits = (s: string) => (s || '').replace(/\D/g, '');
const tk10 = (s?: string | null) => { const d = digits(s || ''); return d.length >= 10 ? d.slice(-10) : (d || null); };
const igk = (s?: string | null) => { const k = (s || '').toLowerCase().replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/^@+/, '').trim(); return k || null; };

// Müşteri bu ürünü gerçekten satın almış mı? (değerlendirme yetkisi)
async function customerBoughtProduct(tenantId: string, customerId: string, productId: string): Promise<boolean> {
  const orders = await prisma.storeOrder.findMany({
    where: { tenantId, customerId, durum: { notIn: ['sepet', 'iptal'] } },
    select: { items: true },
  });
  for (const o of orders) {
    const items: any[] = Array.isArray(o.items) ? (o.items as any) : [];
    if (items.some((it) => it && it.productId === productId)) return true;
  }
  return false;
}

router.post('/store/:slug/uye-kayit', asyncHandler(async (req: Request, res: Response) => {
  const store = await prisma.storeSetting.findFirst({ where: { slug: req.params.slug, active: true } });
  if (!store) throw new ApiError(404, 'Magaza bulunamadi');
  const t = store.tenantId;
  const { ad, telefon, sifre, instagram, email } = req.body || {};
  if (!ad || !telefon || !sifre) throw new ApiError(422, 'Ad, telefon ve şifre zorunlu');
  const tel = digits(telefon);
  const tkey = tk10(telefon); const ikey = igk(instagram);
  // Mevcut müşteriyi telefon veya Instagram kullanıcı adıyla bul (mükerrer açma)
  const all = await prisma.customer.findMany({ where: { tenantId: t } });
  let c = all.find((x) => tkey && tk10(x.telefon) === tkey) || (ikey ? all.find((x) => igk(x.instagram) === ikey) : null) || null;
  const passwordHash = await bcrypt.hash(String(sifre), 10);
  if (c) {
    if (c.passwordHash) throw new ApiError(409, 'Bu telefon veya Instagram zaten kayıtlı. Giriş yapın.');
    c = await prisma.customer.update({ where: { id: c.id }, data: { passwordHash, ad: ad || c.ad, instagram: instagram || c.instagram, igKey: (c as any).igKey || ikey, telKey: c.telKey || tkey, email: email || c.email } });
  } else {
    const count = await prisma.customer.count({ where: { tenantId: t } });
    c = await prisma.customer.create({ data: { tenantId: t, musteriNo: 1000 + count + 1, ad, telefon, telKey: tkey, instagram: instagram || null, igKey: ikey, email: email || null, passwordHash, not: 'Mağaza üyesi' } });
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
  // Kalem gorsellerini urun kayitlarindan zenginlestir (yeni tablo/iliski yok, mevcut Product.images)
  const prodIds = [...new Set(orders.flatMap((o) => (Array.isArray(o.items) ? (o.items as any[]) : []).map((it: any) => it.productId)).filter(Boolean))] as string[];
  const imgProds = prodIds.length ? await prisma.product.findMany({ where: { tenantId: store.tenantId, id: { in: prodIds } }, select: { id: true, images: true } }) : [];
  const imgMap = new Map(imgProds.map((p) => [p.id, (Array.isArray(p.images) ? (p.images as any)[0] : '') || '']));
  res.json({
    musteri: { id: c.id, ad: c.ad, telefon: c.telefon, instagram: c.instagram, email: c.email, adres: c.adres, bakiye: c.bakiye, indirimYuzde: c.indirimYuzde, musteriNo: c.musteriNo },
    siparisler: orders.map((o) => ({ id: o.id, token: o.token, sipNo: o.sipNo, orderNo: o.orderNo, orderYil: o.orderYil, durum: o.durum, kanal: o.kanal, toplam: o.toplam, araToplam: o.araToplam, indirim: o.indirim, kargoUcreti: o.kargoUcreti, tahsilat: o.tahsilat, odemeYontemi: o.odemeYontemi, adres: o.adres, il: o.il, ilce: o.ilce, kargoTakip: o.kargoTakip, kargoFirmasi: o.kargoFirmasi, kargoDurum: o.kargoDurum, kargoAsama: o.kargoAsama, kargoZamani: o.kargoZamani, createdAt: o.createdAt, items: (Array.isArray(o.items) ? (o.items as any[]) : []).map((it: any) => ({ ...it, img: imgMap.get(it.productId) || '' })) })),
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
  // Değerlendirme yetkisi: sadece bu ürünü satın almış üye yorum yapabilir
  const cid = await shopAuth(req, store.tenantId);
  const satinAldi = cid ? await customerBoughtProduct(store.tenantId, cid, p.id) : false;
  const zatenYorumladi = cid ? reviews.some((r) => (r as any).customerId === cid) : false;
  res.json({
    magaza: store.logoText || null,
    urun: { id: p.id, ad: p.ad, satisFiyat: p.satisFiyat, eskiFiyat: p.eskiFiyat, images: p.images, aciklama: p.aciklama, marka: p.marka, kategoriAd: kat?.ad || '', stokAdeti: p.stokAdeti, barkod: p.barkod, variations: (p.variations || []).map((v) => ({ ad: v.ad, deger: v.deger, stok: v.stok, ekFiyat: v.ekFiyat })) },
    yorumlar: reviews, puanOrt: Math.round(avg * 10) / 10, yorumSayi: reviews.length,
    girisYapildi: !!cid, satinAldi, zatenYorumladi,
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
  const prods = await prisma.product.findMany({ where: { tenantId: store.tenantId, id: { in: items.map((i) => i.productId) }, aktif: true }, include: { variations: { select: { ad: true, deger: true, stok: true, ekFiyat: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } });
  const pMap = new Map(prods.map((p) => [p.id, p]));
  // Katalog item'larında Product bulunamayanlar drop (freeProduct) olabilir — onları da çöz
  const missingIds = items.map((i) => i.productId).filter((id) => !pMap.has(id));
  const freeProds = missingIds.length
    ? await prisma.freeProduct.findMany({ where: { tenantId: store.tenantId, aktif: true, id: { in: missingIds } } })
    : [];
  const fMap = new Map(freeProds.map((fp) => {
    const vars: any[] = Array.isArray(fp.variations) ? (fp.variations as any[]) : [];
    const stokTop = vars.length ? vars.reduce((s, v) => s + (Number(v.stok) || 0), 0) : 1;
    return [fp.id, {
      id: fp.id, ad: fp.ad, salesCode: fp.salesCode, marka: null, cinsiyet: fp.cinsiyet, images: fp.images,
      satisFiyat: fp.satisFiyat, eskiFiyat: null, stokAdeti: stokTop,
      variations: vars.map((v) => ({ ad: v.ad || 'Beden', deger: v.deger, stok: Number(v.stok) || 0, ekFiyat: Number(v.ekFiyat) || 0 })),
    }];
  }));
  const now = Date.now();
  const list = items.map((i) => {
    const p: any = pMap.get(i.productId) || fMap.get(i.productId); if (!p) return null;
    const flashAktif = !!(i.flashFiyat && i.flashBitis && new Date(i.flashBitis).getTime() > now);
    return { id: i.id, productId: p.id, ad: p.ad, salesCode: p.salesCode, marka: p.marka, cinsiyet: p.cinsiyet, images: p.images, satisFiyat: p.satisFiyat, eskiFiyat: p.eskiFiyat, stokAdeti: p.stokAdeti, variations: p.variations, flashFiyat: flashAktif ? i.flashFiyat : null, flashBitis: flashAktif ? i.flashBitis : null };
  }).filter(Boolean);
  const cfg: any = store.config || {};
  res.json({ ad: store.logoText || 'Ürün Kataloğu', logo: cfg.logo || store.heroImage || '', slug: store.slug, magazaAktif: store.active, items: list });
}));
// Yayına özel katalog — o canlı yayında satışa sunulan ürünler (LiveStream.token ile)
router.get('/katalog/stream/:token', asyncHandler(async (req: Request, res: Response) => {
  const stream = await prisma.liveStream.findFirst({ where: { token: req.params.token } });
  if (!stream) throw new ApiError(404, 'Yayin bulunamadi');
  const t = stream.tenantId;
  const los = await prisma.liveOrder.findMany({ where: { tenantId: t, streamId: stream.id }, orderBy: { createdAt: 'asc' } });
  // distinct ürünler: productId varsa ona göre, yoksa urun adına göre
  const prodIds = Array.from(new Set(los.map((o) => o.productId).filter(Boolean))) as string[];
  const prods = prodIds.length
    ? await prisma.product.findMany({ where: { tenantId: t, id: { in: prodIds }, aktif: true }, include: { variations: { select: { ad: true, deger: true, stok: true, ekFiyat: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } })
    : [];
  const pMap = new Map(prods.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const items: any[] = [];
  for (const o of los) {
    const key = o.productId || ('ad:' + o.urun);
    if (seen.has(key)) continue;
    seen.add(key);
    const p: any = o.productId ? pMap.get(o.productId) : null;
    if (p) {
      items.push({ id: p.id, ad: p.ad, salesCode: p.salesCode, marka: p.marka, images: p.images, satisFiyat: p.satisFiyat, eskiFiyat: p.eskiFiyat, stokAdeti: p.stokAdeti, variations: p.variations });
    } else {
      items.push({ id: key, ad: o.urun, salesCode: o.kod || null, marka: null, images: o.gorsel ? [o.gorsel] : [], satisFiyat: o.tutar, eskiFiyat: null, stokAdeti: null, variations: o.variation ? [{ ad: 'Beden', deger: o.variation, stok: 0, ekFiyat: 0 }] : [] });
    }
  }
  // Ek olarak: bu yayın sırasında "Ürün Bul"da açılan/okutulan ürünler de yansısın.
  // Bunlar liveOrder oluşturmadan CatalogItem'a yazılır (/store/catalog/add). Yayın başlangıcından
  // sonra güncellenen katalog kalemlerini de listeye ekle (sipariş olmasa bile katalogda görünsün).
  try {
    const since = stream.startedAt || new Date(0);
    const citems = await prisma.catalogItem.findMany({ where: { tenantId: t, updatedAt: { gte: since } }, orderBy: { updatedAt: 'desc' }, take: 200 });
    const catIds = Array.from(new Set(citems.map((c) => c.productId).filter(Boolean))) as string[];
    const need = catIds.filter((id) => !seen.has(id));
    if (need.length) {
      const flashMap = new Map(citems.map((c) => [c.productId, c]));
      const cprods = await prisma.product.findMany({ where: { tenantId: t, id: { in: need }, aktif: true }, include: { variations: { select: { ad: true, deger: true, stok: true, ekFiyat: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } });
      const cpMap = new Map(cprods.map((p) => [p.id, p]));
      const missing = need.filter((id) => !cpMap.has(id));
      const cfree = missing.length ? await prisma.freeProduct.findMany({ where: { tenantId: t, id: { in: missing }, aktif: true } }) : [];
      for (const id of need) {
        if (seen.has(id)) continue;
        const ci: any = flashMap.get(id);
        const flashActive = ci?.flashFiyat && ci?.flashBitis && new Date(ci.flashBitis).getTime() > Date.now();
        const p: any = cpMap.get(id);
        if (p) {
          seen.add(id);
          items.push({ id: p.id, ad: p.ad, salesCode: p.salesCode, marka: p.marka, images: p.images, satisFiyat: flashActive ? ci.flashFiyat : p.satisFiyat, eskiFiyat: flashActive ? p.satisFiyat : p.eskiFiyat, stokAdeti: p.stokAdeti, variations: p.variations, flashBitis: flashActive ? ci.flashBitis : null });
          continue;
        }
        const fp: any = cfree.find((f) => f.id === id);
        if (fp) {
          seen.add(id);
          const vars: any[] = Array.isArray(fp.variations) ? (fp.variations as any[]) : [];
          const stokTop = vars.length ? vars.reduce((s, v) => s + (Number(v.stok) || 0), 0) : 1;
          items.push({ id: fp.id, ad: fp.ad, salesCode: fp.salesCode, marka: null, images: fp.images, satisFiyat: flashActive ? ci.flashFiyat : fp.satisFiyat, eskiFiyat: flashActive ? fp.satisFiyat : null, stokAdeti: stokTop, variations: vars.map((v) => ({ ad: v.ad || 'Beden', deger: v.deger, stok: Number(v.stok) || 0, ekFiyat: Number(v.ekFiyat) || 0 })), flashBitis: flashActive ? ci.flashBitis : null });
        }
      }
    }
  } catch { /* katalog ek listesi opsiyonel */ }
  res.json({ ad: stream.baslik || 'Canlı Yayın Kataloğu', baslik: stream.baslik || '', token: stream.token, startedAt: stream.startedAt, endedAt: stream.endedAt, aktif: stream.status === 'active', items });
}));

// Tedarikçi ürünlerinden derlenen, dışarıya paylaşılabilir özel katalog (FreeCatalog.token ile)
router.get('/katalog/tedarikci/:token', asyncHandler(async (req: Request, res: Response) => {
  const cat = await prisma.freeCatalog.findFirst({ where: { token: req.params.token, aktif: true } });
  if (!cat) throw new ApiError(404, 'Katalog bulunamadi');
  const ids = Array.isArray(cat.productIds) ? (cat.productIds as any[]).map(String) : [];
  let items: any[] = [];
  if (ids.length) {
    const prods = await prisma.freeProduct.findMany({ where: { tenantId: cat.tenantId, id: { in: ids }, aktif: true } });
    const pMap = new Map(prods.map((p) => [p.id, p]));
    items = ids
      .map((id) => pMap.get(id))
      .filter(Boolean)
      .filter((p: any) => { const vs = Array.isArray(p.variations) ? p.variations : []; return vs.length === 0 || vs.some((v: any) => (v?.stok || 0) > 0); })
      .map((p: any) => ({ id: p.id, ad: p.ad, salesCode: p.salesCode, satisFiyat: p.satisFiyat, images: p.images, variations: p.variations, marka: p.marka, cinsiyet: p.cinsiyet }));
  }
  res.json({ ad: cat.ad, whatsapp: cat.whatsapp || '05334413472', token: cat.token, items });
}));

// Dışarıya açık Landing Page (link-in-bio destek paneli)
router.get('/landing/:slug', asyncHandler(async (req: Request, res: Response) => {
  const store = await prisma.storeSetting.findFirst({ where: { slug: req.params.slug } });
  if (!store) throw new ApiError(404, 'Sayfa bulunamadi');
  const cfg: any = store.config || {};
  const lp: any = cfg.landingPage || {};
  res.json({
    baslik: lp.baslik || store.logoText || 'Mağaza',
    tagline: lp.tagline ?? '',
    panelBaslik: lp.panelBaslik ?? 'Müşteri Destek Paneli',
    logo: lp.logo || cfg.logo || store.heroImage || '',
    bgStart: lp.bgStart || '#0b1736',
    bgEnd: lp.bgEnd || '#1e3a8a',
    butonlar: Array.isArray(lp.butonlar) ? lp.butonlar.map((b: any) => ({ id: b.id, label: b.label || '', url: b.url || '', icon: b.icon || 'link', renk: b.renk || '#0f172a' })) : [],
  });
}));
// Yorum gönder — SADECE ürünü satın almış üye değerlendirme yapabilir
router.post('/store/:slug/urun/:id/yorum', asyncHandler(async (req: Request, res: Response) => {
  const store = await prisma.storeSetting.findFirst({ where: { slug: req.params.slug, active: true } });
  if (!store) throw new ApiError(404, 'Magaza bulunamadi');
  const p = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: store.tenantId } });
  if (!p) throw new ApiError(404, 'Ürün bulunamadi');
  const cid = await shopAuth(req, store.tenantId);
  if (!cid) throw new ApiError(401, 'Değerlendirme yapmak için üye girişi yapmalısınız.');
  const bought = await customerBoughtProduct(store.tenantId, cid, p.id);
  if (!bought) throw new ApiError(403, 'Yalnızca bu ürünü satın alan üyeler değerlendirme yapabilir.');
  const customer = await prisma.customer.findFirst({ where: { id: cid, tenantId: store.tenantId } });
  const { puan, yorum, gorsel } = req.body || {};
  const adAuto = String(customer?.ad || 'Üye').slice(0, 60);
  const payload = {
    ad: adAuto,
    puan: Math.min(5, Math.max(1, Number(puan) || 5)),
    yorum: yorum ? String(yorum).slice(0, 1000) : null,
    gorsel: gorsel ? String(gorsel).slice(0, 2_000_000) : null,
    onayli: true,
  };
  // Aynı müşteri aynı üründe tek değerlendirme tutar — varsa günceller
  const existing = await prisma.productReview.findFirst({ where: { tenantId: store.tenantId, productId: p.id, customerId: cid } });
  const r = existing
    ? await prisma.productReview.update({ where: { id: existing.id }, data: payload })
    : await prisma.productReview.create({ data: { tenantId: store.tenantId, productId: p.id, customerId: cid, ...payload } });
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
    const tkey = tk10(musteri.telefon); const ikey = igk(musteri.instagram);
    let c = tkey ? await prisma.customer.findFirst({ where: { tenantId, telKey: tkey } }) : null;
    if (!c && ikey) c = await prisma.customer.findFirst({ where: { tenantId, igKey: ikey } });
    if (!c) {
      const ccount = await prisma.customer.count({ where: { tenantId } });
      c = await prisma.customer.create({ data: { tenantId, musteriNo: 1000 + ccount + 1, ad: musteri.ad || musteri.instagram || musteri.telefon || 'Mağaza Müşterisi', telefon: musteri.telefon || null, telKey: tkey, instagram: musteri.instagram || null, igKey: ikey, not: 'Videolu mağaza' } });
    }
    customerId = c.id; handle = musteri.instagram || musteri.ad || null;
  }
  const token = genToken();
  const sipNo = await generateSipNo(prisma);
  const order = await prisma.storeOrder.create({ data: { tenantId, ...(await nextOrderNo(prisma, tenantId)), sipNo, kanal: 'online', durum: 'sepet', token, customerId, musteriHandle: handle, items: orderItems, araToplam: kamp.araToplam, indirim: kamp.indirim, kampanyalar: kamp.kampanyalar, toplam: kamp.toplam } });
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
  // Server-side zorunlu alan dogrulamasi: ad soyad, telefon, adres, instagram
  const cAd = String(customer?.ad || '').trim();
  const cTel = String(customer?.telefon || '').trim();
  const cAdres = String(customer?.adres || '').trim();
  const cInsta = String(customer?.instagram || '').trim();
  if (!cAd) throw new ApiError(422, 'Ad soyad zorunludur');
  if (!cTel) throw new ApiError(422, 'Telefon zorunludur');
  if (cTel.replace(/\D/g, '').length < 10) throw new ApiError(422, 'Geçerli bir telefon girin (en az 10 hane)');
  if (!cAdres) throw new ApiError(422, 'Teslimat adresi zorunludur');
  if (!cInsta) throw new ApiError(422, 'Instagram kullanıcı adı zorunludur');
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(422, 'Sepet bos');

  // ── KATALOG AKIŞIYLA AYNI MODEL: "Talebi Gönder" HİÇBİR sipariş/StoreOrder/stok
  //    değişikliği YAPMAZ. Yalnızca bir TASLAK CatalogRequest (talepNo) oluşturulur ve
  //    müşteriye wa.me linki + hazır (prefilled) metin döner. Müşteri bu mesajı KENDİ
  //    WhatsApp'ından mağaza numarasına gönderdiğinde, GELEN mesaj webhook'u talepNo'yu
  //    tanır ve catalogOrderTrigger ASIL siparişi oluşturur + stok düşer + 14 dk sayaç
  //    O AN başlar. Mesaj gelmezse taslak beklemede kalır → HİÇBİR sipariş/stok oluşmaz. ─

  // Fiyatlari DB'den dogrula (yalnızca metin/tutar için — stok DÜŞÜLMEZ)
  const prodMap = new Map(data.products.map((p) => [p.id, p]));
  const orderItems: any[] = [];
  let araToplam = 0;
  for (const it of items) {
    const p: any = prodMap.get(it.productId);
    if (!p) continue;
    const adet = Math.max(1, Number(it.adet) || 1);
    const v = it.varyasyon ? (p.variations || []).find((x: any) => x.deger === it.varyasyon) : null;
    const birim = (p.satisFiyat || 0) + (v?.ekFiyat || 0);
    araToplam += birim * adet;
    const adAd = it.varyasyon ? `${p.ad} (${it.varyasyon})` : p.ad;
    // stokDusuldu: true → siparişi tetikleyen webhook iptal ederse stok iadesi doğru çalışır.
    orderItems.push({ productId: p.id, ad: adAd, varyasyon: it.varyasyon || null, adet, fiyat: birim, stokDusuldu: true });
  }
  if (orderItems.length === 0) throw new ApiError(422, 'Gecerli urun yok');

  // Indirim: kupon (kampanya indirimi asıl sipariş oluşurken uygulanır)
  let indirim = 0;
  let kuponKodu: string | null = null;
  if (discountCode) {
    const d = await prisma.discountCode.findFirst({ where: { tenantId, code: String(discountCode).toUpperCase(), aktif: true } });
    if (d) { indirim = d.tip === 'yuzde' ? (araToplam * d.deger) / 100 : d.deger; kuponKodu = String(discountCode).toUpperCase(); }
  }
  indirim = Math.min(araToplam, indirim);
  const toplam = Math.max(0, araToplam - indirim);

  // ── Müşteriyi taslak anında upsert et (STOK DEĞİŞMEZ) ─────────────────────────
  // Böylece adres/instagram bilgisi kaybolmaz ve webhook siparişi tetiklerken
  // müşteriyi telKey (son 10 hane) ile bulup StoreOrder'a bağlar (katalog mantığı).
  const telKeyN = tk10(cTel); const igKeyN = igk(cInsta);
  let custId: string | null = null;
  try {
    const mevcutlar = await prisma.customer.findMany({ where: { tenantId } });
    let cust = (telKeyN ? mevcutlar.find((c) => tk10(c.telefon) === telKeyN) : null)
      || (igKeyN ? mevcutlar.find((c) => igk(c.instagram) === igKeyN) : null) || null;
    if (!cust) {
      cust = await prisma.customer.create({
        data: { tenantId, musteriNo: 1000 + mevcutlar.length + 1, ad: cAd, telefon: cTel, telKey: telKeyN, instagram: cInsta, igKey: igKeyN, email: customer?.email || null, adres: cAdres, not: 'Online mağaza talebi (taslak)' },
      });
    } else {
      const upd: any = {};
      if (!cust.adres && cAdres) upd.adres = cAdres;
      if (!cust.instagram && cInsta) { upd.instagram = cInsta; upd.igKey = igKeyN; }
      if (Object.keys(upd).length > 0) await prisma.customer.update({ where: { id: cust.id }, data: upd });
    }
    custId = cust.id;
  } catch { /* müşteri upsert hatası taslağı engellemesin */ }

  // ── Taslak CatalogRequest oluştur (wpIletildi:false, durum:'beklemede') ────────
  // Katalog talebiyle BİREBİR aynı: talepNo = T + 6 alfanumerik; rezervBitis:null
  // (sayaç HENÜZ başlamaz — asıl siparişi webhook tetiklediğinde başlar).
  const catSetting = await prisma.catalogSetting.findUnique({ where: { tenantId } }).catch(() => null);
  const rezervDk = catSetting?.rezervSureDk || 14;
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let talepNo = '';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = 'T';
    for (let i = 0; i < 6; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
    const ex = await prisma.catalogRequest.findFirst({ where: { talepNo: code } });
    if (!ex) { talepNo = code; break; }
  }
  if (!talepNo) throw new ApiError(500, 'Talep numarası üretilemedi');

  await prisma.catalogRequest.create({
    data: {
      tenantId,
      catalogId: 'online', // online mağaza kaynaklı — gerçek katalog analizini kirletmez
      talepNo,
      items: orderItems,
      toplam, // indirim düşülmüş net tutar
      indirim,
      kuponKodu,
      musteri: cAd || null,
      telefon: cTel || null,
      customerId: custId,
      durum: 'beklemede',   // TASLAK — asıl sipariş yok
      wpIletildi: false,    // müşteri mesajı gelene kadar false; gelince catalogOrderTrigger true yapar
      rezervBitis: null,    // sayaç müşteri mesaj gönderince (webhook) başlar
    },
  });

  // ── Müşterinin GERÇEKTEN göndereceği prefilled WhatsApp metni ─────────────────
  // "Talep No: XXXXXXX" formatı KRİTİK: webhook extractTalepNo() bu metinden talepNo'yu
  // tanır ve asıl siparişi tetikler. (Katalog talep mesajıyla aynı desen.)
  const satirlar = orderItems.map((it: any) => `• ${it.ad}${it.varyasyon ? '' : ''} x${it.adet} → ${(Number(it.fiyat) * Number(it.adet)).toLocaleString('tr-TR')}₺`).join('\n');
  const whatsappMsg =
    `🛒 *Yeni Online Sipariş Talebi*\n\n` +
    `🔢 Talep No: *${talepNo}*\n` +
    `👤 ${cAd}${cInsta ? ' (@' + cInsta.replace(/^@/, '') + ')' : ''}\n` +
    `📞 ${cTel}\n` +
    `📍 ${cAdres}\n\n` +
    `📦 Ürünler:\n${satirlar}\n\n` +
    `${indirim > 0 ? '🏷️ İndirim: -' + indirim.toLocaleString('tr-TR') + '₺\n' : ''}` +
    `💰 *Toplam: ${toplam.toLocaleString('tr-TR')}₺*\n\n` +
    `⏱️ Rezerv Süresi: ${rezervDk} dakika\n\n` +
    `⚠️ Bu mesajı göndererek siparişimi iletiyorum. İletilmeden sipariş oluşmaz.`;

  // wa.me hedefi: mağazanın WhatsApp panel hattı numarası (yoksa STORE_WA_PANEL_PHONE=05323093472).
  // Numara katalog/panel altyapısından çözülür; sabit gömülmez.
  const waTarget = await resolveStoreWaTargetPhone(tenantId).catch(() => null);

  // HİÇBİR StoreOrder/PayTR/stok işlemi YOK — sadece taslak + wa.me yönlendirme verisi döner.
  res.status(201).json({
    ok: true,
    draft: true,
    talepNo,
    toplam,
    indirim,
    rezervDk,
    whatsapp: waTarget,     // 90XXXXXXXXXX (wa.me hedefi)
    whatsappMsg,            // prefilled metin (Talep No dahil)
  });
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
    // Idempotency: ayni merchant_oid ile gelen tekrar bildirimi (cift tahsilat) engelle
    const gecmis: any[] = Array.isArray(order.odemeGecmisi) ? [...(order.odemeGecmisi as any[])] : [];
    const dup = gecmis.some((g) => g && (g.oid === oid || g.id === oid));
    if (dup) { res.send('OK'); return; }
    // PayTR payment_amount kurus cinsinden; yoksa siparis toplamina dus
    const tutar = body.payment_amount ? Number(body.payment_amount) / 100 : (order.toplam || 0);
    gecmis.push({ id: oid, oid, tutar, yontem: 'paytr', tarih: new Date().toISOString() });
    const yeniTahsilat = (order.tahsilat || 0) + tutar;
    const tamOdeme = yeniTahsilat >= (order.toplam || 0) - 0.01;
    await prisma.$transaction(async (tx) => {
      await tx.storeOrder.update({ where: { id: order.id }, data: { durum: tamOdeme ? 'hazirlaniyor' : order.durum, tahsilat: yeniTahsilat, gelirKaydedilen: yeniTahsilat, odemeGecmisi: gecmis, odemeYontemi: 'Kredi Kartı (PayTR)', odemeBildirim: null, not: 'Odeme alindi (PayTR)' } });
      if (tutar > 0) {
        const now = new Date();
        const no = order.orderNo ? `${order.orderYil}-${String(order.orderNo).padStart(3, '0')}` : order.id.slice(-5);
        await tx.hareket.create({ data: { tenantId: order.tenantId, tarih: now.toISOString().slice(0, 10), saat: now.toTimeString().slice(0, 5), aciklama: `Online ödeme (PayTR) #${no}`, tutar, tip: 'gelir', kategori: 'Online Satış', createdBy: null } });
      }
    });
    // Görsel workflow: ödeme alındı + durum (hazırlanıyor) tetikleyicileri
    void startWorkflowRuns(order.tenantId, 'payment_received', { orderId: order.id });
    if (tamOdeme) void startWorkflowRuns(order.tenantId, 'status', { orderId: order.id, durum: 'hazirlaniyor' });
  } else {
    await prisma.storeOrder.update({ where: { id: order.id }, data: { durum: 'iptal', not: 'Odeme basarisiz (PayTR)' } });
  }
  res.send('OK');
}));

// ───── iyzico 3D Secure Ödeme ─────

// Taksit bilgisi sorgula (BIN ilk 6 hane)
router.post('/sepet/:token/iyzico-installment', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  const iyz = await getIyzico(cart.tenantId);
  if (!iyz) return res.json({ ok: false, configured: false });
  const bin = String(req.body.binNumber || '').replace(/\s/g, '');
  if (bin.length < 6) return res.json({ ok: false, error: 'Kart numarasının ilk 6 hanesini girin' });
  try {
    const result = await queryInstallment(iyz.iyzipay, bin, cart.toplam || 0);
    if (result.status !== 'success') return res.json({ ok: false, error: result.errorMessage || 'Taksit sorgulanamadı' });
    const details = (result.installmentDetails || []).map((d: any) => ({
      bankName: d.bankName || '',
      bankCode: d.bankCode || '',
      cardType: d.cardType || '',
      cardAssociation: d.cardAssociation || '',
      cardFamilyName: d.cardFamilyName || '',
      installments: (d.installmentPrices || []).map((ip: any) => ({
        count: ip.installmentNumber || 1,
        totalPrice: Number(ip.totalPrice) || 0,
        perInstallment: Number(ip.installmentPrice) || 0,
      })),
    }));
    return res.json({ ok: true, details });
  } catch (e: any) { return res.json({ ok: false, error: e.message || 'iyzico taksit sorgu hatası' }); }
}));

// 3D Secure başlat
router.post('/sepet/:token/iyzico-init', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token }, include: { customer: true } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  assertNotCancelled(cart);
  const items: any[] = Array.isArray(cart.items) ? (cart.items as any) : [];
  if (items.length === 0) throw new ApiError(422, 'Sepet boş');
  const toplam = cart.toplam || 0;
  if (toplam <= 0) throw new ApiError(422, 'Geçersiz tutar');
  const iyz = await getIyzico(cart.tenantId);
  if (!iyz) return res.json({ ok: false, configured: false });
  const { card, installment } = req.body || {};
  if (!card?.number || !card?.expMonth || !card?.expYear || !card?.cvc || !card?.holderName) throw new ApiError(422, 'Kart bilgileri eksik');
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const custName = cart.customer?.ad || cart.musteriHandle || 'Müşteri';
  const names = custName.trim().split(/\s+/);
  const firstName = names[0] || 'Müşteri';
  const lastName = names.length > 1 ? names.slice(1).join(' ') : firstName;
  const addr = cart.adres || cart.customer?.adres || 'Türkiye';
  const city = cart.il || 'Istanbul';
  const convId = `ord_${cart.id.slice(-8)}_${Date.now()}`;
  try {
    const result = await initThreeDS(iyz.iyzipay, {
      conversationId: convId,
      price: toplam,
      paidPrice: toplam,
      installment: Number(installment) || 1,
      basketId: cart.sipNo || cart.id.slice(-8),
      callbackUrl: `${env.APP_DOMAIN}/api/v1/public/iyzico/callback?token=${cart.token}`,
      buyer: { id: cart.customerId || cart.id, name: firstName, surname: lastName, email: cart.customer?.email || `sepet-${cart.id.slice(-6)}@diljar.com`, phone: cart.customer?.telefon || '+905000000000', ip, address: addr, city, country: 'Turkey' },
      shippingAddress: { address: addr, city, country: 'Turkey', contactName: custName },
      billingAddress: { address: addr, city, country: 'Turkey', contactName: custName },
      basketItems: items.map((it, i) => ({ id: `item_${i}`, name: String(it.ad || 'Ürün').slice(0, 50), category1: 'Genel', itemType: 'PHYSICAL', price: Number(it.toplam || it.fiyat || 0) })),
      card: { holderName: card.holderName, number: card.number, expMonth: String(card.expMonth).padStart(2, '0'), expYear: String(card.expYear), cvc: String(card.cvc) },
    });
    if (result.status !== 'success') return res.json({ ok: false, error: result.errorMessage || 'iyzico 3D başlatılamadı' });
    // iyzico conversationId'yi sakla
    await prisma.storeOrder.update({ where: { id: cart.id }, data: { not: `iyzico_conv:${convId}` } });
    return res.json({ ok: true, htmlContent: result.threeDSHtmlContent || result.htmlContent || '' });
  } catch (e: any) { return res.json({ ok: false, error: e.message || 'iyzico ödeme hatası' }); }
}));

// 3D Secure callback (iyzico banka doğrulama sonrası buraya yönlendirir)
router.post('/iyzico/callback', express.urlencoded({ extended: false }), asyncHandler(async (req: Request, res: Response) => {
  const token = (req.query.token || req.body.token || '') as string;
  const paymentId = req.body.paymentId || '';
  const status3d = req.body.status || req.body.mdStatus || '';
  if (!token) { res.redirect(`${env.APP_DOMAIN}/?payment=fail`); return; }
  const cart = await prisma.storeOrder.findFirst({ where: { token } });
  if (!cart) { res.redirect(`${env.APP_DOMAIN}/?payment=fail`); return; }
  if (status3d !== 'success' && status3d !== '1') {
    res.redirect(`${env.APP_DOMAIN}/sepet/${token}?payment=fail`);
    return;
  }
  const iyz = await getIyzico(cart.tenantId);
  if (!iyz) { res.redirect(`${env.APP_DOMAIN}/sepet/${token}?payment=fail`); return; }
  try {
    const result = await completeThreeDS(iyz.iyzipay, paymentId, req.body.conversationId);
    if (result.status === 'success') {
      const tutar = Number(result.paidPrice) || cart.toplam || 0;
      const gecmis: any[] = Array.isArray(cart.odemeGecmisi) ? [...(cart.odemeGecmisi as any[])] : [];
      gecmis.push({ id: result.paymentId || paymentId, tutar, yontem: 'iyzico', tarih: new Date().toISOString(), paymentId: result.paymentId, installment: result.installment || 1 });
      const yeniTahsilat = (cart.tahsilat || 0) + tutar;
      const tamOdeme = yeniTahsilat >= (cart.toplam || 0);
      const already = (cart.gelirKaydedilen || 0) > 0;
      await prisma.$transaction(async (tx) => {
        await tx.storeOrder.update({
          where: { id: cart.id },
          data: {
            tahsilat: yeniTahsilat,
            gelirKaydedilen: yeniTahsilat,
            odemeGecmisi: gecmis,
            odemeYontemi: 'Kredi Kartı (iyzico)',
            odemeBildirim: null,
            durum: tamOdeme ? 'hazirlaniyor' : cart.durum,
            not: `iyzico ödeme alındı (${result.paymentId})`,
          },
        });
        if (!already && tutar > 0) {
          const now = new Date();
          const no = cart.sipNo || cart.id.slice(-5);
          await tx.hareket.create({
            data: {
              tenantId: cart.tenantId,
              tarih: now.toISOString().slice(0, 10),
              saat: now.toTimeString().slice(0, 5),
              aciklama: `Online ödeme (iyzico) #${no}`,
              tutar,
              tip: 'gelir',
              kategori: 'Online Satış',
              createdBy: null,
            },
          });
        }
      });
      void startWorkflowRuns(cart.tenantId, 'payment_received', { orderId: cart.id });
      if (tamOdeme) void startWorkflowRuns(cart.tenantId, 'status', { orderId: cart.id, durum: 'hazirlaniyor' });
      res.redirect(`${env.APP_DOMAIN}/sepet/${token}?payment=success`);
    } else {
      res.redirect(`${env.APP_DOMAIN}/sepet/${token}?payment=fail`);
    }
  } catch (e: any) {
    console.error('iyzico callback error', e);
    res.redirect(`${env.APP_DOMAIN}/sepet/${token}?payment=fail`);
  }
}));

// ───── Chatbot (public) ─────
async function tenantBySlug(slug: string): Promise<string | null> {
  const raw = (slug || '').trim();
  if (!raw) return null;
  let s = await prisma.storeSetting.findFirst({ where: { slug: raw } });
  if (!s) s = await prisma.storeSetting.findFirst({ where: { slug: { equals: raw, mode: 'insensitive' } } });
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
// Telefonu 10 haneli (5xxxxxxxxx) anahtara indirger
const telKey = (s: string) => { let d = (s || '').replace(/\D/g, ''); if (d.startsWith('90')) d = d.slice(2); if (d.length === 11 && d.startsWith('0')) d = d.slice(1); return d; };

// Üyelik için telefona SMS doğrulama kodu gönder
router.post('/uye/:slug/kod-gonder', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await tenantBySlug(req.params.slug);
  if (!tenantId) throw new ApiError(404, `Mağaza linki geçersiz (adres: "${req.params.slug}").`);
  const telN = String(req.body?.telefon || '').replace(/\D/g, '');
  const telOk = (telN.length === 10 && telN.startsWith('5')) || (telN.length === 11 && telN.startsWith('05')) || (telN.length === 12 && telN.startsWith('905'));
  if (!telOk) throw new ApiError(422, 'Geçerli bir cep telefonu girin (05XX XXX XX XX).');
  const norm = telKey(telN);
  // Zaten üye olan numara/kullanıcı adına SMS gönderme — net hata ver
  const igN = igNorm(String(req.body?.instagram || ''));
  const mevcutlar = await prisma.customer.findMany({ where: { tenantId } });
  if (mevcutlar.some((c) => (c.not || '') === 'Üyelik formu' && telKey(c.telefon || '') === norm))
    throw new ApiError(409, 'Bu telefon numarası ile zaten üyelik oluşturulmuş. Her numara yalnızca bir kez üye olabilir.');
  if (igN && mevcutlar.some((c) => (c.not || '') === 'Üyelik formu' && igNorm(c.instagram || '') === igN))
    throw new ApiError(409, 'Bu Instagram kullanıcı adı ile zaten üyelik oluşturulmuş. Her kullanıcı adı yalnızca bir kez üye olabilir.');
  const key = uyeKodKey(tenantId, norm);
  const now = Date.now();
  const prev = uyeKodlar.get(key);
  if (prev && now - prev.lastSent < 60_000) {
    const sn = Math.ceil((60_000 - (now - prev.lastSent)) / 1000);
    throw new ApiError(429, `Çok sık denediniz. ${sn} saniye sonra tekrar deneyin.`);
  }
  const kod = String(Math.floor(1000 + Math.random() * 9000));
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const firma = (tenant?.name || '').trim();

  // Öncelik: WhatsApp API şablonu ile gönder; başarısız olursa SMS'e düş.
  let kanal = 'telefonunuza';
  let gonderildi = false;
  try {
    const line = await prisma.whatsappLine.findFirst({ where: { tenantId, channel: 'api', wabaId: { not: null }, accessToken: { not: null } }, orderBy: { apiVerified: 'desc' } });
    if (line) {
      const mid = await apiSendTemplate(line as any, norm, 'uyelik_kodu', 'tr', [kod], undefined, kod);
      if (mid) { gonderildi = true; kanal = 'WhatsApp numaranıza'; }
    }
  } catch (e) { /* WhatsApp gönderimi başarısız → SMS yedeğine düş */ }

  if (!gonderildi) {
    const msg = `Uyelik dogrulama kodunuz: ${kod}${firma ? ' - ' + firma : ''}`;
    const r = await sendSms(tenantId, [norm], msg);
    if (!r.ok) throw new ApiError(400, r.message || 'Doğrulama kodu gönderilemedi. Numaranızı kontrol edin.');
  }
  uyeKodlar.set(key, { kod, exp: now + 5 * 60_000, lastSent: now, tries: 0 });
  res.json({ ok: true, message: `Doğrulama kodu ${kanal} gönderildi.` });
}));

router.post('/uye/:slug', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await tenantBySlug(req.params.slug);
  if (!tenantId) throw new ApiError(404, `Mağaza linki geçersiz (adres: "${req.params.slug}"). Lütfen mağaza panelindeki güncel "Üyelik formu linki" ile açın.`);
  const { ad, instagram, telefon, adres, kod, cinsiyet } = req.body || {};
  if (!ad || !instagram || !telefon) throw new ApiError(422, 'Ad soyad, Instagram ve telefon zorunludur');
  const cinsiyetClean = String(cinsiyet || '').trim();
  if (!['Kadın', 'Erkek'].includes(cinsiyetClean)) throw new ApiError(422, 'Cinsiyet seçimi zorunludur.');
  const igClean = String(instagram).trim().replace(/^@+/, '');
  // Mükerrer kontrol: aynı Instagram (veya telefon) zaten kayıtlıysa yeni kayıt AÇMA.
  const igN = igNorm(igClean);
  const telN = String(telefon).replace(/\D/g, '');
  // SMS doğrulama: telefona gönderilen kod doğru olmalı
  const dogKey = uyeKodKey(tenantId, telKey(telN));
  const rec = uyeKodlar.get(dogKey);
  if (!rec || rec.exp < Date.now()) { uyeKodlar.delete(dogKey); throw new ApiError(422, 'Doğrulama kodu bulunamadı veya süresi doldu. Lütfen yeni kod isteyin.'); }
  if (rec.tries >= 5) { uyeKodlar.delete(dogKey); throw new ApiError(429, 'Çok fazla hatalı deneme. Lütfen yeni kod isteyin.'); }
  if (String(kod || '').replace(/\D/g, '') !== rec.kod) { rec.tries += 1; throw new ApiError(422, 'Doğrulama kodu hatalı. Telefonunuza gelen 4 haneli kodu girin.'); }
  uyeKodlar.delete(dogKey);
  const mevcutlar = await prisma.customer.findMany({ where: { tenantId } });
  const telMatch = mevcutlar.find((c) => telKey(telN).length >= 10 && telKey(c.telefon || '') === telKey(telN));
  const igMatch = mevcutlar.find((c) => igN && igNorm(c.instagram || '') === igN);
  // Zaten ÜYE olan numara/kullanıcı adı ile ikinci kez kayıt AÇMA
  if (telMatch && (telMatch.not || '') === 'Üyelik formu')
    throw new ApiError(409, 'Bu telefon numarası ile zaten üyelik oluşturulmuş. Her numara yalnızca bir kez üye olabilir.');
  if (igMatch && (igMatch.not || '') === 'Üyelik formu')
    throw new ApiError(409, 'Bu Instagram kullanıcı adı ile zaten üyelik oluşturulmuş. Her kullanıcı adı yalnızca bir kez üye olabilir.');
  const existing = telMatch || igMatch;
  if (existing) {
    // Otomatik oluşmuş kayıt (canlı yayın/online sipariş) -> üyeliği tamamla, mükerrer kayıt açma.
    const patch: any = { not: 'Üyelik formu' };
    // Instagram: mevcut değer varsa DOKUNMA (müşteri daha önce farklı formatta kaydetmiş olabilir).
    // Mevcut değer boşsa güvenle yaz.
    if (igClean && !existing.instagram) patch.instagram = igClean;
    if (!(existing as any).igKey && (igClean || existing.instagram)) patch.igKey = igk(igClean || existing.instagram);
    if (!existing.telKey && existing.telefon) patch.telKey = tk10(existing.telefon);
    if (!existing.cinsiyet && cinsiyetClean) patch.cinsiyet = cinsiyetClean;
    if (!existing.telefon && telefon) patch.telefon = telefon;
    if ((!existing.ad || igNorm(existing.ad) === igNorm(existing.instagram || '')) && ad) patch.ad = ad;
    if (!existing.adres && adres) patch.adres = adres;
    const cust = await prisma.customer.update({ where: { id: existing.id }, data: patch });
    await promoteReserved(tenantId, cust);
    return res.status(200).json({ ok: true, existed: true });
  }
  // Yeni kayıt -> Instagram kullanıcı adı format kontrolü
  // (3. parti scraper ile "gerçekten var mı" kontrolü kaldırıldı: geçerli kullanıcıları
  //  yanlışlıkla "bulunamadı" diye engelliyor ve kayda 9 sn'ye kadar gecikme ekliyordu)
  const igFmt = igClean.toLowerCase().replace(/^@+/, '').trim();
  const igFormatGecerli = /^[a-z0-9._]{1,30}$/.test(igFmt) && !/\.\./.test(igFmt) && !igFmt.startsWith('.') && !igFmt.endsWith('.');
  if (!igFormatGecerli) throw new ApiError(422, `"${igClean}" geçerli bir Instagram kullanıcı adı değil. Sadece harf, rakam, nokta ve alt çizgi kullanın (örn. kullanici_adi).`);
  const customer = await prisma.customer.create({ data: { tenantId, musteriNo: 1000 + mevcutlar.length + 1, ad, instagram: igClean, igKey: igk(igClean), telefon, telKey: tk10(telefon), cinsiyet: cinsiyetClean, adres: adres || null, not: 'Üyelik formu' } });
  await promoteReserved(tenantId, customer);
  res.status(201).json({ ok: true });
}));

// ───── Sepet (public link) ─────
const cartModifiable = (durum: string) => durum === 'sepet' || durum === 'yeni';
// İptal edilmiş sepete ödeme/işlem yapılamaz
const assertNotCancelled = (cart: { durum: string }) => {
  if (cart.durum === 'iptal') throw new ApiError(409, 'Bu sepet iptal edilmiştir; ödeme veya işlem yapılamaz.');
};

router.get('/sepet/:token', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token }, include: { customer: true } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  const tenant = await prisma.tenant.findUnique({ where: { id: cart.tenantId }, select: { name: true } });
  const setting = await prisma.storeSetting.findUnique({ where: { tenantId: cart.tenantId } }).catch(() => null);
  const items: any[] = Array.isArray(cart.items) ? (cart.items as any) : [];
  const ids = items.map((it) => it.productId).filter(Boolean);
  const prods = ids.length ? await prisma.product.findMany({ where: { tenantId: cart.tenantId, id: { in: ids } }, select: { id: true, images: true, barkod: true, salesCode: true, sku: true } }) : [];
  const pMap = new Map(prods.map((p) => [p.id, p]));
  const itemsWithImg = items.map((it) => { const p: any = pMap.get(it.productId); return { ...it, img: (Array.isArray(p?.images) ? (p.images as any)[0] : '') || it.gorsel || it.img || '', barkod: p?.barkod || '', salesCode: p?.salesCode || '', sku: p?.sku || '' }; });
  // Ürün başına kampanya indirimi: müşteri her kalemde normal + kampanya sonrası fiyatı görsün
  let perItemDisc: number[] = [];
  try { perItemDisc = await campaignPerItem(prisma, cart.tenantId, items, { lockedIds: lockedCampaignIds(cart) }); } catch { perItemDisc = []; }
  itemsWithImg.forEach((it: any, i: number) => {
    const lineDisc = perItemDisc[i] || 0;
    const adet = Number(it.adet) || 1;
    const birim = Number(it.fiyat) || 0;
    if (lineDisc > 0.009 && birim > 0) {
      const birimIndirimli = Math.max(0, Math.round((birim - lineDisc / adet) * 100) / 100);
      it.kampanyaIndirim = lineDisc;                 // satır toplam indirim
      it.birimNormal = birim;                        // normal birim fiyat
      it.birimIndirimli = birimIndirimli;            // kampanya sonrası birim fiyat
      it.satirIndirimli = Math.max(0, Math.round((birim * adet - lineDisc) * 100) / 100); // satır toplam (kampanya sonrası)
    }
  });
  // Öneriler (canlı yayına özel fırsatlar) — admin'den aç/kapa + kaynak seçimi (mağaza ⇄ katalog) + elle seçim
  const oneriCfg: any = (setting?.config as any) || {};
  const oneriEnabled = oneriCfg.oneriEnabled !== false; // varsayılan açık
  const oneriKaynak = oneriCfg.oneriKaynak === 'katalog' ? 'katalog' : 'magaza'; // varsayılan: mağaza ürünleri
  const oneriSecili: string[] = Array.isArray(oneriCfg.oneriProductIds) ? oneriCfg.oneriProductIds.filter(Boolean) : [];
  let oneriRaw: any[] = [];
  if (oneriEnabled) {
    if (oneriSecili.length) {
      // Elle seçim her zaman önceliklidir (kaynaktan bağımsız)
      const seciliIds = oneriSecili.filter((id) => !ids.includes(id));
      oneriRaw = seciliIds.length
        ? await prisma.product.findMany({ where: { tenantId: cart.tenantId, aktif: true, stokAdeti: { gt: 0 }, id: { in: seciliIds } }, include: { variations: true } })
        : [];
    } else if (oneriKaynak === 'katalog') {
      // Katalogda (canlıda okutulan) bulunan ürünleri öner — CatalogItem → Product
      const citems = await prisma.catalogItem.findMany({ where: { tenantId: cart.tenantId }, orderBy: { updatedAt: 'desc' }, take: 40 });
      const catIds = [...new Set(citems.map((c) => c.productId).filter(Boolean))].filter((id) => !ids.includes(id));
      oneriRaw = catIds.length
        ? await prisma.product.findMany({ where: { tenantId: cart.tenantId, aktif: true, stokAdeti: { gt: 0 }, id: { in: catIds } }, include: { variations: true } })
        : [];
      const orderMap = new Map(catIds.map((id, i) => [id, i]));
      oneriRaw = oneriRaw.sort((a, b) => (orderMap.get(a.id) ?? 99) - (orderMap.get(b.id) ?? 99)).slice(0, 8);
    } else {
      oneriRaw = await prisma.product.findMany({ where: { tenantId: cart.tenantId, aktif: true, stokAdeti: { gt: 0 }, id: { notIn: ids.length ? ids : ['_'] } }, orderBy: [{ oneCikan: 'desc' }, { createdAt: 'desc' }], take: 8, include: { variations: true } });
    }
  }
  const oneriler = oneriRaw.map((p) => ({ id: p.id, ad: p.ad, fiyat: p.satisFiyat, eskiFiyat: p.eskiFiyat, img: (Array.isArray(p.images) ? (p.images as any)[0] : '') || '', stok: p.stokAdeti, bedenler: (p.variations || []).filter((v: any) => v.stok > 0).map((v: any) => v.deger) }));
  // Kargo etiketi: eşik üstündeyse ücretsiz; eşik altındaysa alıcı ödemeli (sepet toplamına eklenmez)
  let cfgObj: any = setting?.config || {};
  if (typeof cfgObj === 'string') { try { cfgObj = JSON.parse(cfgObj); } catch { cfgObj = {}; } }
  const malToplam = cart.toplam || 0; // araToplam - indirim
  // Bakiyeden ödenen tutar kargo eşik değerine sayılmaz; yalnız bakiye dışı ödemeler eşiğe tabidir
  const bakiyeOdenen = (Array.isArray(cart.odemeGecmisi) ? (cart.odemeGecmisi as any[]) : []).filter((r) => String(r?.yontem || '').toLocaleLowerCase('tr').includes('bakiye')).reduce((s, r) => s + (Number(r?.tutar) || 0), 0);
  const esikTutar = Math.max(0, malToplam - bakiyeOdenen);
  const freeShip = setting?.freeShipThreshold || 0;
  const kargoEtiket = (freeShip > 0 && esikTutar >= freeShip) ? 'ucretsiz' : 'alici_odemeli';
  const kargoUcreti = 0; // sepet toplamına kargo eklenmez (alıcı ödemeli teslimatta tahsil edilir)
  const banka = {
    ad: setting?.bankaAd || '',
    iban: setting?.iban || '',
    hesapSahibi: setting?.hesapSahibi || '',
    not: cfgObj.bankaNot || '',
  };
  const oneriGoster = cfgObj.oneriEnabled !== false;
  res.json({
    magaza: setting?.logoText || tenant?.name || 'Mağaza',
    slug: setting?.slug || null,
    durum: cart.durum,
    duzenlenebilir: cartModifiable(cart.durum),
    items: itemsWithImg,
    araToplam: cart.araToplam,
    indirim: cart.indirim,
    indirimKodu: cart.indirimKodu || null,
    kargoUcreti,
    kargoEtiket,
    freeShipThreshold: setting?.freeShipThreshold || 0,
    puanOrani: setting?.puanOrani || 0,
    odemeLinki: cart.odemeLinki || null,
    odemeLinkiSon: cart.odemeLinkiSon || null,
    toplam: malToplam,
    tahsilat: (cart as any).tahsilat || 0,
    odendi: ((cart as any).tahsilat || 0) >= (malToplam || 0) - 0.01 && (malToplam || 0) > 0,
    odemeYontemi: (cart as any).odemeYontemi || null,
    createdAt: cart.createdAt,
    sipNo: cart.sipNo || (cart.orderNo ? `${cart.orderYil}-${String(cart.orderNo).padStart(3, '0')}` : null),
    adres: cart.adres || cart.customer?.adres || '',
    il: cart.il || cart.customer?.il || '',
    ilce: cart.ilce || cart.customer?.ilce || '',
    odemeBildirim: cart.odemeBildirim || null,
    banka,
    musteri: cart.customer?.ad || cart.musteriHandle || '',
    telefon: cart.customer?.telefon || '',
    instagram: cart.customer?.instagram || '',
    oneriler: oneriGoster ? oneriler : [],
  });
}));

router.patch('/sepet/:token', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  const adres = req.body?.adres !== undefined ? String(req.body.adres).slice(0, 500) : undefined;
  const il = req.body?.il !== undefined ? String(req.body.il).slice(0, 60) : undefined;
  const ilce = req.body?.ilce !== undefined ? String(req.body.ilce).slice(0, 60) : undefined;
  const upd: any = {};
  if (adres !== undefined) upd.adres = adres;
  if (il !== undefined) upd.il = il;
  if (ilce !== undefined) upd.ilce = ilce;
  if (Object.keys(upd).length) await prisma.storeOrder.update({ where: { id: cart.id }, data: upd });
  if (cart.customerId && (req.body?.telefon !== undefined || req.body?.musteri !== undefined || adres !== undefined || il !== undefined || ilce !== undefined)) {
    const cd: any = {};
    if (req.body?.telefon !== undefined) cd.telefon = String(req.body.telefon).slice(0, 30);
    if (req.body?.musteri !== undefined) cd.ad = String(req.body.musteri).slice(0, 120);
    if (adres !== undefined) cd.adres = adres;
    if (il !== undefined) cd.il = il;
    if (ilce !== undefined) cd.ilce = ilce;
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
  const allOrders = await prisma.storeOrder.findMany({ where: { tenantId: cart.tenantId, customerId: cart.customerId }, orderBy: { createdAt: 'desc' }, take: 100 });
  // İçinde ürün kalmayan (boşalmış) sepetler "Siparişlerim"de gösterilmez
  const orders = allOrders.filter((o) => (Array.isArray(o.items) ? (o.items as any) : []).length > 0);
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

// Müşteri kargo takibi — gerçek Yurtiçi durumu + son hareketler
router.get('/sepet/:token/kargo/:orderId', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  const order = await prisma.storeOrder.findFirst({ where: { id: req.params.orderId, tenantId: cart.tenantId, ...(cart.customerId ? { customerId: cart.customerId } : { id: cart.id }) } });
  if (!order) throw new ApiError(404, 'Siparis bulunamadi');
  const takip = order.kargoTakip || order.cargoKey || null;
  const base = { takip, kargoFirmasi: order.kargoFirmasi || null, kargoTip: order.kargoTip || null, kargoZamani: order.kargoZamani || null };
  if (!takip) return res.json({ ...base, durum: order.kargoDurum || (order.durum === 'kargoda' ? 'Kargoya verildi' : 'Henüz kargolanmadı'), teslim: false, hareketler: [], live: false });
  const isYurtici = order.kargoFirmasi ? /(yurtiçi|yurtici)/i.test(order.kargoFirmasi) : false;
  if (isYurtici) {
    try {
      const sonuc = await queryShipment(cart.tenantId, 'yurtici', order.cargoKey || takip);
      const data: any = { kargoDurum: sonuc.durum };
      if (sonuc.teslim && order.durum !== 'teslim') data.durum = 'teslim';
      try { await prisma.storeOrder.update({ where: { id: order.id }, data }); } catch { /* */ }
      return res.json({ ...base, durum: sonuc.durum, teslim: sonuc.teslim, hareketler: sonuc.hareketler, live: true });
    } catch (e: any) {
      return res.json({ ...base, durum: order.kargoDurum || 'Kargoda', teslim: order.durum === 'teslim', hareketler: [], live: false });
    }
  }
  return res.json({ ...base, durum: order.kargoDurum || 'Kargoda', teslim: order.durum === 'teslim', hareketler: [], live: false });
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
  const prAdd = await prisma.product.update({ where: { id: p.id }, data: { stokAdeti: { decrement: 1 } }, select: { stokAdeti: true } });
  const cAdd = cart.customerId ? (await prisma.customer.findUnique({ where: { id: cart.customerId }, select: { ad: true } }))?.ad : null;
  await logStok(prisma, cart.tenantId, { productId: p.id, varyasyon: beden || null, yon: 'cikis', tip: 'satis', kanal: 'online', miktar: 1, stokSonra: prAdd.stokAdeti, orderId: cart.id, sipNo: cart.sipNo || null, customerId: cart.customerId || null, customerAd: cAdd || null, kullanici: 'Müşteri (sepet linki)', aciklama: `${p.ad}${beden ? ` (${beden})` : ''} sepete eklendi` });
  const adj = await campaignAdjust(prisma, cart.tenantId, items, { lockedIds: lockedCampaignIds(cart) });
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
  const restoreStock = async (n: number) => {
    if (!it.stokDusuldu || n === 0) return;
    if (it.productId) {
      if (it.varyasyon) { const v = await prisma.productVariation.findFirst({ where: { productId: it.productId, tenantId: cart.tenantId, deger: it.varyasyon } }); if (v) await prisma.productVariation.update({ where: { id: v.id }, data: { stok: { increment: n } } }); }
      const prR = await prisma.product.update({ where: { id: it.productId }, data: { stokAdeti: { increment: n } }, select: { stokAdeti: true } }).catch(() => null);
      const cR = cart.customerId ? (await prisma.customer.findUnique({ where: { id: cart.customerId }, select: { ad: true } }))?.ad : null;
      await logStok(prisma, cart.tenantId, { productId: it.productId, varyasyon: it.varyasyon || null, yon: 'giris', tip: 'sepet_cikar', kanal: 'online', miktar: n, stokSonra: prR?.stokAdeti ?? null, orderId: cart.id, sipNo: cart.sipNo || null, customerId: cart.customerId || null, customerAd: cR || null, kullanici: 'Müşteri (sepet linki)', aciklama: `${it.ad || 'Ürün'} sepetten çıkarıldı` });
    } else if (it.freeProductId) {
      // Drop (freeProduct) stoğunu iade et
      const fp = await prisma.freeProduct.findFirst({ where: { id: it.freeProductId, tenantId: cart.tenantId } });
      if (fp) { const vars: any[] = Array.isArray(fp.variations) ? (fp.variations as any[]) : []; const target = it.varyasyon || null; if (target) { const idx = vars.findIndex((v: any) => v.deger === target); if (idx >= 0) { vars[idx].stok = (Number(vars[idx].stok) || 0) + n; await prisma.freeProduct.update({ where: { id: fp.id }, data: { variations: vars } }); } } }
    }
  };
  // Ürün sepetten tamamen çıkınca bağlı canlı yayın satırını iptal et (drop dahil)
  const cancelLive = async () => { if (it.liveOrderId) await prisma.liveOrder.updateMany({ where: { id: it.liveOrderId, tenantId: cart.tenantId }, data: { durum: 'iptal', storeOrderId: null } }); };
  let newItems = items;
  if (remove) { await restoreStock(it.adet || 1); await cancelLive(); newItems = items.filter((_, i) => i !== idx); }
  else if (delta !== null) {
    if (delta > 0) { if (it.productId && (await prisma.product.findFirst({ where: { id: it.productId, tenantId: cart.tenantId } }))!.stokAdeti < 1) throw new ApiError(400, 'Stok yetersiz'); if (it.productId && it.stokDusuldu) { const prD = await prisma.product.update({ where: { id: it.productId }, data: { stokAdeti: { decrement: 1 } }, select: { stokAdeti: true } }); await logStok(prisma, cart.tenantId, { productId: it.productId, varyasyon: it.varyasyon || null, yon: 'cikis', tip: 'satis', kanal: 'online', miktar: 1, stokSonra: prD.stokAdeti, orderId: cart.id, sipNo: cart.sipNo || null, customerId: cart.customerId || null, kullanici: 'Müşteri (sepet linki)', aciklama: `${it.ad || 'Ürün'} adet artırıldı` }); } it.adet = (it.adet || 1) + 1; }
    else { if ((it.adet || 1) <= 1) { await restoreStock(1); await cancelLive(); newItems = items.filter((_, i) => i !== idx); } else { await restoreStock(1); it.adet = (it.adet || 1) - 1; } }
  }
  const adj = await campaignAdjust(prisma, cart.tenantId, newItems, { lockedIds: lockedCampaignIds(cart) });
  if (newItems.length === 0 && cart.durum === 'sepet') {
    // Sepette ürün kalmadı -> açık sepeti iptal et (sil), bağlı canlı yayın satırlarını iptal et
    await prisma.liveOrder.updateMany({ where: { storeOrderId: cart.id }, data: { durum: 'iptal', storeOrderId: null } });
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
  assertNotCancelled(cart);
  // Ödeme bildirimi sepet DURUMUNU değiştirmez; yalnız bildirim bayrağı set edilir.
  const data: any = { odemeBildirim: 'bekliyor' };
  await prisma.storeOrder.update({ where: { id: cart.id }, data });
  try { await prisma.orderEvent.create({ data: { tenantId: cart.tenantId, orderId: cart.id, kullanici: 'Müşteri', islem: 'Ödeme bildirimi yapıldı', detay: `Tutar: ${(cart.toplam || 0).toLocaleString('tr-TR')}₺` } }); } catch { /* */ }
  res.json({ ok: true });
}));

// Sepet için kredi kartı (PayTR) ödeme tokeni üret → iframe URL döner
router.post('/sepet/:token/paytr', asyncHandler(async (req: Request, res: Response) => {
  const cart = await prisma.storeOrder.findFirst({ where: { token: req.params.token }, include: { customer: true } });
  if (!cart) throw new ApiError(404, 'Sepet bulunamadi');
  assertNotCancelled(cart);
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
  const emailRaw = String(customer?.email || req.body?.buyer?.email || '').trim();
  const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw) ? emailRaw : `siparis-${order.id}@diljar.com`;
  const addr = String(req.body?.buyer?.adres || customer?.adres || 'Adres belirtilmedi');
  const city = String(req.body?.buyer?.il || 'Istanbul').slice(0, 40) || 'Istanbul';
  const district = String(req.body?.buyer?.ilce || '-').slice(0, 40) || '-';
  const address = { address: addr, city, country: 'Turkiye', contactName: adAll, companyName: null, zipCode: '34000', phoneNumber: phone, district };
  const items = (order.items as any[]) || [];
  const basketItems = items.map((it, idx) => ({ itemId: String(it.productId || idx), itemType: 'PHYSICAL', name: String(it.ad || 'Urun').slice(0, 60), category: 'Giyim', subCategory: '-', unitPrice: Number(it.fiyat) || 0, totalPrice: (Number(it.fiyat) || 0) * (Number(it.adet) || 1), numberOfProducts: Number(it.adet) || 1 }));

  const resp = await tamiInitAuth(tami, {
    orderId: tamiOid,
    amount: Number(order.toplam) || 0,
    callbackUrl: `${env.APP_DOMAIN}/api/v1/public/tami/callback`,
    card: { number: String(card.number).replace(/\s/g, ''), cvv: String(card.cvv || ''), expireMonth: Number(card.expireMonth) || 0, expireYear: Number(card.expireYear) || 0, holderName: String(card.holderName || adAll) },
    buyer: { ipAddress: ip, buyerId: String(order.customerId || 'b' + order.id).slice(0, 30), name, surName, identityNumber: null, city, country: 'Turkiye', emailAddress: email, phoneNumber: phone, registrationAddress: addr, zipCode: '34000' },
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
  // Görsel workflow: ödeme alındı + durum (hazırlanıyor) tetikleyicileri
  void startWorkflowRuns(order.tenantId, 'payment_received', { orderId: order.id });
  void startWorkflowRuns(order.tenantId, 'status', { orderId: order.id, durum: 'hazirlaniyor' });
  res.redirect(`${env.APP_DOMAIN}/?payment=success`);
}));

// ─── Tedarikçi Portalı (/api/v1/public/supplier) ─────────────────────────────

// Varsayılan kâr çarpanı (alış × 2.10 = otomatik satış fiyatı)
const SUP_PRICE_MULT = 2.10;
const supRound2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// Supplier JWT middleware
function supplierAuth(req: Request, res: Response, next: Function) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Token gerekli' });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET || 'secret') as any;
    if (payload.type !== 'supplier') return res.status(403).json({ error: 'Yetkisiz' });
    (req as any).supplierId = payload.supplierId;
    (req as any).supplierTenantId = payload.tenantId;
    next();
  } catch { return res.status(401).json({ error: 'Geçersiz token' }); }
}

// Tedarikçi girişi (public — token yok)
router.post('/supplier/login', asyncHandler(async (req: Request, res: Response) => {
  const { loginCode, pin } = req.body || {};
  if (!loginCode || !pin) throw new ApiError(400, 'loginCode ve pin zorunludur');
  const s = await prisma.supplier.findFirst({ where: { loginCode, aktif: true } });
  if (!s) throw new ApiError(401, 'Geçersiz giriş kodu');
  const ok = await bcrypt.compare(String(pin), s.pinHash);
  if (!ok) throw new ApiError(401, 'Hatalı PIN');
  const token = jwt.sign({ supplierId: s.id, tenantId: s.tenantId, type: 'supplier' }, env.JWT_SECRET || 'secret', { expiresIn: '30d' } as any);
  res.json({ token, supplier: { id: s.id, ad: s.ad } });
}));

// Tedarikçi profili
router.get('/supplier/me', supplierAuth as any, asyncHandler(async (req: Request, res: Response) => {
  const sid = (req as any).supplierId;
  const s = await prisma.supplier.findFirst({ where: { id: sid } });
  if (!s) throw new ApiError(404, 'Bulunamadı');
  res.json({ id: s.id, ad: s.ad, loginCode: s.loginCode });
}));

// Tedarikçinin ürünleri (alış fiyatı görünür, satış fiyatı GİZLİ)
router.get('/supplier/products', supplierAuth as any, asyncHandler(async (req: Request, res: Response) => {
  const sid = (req as any).supplierId;
  const t = (req as any).supplierTenantId;
  const prods = await prisma.freeProduct.findMany({ where: { tenantId: t, supplierId: sid, aktif: true }, orderBy: { createdAt: 'desc' } });
  res.json(prods.map((p) => ({ ...p, satisFiyat: undefined })));
}));

// Tedarikçi ürün yükleme
router.post('/supplier/products', supplierAuth as any, asyncHandler(async (req: Request, res: Response) => {
  const sid = (req as any).supplierId;
  const t = (req as any).supplierTenantId;
  const { ad, images, bedenler, alisFiyat, variations, cinsiyet, aciklama } = req.body || {};
  if (!ad) throw new ApiError(400, 'Ürün adı zorunludur');
  let salesCode: string | null = null;
  const sc = await prisma.salesCode.findFirst({ where: { tenantId: t, used: false }, orderBy: { createdAt: 'asc' } });
  if (sc) { salesCode = sc.code; await prisma.salesCode.update({ where: { id: sc.id }, data: { used: true } }); }
  let vars: { deger: string; stok: number }[] = [];
  if (Array.isArray(variations) && variations.length > 0) {
    vars = variations.map((v: any) => ({ deger: String(v.deger || v), stok: Number(v.stok) || 1 }));
  } else if (bedenler) {
    vars = String(bedenler).split(',').map((b: string) => b.trim()).filter(Boolean).map((b: string) => ({ deger: b, stok: 1 }));
  }
  const alis = Number(alisFiyat) || 0;
  const p = await prisma.freeProduct.create({ data: { tenantId: t, supplierId: sid, ad, salesCode, cinsiyet: cinsiyet || null, aciklama: aciklama || null, images: images || [], variations: vars, alisFiyat: alis, satisFiyat: supRound2(alis * SUP_PRICE_MULT) } });
  await promoteWaitingStock(t, { freeProductId: p.id }).catch((e) => console.error('[promoteWaitingStock]', e));
  res.status(201).json({ ...p, satisFiyat: undefined });
}));

// Tedarikçi ürün güncelleme (sadece kendi ürünleri)
router.patch('/supplier/products/:id', supplierAuth as any, asyncHandler(async (req: Request, res: Response) => {
  const sid = (req as any).supplierId;
  const t = (req as any).supplierTenantId;
  const { ad, images, variations, alisFiyat, cinsiyet, aciklama } = req.body || {};
  const data: any = {};
  if (ad !== undefined) data.ad = ad;
  if (cinsiyet !== undefined) data.cinsiyet = cinsiyet || null;
  if (aciklama !== undefined) data.aciklama = aciklama || null;
  if (images !== undefined) data.images = images;
  if (variations !== undefined) data.variations = variations;
  if (alisFiyat !== undefined) {
    data.alisFiyat = Number(alisFiyat);
    // Alış değişince satış fiyatını otomatik yeniden hesapla
    data.satisFiyat = supRound2((Number(alisFiyat) || 0) * SUP_PRICE_MULT);
  }
  await prisma.freeProduct.updateMany({ where: { id: req.params.id, tenantId: t, supplierId: sid }, data });
  await promoteWaitingStock(t, { freeProductId: req.params.id }).catch((e) => console.error('[promoteWaitingStock]', e));
  const p = await prisma.freeProduct.findFirst({ where: { id: req.params.id } });
  res.json(p ? { ...p, satisFiyat: undefined } : { ok: true });
}));

// Tedarikçi ürün silme (kendi ürünleri — soft delete)
router.delete('/supplier/products/:id', supplierAuth as any, asyncHandler(async (req: Request, res: Response) => {
  const sid = (req as any).supplierId;
  const t = (req as any).supplierTenantId;
  await prisma.freeProduct.updateMany({ where: { id: req.params.id, tenantId: t, supplierId: sid }, data: { aktif: false } });
  res.json({ ok: true });
}));

// Tedarikçi satış raporu (satış fiyatı GİZLİ) — iptal edilenler HARİÇ
router.get('/supplier/sales', supplierAuth as any, asyncHandler(async (req: Request, res: Response) => {
  const sid = (req as any).supplierId;
  const t = (req as any).supplierTenantId;
  const orders = await prisma.liveOrder.findMany({
    where: { tenantId: t, supplierId: sid, drop: true, durum: { in: ['onaylandi', 'rezerve'] } },
    orderBy: { createdAt: 'desc' },
  });
  // Ürün bazlı gruplama — satış fiyatı/tutar dönmez; ciro tedarikçinin KENDİ alış fiyatına göre
  const map = new Map<string, { ad: string; image: string | null; toplam: number; alisFiyat: number; ciro: number; bedenler: Record<string, number> }>();
  for (const o of orders) {
    const key = o.freeProductId || o.urun;
    const alis = o.alis || 0;
    if (!map.has(key)) map.set(key, { ad: o.urun, image: o.gorsel || null, toplam: 0, alisFiyat: alis, ciro: 0, bedenler: {} });
    const e = map.get(key)!;
    e.toplam++;
    e.ciro = supRound2(e.ciro + alis);
    if (o.beden) e.bedenler[o.beden] = (e.bedenler[o.beden] || 0) + 1;
  }
  res.json([...map.values()]);
}));

// Tedarikçi hesap özeti (borç / ödenen / kalan) — okuma amaçlı, tedarikçi kendi hesabını görür
router.get('/supplier/account', supplierAuth as any, asyncHandler(async (req: Request, res: Response) => {
  const sid = (req as any).supplierId;
  const t = (req as any).supplierTenantId;
  const orders = await prisma.liveOrder.findMany({ where: { tenantId: t, supplierId: sid, drop: true, durum: { in: ['onaylandi', 'rezerve'] } } });
  const borc = supRound2(orders.reduce((s, o) => s + (o.alis || 0), 0));
  const payments = await prisma.supplierPayment.findMany({ where: { tenantId: t, supplierId: sid }, orderBy: { createdAt: 'desc' } });
  const odenen = supRound2(payments.reduce((s, p) => s + (p.tutar || 0), 0));
  res.json({ borc, odenen, kalan: supRound2(borc - odenen), adet: orders.length, payments });
}));

// ═══════════ Özel Katalog (Public) ═══════════

// Müşterinin gördüğü katalog sayfası
router.get('/custom-katalog/:slug', asyncHandler(async (req: Request, res: Response) => {
  const cat = await prisma.customCatalog.findFirst({ where: { slug: req.params.slug, aktif: true } });
  if (!cat) throw new ApiError(404, 'Katalog bulunamadı');
  // Görüntülenme kaydı (fire & forget)
  prisma.catalogView.create({ data: { tenantId: cat.tenantId, catalogId: cat.id, ip: (req.headers['x-forwarded-for'] as string || req.ip || '').split(',')[0].trim().slice(0, 45), ua: (req.headers['user-agent'] || '').slice(0, 200) } }).catch(() => {});
  const ids: string[] = Array.isArray(cat.productIds) ? (cat.productIds as any[]).map(String) : [];
  let products: any[] = [];
  if (ids.length) {
    const [prods, cats] = await Promise.all([
      prisma.product.findMany({
        where: { tenantId: cat.tenantId, id: { in: ids }, aktif: true },
        select: { id: true, ad: true, satisFiyat: true, eskiFiyat: true, images: true, marka: true, cinsiyet: true, kategoriId: true, salesCode: true, sku: true, barkod: true, stokAdeti: true, variations: { select: { id: true, deger: true, stok: true, ekFiyat: true } } }
      }),
      prisma.productCategory.findMany({ where: { tenantId: cat.tenantId }, select: { id: true, ad: true } })
    ]);
    const pMap = new Map(prods.map((p) => [p.id, p]));
    const catMap = new Map(cats.map((c) => [c.id, c.ad]));
    products = ids.map((id) => pMap.get(id)).filter(Boolean)
      .filter((p: any) => {
        // Stok kontrolü: stokAdeti > 0 VEYA en az 1 varyasyonun stoğu > 0 ise göster
        if ((p.stokAdeti || 0) > 0) return true;
        if ((p.variations || []).some((v: any) => (v.stok || 0) > 0)) return true;
        return false;
      })
      .map((p: any) => {
      const imgs = Array.isArray(p.images) ? p.images : [];
      // base64 data URI varsa sadece URL olanları al (performans koruması)
      const cleanImgs = imgs.filter((i: any) => typeof i === 'string' && !i.startsWith('data:'));
      return {
      id: p.id, ad: p.ad, satisFiyat: p.satisFiyat, eskiFiyat: p.eskiFiyat,
      images: cleanImgs.length > 0 ? [cleanImgs[0]] : [], marka: p.marka || null, cinsiyet: p.cinsiyet || 'unisex',
      kategori: catMap.get(p.kategoriId) || null, salesCode: p.salesCode || p.sku || null,
      barkod: p.barkod || null, stokAdeti: p.stokAdeti || 0,
      variations: (p.variations || []).filter((v: any) => v.stok > 0).map((v: any) => ({ id: v.id, deger: v.deger, stok: v.stok, ekFiyat: v.ekFiyat || 0 }))
    };
    });
  }
  // Filtreleme seçenekleri çıkar
  const markalar = [...new Set(products.map((p) => p.marka).filter(Boolean))].sort();
  const kategoriler = [...new Set(products.map((p) => p.kategori).filter(Boolean))].sort();
  const cinsiyetler = [...new Set(products.map((p) => p.cinsiyet).filter(Boolean))].sort();
  const bedenler = [...new Set(products.flatMap((p) => (p.variations || []).map((v: any) => v.deger)).filter(Boolean))].sort();
  res.json({ catalog: { id: cat.id, ad: cat.ad, slug: cat.slug }, ad: cat.ad, slug: cat.slug, whatsapp: cat.whatsapp, kampanyalar: cat.kampanyalar || [], products, filters: { markalar, kategoriler, cinsiyetler, bedenler } });
}));

// Kupon doğrulama
router.post('/custom-katalog/:slug/validate-coupon', asyncHandler(async (req: Request, res: Response) => {
  const cat = await prisma.customCatalog.findFirst({ where: { slug: req.params.slug, aktif: true } });
  if (!cat) throw new ApiError(404, 'Katalog bulunamadı');
  const { code } = req.body || {};
  if (!code || typeof code !== 'string') return res.json({ valid: false, message: 'Kupon kodu giriniz' });

  const cleanCode = code.trim().toUpperCase();
  const coupon = await prisma.catalogCoupon.findFirst({
    where: { catalogId: cat.id, code: cleanCode, aktif: true }
  });

  if (!coupon) return res.json({ valid: false, message: 'Geçersiz kupon kodu' });

  const now = new Date();
  if (coupon.baslangic && now < coupon.baslangic) return res.json({ valid: false, message: 'Kupon henüz aktif değil' });
  if (coupon.bitis && now > coupon.bitis) return res.json({ valid: false, message: 'Kupon süresi dolmuş' });
  if (coupon.maxKullanim !== null && coupon.kullanim >= coupon.maxKullanim) return res.json({ valid: false, message: 'Kupon kullanım limiti dolmuş' });

  const label = coupon.tip === 'yuzde' ? `%${coupon.deger} indirim` : `${coupon.deger} ₺ indirim`;
  res.json({ valid: true, tip: coupon.tip, deger: coupon.deger, message: label });
}));

// Müşteriden gelen sipariş talebi
router.post('/custom-katalog/:slug/talep', asyncHandler(async (req: Request, res: Response) => {
  const cat = await prisma.customCatalog.findFirst({ where: { slug: req.params.slug, aktif: true } });
  if (!cat) throw new ApiError(404, 'Katalog bulunamadı');
  const { items, musteri, telefon, kuponKodu } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(422, 'Sepet boş');
  // Stok kontrolü
  for (const it of items) {
    const productId = it.productId;
    if (!productId) continue;
    const adet = Number(it.adet) || 1;
    const product = await prisma.product.findFirst({ where: { id: productId, tenantId: cat.tenantId } });
    if (!product) throw new ApiError(422, `Ürün bulunamadı: ${it.ad || productId}`);
    if (it.varyasyon) {
      const v = await prisma.productVariation.findFirst({ where: { productId, tenantId: cat.tenantId, deger: it.varyasyon } });
      if (!v || v.stok < adet) throw new ApiError(422, `${it.ad || product.ad} - ${it.varyasyon} stoğu yetersiz`);
    } else {
      if ((product.stokAdeti || 0) < adet) throw new ApiError(422, `${it.ad || product.ad} stoğu yetersiz`);
    }
  }
  // Toplam ve indirim hesapla
  let toplam = items.reduce((s: number, it: any) => s + (Number(it.fiyat) || 0) * (Number(it.adet) || 1), 0);
  let indirim = 0;
  // Kampanya indirimi
  const kampanyalar: any[] = Array.isArray(cat.kampanyalar) ? (cat.kampanyalar as any[]) : [];
  const toplamAdet = items.reduce((s: number, it: any) => s + (Number(it.adet) || 1), 0);
  for (const k of kampanyalar) {
    let uygulanir = false;
    if (k.tip === 'adetIndirim' && toplamAdet >= (Number(k.kosul) || 0)) uygulanir = true;
    if (k.tip === 'tutarIndirim' && toplam >= (Number(k.kosul) || 0)) uygulanir = true;
    if (uygulanir) {
      if (k.indirimTip === 'yuzde') indirim += toplam * (Number(k.indirimDeger) || 0) / 100;
      else indirim += Number(k.indirimDeger) || 0;
    }
  }
  // Kupon indirim: önce CatalogCoupon, sonra DiscountCode
  let usedCatalogCouponId: string | null = null;
  if (kuponKodu) {
    const cleanCode = String(kuponKodu).trim().toUpperCase();
    // 1. Katalog bazlı kupon
    const catCoupon = await prisma.catalogCoupon.findFirst({ where: { catalogId: cat.id, code: cleanCode, aktif: true } });
    if (catCoupon) {
      const now = new Date();
      const valid = (!catCoupon.baslangic || now >= catCoupon.baslangic) &&
                    (!catCoupon.bitis || now <= catCoupon.bitis) &&
                    (catCoupon.maxKullanim === null || catCoupon.kullanim < catCoupon.maxKullanim);
      if (valid) {
        indirim += catCoupon.tip === 'yuzde' ? toplam * catCoupon.deger / 100 : catCoupon.deger;
        usedCatalogCouponId = catCoupon.id;
      }
    } else {
      // 2. Fallback: genel DiscountCode
      const d = await prisma.discountCode.findFirst({ where: { tenantId: cat.tenantId, code: cleanCode, aktif: true } });
      if (d) { indirim += d.tip === 'yuzde' ? toplam * d.deger / 100 : d.deger; }
    }
  }
  indirim = Math.min(toplam, indirim);
  // TalepNo üret (T + 6 alfanumerik)
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let talepNo = '';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = 'T';
    for (let i = 0; i < 6; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
    const ex = await prisma.catalogRequest.findFirst({ where: { talepNo: code } });
    if (!ex) { talepNo = code; break; }
  }
  if (!talepNo) throw new ApiError(500, 'Talep numarası üretilemedi');
  // Rezerv süresi hesapla
  const catSetting = await prisma.catalogSetting.findUnique({ where: { tenantId: cat.tenantId } }).catch(() => null);
  const rezervDk = catSetting?.rezervSureDk || 30;
  const request = await prisma.catalogRequest.create({
    data: { tenantId: cat.tenantId, catalogId: cat.id, talepNo, items, toplam: toplam - indirim, indirim, kuponKodu: kuponKodu || null, musteri: musteri || null, telefon: telefon || null, durum: 'beklemede', rezervBitis: null, wpIletildi: false }
  });
  // Katalog kuponu kullanıldıysa kullanım sayısını artır
  if (usedCatalogCouponId) {
    await prisma.catalogCoupon.update({ where: { id: usedCatalogCouponId }, data: { kullanim: { increment: 1 } } });
  }
  // WhatsApp mesaj metni oluştur
  const satirlar = items.map((it: any) => `• ${it.ad}${it.varyasyon ? ' (' + it.varyasyon + ')' : ''} x${it.adet} → ${(Number(it.fiyat) * Number(it.adet)).toLocaleString('tr-TR')}₺`).join('\n');
  const msg = `📋 *Yeni Katalog Talebi*\n\n🔢 Talep No: *${talepNo}*\n👤 ${musteri || '-'}\n📞 ${telefon || '-'}\n\n${satirlar}\n\n${indirim > 0 ? '🏷️ İndirim: -' + indirim.toLocaleString('tr-TR') + '₺\n' : ''}💰 *Toplam: ${(toplam - indirim).toLocaleString('tr-TR')}₺*\n\n⏱️ Rezerv Süresi: ${rezervDk} dakika\n\n⚠️ Bu mesajı WhatsApp üzerinden ileterek siparişinizi onaylayın. İletilmeden sipariş oluşmaz.`;
  res.json({ ok: true, talepNo, toplam: toplam - indirim, indirim, whatsappMsg: msg, whatsapp: cat.whatsapp, rezervDk });
}));

// ─── Katalog canlı izleme tracking ───
router.post('/catalog-track', asyncHandler(async (req: Request, res: Response) => {
  const { visitorId, catalogId, sayfaNo, sonGorulen, sonGorulenImg, sepetUrunSayisi, sepetToplam, sepetUrunler, durum } = req.body || {};
  if (!visitorId || !catalogId) throw new ApiError(422, 'visitorId ve catalogId gerekli');
  const cat = await prisma.customCatalog.findFirst({ where: { id: catalogId }, select: { tenantId: true } });
  if (!cat) throw new ApiError(404, 'Katalog bulunamadı');
  trackVisitor({
    visitorId, catalogId, tenantId: cat.tenantId,
    ip: (req.headers['x-forwarded-for'] as string || req.ip || '').split(',')[0].trim(),
    userAgent: req.headers['user-agent'],
    sayfaNo, sonGorulen, sonGorulenImg, sepetUrunSayisi, sepetToplam, sepetUrunler, durum,
  });
  res.json({ ok: true });
}));

export default router;
