import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../lib/http';
import { promoteReserved, campaignAdjust, recalcOpenCarts, promoteWaitingStock } from './live.routes';
import { notifyOrderSms } from '../sms/netgsm.service';
import { enqueueOrderNotification, enqueueStatusNotification, enqueueIadeNotification } from '../whatsapp/wa.service';
import { enhanceProductImage } from '../../lib/fal';
import { env } from '../../config/env';
import { getActiveVisitors, getVisitorStats } from './catalog.live';

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const router = Router();

// ── Telefon normalizasyonu: rakamların son 10 hanesi (kanonik). ──
// "+90 532...", "0532...", "532...", "90532..." hepsi aynı telKey'e iner.
export function telKey(phone?: string | null): string | null {
  if (!phone) return null;
  const d = String(phone).replace(/\D/g, '');
  if (d.length < 10) return d || null;
  return d.slice(-10);
}

// ── Instagram kullanıcı adı normalizasyonu (büyük/küçük harf + Türkçe karakter duyarsız). ──
// "@Ahmet", "ahmet", "AHMET", "ahmét" → aynı igKey. Aynı kullanıcı adı = tek kayıt.
export function igKey(s?: string | null): string | null {
  const k = (s || '')
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c')
    .replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/^@+/, '').trim();
  return k || null;
}

// Telefonuna göre mevcut müşteriyi bulur; yoksa oluşturur. Aynı numara = tek kayıt.
export async function findOrCreateCustomer(
  db: any,
  tenantId: string,
  info: { telefon?: string | null; ad?: string | null; instagram?: string | null; il?: string | null; ilce?: string | null; adres?: string | null; email?: string | null },
): Promise<any> {
  const tk = telKey(info.telefon);
  const ik = igKey(info.instagram);
  let existing: any = null;
  if (tk) {
    existing = await db.customer.findFirst({ where: { tenantId, telKey: tk }, orderBy: { createdAt: 'asc' } });
  }
  if (!existing && ik) {
    existing = await db.customer.findFirst({ where: { tenantId, igKey: ik }, orderBy: { createdAt: 'asc' } });
  }
  if (existing) {
    // Eksik alanları tamamla (mevcut veriyi ezme)
    const patch: any = {};
    if (!existing.ad && info.ad) patch.ad = info.ad;
    if (!existing.telefon && info.telefon) patch.telefon = info.telefon;
    if (!existing.telKey && tk) patch.telKey = tk;
    if (!existing.instagram && info.instagram) patch.instagram = info.instagram;
    if (!existing.igKey && ik) patch.igKey = ik;
    if (!existing.il && info.il) patch.il = info.il;
    if (!existing.ilce && info.ilce) patch.ilce = info.ilce;
    if (!existing.adres && info.adres) patch.adres = info.adres;
    if (!existing.email && info.email) patch.email = info.email;
    if (Object.keys(patch).length) existing = await db.customer.update({ where: { id: existing.id }, data: patch });
    return existing;
  }
  const count = await db.customer.count({ where: { tenantId } });
  return db.customer.create({
    data: {
      tenantId,
      ad: info.ad || 'Müşteri',
      telefon: info.telefon || null,
      telKey: tk,
      instagram: info.instagram || null,
      igKey: ik,
      il: info.il || null,
      ilce: info.ilce || null,
      adres: info.adres || null,
      email: info.email || null,
      musteriNo: 1000 + count + 1,
    },
  });
}

// Müşteri olusturunca rezerve canli siparislerini onayla (SIMPLE loop'tan once)
router.post('/customers', asyncHandler(async (req: Request, res: Response) => {
  const META2 = new Set(['id', 'tenantId', 'createdAt', 'updatedAt', 'createdBy', 'orders', 'telKey', 'igKey']);
  const data: any = {};
  for (const k of Object.keys(req.body || {})) if (!META2.has(k)) data[k] = req.body[k];
  const tk = telKey(data.telefon);
  const ik = igKey(data.instagram);
  // Aynı numara zaten kayıtlıysa yeni kayıt açma — mevcut kaydı bildir.
  if (tk) {
    const dup = await prisma.customer.findFirst({ where: { tenantId: req.tenantId!, telKey: tk }, orderBy: { createdAt: 'asc' } });
    if (dup) throw new ApiError(409, `Bu telefon numarası zaten kayıtlı: ${dup.ad}`);
  }
  // Aynı Instagram kullanıcı adı (büyük/küçük harf duyarsız) zaten kayıtlıysa yeni kayıt açma.
  if (ik) {
    const dupIg = await prisma.customer.findFirst({ where: { tenantId: req.tenantId!, igKey: ik }, orderBy: { createdAt: 'asc' } });
    if (dupIg) throw new ApiError(409, `Bu Instagram kullanıcı adı zaten kayıtlı: ${dupIg.ad}`);
  }
  const count = await prisma.customer.count({ where: { tenantId: req.tenantId! } });
  const created = await prisma.customer.create({ data: { ...data, telKey: tk, igKey: ik, musteriNo: 1000 + count + 1, tenantId: req.tenantId! } });
  await promoteReserved(req.tenantId!, created);
  await logAudit(req, 'ekle', 'musteri', created.id, `Müşteri eklendi: ${created.ad}`, { hedef: created.ad, kime: created.ad, meta: { telefon: created.telefon || null, instagram: created.instagram || null, musteriNo: created.musteriNo } });
  res.status(201).json(created);
}));

// Musteri bakiye hareketleri
router.get('/customers/:id/ledger', asyncHandler(async (req: Request, res: Response) => {
  const c = await prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!c) throw new ApiError(404, 'Musteri bulunamadi');
  const ledger = await prisma.customerLedger.findMany({ where: { customerId: req.params.id, tenantId: req.tenantId! }, orderBy: { createdAt: 'desc' } });
  res.json(ledger);
}));

// Tüm müşterilerin bakiye hareketleri (tanımlanan + bakiyeden ödenen) + toplam bakiye
router.get('/customers-ledger', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const [rows, custs] = await Promise.all([
    prisma.customerLedger.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 500 }),
    prisma.customer.findMany({ where: { tenantId }, select: { id: true, ad: true, bakiye: true, instagram: true, telefon: true } }),
  ]);
  const cMap = new Map(custs.map((c) => [c.id, c]));
  // refId'ler siparişe bağlıysa sipNo + ürün adedi + kalan çöz
  const refIds = Array.from(new Set(rows.map((r) => r.refId).filter(Boolean))) as string[];
  const ords = refIds.length ? await prisma.storeOrder.findMany({ where: { tenantId, id: { in: refIds } }, select: { id: true, sipNo: true, items: true, toplam: true, tahsilat: true } }) : [];
  const oMap = new Map(ords.map((o) => [o.id, o]));
  const toplamBakiye = custs.reduce((s, c) => s + (Number(c.bakiye) || 0), 0);
  const toplamEklenen = rows.filter((r) => r.tip === 'yukleme' || r.tip === 'iade').reduce((s, r) => s + (Number(r.tutar) || 0), 0);
  const toplamOdenen = rows.filter((r) => r.tip === 'harcama').reduce((s, r) => s + (Number(r.tutar) || 0), 0);
  const aktifMusteri = new Set(rows.map((r) => r.customerId)).size;
  // Müşteri bazında kronolojik running bakiye (bakiye sonucu)
  const byCust: Record<string, any[]> = {};
  for (const r of [...rows].reverse()) { (byCust[r.customerId] ||= []).push(r); }
  const bakiyeSonucu: Record<string, number> = {};
  for (const cid of Object.keys(byCust)) { let bal = 0; for (const r of byCust[cid]) { bal += (r.tip === 'harcama' ? -1 : 1) * (Number(r.tutar) || 0); bakiyeSonucu[r.id] = Math.round(bal * 100) / 100; } }
  const bakiyeliMusteriler = custs.filter((c) => Math.abs(Number(c.bakiye) || 0) > 0.01)
    .map((c) => ({ id: c.id, ad: c.ad, instagram: c.instagram, telefon: c.telefon, bakiye: c.bakiye }))
    .sort((a, b) => (Number(b.bakiye) || 0) - (Number(a.bakiye) || 0));
  res.json({
    rows: rows.map((r) => {
      const c = cMap.get(r.customerId); const o: any = r.refId ? oMap.get(r.refId) : null;
      const urunAdet = o && Array.isArray(o.items) ? o.items.reduce((s: number, it: any) => s + (Number(it.adet) || 1), 0) : 0;
      const durum = r.tip === 'harcama' && o && (Number(o.toplam) || 0) - (Number(o.tahsilat) || 0) > 0.5 ? 'bekleyen' : 'tamamlandi';
      return { ...r, customerAd: c?.ad || '-', instagram: c?.instagram || null, telefon: c?.telefon || null, sipNo: o?.sipNo || null, orderId: r.refId || null, urunAdet, durum, bakiyeSonucu: bakiyeSonucu[r.id] ?? null };
    }),
    toplamBakiye, toplamEklenen, toplamOdenen, aktifMusteri, islemSayisi: rows.length, bakiyeliMusteriler,
  });
}));

// Bakiye yukle / harcama / iade
router.post('/customers/:id/balance', asyncHandler(async (req: Request, res: Response) => {
  const { tip, tutar, aciklama } = req.body || {};
  const amt = Number(tutar) || 0;
  if (!['yukleme', 'harcama', 'iade'].includes(tip) || amt <= 0) throw new ApiError(422, 'Gecersiz islem');
  const result = await prisma.$transaction(async (tx) => {
    const c = await tx.customer.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!c) throw new ApiError(404, 'Musteri bulunamadi');
    const delta = tip === 'harcama' ? -amt : amt; // yukleme/iade +, harcama -
    const updated = await tx.customer.update({ where: { id: c.id }, data: { bakiye: (c.bakiye || 0) + delta } });
    await tx.customerLedger.create({ data: { tenantId: req.tenantId!, customerId: c.id, tip, tutar: amt, aciklama: aciklama || null, kullanici: await actorName(req.auth?.userId) } });
    return updated;
  });
  await logAudit(req, 'guncelle', 'musteri', req.params.id, `Bakiye ${tip}: ${amt} TL`, { hedef: result.ad, kime: result.ad, neden: aciklama || null, meta: { tip, tutar: amt, yeniBakiye: result.bakiye } });
  res.json(result);
}));

const META = new Set(['id', 'tenantId', 'createdAt', 'updatedAt', 'createdBy', 'tenant', 'variations', 'product', 'customer', 'orders']);

const IMG_DIR = '/var/www/finanstakip/product-images';
const IMG_BASE_URL = 'https://diljar.com/product-images';

function convertBase64ToFile(img: any): string {
  if (typeof img !== 'string') return img;
  if (img.startsWith('http://') || img.startsWith('https://')) return img;
  const match = img.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
  if (!match) return img;
  try {
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buf = Buffer.from(match[2], 'base64');
    const hash = crypto.createHash('md5').update(buf).digest('hex').slice(0, 12);
    const filename = Date.now().toString(36) + '_' + hash + '.' + ext;
    fs.mkdirSync(IMG_DIR, { recursive: true });
    fs.writeFileSync(path.join(IMG_DIR, filename), buf);
    return IMG_BASE_URL + '/' + filename;
  } catch { return img; }
}

function clean(body: any): any {
  const out: any = {};
  for (const k of Object.keys(body || {})) if (!META.has(k)) out[k] = body[k];
  if (Array.isArray(out.images)) {
    out.images = out.images.map((img: any) => convertBase64ToFile(img));
  }
  return out;
}

function genBarcode(): string {
  // 13 haneli sayisal (EAN benzeri), 869 ulke onekiyle
  let s = '869';
  for (let i = 0; i < 10; i++) s += Math.floor(Math.random() * 10);
  return s;
}

// Yillik sirali siparis no (iptalde tekrar atanmaz; tenant sayaci monotonik)
export async function nextOrderNo(tx: any, tenantId: string): Promise<{ orderNo: number; orderYil: number }> {
  const yil = new Date().getFullYear();
  const t = await tx.tenant.findUnique({ where: { id: tenantId } });
  let seqNo = (t?.seqNo || 0);
  if ((t?.seqYil || 0) !== yil) seqNo = 0; // yeni yil -> 001'den
  seqNo += 1;
  await tx.tenant.update({ where: { id: tenantId }, data: { seqNo, seqYil: yil } });
  return { orderNo: seqNo, orderYil: yil };
}

// L ile başlayan 5 haneli benzersiz sipariş no (harf+rakam karışık, asla tekrar kullanılmaz)
const SIP_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // karışıklık yaratan 0/O/1/I hariç
export async function generateSipNo(tx: any): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = 'L';
    for (let i = 0; i < 6; i++) code += SIP_CHARS[Math.floor(Math.random() * SIP_CHARS.length)];
    const exists = await tx.storeOrder.findFirst({ where: { sipNo: code } });
    if (!exists) return code;
  }
  throw new Error('Benzersiz sipariş no üretilemedi');
}

// Kriptografik guvenli token (tahmin edilemez) — sepet/siparis/yayin linkleri icin
export function genToken(bytes: number = 18): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

async function actorName(userId?: string): Promise<string> {
  if (!userId) return 'Sistem';
  const u = await prisma.user.findUnique({ where: { id: userId } });
  return u?.fullName || u?.email || 'Sistem';
}
export { actorName };

// Personel hareket logu (giriş + ekle/sil/güncelle işlemleri). Akışı asla bozmaz.
// extra: { hedef (nereye/hangi kayıt), kime (müşteri/hedef kişi), neden (sebep), meta (ek yapısal veri) }
export async function logAudit(
  req: any,
  action: string,
  entity: string,
  entityId?: string | null,
  detail?: string | null,
  extra?: { hedef?: string | null; kime?: string | null; neden?: string | null; meta?: any },
) {
  try {
    const tenantId = req?.tenantId; if (!tenantId) return;
    const userId = req?.auth?.userId || null;
    const userName = await actorName(userId);
    const ip = String(req?.headers?.['x-forwarded-for'] || req?.ip || '').split(',')[0].trim() || null;
    await prisma.auditLog.create({ data: {
      tenantId, userId, userName, action, entity,
      entityId: entityId || null, detail: detail || null,
      hedef: extra?.hedef || null, kime: extra?.kime || null, neden: extra?.neden || null,
      ip, meta: extra?.meta ?? undefined,
    } });
  } catch { /* log hatasi akisi bozmaz */ }
}

// Sipariş durumunu kim değiştirebilir: yalnız PATRON (TENANT_OWNER) ve ünvanı YONETICI olanlar
async function canChangeDurum(req: any): Promise<boolean> {
  if (req?.auth?.role === 'TENANT_OWNER') return true;
  const userId = req?.auth?.userId;
  if (!userId) return false;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { unvan: true } });
  return u?.unvan === 'YONETICI';
}

export async function logEvent(tenantId: string, orderId: string, kullanici: string, islem: string, detay?: string) {
  try { await prisma.orderEvent.create({ data: { tenantId, orderId, kullanici, islem, detay: detay || null } }); } catch { /* */ }
}

// Stok hareketi audit logu — db = prisma veya $transaction tx
export async function logStok(db: any, tenantId: string, p: {
  productId?: string | null; varyasyon?: string | null; yon: 'giris' | 'cikis'; tip: string;
  kanal?: string | null; miktar: number; stokSonra?: number | null; orderId?: string | null;
  sipNo?: string | null; customerId?: string | null; customerAd?: string | null; kullanici?: string | null;
  aciklama?: string | null; kaynak?: string | null; createdAt?: Date;
}) {
  try {
    if (!p.productId || !(Number(p.miktar) > 0)) return;
    await (db || prisma).stokHareket.create({ data: {
      tenantId, productId: p.productId, varyasyon: p.varyasyon || null, yon: p.yon, tip: p.tip,
      kanal: p.kanal || null, miktar: Math.abs(Number(p.miktar) || 0), stokSonra: p.stokSonra ?? null,
      orderId: p.orderId || null, sipNo: p.sipNo || null, customerId: p.customerId || null,
      customerAd: p.customerAd || null, kullanici: p.kullanici || null, aciklama: p.aciklama || null,
      kaynak: p.kaynak || null, ...(p.createdAt ? { createdAt: p.createdAt } : {}),
    } });
  } catch { /* log hatasi akisi bozmaz */ }
}

// Iptal/silmede stoga geri don (sadece stogu dusurulmus kalemler)
async function returnStock(tx: any, tenantId: string, items: any[], ctx?: { orderId?: string | null; sipNo?: string | null; customerId?: string | null; customerAd?: string | null; kullanici?: string | null; tip?: string }) {
  for (const it of items || []) {
    // 1) Bağlı canlı yayın satırını HER DURUMDA iptal et (drop/stoksuz/productId'siz dahil)
    if (it?.liveOrderId) await tx.liveOrder.updateMany({ where: { id: it.liveOrderId, tenantId }, data: { durum: 'iptal', storeOrderId: null } });
    if (!it?.stokDusuldu) continue;
    const adet = Number(it.adet) || 1;
    // 2) Sahip olunan ürün stoğunu iade et
    if (it.productId) {
      if (it.varyasyon) {
        const v = await tx.productVariation.findFirst({ where: { productId: it.productId, tenantId, deger: it.varyasyon } });
        if (v) await tx.productVariation.update({ where: { id: v.id }, data: { stok: { increment: adet } } });
      }
      const pr = await tx.product.update({ where: { id: it.productId }, data: { stokAdeti: { increment: adet } }, select: { stokAdeti: true } }).catch(() => null);
      await logStok(tx, tenantId, {
        productId: it.productId, varyasyon: it.varyasyon || null, yon: 'giris', tip: ctx?.tip || 'iptal_iade',
        miktar: adet, stokSonra: pr?.stokAdeti ?? null, orderId: ctx?.orderId, sipNo: ctx?.sipNo,
        customerId: ctx?.customerId, customerAd: ctx?.customerAd, kullanici: ctx?.kullanici,
        aciklama: `${it.ad || 'Ürün'} iade (iptal)`,
      });
    } else if (it.freeProductId) {
      // 3) Drop (freeProduct) stoğunu iade et — canlı iptal ile simetrik
      const fp = await tx.freeProduct.findFirst({ where: { id: it.freeProductId, tenantId } });
      if (fp) {
        const vars: any[] = Array.isArray(fp.variations) ? (fp.variations as any[]) : [];
        const target = it.varyasyon || null;
        if (target) {
          const idx = vars.findIndex((v) => v.deger === target);
          if (idx >= 0) { vars[idx].stok = (Number(vars[idx].stok) || 0) + adet; await tx.freeProduct.update({ where: { id: fp.id }, data: { variations: vars } }); }
        }
      }
    }
  }
}

// Iptal/iadede daha once kasaya islenen geliri geri al (ters gider kaydi) - bir kez
async function reverseIncome(tx: any, tenantId: string, order: any) {
  const kayitli = Number(order?.gelirKaydedilen) || 0;
  if (kayitli <= 0.001) return;
  const now = new Date();
  const no = order.orderNo ? `${order.orderYil}-${String(order.orderNo).padStart(3, '0')}` : String(order.id).slice(-5);
  const r = await getRouting(tx, tenantId);
  const accId = routeAccount(r, order.kanal, order.odemeYontemi);
  await tx.hareket.create({ data: { tenantId, tarih: now.toISOString().slice(0, 10), saat: now.toTimeString().slice(0, 5), aciklama: `Sipariş iptal/iade #${no}`, tutar: kayitli, tip: 'gider', kategori: 'İade/İptal', kasaBankaId: accId || null, createdBy: null } });
  if (accId) await tx.kasaBanka.update({ where: { id: accId }, data: { bakiye: { decrement: kayitli } } }).catch(() => null);
  await tx.storeOrder.update({ where: { id: order.id }, data: { gelirKaydedilen: 0, tahsilat: 0 } });
}

// Ödeme yönlendirme ayarını oku (kanal -> kasa/banka hesabı + POS komisyonu)
async function getRouting(tx: any, tenantId: string): Promise<any> {
  const s = await tx.integrationSetting.findFirst({ where: { tenantId, category: 'PAYMENT', provider: 'kasa-routing' } }).catch(() => null);
  return (s?.config as any) || {};
}
function isPosPayment(odemeYontemi?: string | null) { return /kart|kredi|pos/i.test(odemeYontemi || ''); }
function routeAccount(r: any, kanal?: string | null, odemeYontemi?: string | null): string | null {
  if (r.posAktif && r.pos && isPosPayment(odemeYontemi)) return r.pos;
  return r[kanal || ''] || r.online || r.magaza || r.kasa || null;
}
// Sipariş gelirini ilgili kasa/banka hesabına işle (+ POS komisyonu)
async function creditIncome(tx: any, tenantId: string, opt: { tutar: number; kanal?: string | null; odemeYontemi?: string | null; aciklama: string; kategori: string; createdBy?: string | null }) {
  if (!(opt.tutar > 0)) return;
  const now = new Date();
  const tarih = now.toISOString().slice(0, 10), saat = now.toTimeString().slice(0, 5);
  const r = await getRouting(tx, tenantId);
  const accId = routeAccount(r, opt.kanal, opt.odemeYontemi);
  const pos = !!(r.posAktif && r.pos && isPosPayment(opt.odemeYontemi));
  const komisyon = pos && (Number(r.posKomisyon) || 0) > 0 ? Math.round(opt.tutar * (Number(r.posKomisyon) / 100) * 100) / 100 : 0;
  await tx.hareket.create({ data: { tenantId, tarih, saat, aciklama: opt.aciklama, tutar: opt.tutar, tip: 'gelir', kategori: opt.kategori, kasaBankaId: accId || null, createdBy: opt.createdBy || null } }).catch(() => null);
  if (accId) await tx.kasaBanka.update({ where: { id: accId }, data: { bakiye: { increment: opt.tutar - komisyon } } }).catch(() => null);
  if (komisyon > 0) await tx.hareket.create({ data: { tenantId, tarih, saat, aciklama: `POS komisyonu - ${opt.aciklama}`, tutar: komisyon, tip: 'gider', kategori: 'POS Komisyonu', kasaBankaId: accId || null, createdBy: opt.createdBy || null } }).catch(() => null);
}

// ───────── Bootstrap: tum depo/magaza verisi ─────────
router.get('/bootstrap', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const [products, categories, brands, salesCodes, customers, discountCodes, orders, storeSetting, variationTemplates, campaigns, socialAccounts, socialGroups, socialPersonas, igRules, igOtoAyar, igMesajLog] = await Promise.all([
    prisma.product.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' }, include: { variations: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } }),
    prisma.productCategory.findMany({ where: { tenantId: t }, orderBy: { ad: 'asc' } }),
    prisma.marka.findMany({ where: { tenantId: t }, orderBy: { ad: 'asc' } }),
    prisma.salesCode.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' } }),
    prisma.customer.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' } }),
    prisma.discountCode.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' } }),
    prisma.storeOrder.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' }, include: { customer: { select: { id: true, ad: true, telefon: true, instagram: true, email: true, adres: true, il: true, ilce: true } } } }),
    prisma.storeSetting.findUnique({ where: { tenantId: t } }),
    prisma.variationTemplate.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' } }),
    prisma.campaign.findMany({ where: { tenantId: t, silindi: null }, orderBy: { createdAt: 'desc' } }),
    prisma.sosyalHesap.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' } }),
    prisma.sosyalGrup.findMany({ where: { tenantId: t }, orderBy: { ad: 'asc' } }),
    prisma.sosyalPersona.findMany({ where: { tenantId: t }, orderBy: { ad: 'asc' } }),
    prisma.igOtoYanitKural.findMany({ where: { tenantId: t }, orderBy: [{ oncelik: 'desc' }, { createdAt: 'desc' }] }),
    prisma.igOtoAyar.findUnique({ where: { tenantId: t } }),
    prisma.igMesajLog.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  // Adres tamamlama: siparişin kendi adresi boşsa müşteri kaydından (ilişki veya musteriHandle eşleşmesi) doldur
  const byInsta = new Map<string, any>();
  const byTel = new Map<string, any>();
  const normH = (s: any) => String(s || '').replace(/^@/, '').trim().toLowerCase();
  const normT = (s: any) => String(s || '').replace(/\D/g, '');
  for (const c of customers as any[]) {
    if (c.instagram) byInsta.set(normH(c.instagram), c);
    if (c.telefon) byTel.set(normT(c.telefon), c);
  }
  const ordersMerged = (orders as any[]).map((o) => {
    const hasAddr = (o.adres || '').trim() || (o.il || '').trim() || (o.ilce || '').trim();
    if (hasAddr) return o;
    let src: any = o.customer && ((o.customer.adres || '').trim() || (o.customer.il || '').trim() || (o.customer.ilce || '').trim()) ? o.customer : null;
    if (!src && o.musteriHandle) {
      const h = normH(o.musteriHandle); const tel = normT(o.musteriHandle);
      src = byInsta.get(h) || (tel ? byTel.get(tel) : null) || null;
    }
    if (src) return { ...o, adres: o.adres || src.adres || '', il: o.il || src.il || '', ilce: o.ilce || src.ilce || '' };
    return o;
  });
  res.json({ products, categories, brands, salesCodes, customers, discountCodes, orders: ordersMerged, storeSetting, variationTemplates, campaigns, socialAccounts, socialGroups, socialPersonas, igRules, igOtoAyar, igMesajLog });
}));

// ───────── Generic CRUD ─────────
const SIMPLE: Record<string, string> = {
  'categories': 'productCategory',
  'brands': 'marka',
  'customers': 'customer',
  'discounts': 'discountCode',
  'variations': 'productVariation',
  'variation-templates': 'variationTemplate',
  // Etkileşim Ağı (sosyal medya hesap yönetim paneli) - generic CRUD
  'social-accounts': 'sosyalHesap',
  'social-groups': 'sosyalGrup',
  'social-personas': 'sosyalPersona',
  // Instagram otomatik yanit kurallari (DM/yorum) - generic CRUD
  'ig-rules': 'igOtoYanitKural',
};
for (const [seg, model] of Object.entries(SIMPLE)) {
  const m = () => (prisma as any)[model];
  router.post(`/${seg}`, asyncHandler(async (req: Request, res: Response) => {
    const created = await m().create({ data: { ...clean(req.body), tenantId: req.tenantId! } });
    res.status(201).json(created);
  }));
  router.patch(`/${seg}/:id`, asyncHandler(async (req: Request, res: Response) => {
    const found = await m().findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!found) throw new ApiError(404, 'Kayit bulunamadi');
    res.json(await m().update({ where: { id: req.params.id }, data: clean(req.body) }));
  }));
  router.delete(`/${seg}/:id`, asyncHandler(async (req: Request, res: Response) => {
    const found = await m().findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!found) throw new ApiError(404, 'Kayit bulunamadi');
    await m().delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }));
}

// ───────── Etkileşim Ağı: toplu işlem ─────────
// Sadece veri/yönetim: toplu proxy değiştir, grup taşı, etiket ekle/kaldır, durum değiştir.
// Gerçek otomasyon (oturum açma/konsol) YOK.
router.post('/social-accounts/bulk', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const islem: string = String(req.body?.islem || '');
  const deger = req.body?.deger;
  if (!ids.length) throw new ApiError(400, 'Kayit secilmedi');
  // Sadece bu tenant'a ait hesaplar
  const rows = await prisma.sosyalHesap.findMany({ where: { id: { in: ids }, tenantId: t } });
  const validIds = rows.map((r) => r.id);
  if (!validIds.length) throw new ApiError(404, 'Kayit bulunamadi');

  let sonuc = 0;
  if (islem === 'proxy') {
    const r = await prisma.sosyalHesap.updateMany({ where: { id: { in: validIds }, tenantId: t }, data: { proxy: deger?.proxy ?? null, proxyDurum: deger?.proxyDurum ?? 'yok' } });
    sonuc = r.count;
  } else if (islem === 'grup') {
    const r = await prisma.sosyalHesap.updateMany({ where: { id: { in: validIds }, tenantId: t }, data: { grupId: deger?.grupId ?? null } });
    sonuc = r.count;
  } else if (islem === 'durum') {
    const r = await prisma.sosyalHesap.updateMany({ where: { id: { in: validIds }, tenantId: t }, data: { durum: String(deger?.durum || 'aktif') } });
    sonuc = r.count;
  } else if (islem === 'persona') {
    const r = await prisma.sosyalHesap.updateMany({ where: { id: { in: validIds }, tenantId: t }, data: { persona: deger?.persona ?? null } });
    sonuc = r.count;
  } else if (islem === 'etiket-ekle' || islem === 'etiket-kaldir') {
    // Etiketler virgülle ayrılmış string. Her kaydı ayrı güncelle (set birleştir/çıkar).
    const tag = String(deger?.etiket || '').trim();
    if (!tag) throw new ApiError(400, 'Etiket bos');
    for (const row of rows) {
      const cur = String(row.etiketler || '').split(',').map((s) => s.trim()).filter(Boolean);
      let next: string[];
      if (islem === 'etiket-ekle') next = cur.includes(tag) ? cur : [...cur, tag];
      else next = cur.filter((x) => x !== tag);
      await prisma.sosyalHesap.update({ where: { id: row.id }, data: { etiketler: next.join(',') } });
      sonuc++;
    }
  } else {
    throw new ApiError(400, 'Gecersiz islem');
  }
  res.json({ ok: true, count: sonuc });
}));

// ───────── Kampanyalar ─────────
// Generic CRUD'dan ayri tutuluyor: kampanya eklendiginde/guncellendiginde/silindiginde
// acik (durum='sepet') siparis sepetlerinin indirimi recalcOpenCarts ile yeniden hesaplanir.
// Aksi halde kampanya pasif yapilsa bile eski hesaplanmis indirim sepette kalir.
function cleanCampaign(body: any): any {
  const d = clean(body);
  // bitisZamani: süreli kampanya bitişi (string/ISO -> Date | null)
  if ('bitisZamani' in d) d.bitisZamani = d.bitisZamani ? new Date(d.bitisZamani) : null;
  return d;
}
router.post('/campaigns', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const created = await prisma.$transaction(async (tx) => {
    const c = await tx.campaign.create({ data: { ...cleanCampaign(req.body), tenantId: t } });
    await recalcOpenCarts(tx, t);
    return c;
  });
  res.status(201).json(created);
}));
router.patch('/campaigns/:id', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const found = await prisma.campaign.findFirst({ where: { id: req.params.id, tenantId: t } });
  if (!found) throw new ApiError(404, 'Kayit bulunamadi');
  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.campaign.update({ where: { id: req.params.id }, data: cleanCampaign(req.body) });
    await recalcOpenCarts(tx, t);
    return c;
  });
  res.json(updated);
}));
// Kampanyayı durdur: aktif=false + bitisZamani=now. Daha önce bu kampanyadan yararlanmış
// (snapshot'ta kilitli) sepetler recalcOpenCarts içinde lockedIds ile korunur; yeni sepetler yararlanamaz.
router.post('/campaigns/:id/stop', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const found = await prisma.campaign.findFirst({ where: { id: req.params.id, tenantId: t } });
  if (!found) throw new ApiError(404, 'Kayit bulunamadi');
  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.campaign.update({ where: { id: req.params.id }, data: { aktif: false, bitisZamani: new Date() } });
    await recalcOpenCarts(tx, t);
    return c;
  });
  res.json(updated);
}));
router.delete('/campaigns/:id', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const found = await prisma.campaign.findFirst({ where: { id: req.params.id, tenantId: t } });
  if (!found) throw new ApiError(404, 'Kayit bulunamadi');
  await prisma.$transaction(async (tx) => {
    await tx.campaign.update({ where: { id: req.params.id }, data: { silindi: new Date(), aktif: false } });
    await recalcOpenCarts(tx, t);
  });
  res.json({ ok: true });
}));

// ───────── Products (barkod + satis kodu havuzu) ─────────
router.post('/products', asyncHandler(async (req: Request, res: Response) => {
  const b = clean(req.body);
  if (b.kdv !== undefined) b.kdv = Number(b.kdv) || 0;
  if (!b.barkod) b.barkod = genBarcode();
  const vars: any[] = Array.isArray(req.body.variations) ? req.body.variations : [];
  const product = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({ data: { ...b, tenantId: req.tenantId!, createdBy: req.auth!.userId } });
    if (b.salesCode) {
      await tx.salesCode.updateMany({ where: { tenantId: req.tenantId!, code: b.salesCode }, data: { used: true, productId: p.id } });
    }
    for (const v of vars) {
      if (!v?.deger) continue;
      await tx.productVariation.create({ data: { tenantId: req.tenantId!, productId: p.id, ad: v.ad || 'Varyasyon', deger: v.deger, stok: Number(v.stok) || 0, ekFiyat: Number(v.ekFiyat) || 0 } });
    }
    if (vars.some((v) => v?.deger)) {
      const toplam = vars.reduce((s, v) => s + (v?.deger ? (Number(v.stok) || 0) : 0), 0);
      await tx.product.update({ where: { id: p.id }, data: { stokAdeti: toplam } });
    }
    // Baslangic stok hareketi (olusturma / ice aktarma)
    const importMode = req.body?.kaynak === 'import' || req.body?.iceAktarma === true;
    const who2 = await actorName(req.auth?.userId);
    if (vars.some((v) => v?.deger)) {
      for (const v of vars) {
        if (!v?.deger || !(Number(v.stok) > 0)) continue;
        await logStok(tx, req.tenantId!, { productId: p.id, varyasyon: v.deger, yon: 'giris', tip: importMode ? 'ice_aktarma' : 'olusturma', kanal: 'manuel', miktar: Number(v.stok) || 0, stokSonra: Number(v.stok) || 0, kullanici: who2, aciklama: `${p.ad} başlangıç stoğu` });
      }
    } else if (Number(b.stokAdeti) > 0) {
      await logStok(tx, req.tenantId!, { productId: p.id, yon: 'giris', tip: importMode ? 'ice_aktarma' : 'olusturma', kanal: 'manuel', miktar: Number(b.stokAdeti) || 0, stokSonra: Number(b.stokAdeti) || 0, kullanici: who2, aciklama: `${p.ad} başlangıç stoğu` });
    }
    return p;
  });
  await promoteWaitingStock(req.tenantId!, { productId: product.id }).catch((e) => console.error('[promoteWaitingStock]', e));
  await logAudit(req, 'ekle', 'urun', product.id, `Ürün eklendi: ${product.ad}`, { hedef: product.ad, meta: { satisFiyat: product.satisFiyat, stok: product.stokAdeti } });
  res.status(201).json(product);
}));
router.patch('/products/:id', asyncHandler(async (req: Request, res: Response) => {
  const found = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!found) throw new ApiError(404, 'Urun bulunamadi');
  const b = clean(req.body);
  if (b.kdv !== undefined) b.kdv = Number(b.kdv) || 0;
  const updated = await prisma.$transaction(async (tx) => {
    const who3 = await actorName(req.auth?.userId);
    const p = await tx.product.update({ where: { id: req.params.id }, data: b });
    let stokArtti = false;
    if (b.salesCode !== undefined && b.salesCode !== found.salesCode) {
      if (found.salesCode) await tx.salesCode.updateMany({ where: { tenantId: req.tenantId!, code: found.salesCode }, data: { used: false, productId: null } });
      if (b.salesCode) await tx.salesCode.updateMany({ where: { tenantId: req.tenantId!, code: b.salesCode }, data: { used: true, productId: p.id } });
    }
    if (Array.isArray(req.body.variations)) {
      const oldVars = await tx.productVariation.findMany({ where: { productId: p.id, tenantId: req.tenantId! }, select: { deger: true, stok: true } });
      const oldMap = new Map(oldVars.map((v) => [v.deger, Number(v.stok) || 0]));
      await tx.productVariation.deleteMany({ where: { productId: p.id, tenantId: req.tenantId! } });
      let toplam = 0;
      for (const v of req.body.variations) {
        if (!v?.deger) continue;
        const yeni = Number(v.stok) || 0;
        toplam += yeni;
        await tx.productVariation.create({ data: { tenantId: req.tenantId!, productId: p.id, ad: v.ad || 'Varyasyon', deger: v.deger, stok: yeni, ekFiyat: Number(v.ekFiyat) || 0 } });
        const fark = yeni - (oldMap.get(v.deger) ?? 0);
        if (fark > 0) stokArtti = true;
        if (fark !== 0) await logStok(tx, req.tenantId!, { productId: p.id, varyasyon: v.deger, yon: fark > 0 ? 'giris' : 'cikis', tip: 'manuel', kanal: 'manuel', miktar: Math.abs(fark), stokSonra: yeni, kullanici: who3, aciklama: `${p.ad} manuel stok düzenleme` });
        oldMap.delete(v.deger);
      }
      // Silinen varyasyonlar (cikis)
      for (const [deg, st] of oldMap) {
        if (st > 0) await logStok(tx, req.tenantId!, { productId: p.id, varyasyon: deg, yon: 'cikis', tip: 'manuel', kanal: 'manuel', miktar: st, stokSonra: 0, kullanici: who3, aciklama: `${p.ad} varyasyon kaldırıldı` });
      }
      // Varyasyonlu üründe toplam stok = varyasyon stokları toplamı
      if (req.body.variations.some((v: any) => v?.deger)) {
        await tx.product.update({ where: { id: p.id }, data: { stokAdeti: toplam } });
      }
    } else if (b.stokAdeti !== undefined && Number(b.stokAdeti) !== Number(found.stokAdeti)) {
      const fark = Number(b.stokAdeti) - Number(found.stokAdeti || 0);
      if (fark > 0) stokArtti = true;
      await logStok(tx, req.tenantId!, { productId: p.id, yon: fark > 0 ? 'giris' : 'cikis', tip: 'manuel', kanal: 'manuel', miktar: Math.abs(fark), stokSonra: Number(b.stokAdeti), kullanici: who3, aciklama: `${p.ad} manuel stok düzenleme` });
    }
    return { p, stokArtti };
  });
  // Bekleyen "stok_yok" siparişleri YALNIZCA stok GERÇEKTEN arttığında otomatik onayla.
  // (Aksi halde isim/fiyat düzenleme veya stok azaltma anında da stok tükenirdi.)
  if (updated.stokArtti) {
    await promoteWaitingStock(req.tenantId!, { productId: req.params.id }).catch((e) => console.error('[promoteWaitingStock]', e));
  }
  const degisen: Record<string, any> = {};
  for (const k of ['ad', 'satisFiyat', 'eskiFiyat', 'stokAdeti', 'salesCode', 'marka', 'kategoriId']) {
    if (b[k] !== undefined && (found as any)[k] !== b[k]) degisen[k] = { onceki: (found as any)[k] ?? null, yeni: b[k] };
  }
  const degisenAlanlar = Object.keys(degisen);
  await logAudit(req, 'guncelle', 'urun', updated.p.id, degisenAlanlar.length ? `Güncellenen: ${degisenAlanlar.join(', ')}` : `Ürün güncellendi: ${updated.p.ad}`, { hedef: updated.p.ad, neden: degisenAlanlar.length ? `${degisenAlanlar.length} alan değişti` : null, meta: degisen });
  res.json(updated.p);
}));
router.delete('/products/:id', asyncHandler(async (req: Request, res: Response) => {
  const found = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!found) throw new ApiError(404, 'Urun bulunamadi');
  await prisma.$transaction(async (tx) => {
    if (found.salesCode) await tx.salesCode.updateMany({ where: { tenantId: req.tenantId!, code: found.salesCode }, data: { used: false, productId: null } });
    await tx.product.delete({ where: { id: req.params.id } });
  });
  await logAudit(req, 'sil', 'urun', found.id, `Ürün silindi: ${found.ad}`, { hedef: found.ad, neden: req.body?.neden || null, meta: { satisFiyat: found.satisFiyat, stok: found.stokAdeti } });
  res.json({ ok: true });
}));

// ───────── Satis Kodu Havuzu ─────────
router.post('/salescodes/bulk', asyncHandler(async (req: Request, res: Response) => {
  const raw = String(req.body?.codes || '');
  const codes = raw.split(',').map((c) => c.trim()).filter(Boolean);
  if (codes.length === 0) throw new ApiError(422, 'Kod girilmedi');
  let added = 0;
  for (const code of codes) {
    try {
      await prisma.salesCode.create({ data: { tenantId: req.tenantId!, code } });
      added++;
    } catch { /* zaten var */ }
  }
  res.status(201).json({ added });
}));
router.delete('/salescodes/:id', asyncHandler(async (req: Request, res: Response) => {
  const found = await prisma.salesCode.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!found) throw new ApiError(404, 'Kod bulunamadi');
  await prisma.salesCode.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// ───────── Siparisler ─────────
router.get('/orders/:id', asyncHandler(async (req: Request, res: Response) => {
  const found = await prisma.storeOrder.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!found) throw new ApiError(404, 'Siparis bulunamadi');
  let custBakiye = 0;
  let resolvedCustomerId: string | null = found.customerId || null;
  let custObj: any = null;
  if (!resolvedCustomerId && found.musteriHandle) {
    const h = String(found.musteriHandle).replace(/^@/, '').trim();
    if (h) {
      custObj = await prisma.customer.findFirst({
        where: { tenantId: req.tenantId!, OR: [{ instagram: h }, { instagram: '@' + h }, { telefon: h }] },
        select: { id: true, bakiye: true, adres: true, il: true, ilce: true },
      });
      if (custObj) { resolvedCustomerId = custObj.id; custBakiye = Number(custObj.bakiye) || 0; }
    }
  } else if (resolvedCustomerId) {
    custObj = await prisma.customer.findFirst({ where: { id: resolvedCustomerId, tenantId: req.tenantId! }, select: { bakiye: true, adres: true, il: true, ilce: true } });
    custBakiye = Number(custObj?.bakiye) || 0;
  }
  res.json({
    ...found,
    custBakiye,
    custResolvedId: resolvedCustomerId,
    custAdres: custObj?.adres || null,
    custIl: custObj?.il || null,
    custIlce: custObj?.ilce || null,
  });
}));
router.get('/orders/:id/events', asyncHandler(async (req: Request, res: Response) => {
  const found = await prisma.storeOrder.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!found) throw new ApiError(404, 'Siparis bulunamadi');
  const events = await prisma.orderEvent.findMany({ where: { orderId: req.params.id, tenantId: req.tenantId! }, orderBy: { createdAt: 'desc' } });
  res.json(events);
}));

router.post('/orders', asyncHandler(async (req: Request, res: Response) => {
  const b = clean(req.body);
  const who = await actorName(req.auth?.userId);
  // Müşteri kayıtlı adresini varsayılan olarak doldur (body'de yoksa)
  if (b.customerId && (!b.adres && !b.il && !b.ilce)) {
    const cst = await prisma.customer.findFirst({ where: { id: b.customerId, tenantId: req.tenantId! }, select: { adres: true, il: true, ilce: true } });
    if (cst) { if (cst.adres) b.adres = cst.adres; if (cst.il) b.il = cst.il; if (cst.ilce) b.ilce = cst.ilce; }
  }
  const created = await prisma.$transaction(async (tx) => {
    const seq = await nextOrderNo(tx, req.tenantId!);
    const sipNo = await generateSipNo(tx);
    return tx.storeOrder.create({ data: { ...b, ...seq, sipNo, tenantId: req.tenantId! } });
  });
  await logEvent(req.tenantId!, created.id, who, 'Sipariş oluşturuldu', `${created.sipNo || created.orderYil + '-' + String(created.orderNo).padStart(3, '0')}`);
  // Sipariş alındı bildirimi (NetGSM SMS) — sessiz
  try {
    if (created.customerId) {
      const cst = await prisma.customer.findFirst({ where: { id: created.customerId, tenantId: req.tenantId! }, select: { telefon: true, ad: true } });
      const tnt = await prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { name: true } });
      const no2 = `${created.orderYil}-${String(created.orderNo).padStart(3, '0')}`;
      void notifyOrderSms(req.tenantId!, 'new', { phone: cst?.telefon, ad: cst?.ad, no: no2, tutar: created.toplam, firma: tnt?.name || '', sepetLink: created.token ? `${env.APP_DOMAIN}/sepet/${created.token}` : undefined });
    }
  } catch { /* */ }
  await logAudit(req, 'ekle', 'siparis', created.id, created.sipNo || `#${created.id.slice(-6)}`, { hedef: created.sipNo || `#${created.id.slice(-6)}`, kime: created.musteriHandle || null, meta: { kanal: created.kanal || null, tutar: created.toplam || 0, durum: created.durum } });
  res.status(201).json(created);
}));

router.patch('/orders/:id', asyncHandler(async (req: Request, res: Response) => {
  const found = await prisma.storeOrder.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!found) throw new ApiError(404, 'Siparis bulunamadi');
  const who = await actorName(req.auth?.userId);
  const customLog = typeof req.body?._log === 'string' ? req.body._log : '';
  const manuelIndirim = req.body?.manuelIndirim === true || found.manuelIndirim === true;
  const iptalNedeni = typeof req.body?.iptalNedeni === 'string' ? req.body.iptalNedeni : '';
  const body = clean(req.body);
  delete (body as any)._log;
  delete (body as any).iptalNedeni;
  // manuelIndirim kalıcı olarak DB'ye kaydedilecek — silme

  // Durum değiştirme yetki kontrolü: yalnız PATRON / YONETICI / özel yetkili manuel değiştirebilir.
  // İstisna: sistemin otomatik 'odeme_bekliyor → hazirlaniyor' geçişi (auto:true, kalan ≤ 0) yetki istemez.
  if (body.durum !== undefined && body.durum !== found.durum) {
    // Sistemin otomatik 'hazirlaniyor' geçişi (auto:true) yetki istemez; manuel değişiklik yetki ister.
    const isAutoHazir = req.body?._auto === true && body.durum === 'hazirlaniyor';
    if (!isAutoHazir && !(await canChangeDurum(req))) {
      throw new ApiError(403, 'Sipariş durumunu yalnızca patron, yönetici veya yetkilendirilmiş personel değiştirebilir.');
    }
  }
  delete (body as any)._auto;

  // Kalan bakiyesi olan sepet kargoya/hazırlanıyor moduna alınamaz
  if (body.durum && ['kargoda', 'hazirlaniyor'].includes(body.durum)) {
    const toplam = Number(found.toplam) || 0;
    const tahsilat = Number(found.tahsilat) || 0;
    const kalan = toplam - tahsilat;
    if (kalan > 0.01) {
      throw new ApiError(422, `Kalan bakiye: ${kalan.toFixed(2)} TL — ödeme tamamlanmadan sepet ${body.durum === 'kargoda' ? 'kargoya verilemez' : 'hazırlanıyor moduna alınamaz'}.`);
    }
  }

  // Tahsilat artışında otomatik gelir kaydı (çift kayıt önlenir: gelirKaydedilen takibi)
  let gelirDelta = 0;
  if (body.tahsilat !== undefined) {
    const yeniTahsilat = Number(body.tahsilat) || 0;
    const kayitli = found.gelirKaydedilen || 0;
    if (yeniTahsilat > kayitli) { gelirDelta = yeniTahsilat - kayitli; (body as any).gelirKaydedilen = yeniTahsilat; }
    // Ödeme bildirimi bekleyen siparişe ödeme eklenirse "ödeme bildirimi" etiketi otomatik kalkar
    if (yeniTahsilat > (Number(found.tahsilat) || 0) && (found as any).odemeBildirim && (body as any).odemeBildirim === undefined) {
      (body as any).odemeBildirim = null;
    }
  }
  const updated = await prisma.$transaction(async (tx) => {
    // Kalemler güncelleniyorsa: (1) bağlı canlı yayın satırlarının fiyatını sepetle eşitle,
    // (2) kupon/manuel indirim yoksa kampanya indirimini sunucuda yeniden hesapla (tek kaynak).
    if (Array.isArray(body.items)) {
      const items = body.items as any[];
      for (const it of items) {
        if (it && it.liveOrderId) {
          await tx.liveOrder.updateMany({ where: { id: it.liveOrderId, tenantId: req.tenantId! }, data: { tutar: Number(it.fiyat) || 0, ...(it.durum ? { durum: it.durum } : {}) } });
        }
      }
      const kupon = (body.indirimKodu ?? found.indirimKodu);
      if (!kupon && !manuelIndirim) {
        const adj = await campaignAdjust(tx, req.tenantId!, items);
        const kargo = Number(body.kargoUcreti ?? found.kargoUcreti) || 0;
        (body as any).araToplam = adj.araToplam;
        (body as any).indirim = adj.indirim;
        (body as any).kampanyalar = adj.kampanyalar;
        (body as any).toplam = Math.max(0, adj.toplam + kargo);
      }
    }
    // İptal'e geçiş: stok iadesi + kasaya işlenen gelirin geri alımı (yalnız bir kez)
    if (body.durum === 'iptal' && found.durum !== 'iptal') {
      const oItems: any[] = Array.isArray(found.items) ? (found.items as any[]) : [];
      const cAd = found.customerId ? (await tx.customer.findUnique({ where: { id: found.customerId }, select: { ad: true } }))?.ad : (found.musteriHandle || null);
      await returnStock(tx, req.tenantId!, oItems, { orderId: found.id, sipNo: found.sipNo || null, customerId: found.customerId, customerAd: cAd, kullanici: who, tip: 'iptal_iade' });
      await reverseIncome(tx, req.tenantId!, found);
    }
    // İptal -> aktif geçişini bu uçtan engelle: stok kontrolü/düşümü yapılmadan oversell olmasın.
    if (found.durum === 'iptal' && body.durum && body.durum !== 'iptal') {
      throw new ApiError(400, "İptal edilmiş sipariş yalnızca 'Aktifleştir' ile geri alınabilir (stok kontrolü için).");
    }
    return tx.storeOrder.update({ where: { id: req.params.id }, data: body });
  });
  // Adres güncelleniyorsa müşteri kaydına da yansıt (customerId yoksa musteriHandle ile çöz)
  if (body.adres !== undefined || body.il !== undefined || body.ilce !== undefined) {
    const cd: any = {};
    if (body.adres !== undefined) cd.adres = body.adres;
    if (body.il !== undefined) cd.il = body.il;
    if (body.ilce !== undefined) cd.ilce = body.ilce;
    if (Object.keys(cd).length) {
      let custId: string | null = updated.customerId || null;
      if (!custId && updated.musteriHandle) {
        const h = String(updated.musteriHandle).replace(/^@/, '').trim();
        if (h) {
          const m = await prisma.customer.findFirst({ where: { tenantId: req.tenantId!, OR: [{ instagram: h }, { instagram: '@' + h }, { telefon: h }] }, select: { id: true } });
          if (m) custId = m.id;
        }
      }
      if (custId) await prisma.customer.update({ where: { id: custId }, data: cd }).catch(() => null);
    }
  }
  if (gelirDelta > 0.001) {
    const now = new Date();
    const cust = updated.customerId ? await prisma.customer.findFirst({ where: { id: updated.customerId, tenantId: req.tenantId! } }) : null;
    const no = updated.orderNo ? `${updated.orderYil}-${String(updated.orderNo).padStart(3, '0')}` : updated.id.slice(-5);
    await creditIncome(prisma, req.tenantId!, { tutar: gelirDelta, kanal: updated.kanal, odemeYontemi: updated.odemeYontemi, aciklama: `Satış tahsilatı #${no}${cust ? ' - ' + cust.ad : ''}`, kategori: 'Satış', createdBy: req.auth?.userId || null }).catch(() => null);
    void now;
    await logEvent(req.tenantId!, found.id, who, 'Gelire işlendi', `${gelirDelta.toLocaleString('tr-TR')}₺ Gelir/Gider'e eklendi`);
  }
  // Otomatik degisiklik loglari
  if (customLog) await logEvent(req.tenantId!, found.id, who, customLog);
  else {
    if (body.durum !== undefined && body.durum !== found.durum) await logEvent(req.tenantId!, found.id, who, 'Durum değiştirildi', `${found.durum} → ${body.durum}`);
    if (body.tahsilat !== undefined && Number(body.tahsilat) !== Number(found.tahsilat)) await logEvent(req.tenantId!, found.id, who, 'Tahsilat güncellendi', `${found.tahsilat} → ${body.tahsilat}`);
    if (body.indirim !== undefined && Number(body.indirim) !== Number(found.indirim)) await logEvent(req.tenantId!, found.id, who, 'İndirim güncellendi', `${body.indirim}`);
  }
  // Sipariş bildirimi (NetGSM SMS) — durum/kargo değişiminde, sessiz
  try {
    let event: 'approved' | 'shipped' | 'cancel' | 'lowstock' | null = null;
    const yeni = updated.durum;
    if ((yeni === 'hazirlaniyor' || yeni === 'onaylandi') && yeni !== found.durum) event = 'approved';
    if (yeni === 'kargoda' && yeni !== found.durum) event = 'shipped';
    if (updated.kargoTakip && updated.kargoTakip !== (found as any).kargoTakip) event = 'shipped';
    if (yeni === 'iptal' && yeni !== found.durum) event = (iptalNedeni === 'yetersiz_stok') ? 'lowstock' : 'cancel';
    if (event && updated.customerId) {
      const cst = await prisma.customer.findFirst({ where: { id: updated.customerId, tenantId: req.tenantId! }, select: { telefon: true, ad: true, instagram: true } });
      const tnt = await prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { name: true } });
      const no2 = updated.orderNo ? `${updated.orderYil}-${String(updated.orderNo).padStart(3, '0')}` : updated.id.slice(-5);
      const oItems: any[] = Array.isArray(updated.items) ? (updated.items as any[]) : [];
      const ilk = oItems[0] || {};
      const durumMap: Record<string, string> = { onaylandi: 'Onaylandı', hazirlaniyor: 'Hazırlanıyor', kargoda: 'Kargoda', iptal: 'İptal' };
      void notifyOrderSms(req.tenantId!, event, { phone: cst?.telefon, ad: cst?.ad, no: no2, tutar: updated.toplam, kargo: (updated as any).kargoFirmasi || '', takip: (updated as any).kargoTakip || '', firma: tnt?.name || '', kullaniciadi: cst?.instagram || '', instagram: cst?.instagram || '', durum: durumMap[yeni] || yeni, urun: ilk.ad || '', beden: ilk.beden || ilk.varyasyon || '', kod: ilk.kod || '', sepetLink: updated.token ? `${env.APP_DOMAIN}/sepet/${updated.token}` : undefined });
      // WhatsApp kargo hazırlık bildirimi (durum hazırlanıyor/onaylandı) — ödeme talebi değil
      if (event === 'approved') {
        void enqueueStatusNotification(req.tenantId!, { phone: cst?.telefon, ad: cst?.ad, kind: 'hazirlik', payload: { no: no2 } });
      }
      // WhatsApp durum bildirimleri: iptal / yetersiz stok (yalnızca kayıtlı müşteri)
      if (event === 'cancel') {
        void enqueueStatusNotification(req.tenantId!, { phone: cst?.telefon, ad: cst?.ad, kind: 'iptal', payload: { no: no2, urun: ilk.ad || '' } });
      } else if (event === 'lowstock') {
        void enqueueStatusNotification(req.tenantId!, { phone: cst?.telefon, ad: cst?.ad, kind: 'stok', payload: { no: no2, urun: ilk.ad || '' } });
      }
    }
  } catch { /* SMS hatasi siparisi etkilemez */ }
  // WhatsApp ödeme onaylandı bildirimi — her tahsilat artışında (customerId yoksa musteriHandle ile çözülür)
  try {
    const oldTah = Number(found.tahsilat) || 0;
    const newTah = Number(updated.tahsilat) || 0;
    if (newTah > oldTah + 0.005) await notifyPaymentApproved(req.tenantId!, updated, newTah - oldTah);
  } catch { /* bildirim hatasi akisi etkilemez */ }
  res.json(updated);
}));

// Sepet iptal (stok iadesi + log; numara korunur)
router.post('/orders/:id/cancel', asyncHandler(async (req: Request, res: Response) => {
  const who = await actorName(req.auth?.userId);
  const updated = await prisma.$transaction(async (tx) => {
    const o = await tx.storeOrder.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!o) throw new ApiError(404, 'Siparis bulunamadi');
    // Zaten iptal edilmiş siparişi tekrar iptal etme — çift stok iadesini (stok şişmesi) engelle
    if (o.durum === 'iptal') return o;
    const items: any[] = Array.isArray(o.items) ? (o.items as any) : [];
    const cAd = o.customerId ? (await tx.customer.findUnique({ where: { id: o.customerId }, select: { ad: true } }))?.ad : (o.musteriHandle || null);
    await returnStock(tx, req.tenantId!, items, { orderId: o.id, sipNo: o.sipNo || null, customerId: o.customerId, customerAd: cAd, kullanici: who, tip: 'iptal_iade' });
    if (o.durum !== 'iptal') await reverseIncome(tx, req.tenantId!, o);
    return tx.storeOrder.update({ where: { id: o.id }, data: { durum: 'iptal' } });
  });
  await logEvent(req.tenantId!, updated.id, who, 'Sepet iptal edildi (stok iade)');
  await logAudit(req, 'iptal', 'siparis', updated.id, updated.sipNo || null, { hedef: updated.sipNo || null, kime: updated.musteriHandle || null, neden: req.body?.neden || 'Sepet iptal (stok iade)', meta: { tutar: updated.toplam || 0 } });
  res.json(updated);
}));

// İptal edilen sepeti yeniden aktifleştir (stok tekrar düşer)
router.post('/orders/:id/reactivate', asyncHandler(async (req: Request, res: Response) => {
  const who = await actorName(req.auth?.userId);
  const updated = await prisma.$transaction(async (tx) => {
    const o = await tx.storeOrder.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!o) throw new ApiError(404, 'Siparis bulunamadi');
    if (o.durum !== 'iptal') throw new ApiError(400, 'Yalnızca iptal edilmiş siparişler aktifleştirilebilir');
    const items: any[] = Array.isArray(o.items) ? (o.items as any) : [];
    const cAd = o.customerId ? (await tx.customer.findUnique({ where: { id: o.customerId }, select: { ad: true } }))?.ad : (o.musteriHandle || null);
    // Stok kontrolü + düşme
    for (const it of items) {
      if (!it?.stokDusuldu) continue;
      const adet = Number(it.adet) || 1;
      if (it.productId) {
        if (it.varyasyon) {
          const v = await tx.productVariation.findFirst({ where: { productId: it.productId, tenantId: req.tenantId!, deger: it.varyasyon } });
          if (!v || v.stok < adet) throw new ApiError(400, `Stok yetersiz: ${it.ad || it.productId} (${it.varyasyon || '-'})`);
          await tx.productVariation.update({ where: { id: v.id }, data: { stok: { decrement: adet } } });
        } else {
          // Bedensiz (basit) ürün: toplam stok yetmiyorsa aktifleştirmeyi engelle (negatife düşme = oversell)
          const prod = await tx.product.findUnique({ where: { id: it.productId }, select: { stokAdeti: true } });
          if (!prod || (prod.stokAdeti || 0) < adet) throw new ApiError(400, `Stok yetersiz: ${it.ad || it.productId}`);
        }
        const pr = await tx.product.update({ where: { id: it.productId }, data: { stokAdeti: { decrement: adet } }, select: { stokAdeti: true } }).catch(() => null);
        await logStok(tx, req.tenantId!, { productId: it.productId, varyasyon: it.varyasyon || null, yon: 'cikis', tip: 'satis', kanal: o.kanal || null, miktar: adet, stokSonra: pr?.stokAdeti ?? null, orderId: o.id, sipNo: o.sipNo || null, customerId: o.customerId, customerAd: cAd, kullanici: who, aciklama: `${it.ad || 'Ürün'} (yeniden aktif)` });
      }
    }
    return tx.storeOrder.update({ where: { id: o.id }, data: { durum: 'yeni' } });
  });
  await logEvent(req.tenantId!, updated.id, who, 'Sepet yeniden aktifleştirildi (stok düşüldü)');
  res.json(updated);
}));

// Sepetten urun cikar (stok iadesi + log)
router.post('/orders/:id/item-remove', asyncHandler(async (req: Request, res: Response) => {
  const idx = Number(req.body?.index);
  const who = await actorName(req.auth?.userId);
  const updated = await prisma.$transaction(async (tx) => {
    const o = await tx.storeOrder.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!o) throw new ApiError(404, 'Siparis bulunamadi');
    const items: any[] = Array.isArray(o.items) ? (o.items as any) : [];
    const removed = items[idx];
    if (removed) {
      const cAd = o.customerId ? (await tx.customer.findUnique({ where: { id: o.customerId }, select: { ad: true } }))?.ad : (o.musteriHandle || null);
      await returnStock(tx, req.tenantId!, [removed], { orderId: o.id, sipNo: o.sipNo || null, customerId: o.customerId, customerAd: cAd, kullanici: who, tip: 'sepet_cikar' });
    }
    const rest = items.filter((_, i) => i !== idx);
    const adj = await campaignAdjust(tx, req.tenantId!, rest);
    const upd = await tx.storeOrder.update({ where: { id: o.id }, data: { items: rest, araToplam: adj.araToplam, indirim: adj.indirim, kampanyalar: adj.kampanyalar, toplam: Math.max(0, adj.toplam + (o.kargoUcreti || 0)) } });
    return { upd, removed };
  });
  await logEvent(req.tenantId!, updated.upd.id, who, 'Ürün sepetten çıkarıldı', updated.removed?.ad || '');
  res.json(updated.upd);
}));

router.delete('/orders/:id', asyncHandler(async (req: Request, res: Response) => {
  const found = await prisma.storeOrder.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!found) throw new ApiError(404, 'Siparis bulunamadi');
  await prisma.$transaction(async (tx) => {
    const items: any[] = Array.isArray(found.items) ? (found.items as any) : [];
    const who = await actorName(req.auth?.userId);
    const cAd = found.customerId ? (await tx.customer.findUnique({ where: { id: found.customerId }, select: { ad: true } }))?.ad : (found.musteriHandle || null);
    await returnStock(tx, req.tenantId!, items, { orderId: found.id, sipNo: found.sipNo || null, customerId: found.customerId, customerAd: cAd, kullanici: who, tip: 'iptal_iade' });
    if (found.durum !== 'iptal') await reverseIncome(tx, req.tenantId!, found);
    await tx.storeOrder.delete({ where: { id: req.params.id } });
  });
  await logAudit(req, 'sil', 'siparis', found.id, found.sipNo || null, { hedef: found.sipNo || null, kime: found.musteriHandle || null, neden: req.body?.neden || 'Sipariş silindi', meta: { tutar: found.toplam || 0, durum: found.durum } });
  res.json({ ok: true });
}));

// ───────── Canli yayin siparisi (stok dususlu) ─────────
router.post('/canli-order', asyncHandler(async (req: Request, res: Response) => {
  const { productId, variationDeger, adet = 1, user } = req.body || {};
  const result = await prisma.$transaction(async (tx) => {
    const p = await tx.product.findFirst({ where: { id: productId, tenantId: req.tenantId! } });
    if (!p) throw new ApiError(404, 'Urun bulunamadi');
    let fiyat = p.satisFiyat;
    if (variationDeger) {
      const v = await tx.productVariation.findFirst({ where: { productId, tenantId: req.tenantId!, deger: variationDeger } });
      if (!v || v.stok < adet) throw new ApiError(400, 'Stok yetersiz');
      await tx.productVariation.update({ where: { id: v.id }, data: { stok: { decrement: adet } } });
      fiyat += v.ekFiyat || 0;
    } else if ((p.stokAdeti || 0) < adet) {
      throw new ApiError(400, 'Stok yetersiz');
    }
    const pr = await tx.product.update({ where: { id: p.id }, data: { stokAdeti: { decrement: adet } }, select: { stokAdeti: true } });
    const ad = p.ad + (variationDeger ? ` (${variationDeger})` : '');
    const seq = await nextOrderNo(tx, req.tenantId!);
    const sipNo = await generateSipNo(tx);
    const order = await tx.storeOrder.create({
      data: { tenantId: req.tenantId!, ...seq, sipNo, kanal: 'canli', durum: 'yeni', items: [{ productId, ad, varyasyon: variationDeger || null, adet, fiyat, stokDusuldu: true }], araToplam: fiyat * adet, indirim: 0, toplam: fiyat * adet, not: `Canli yayin - ${user || ''}` },
    });
    await logStok(tx, req.tenantId!, { productId, varyasyon: variationDeger || null, yon: 'cikis', tip: 'satis', kanal: 'canli', miktar: adet, stokSonra: pr.stokAdeti, orderId: order.id, sipNo, customerAd: user || null, kullanici: await actorName(req.auth?.userId), aciklama: `${ad} canlı yayın satışı` });
    return order;
  });
  res.status(201).json({ ok: true, orderId: result.id });
}));

// ───────── Kasa Satışı (mağaza POS — canlı yayından bağımsız) ─────────
router.post('/kasa-order', asyncHandler(async (req: Request, res: Response) => {
  const { items, odemeYontemi, saticiAd } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(422, 'Sepet boş');
  const who = await actorName(req.auth?.userId);
  const order = await prisma.$transaction(async (tx) => {
    const orderItems: any[] = [];
    const stokLogs: any[] = [];
    for (const it of items) {
      const p = await tx.product.findFirst({ where: { id: it.productId, tenantId: req.tenantId! }, include: { variations: true } });
      if (!p) throw new ApiError(404, 'Ürün bulunamadı');
      const adet = Math.max(1, Number(it.adet) || 1);
      let fiyat = p.satisFiyat;
      if (it.varyasyon) {
        const v = (p.variations || []).find((x: any) => x.deger === it.varyasyon);
        if (!v || v.stok < adet) throw new ApiError(400, `Stok yetersiz: ${p.ad}`);
        fiyat += v.ekFiyat || 0;
        await tx.productVariation.update({ where: { id: v.id }, data: { stok: { decrement: adet } } });
      } else if ((p.stokAdeti || 0) < adet) throw new ApiError(400, `Stok yetersiz: ${p.ad}`);
      const pr = await tx.product.update({ where: { id: p.id }, data: { stokAdeti: { decrement: adet } }, select: { stokAdeti: true } });
      const adAdi = p.ad + (it.varyasyon ? ` (${it.varyasyon})` : '');
      orderItems.push({ productId: p.id, ad: adAdi, varyasyon: it.varyasyon || null, adet, fiyat, stokDusuldu: true });
      stokLogs.push({ productId: p.id, varyasyon: it.varyasyon || null, adet, stokSonra: pr.stokAdeti, ad: adAdi });
    }
    const kamp = await campaignAdjust(tx, req.tenantId!, orderItems);
    const seq = await nextOrderNo(tx, req.tenantId!);
    const sipNo = await generateSipNo(tx);
    const ord = await tx.storeOrder.create({ data: { tenantId: req.tenantId!, ...seq, sipNo, kanal: 'magaza', durum: 'teslim', items: orderItems, araToplam: kamp.araToplam, indirim: kamp.indirim, kampanyalar: kamp.kampanyalar, toplam: kamp.toplam, tahsilat: kamp.toplam, gelirKaydedilen: kamp.toplam, odemeYontemi: odemeYontemi || 'Nakit', not: saticiAd ? `Kasa satışı - ${saticiAd}` : 'Kasa satışı' } });
    for (const sl of stokLogs) await logStok(tx, req.tenantId!, { productId: sl.productId, varyasyon: sl.varyasyon, yon: 'cikis', tip: 'satis', kanal: 'kasa', miktar: sl.adet, stokSonra: sl.stokSonra, orderId: ord.id, sipNo, customerAd: saticiAd || null, kullanici: who, aciklama: `${sl.ad} kasa satışı` });
    return ord;
  });
  // Gelir kaydı (ödeme yönlendirme + POS komisyonu uygulanır)
  try {
    await creditIncome(prisma, req.tenantId!, { tutar: order.toplam, kanal: 'kasa', odemeYontemi: odemeYontemi || 'Nakit', aciklama: `Kasa satışı #${order.sipNo || order.orderYil + '-' + String(order.orderNo).padStart(3, '0')}`, kategori: 'Kasa Satışı', createdBy: req.auth?.userId || null });
    await logEvent(req.tenantId!, order.id, who, 'Kasa satışı tamamlandı', `${order.toplam.toLocaleString('tr-TR')}₺ (${odemeYontemi || 'Nakit'})`);
  } catch { /* */ }
  res.status(201).json({ ok: true, order });
}));

// ───────── Stok Hareketleri ─────────
// Ürün bazlı stok hareketleri (stok kartı)
router.get('/products/:id/stock-movements', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const where: any = { tenantId, productId: req.params.id };
  if (req.query.varyasyon) where.varyasyon = String(req.query.varyasyon);
  if (req.query.tip) where.tip = String(req.query.tip);
  const rows = await prisma.stokHareket.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(1000, Number(req.query.limit) || 500) });
  res.json({ ok: true, rows });
}));

// Genel stok hareketleri raporu (filtre + sayfalama)
router.get('/stock-movements', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { tip, kanal, from, to, q, productId } = req.query as any;
  const where: any = { tenantId };
  if (productId) where.productId = String(productId);
  if (tip) where.tip = String(tip);
  if (kanal) where.kanal = String(kanal);
  if (from || to) where.createdAt = { ...(from ? { gte: new Date(String(from)) } : {}), ...(to ? { lte: new Date(String(to) + 'T23:59:59') } : {}) };
  if (q) {
    const term = String(q).trim();
    const matchProds = await prisma.product.findMany({ where: { tenantId, ad: { contains: term, mode: 'insensitive' } }, select: { id: true }, take: 200 });
    where.OR = [
      { sipNo: { contains: term, mode: 'insensitive' } },
      { customerAd: { contains: term, mode: 'insensitive' } },
      { aciklama: { contains: term, mode: 'insensitive' } },
      ...(matchProds.length ? [{ productId: { in: matchProds.map((p) => p.id) } }] : []),
    ];
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Number(req.query.pageSize) || 50);
  const [total, rows, agg] = await Promise.all([
    prisma.stokHareket.count({ where }),
    prisma.stokHareket.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.stokHareket.groupBy({ by: ['yon'], where, _sum: { miktar: true } }),
  ]);
  const pids = [...new Set(rows.map((r) => r.productId))];
  const prods = await prisma.product.findMany({ where: { id: { in: pids } }, select: { id: true, ad: true, salesCode: true } });
  const pmap = new Map(prods.map((p) => [p.id, p]));
  const out = rows.map((r) => ({ ...r, productAd: pmap.get(r.productId)?.ad || '(silinmiş ürün)', productKod: pmap.get(r.productId)?.salesCode || '' }));
  const toplamGiris = agg.find((a) => a.yon === 'giris')?._sum.miktar || 0;
  const toplamCikis = agg.find((a) => a.yon === 'cikis')?._sum.miktar || 0;
  res.json({ ok: true, rows: out, total, page, pageSize, ozet: { toplamGiris, toplamCikis, net: toplamGiris - toplamCikis } });
}));

// Geçmiş siparişlerden satış+iptal kayıtlarını geriye dönük doldur (idempotent)
router.post('/stock-movements/backfill', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const existing = await prisma.stokHareket.count({ where: { tenantId, kaynak: 'backfill' } });
  if (existing > 0 && !req.body?.force) return res.json({ ok: true, skipped: true, count: existing });
  if (req.body?.force) await prisma.stokHareket.deleteMany({ where: { tenantId, kaynak: 'backfill' } });
  const orders = await prisma.storeOrder.findMany({ where: { tenantId, durum: { not: 'sepet' } }, select: { id: true, sipNo: true, kanal: true, durum: true, customerId: true, musteriHandle: true, items: true, createdAt: true } });
  const custIds = [...new Set(orders.map((o) => o.customerId).filter(Boolean))] as string[];
  const custs = custIds.length ? await prisma.customer.findMany({ where: { id: { in: custIds } }, select: { id: true, ad: true } }) : [];
  const cmap = new Map(custs.map((c) => [c.id, c.ad]));
  const data: any[] = [];
  for (const o of orders) {
    const items = Array.isArray(o.items) ? (o.items as any[]) : [];
    for (const it of items) {
      if (!it?.productId || !it?.stokDusuldu) continue;
      const adet = Number(it.adet) || 1;
      const cAd = o.customerId ? cmap.get(o.customerId) || null : (o.musteriHandle || null);
      const iptal = o.durum === 'iptal';
      data.push({ tenantId, productId: it.productId, varyasyon: it.varyasyon || null, yon: iptal ? 'giris' : 'cikis', tip: iptal ? 'iptal_iade' : 'satis', kanal: o.kanal || null, miktar: adet, orderId: o.id, sipNo: o.sipNo || null, customerId: o.customerId || null, customerAd: cAd, aciklama: `${it.ad || 'Ürün'} (geçmiş ${iptal ? 'iptal' : 'satış'})`, kaynak: 'backfill', createdAt: o.createdAt });
    }
  }
  if (data.length) await prisma.stokHareket.createMany({ data });
  res.json({ ok: true, count: data.length });
}));

// ───────── Pazarlama / Davranış Analizi ─────────
router.get('/pazarlama', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const [products, customers, orders, views] = await Promise.all([
    prisma.product.findMany({ where: { tenantId: t }, select: { id: true, ad: true, satisFiyat: true, images: true } }),
    prisma.customer.findMany({ where: { tenantId: t } }),
    prisma.storeOrder.findMany({ where: { tenantId: t, durum: { not: 'sepet' } }, select: { customerId: true, durum: true, toplam: true, items: true, createdAt: true } }),
    prisma.productView.findMany({ where: { tenantId: t }, select: { productId: true, customerId: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 5000 }),
  ]);
  const pMap = new Map(products.map((p) => [p.id, p]));
  const viewCount = new Map<string, number>();
  for (const v of views) viewCount.set(v.productId, (viewCount.get(v.productId) || 0) + 1);
  const enCokGoruntulenen = [...viewCount.entries()].map(([id, n]) => ({ id, ad: pMap.get(id)?.ad || '?', img: (pMap.get(id)?.images as any)?.[0] || '', goruntulenme: n })).sort((a, b) => b.goruntulenme - a.goruntulenme).slice(0, 10);
  const custBought = new Map<string, Set<string>>();
  const custSpend = new Map<string, number>();
  const custLast = new Map<string, string>();
  for (const o of orders) {
    if (!o.customerId) continue;
    if (o.durum !== 'iptal') custSpend.set(o.customerId, (custSpend.get(o.customerId) || 0) + (o.toplam || 0));
    if (!custLast.get(o.customerId) || (o.createdAt as any) > (custLast.get(o.customerId) as any)) custLast.set(o.customerId, o.createdAt as any);
    const set = custBought.get(o.customerId) || new Set<string>();
    for (const it of (Array.isArray(o.items) ? (o.items as any) : [])) if (it.productId) set.add(it.productId);
    custBought.set(o.customerId, set);
  }
  const ilgiAmaAlmadi: any[] = [];
  const seen = new Set<string>();
  for (const v of views) {
    if (!v.customerId) continue;
    const key = v.customerId + '|' + v.productId;
    if (seen.has(key)) continue; seen.add(key);
    if (custBought.get(v.customerId)?.has(v.productId)) continue;
    const c = customers.find((x) => x.id === v.customerId);
    if (!c) continue;
    ilgiAmaAlmadi.push({ customerId: v.customerId, ad: c.ad, telefon: c.telefon, urun: pMap.get(v.productId)?.ad || '?', productId: v.productId });
    if (ilgiAmaAlmadi.length >= 50) break;
  }
  const enCokHarcayan = [...custSpend.entries()].map(([id, tutar]) => { const c = customers.find((x) => x.id === id); return { customerId: id, ad: c?.ad || '?', telefon: c?.telefon, tutar }; }).sort((a, b) => b.tutar - a.tutar).slice(0, 20);
  const now = Date.now();
  const pasifMusteriler = customers.filter((c) => { const last = custLast.get(c.id); return last && (now - new Date(last).getTime()) > 30 * 86400000; }).map((c) => ({ customerId: c.id, ad: c.ad, telefon: c.telefon, sonAlisveris: custLast.get(c.id) })).slice(0, 50);
  res.json({
    ozet: { toplamGoruntulenme: views.length, tekilUrun: viewCount.size, ilgiAmaAlmadi: ilgiAmaAlmadi.length, pasif: pasifMusteriler.length },
    enCokGoruntulenen, ilgiAmaAlmadi, enCokHarcayan, pasifMusteriler,
  });
}));

// ───────── Personel / Satıcı Sicili & Kalite ─────────
router.get('/sicil', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const [los, kayitlar, staff] = await Promise.all([
    prisma.liveOrder.findMany({ where: { tenantId: t }, select: { saticiAd: true, durum: true } }),
    prisma.sicilKaydi.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' } }),
    prisma.user.findMany({ where: { tenantId: t, role: 'TENANT_USER' }, select: { fullName: true, unvan: true } }),
  ]);
  const m = new Map<string, any>();
  const ensure = (ad: string) => { if (!m.has(ad)) m.set(ad, { satici: ad, unvan: '', satis: 0, iptal: 0, iade: 0, yanlisBeden: 0, sikayet: 0, olumlu: 0, kayitlar: [] as any[] }); return m.get(ad); };
  for (const u of staff) { const s = ensure(u.fullName); s.unvan = u.unvan || 'Personel'; }
  for (const lo of los) { const ad = lo.saticiAd || 'Atanmamış'; const s = ensure(ad); if (lo.durum === 'iptal') s.iptal += 1; else if (lo.durum === 'onaylandi' || lo.durum === 'teslim') s.satis += 1; }
  for (const k of kayitlar) { const s = ensure(k.satici); if (k.tip === 'iade') s.iade += 1; else if (k.tip === 'yanlis_beden') s.yanlisBeden += 1; else if (k.tip === 'sikayet') s.sikayet += 1; else if (k.tip === 'olumlu') s.olumlu += 1; s.kayitlar.push(k); }
  const list = [...m.values()].map((s) => {
    const toplamIslem = s.satis + s.iptal;
    const iptalOrani = toplamIslem ? (s.iptal / toplamIslem) * 100 : 0;
    let puan = 100 - Math.round(iptalOrani * 0.5) - s.iade * 6 - s.yanlisBeden * 5 - s.sikayet * 8 + s.olumlu * 3;
    puan = Math.max(0, Math.min(100, puan));
    return { ...s, iptalOrani: Math.round(iptalOrani), puan };
  }).sort((a, b) => b.puan - a.puan);
  res.json(list);
}));
router.post('/sicil', asyncHandler(async (req: Request, res: Response) => {
  const { satici, tip, aciklama, orderRef } = req.body || {};
  if (!satici || !tip) throw new ApiError(422, 'Satıcı ve tip zorunlu');
  const k = await prisma.sicilKaydi.create({ data: { tenantId: req.tenantId!, satici: String(satici), tip: String(tip), aciklama: aciklama || null, orderRef: orderRef || null } });
  res.status(201).json(k);
}));
router.delete('/sicil/:id', asyncHandler(async (req: Request, res: Response) => {
  const f = await prisma.sicilKaydi.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!f) throw new ApiError(404, 'Kayıt bulunamadı');
  await prisma.sicilKaydi.delete({ where: { id: f.id } });
  res.json({ ok: true });
}));

// ───────── Satıcı Performansı (canlı yayın satıcıları) ─────────
router.get('/seller-performance', asyncHandler(async (req: Request, res: Response) => {
  const los = await prisma.liveOrder.findMany({ where: { tenantId: req.tenantId! }, select: { saticiAd: true, durum: true, tutar: true, alis: true, urun: true, createdAt: true } });
  const m = new Map<string, any>();
  for (const lo of los) {
    const ad = lo.saticiAd || 'Atanmamış';
    const s = m.get(ad) || { satici: ad, ciro: 0, kar: 0, adet: 0, iptal: 0, sonSatis: '' };
    if (lo.durum === 'iptal') { s.iptal += 1; }
    else if (lo.durum === 'onaylandi' || lo.durum === 'teslim') { s.ciro += lo.tutar || 0; s.kar += (lo.tutar || 0) - (lo.alis || 0); s.adet += 1; }
    if (!s.sonSatis || (lo.createdAt && lo.createdAt > s.sonSatis)) s.sonSatis = lo.createdAt;
    m.set(ad, s);
  }
  const list = [...m.values()].sort((a, b) => b.ciro - a.ciro).map((s) => ({ ...s, prim: Math.round(s.kar * 0.05), iptalOrani: (s.adet + s.iptal) ? Math.round((s.iptal / (s.adet + s.iptal)) * 100) : 0 }));
  res.json(list);
}));

router.post('/canli-order/:id/iptal', asyncHandler(async (req: Request, res: Response) => {
  await prisma.$transaction(async (tx) => {
    const o = await tx.storeOrder.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!o) return;
    const items: any[] = Array.isArray(o.items) ? (o.items as any) : [];
    // Sahip olunan + drop (freeProduct) stoklarını iade et ve bağlı canlı yayın satırlarını iptal et
    await returnStock(tx, req.tenantId!, items);
    await tx.storeOrder.delete({ where: { id: o.id } });
  });
  res.json({ ok: true });
}));

// ───────── Magaza Ayarlari ─────────
router.put('/settings', asyncHandler(async (req: Request, res: Response) => {
  const b = clean(req.body);
  const saved = await prisma.storeSetting.upsert({
    where: { tenantId: req.tenantId! },
    update: b,
    create: { ...b, tenantId: req.tenantId! },
  });
  res.json(saved);
}));

// ───────── Instagram Otomatik Yanit ayarlari (IgOtoAyar upsert) ─────────
router.get('/ig-oto-settings', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  let ayar = await prisma.igOtoAyar.findUnique({ where: { tenantId: t } });
  if (!ayar) ayar = await prisma.igOtoAyar.create({ data: { tenantId: t } });
  const ss = await prisma.storeSetting.findUnique({
    where: { tenantId: t },
    select: { igTokenSaved: true, igUserIdSaved: true, igWebhookVerifyToken: true },
  });
  res.json({
    ayar,
    baglanti: { hasToken: !!ss?.igTokenSaved, hasUserId: !!ss?.igUserIdSaved, igUserId: ss?.igUserIdSaved || null },
    webhookVerifyToken: ss?.igWebhookVerifyToken || null,
  });
}));

router.put('/ig-oto-settings', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const { aktif, karsilamaAktif, karsilamaMetni, calismaSaatDisiAktif, calismaSaatDisiMetni, calismaBasSaat, calismaBitSaat } = req.body || {};
  const data: any = {};
  if (aktif !== undefined) data.aktif = Boolean(aktif);
  if (karsilamaAktif !== undefined) data.karsilamaAktif = Boolean(karsilamaAktif);
  if (karsilamaMetni !== undefined) data.karsilamaMetni = karsilamaMetni || null;
  if (calismaSaatDisiAktif !== undefined) data.calismaSaatDisiAktif = Boolean(calismaSaatDisiAktif);
  if (calismaSaatDisiMetni !== undefined) data.calismaSaatDisiMetni = calismaSaatDisiMetni || null;
  if (calismaBasSaat !== undefined) data.calismaBasSaat = calismaBasSaat || null;
  if (calismaBitSaat !== undefined) data.calismaBitSaat = calismaBitSaat || null;
  const ayar = await prisma.igOtoAyar.upsert({
    where: { tenantId: t },
    update: data,
    create: { tenantId: t, ...data },
  });
  res.json({ ok: true, ayar });
}));

// Instagram webhook dogrulama token'i uret/kaydet (Meta App panelinde kullanilir)
router.post('/ig-oto-settings/verify-token', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const token = crypto.randomBytes(18).toString('hex');
  await prisma.storeSetting.upsert({
    where: { tenantId: t },
    update: { igWebhookVerifyToken: token },
    create: { tenantId: t, igWebhookVerifyToken: token },
  });
  res.json({ ok: true, webhookVerifyToken: token });
}));

// ───────── Ödeme Yönlendirme & POS ayarları ─────────
router.get('/payment-routing', asyncHandler(async (req: Request, res: Response) => {
  const s = await prisma.integrationSetting.findFirst({ where: { tenantId: req.tenantId!, category: 'PAYMENT', provider: 'kasa-routing' } });
  res.json((s?.config as any) || {});
}));
router.put('/payment-routing', asyncHandler(async (req: Request, res: Response) => {
  const cfg = req.body || {};
  await prisma.integrationSetting.upsert({
    where: { scope_tenantId_provider: { scope: 'TENANT', tenantId: req.tenantId!, provider: 'kasa-routing' } },
    update: { config: cfg, category: 'PAYMENT', enabled: true },
    create: { scope: 'TENANT', tenantId: req.tenantId!, category: 'PAYMENT', provider: 'kasa-routing', enabled: true, config: cfg },
  });
  res.json({ ok: true });
}));

// ───────── Barkod kataloğu ─────────
router.post('/catalog/add', asyncHandler(async (req: Request, res: Response) => {
  const { productId, flashFiyat, flashBitis } = req.body || {};
  if (!productId) { res.json({ ok: false }); return; }
  const data: any = { updatedAt: new Date() };
  if (flashFiyat !== undefined) data.flashFiyat = flashFiyat ? Number(flashFiyat) : null;
  if (flashBitis !== undefined) data.flashBitis = flashBitis ? new Date(flashBitis) : null;
  await prisma.catalogItem.upsert({
    where: { tenantId_productId: { tenantId: req.tenantId!, productId } },
    update: data,
    create: { tenantId: req.tenantId!, productId, flashFiyat: data.flashFiyat ?? null, flashBitis: data.flashBitis ?? null },
  }).catch(() => null);
  res.json({ ok: true });
}));
router.get('/catalog', asyncHandler(async (req: Request, res: Response) => {
  const items = await prisma.catalogItem.findMany({ where: { tenantId: req.tenantId! }, orderBy: { updatedAt: 'desc' } });
  res.json(items);
}));
router.delete('/catalog/:id', asyncHandler(async (req: Request, res: Response) => {
  await prisma.catalogItem.deleteMany({ where: { id: req.params.id, tenantId: req.tenantId! } });
  res.json({ ok: true });
}));

// ───────── PayTR (Sanal POS) yapılandırması ─────────
router.get('/paytr', asyncHandler(async (req: Request, res: Response) => {
  const s = await prisma.integrationSetting.findFirst({ where: { tenantId: req.tenantId!, provider: 'paytr' } });
  const c: any = s?.config || {};
  res.json({ merchant_id: c.merchant_id || '', merchant_key: c.merchant_key || '', merchant_salt: c.merchant_salt || '', mode: s?.mode || 'TEST', enabled: s?.enabled ?? false });
}));
router.put('/paytr', asyncHandler(async (req: Request, res: Response) => {
  const { merchant_id, merchant_key, merchant_salt, mode, enabled } = req.body || {};
  const config = { merchant_id: String(merchant_id || '').trim(), merchant_key: String(merchant_key || '').trim(), merchant_salt: String(merchant_salt || '').trim() };
  await prisma.integrationSetting.upsert({
    where: { scope_tenantId_provider: { scope: 'TENANT', tenantId: req.tenantId!, provider: 'paytr' } },
    update: { config, mode: mode === 'LIVE' ? 'LIVE' : 'TEST', enabled: !!enabled, category: 'PAYMENT' },
    create: { scope: 'TENANT', tenantId: req.tenantId!, provider: 'paytr', category: 'PAYMENT', config, mode: mode === 'LIVE' ? 'LIVE' : 'TEST', enabled: !!enabled },
  });
  res.json({ ok: true });
}));

// Ürün görselini profesyonel stüdyo çekimine dönüştür (Seedream 4.5 / fal.ai)
router.post('/enhance-image', asyncHandler(async (req: Request, res: Response) => {
  const { image, prompt } = req.body || {};
  if (!image || typeof image !== 'string') throw new ApiError(422, 'Görsel gerekli');
  const out = await enhanceProductImage(image, typeof prompt === 'string' ? prompt : undefined);
  res.json({ image: out.image });
}));

// ═══════════ Excel ile Ödeme İşleme (Bank Import) ═══════════

// POST /bank-import — Excel satırlarını import et, otomatik eşleştir
router.post('/bank-import', asyncHandler(async (req: Request, res: Response) => {
  const rows: any[] = req.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) throw new ApiError(422, 'Satır verisi gerekli (rows dizisi)');
  const tenantId = req.tenantId!;
  const sipNoRegex = /L[A-Z0-9]{6}/gi;
  let imported = 0, matched = 0, skippedDuplicates = 0;
  const results: any[] = [];

  for (const row of rows) {
    const refNo = String(row.refNo || '').trim();
    if (!refNo) continue;
    const tarih = String(row.tarih || '').trim();
    const saat = row.saat ? String(row.saat).trim() : null;
    const tutar = Math.abs(Number(row.tutar) || 0);
    const aciklama = String(row.aciklama || '').trim();
    if (!tutar || !aciklama) continue;

    // Mükerrer kontrol
    const exists = await prisma.bankImportRow.findUnique({ where: { tenantId_refNo: { tenantId, refNo } } });
    if (exists) { skippedDuplicates++; results.push({ refNo, status: 'duplicate', id: exists.id }); continue; }

    // Kaydet
    let orderId: string | null = null;
    let orderSipNo: string | null = null;
    let processedAt: Date | null = null;

    // Açıklamada sipNo ara
    const sipMatches = aciklama.match(sipNoRegex);
    if (sipMatches) {
      for (const candidate of sipMatches) {
        const upper = candidate.toUpperCase();
        const order = await prisma.storeOrder.findFirst({ where: { tenantId, sipNo: upper, durum: 'sepet' } });
        if (order) { orderId = order.id; orderSipNo = upper; break; }
      }
    }

    const created = await prisma.bankImportRow.create({
      data: { tenantId, tarih, saat, tutar, aciklama, refNo, orderId: null, orderSipNo: null, suggestedOrderId: orderId, suggestedSipNo: orderSipNo, processedAt: null }
    });
    imported++;

    // Otomatik işleme yapma — sadece eşleşme bilgisini dön, kullanıcı onayı ile işlenecek
    if (orderId) {
      matched++;
      results.push({ refNo, status: 'pending_match', id: created.id, orderId, orderSipNo });
    } else {
      results.push({ refNo, status: 'free', id: created.id });
    }
  }

  // Import sonrası mevcut serbest kayıtları da yeniden tara (eski regex ile eşleşmemiş olanlar)
  const freeRows = await prisma.bankImportRow.findMany({ where: { tenantId, orderId: null, suggestedOrderId: null } });
  let reMatched = 0;
  for (const fr of freeRows) {
    const sipM = fr.aciklama.match(sipNoRegex);
    if (!sipM) continue;
    for (const cand of sipM) {
      const up = cand.toUpperCase();
      const ord = await prisma.storeOrder.findFirst({ where: { tenantId, sipNo: up, durum: 'sepet' } });
      if (ord) { await prisma.bankImportRow.update({ where: { id: fr.id }, data: { suggestedOrderId: ord.id, suggestedSipNo: up } }); reMatched++; break; }
    }
  }
  if (reMatched > 0) matched += reMatched;

  res.json({ ok: true, imported, matched, skippedDuplicates, results });
}));

// Banka ödemesini siparişe işle (odemeGecmisi + tahsilat + creditIncome)
async function applyBankPayment(tenantId: string, orderId: string, importRowId: string, tutar: number, refNo: string, tarih: string, userId: string | null) {
  const order = await prisma.storeOrder.findUnique({ where: { id: orderId } });
  if (!order) return;
  if (order.durum === 'iptal') throw new ApiError(409, 'Bu sepet iptal edilmiştir; ödeme işlenemez.');
  const gecmis: any[] = Array.isArray(order.odemeGecmisi) ? (order.odemeGecmisi as any[]) : [];
  // Mükerrer ödeme koruması: aynı refNo veya aynı importRowId zaten işlenmişse tekrar ekleme
  if (gecmis.some((r) => (refNo && r.refNo === refNo) || r.id === importRowId)) return;
  const yeniOdeme = { id: importRowId, tutar, yontem: 'Banka Havale (Excel)', tarih, refNo };
  const yeniGecmis = [...gecmis, yeniOdeme];
  const yeniTahsilat = yeniGecmis.reduce((s, r) => s + (Number(r.tutar) || 0), 0);
  const gelirDelta = yeniTahsilat - (order.gelirKaydedilen || 0);
  const updateData: any = { odemeGecmisi: yeniGecmis, tahsilat: yeniTahsilat };
  if (gelirDelta > 0) updateData.gelirKaydedilen = yeniTahsilat;
  // Ödeme bildirimi varsa otomatik kaldır
  if ((order as any).odemeBildirim) updateData.odemeBildirim = null;
  await prisma.storeOrder.update({ where: { id: orderId }, data: updateData });
  if (gelirDelta > 0) {
    await creditIncome(prisma, tenantId, { tutar: gelirDelta, kanal: 'banka', odemeYontemi: 'Banka Havale', aciklama: `Banka ödemesi (Excel) #${order.sipNo || orderId.slice(-5)} ref:${refNo}`, kategori: 'Sipariş Geliri', createdBy: userId });
  }
  await logEvent(tenantId, orderId, userId || 'Sistem', 'Banka ödemesi işlendi (Excel)', `${tutar.toLocaleString('tr-TR')}₺ ref:${refNo}`);
  await notifyPaymentApproved(tenantId, order, tutar);
}

// Ödeme işlendiğinde "ödemeniz onaylandı" WhatsApp bildirimi — müşteriyi customerId VEYA musteriHandle (instagram/telefon) ile çözer
async function notifyPaymentApproved(tenantId: string, order: any, alinanTutar: number) {
  try {
    if (!(Number(alinanTutar) > 0) || !order) return;
    let phone: string | null = null;
    let ad: string | null = null;
    if (order.customerId) {
      const c = await prisma.customer.findFirst({ where: { id: order.customerId, tenantId }, select: { telefon: true, ad: true } });
      if (c) { phone = c.telefon; ad = c.ad; }
    }
    if (!phone && order.musteriHandle) {
      const h = String(order.musteriHandle).replace(/^@/, '').trim();
      if (h) {
        const c = await prisma.customer.findFirst({ where: { tenantId, OR: [{ instagram: h }, { instagram: '@' + h }, { telefon: h }] }, select: { telefon: true, ad: true } });
        if (c) { phone = c.telefon; ad = c.ad; }
      }
    }
    if (!phone) phone = order.telefon || order.musteriTelefon || null;
    if (!phone) return;
    await enqueueStatusNotification(tenantId, { phone, ad: ad || order.musteriHandle || '', kind: 'odemeonay', payload: { tutar: Number(alinanTutar) } });
  } catch { /* bildirim hatasi odeme akisini etkilemez */ }
}

// POST /orders/:id/pay-with-balance — Müşteri bakiyesinden tahsilat (kısmi ödeme)
router.post('/orders/:id/pay-with-balance', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const who = await actorName(req.auth?.userId);
  const order = await prisma.storeOrder.findFirst({ where: { id: req.params.id, tenantId, durum: { notIn: ['iptal'] } } });
  if (!order) throw new ApiError(404, 'Sipariş bulunamadı veya iptal edilmiş');
  let cust = order.customerId ? await prisma.customer.findFirst({ where: { id: order.customerId, tenantId } }) : null;
  if (!cust && order.musteriHandle) {
    const h = String(order.musteriHandle).replace(/^@/, '').trim();
    if (h) cust = await prisma.customer.findFirst({ where: { tenantId, OR: [{ instagram: h }, { instagram: '@' + h }, { telefon: h }] } });
  }
  if (!cust) throw new ApiError(422, 'Bu siparişte bakiyesi kullanılabilir müşteri bulunamadı');
  const bakiye = Number(cust.bakiye) || 0;
  if (bakiye <= 0) throw new ApiError(422, 'Müşterinin kullanılabilir bakiyesi yok');
  const kalan = (Number(order.toplam) || 0) - (Number(order.tahsilat) || 0);
  if (kalan <= 0.005) throw new ApiError(422, 'Bu sepette ödenecek kalan tutar yok');
  const istenen = Number(req.body?.tutar);
  let uygula = istenen > 0 ? Math.min(istenen, bakiye, kalan) : Math.min(bakiye, kalan);
  uygula = Math.round(uygula * 100) / 100;
  if (uygula <= 0) throw new ApiError(422, 'Geçerli tutar yok');

  const result = await prisma.$transaction(async (tx) => {
    const yeniBakiye = Math.round((bakiye - uygula) * 100) / 100;
    await tx.customer.update({ where: { id: cust.id }, data: { bakiye: yeniBakiye } });
    await tx.customerLedger.create({ data: { tenantId, customerId: cust.id, tip: 'harcama', tutar: uygula, aciklama: `Sepet ödemesi #${order.sipNo || order.id.slice(-5)}`, refId: order.id, kullanici: await actorName(req.auth?.userId) } });
    const gecmis: any[] = Array.isArray(order.odemeGecmisi) ? (order.odemeGecmisi as any[]) : [];
    const yeniGecmis = [...gecmis, { id: 'bal_' + Date.now().toString(36), tutar: uygula, yontem: 'Müşteri Bakiyesi', tarih: new Date().toISOString() }];
    const yeniTahsilat = yeniGecmis.reduce((s, r) => s + (Number(r.tutar) || 0), 0);
    const gelirDelta = yeniTahsilat - (Number(order.gelirKaydedilen) || 0);
    const updateData: any = { odemeGecmisi: yeniGecmis, tahsilat: yeniTahsilat };
    if (gelirDelta > 0) updateData.gelirKaydedilen = yeniTahsilat;
    if ((order as any).odemeBildirim) updateData.odemeBildirim = null;
    const updated = await tx.storeOrder.update({ where: { id: order.id }, data: updateData });
    if (gelirDelta > 0) {
      await creditIncome(tx, tenantId, { tutar: gelirDelta, kanal: 'bakiye', odemeYontemi: 'Müşteri Bakiyesi', aciklama: `Bakiye ödemesi #${order.sipNo || order.id.slice(-5)}`, kategori: 'Sipariş Geliri', createdBy: req.auth?.userId || null });
    }
    return { updated, yeniBakiye };
  });
  await logEvent(tenantId, order.id, who, 'Müşteri bakiyesinden tahsilat', `${uygula.toLocaleString('tr-TR')}₺ işlendi`);
  await notifyPaymentApproved(tenantId, order, uygula);
  res.json({ order: result.updated, bakiye: result.yeniBakiye, uygulanan: uygula });
}));

// GET /bank-imports — Listeleme (filtre + sayfalama + tarih)
router.get('/bank-imports', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { status, q, page, basTarih, bitTarih, sortDir } = req.query as any;
  const where: any = { tenantId };
  // Silinmiş kayıtlar yalnız 'silinmis' sekmesinde (ve yalnız patron) görünür; diğer tüm sekmelerde gizli.
  if (status === 'silinmis') {
    if ((req.auth as any)?.role !== 'TENANT_OWNER') { res.json({ ok: true, rows: [], total: 0, page: 1, pages: 0 }); return; }
    where.deletedAt = { not: null };
  } else {
    where.deletedAt = null;
  }
  if (status === 'matched') where.orderId = { not: null };
  else if (status === 'recent') { where.orderId = { not: null }; where.processedAt = { not: null }; }
  else if (status === 'free') { where.orderId = null; where.suggestedOrderId = null; }
  else if (status === 'pending') { where.orderId = null; where.suggestedOrderId = { not: null }; }
  if (q) where.OR = [{ aciklama: { contains: q, mode: 'insensitive' } }, { refNo: { contains: q, mode: 'insensitive' } }, { orderSipNo: { contains: q, mode: 'insensitive' } }, { suggestedSipNo: { contains: q, mode: 'insensitive' } }];
  // Tarih filtresi — tarih DB'de "dd/mm/yyyy" string olarak saklanıyor, karşılaştırma LIKE ile yapılır
  // YYYY-MM-DD → dd/mm/yyyy formatına çeviriyoruz
  if (basTarih || bitTarih) {
    // Tüm kayıtları tarih aralığına göre filtreleyeceğiz — prisma string compare çalışmaz
    // Bunun yerine createdAt kullanacağız
    if (basTarih) { where.createdAt = { ...(where.createdAt || {}), gte: new Date(basTarih + 'T00:00:00Z') }; }
    if (bitTarih) { where.createdAt = { ...(where.createdAt || {}), lte: new Date(bitTarih + 'T23:59:59Z') }; }
  }
  const take = 100;
  const skip = Math.max(0, (Number(page) || 1) - 1) * take;
  const dir = sortDir === 'asc' ? 'asc' : 'desc';
  const orderBy: any = status === 'recent' ? [{ processedAt: 'desc' }] : [{ tarih: dir }, { createdAt: dir }];
  const [rows, total] = await Promise.all([
    prisma.bankImportRow.findMany({ where, orderBy, take, skip }),
    prisma.bankImportRow.count({ where })
  ]);
  res.json({ ok: true, rows, total, page: Number(page) || 1, pages: Math.ceil(total / take) });
}));

// POST /bank-imports/:id/match — Manuel eşleştirme
router.post('/bank-imports/:id/match', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const row = await prisma.bankImportRow.findFirst({ where: { id: req.params.id, tenantId } });
  if (!row) throw new ApiError(404, 'Import satırı bulunamadı');
  if (row.orderId) throw new ApiError(422, 'Bu ödeme zaten bir sepete eşleştirilmiş. Önce serbest bırakın.');
  const { orderId } = req.body;
  if (!orderId) throw new ApiError(422, 'orderId gerekli');
  const order = await prisma.storeOrder.findFirst({ where: { id: orderId, tenantId, durum: { notIn: ['iptal'] } } });
  if (!order) throw new ApiError(404, 'Sipariş bulunamadı veya iptal edilmiş');
  if (order.durum !== 'sepet') throw new ApiError(422, 'Bu sepet açık sepet durumunda değil; ödeme işlenemez.');
  // Dekont tarihi sepet oluşturma tarihinden önce ise eşleştirme yapma
  const dm = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(row.tarih || '').trim());
  if (dm) {
    const dekontT = new Date(Number(dm[3]), Number(dm[2]) - 1, Number(dm[1]), 23, 59, 59);
    const sepetT = new Date(order.createdAt); sepetT.setHours(0, 0, 0, 0);
    if (dekontT < sepetT) throw new ApiError(422, 'Dekont tarihi sepet tarihinden önce; bu ödeme bu sepete eşleştirilemez.');
  }
  await prisma.bankImportRow.update({ where: { id: row.id }, data: { orderId, orderSipNo: order.sipNo || null, processedAt: new Date() } });
  await applyBankPayment(tenantId, orderId, row.id, row.tutar, row.refNo, row.tarih, req.auth?.userId || null);
  res.json({ ok: true });
}));

// POST /bank-imports/:id/release — Serbest bırak (ödemeyi sepetten çıkar) — yalnızca yönetici
router.post('/bank-imports/:id/release', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  if ((req.auth as any)?.role !== 'TENANT_OWNER') throw new ApiError(403, 'Excel ile işlenmiş ödemeyi yalnızca yönetici silebilir.');
  const row = await prisma.bankImportRow.findFirst({ where: { id: req.params.id, tenantId } });
  if (!row) throw new ApiError(404, 'Import satırı bulunamadı');
  if (!row.orderId) { res.json({ ok: true, message: 'Zaten serbest' }); return; }
  // Siparişten ödemeyi çıkar
  const order = await prisma.storeOrder.findUnique({ where: { id: row.orderId } });
  if (order) {
    const gecmis: any[] = Array.isArray(order.odemeGecmisi) ? (order.odemeGecmisi as any[]) : [];
    const yeniGecmis = gecmis.filter((r) => r.id !== row.id && r.refNo !== row.refNo);
    const yeniTahsilat = yeniGecmis.reduce((s, r) => s + (Number(r.tutar) || 0), 0);
    const updateData: any = { odemeGecmisi: yeniGecmis.length > 0 ? yeniGecmis : [], tahsilat: yeniTahsilat, gelirKaydedilen: yeniTahsilat };
    await prisma.storeOrder.update({ where: { id: order.id }, data: updateData });
    // Ters hareket oluştur
    const now = new Date();
    await prisma.hareket.create({ data: { tenantId, tarih: now.toISOString().slice(0, 10), saat: now.toTimeString().slice(0, 5), aciklama: `İptal: Banka ödemesi geri alındı #${order.sipNo || order.id.slice(-5)} ref:${row.refNo}`, tutar: row.tutar, tip: 'gider', kategori: 'İade / İptal', createdBy: req.auth?.userId || null } }).catch(() => null);
    await logEvent(tenantId, order.id, req.auth?.userId || 'Sistem', 'Banka ödemesi geri alındı', `${row.tutar.toLocaleString('tr-TR')}₺ ref:${row.refNo}`);
  }
  await prisma.bankImportRow.update({ where: { id: row.id }, data: { orderId: null, orderSipNo: null, processedAt: null } });
  res.json({ ok: true });
}));

// DELETE /bank-imports/:id — Excel ödeme (para giriş/çıkış) satırını sil (soft-delete) — yalnızca PATRON
router.delete('/bank-imports/:id', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  if ((req.auth as any)?.role !== 'TENANT_OWNER') throw new ApiError(403, 'Excel ödeme kaydını yalnızca patron silebilir.');
  const row = await prisma.bankImportRow.findFirst({ where: { id: req.params.id, tenantId } });
  if (!row) throw new ApiError(404, 'Import satırı bulunamadı');
  // Bir sepete bağlıysa önce ödemeyi geri al (release mantığı)
  if (row.orderId && row.orderId !== '__processed__') {
    const order = await prisma.storeOrder.findUnique({ where: { id: row.orderId } });
    if (order) {
      const gecmis: any[] = Array.isArray(order.odemeGecmisi) ? (order.odemeGecmisi as any[]) : [];
      const yeniGecmis = gecmis.filter((r) => r.id !== row.id && r.refNo !== row.refNo);
      const yeniTahsilat = yeniGecmis.reduce((s, r) => s + (Number(r.tutar) || 0), 0);
      await prisma.storeOrder.update({ where: { id: order.id }, data: { odemeGecmisi: yeniGecmis, tahsilat: yeniTahsilat, gelirKaydedilen: yeniTahsilat } });
    }
  }
  const who = await actorName(req.auth?.userId);
  await prisma.bankImportRow.update({ where: { id: row.id }, data: { deletedAt: new Date(), deletedBy: who, orderId: null, orderSipNo: null, processedAt: null } });
  await logAudit(req, 'sil', 'excel-odeme', row.id, row.refNo, { neden: req.body?.neden || 'Excel ödeme satırı silindi', meta: { tutar: row.tutar } });
  res.json({ ok: true });
}));

// POST /bank-imports/bulk-delete — Çoklu soft-delete (yalnız patron)
router.post('/bank-imports/bulk-delete', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  if ((req.auth as any)?.role !== 'TENANT_OWNER') throw new ApiError(403, 'Kayıtları yalnızca patron silebilir.');
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) throw new ApiError(422, 'Silinecek kayıt seçilmedi');
  const rows = await prisma.bankImportRow.findMany({ where: { id: { in: ids }, tenantId, deletedAt: null } });
  const who = await actorName(req.auth?.userId);
  for (const row of rows) {
    if (row.orderId && row.orderId !== '__processed__') {
      const order = await prisma.storeOrder.findUnique({ where: { id: row.orderId } });
      if (order) {
        const gecmis: any[] = Array.isArray(order.odemeGecmisi) ? (order.odemeGecmisi as any[]) : [];
        const yeniGecmis = gecmis.filter((r) => r.id !== row.id && r.refNo !== row.refNo);
        const yeniTahsilat = yeniGecmis.reduce((s, r) => s + (Number(r.tutar) || 0), 0);
        await prisma.storeOrder.update({ where: { id: order.id }, data: { odemeGecmisi: yeniGecmis, tahsilat: yeniTahsilat, gelirKaydedilen: yeniTahsilat } });
      }
    }
    await prisma.bankImportRow.update({ where: { id: row.id }, data: { deletedAt: new Date(), deletedBy: who, orderId: null, orderSipNo: null, processedAt: null } });
  }
  await logAudit(req, 'sil', 'excel-odeme', null, `${rows.length} Excel ödeme kaydı toplu silindi`, { meta: { adet: rows.length } });
  res.json({ ok: true, deleted: rows.length });
}));

// POST /bank-imports/:id/mark-processed — Zaten işlenmiş olarak işaretle (sepete bağlamadan)
router.post('/bank-imports/:id/mark-processed', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const row = await prisma.bankImportRow.findFirst({ where: { id: req.params.id, tenantId } });
  if (!row) throw new ApiError(404, 'Import satırı bulunamadı');
  if (row.orderId) throw new ApiError(400, 'Bu ödeme zaten bir sepete işlenmiş');
  await prisma.bankImportRow.update({ where: { id: row.id }, data: { orderId: '__processed__', orderSipNo: 'Zaten İşlenmiş', suggestedOrderId: null, suggestedSipNo: null } });
  res.json({ ok: true });
}));

// POST /bank-imports/re-match — Eşleşmemiş tüm kayıtları yeniden tara (sipNo formatı değişince)
router.post('/bank-imports/re-match', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const sipNoRegex = /L[A-Z0-9]{6}/gi;
  const freeRows = await prisma.bankImportRow.findMany({ where: { tenantId, orderId: null, suggestedOrderId: null } });
  let updated = 0;
  for (const row of freeRows) {
    const sipMatches = row.aciklama.match(sipNoRegex);
    if (!sipMatches) continue;
    for (const candidate of sipMatches) {
      const upper = candidate.toUpperCase();
      const order = await prisma.storeOrder.findFirst({ where: { tenantId, sipNo: upper, durum: { notIn: ['iptal', 'tamamlandi'] } } });
      if (order) {
        await prisma.bankImportRow.update({ where: { id: row.id }, data: { suggestedOrderId: order.id, suggestedSipNo: upper } });
        updated++;
        break;
      }
    }
  }
  res.json({ ok: true, updated, total: freeRows.length });
}));

// GET /orders/:id/available-bank-imports — Sepet detayından serbest ödemeleri listele
router.get('/orders/:id/available-bank-imports', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { q } = req.query as any;
  const where: any = { tenantId, orderId: null, deletedAt: null };
  if (q) where.OR = [{ aciklama: { contains: q, mode: 'insensitive' } }, { refNo: { contains: q, mode: 'insensitive' } }];
  const rows = await prisma.bankImportRow.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ ok: true, rows });
}));

// ═══════════ Özel Katalog Yönetimi ═══════════

router.get('/catalogs', asyncHandler(async (req: Request, res: Response) => {
  const rows = await prisma.customCatalog.findMany({ where: { tenantId: req.tenantId! }, orderBy: { updatedAt: 'desc' } });
  res.json({ ok: true, rows });
}));

// Katalog istatistikleri (tüm katalogların özet stats'ları)
router.get('/catalogs/stats', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const catalogs = await prisma.customCatalog.findMany({ where: { tenantId }, select: { id: true, productIds: true } });
  const catIds = catalogs.map((c) => c.id);
  if (!catIds.length) { res.json({ ok: true, stats: {} }); return; }

  // Ürün stok/maliyet bilgileri topla
  const allPids = new Set<string>();
  catalogs.forEach((c) => ((c.productIds as string[]) || []).forEach((pid) => allPids.add(pid)));
  const prodMap = new Map<string, any>();
  if (allPids.size) {
    const prods = await prisma.product.findMany({
      where: { id: { in: Array.from(allPids) } },
      select: { id: true, stokAdeti: true, alisFiyat: true, satisFiyat: true, aktif: true,
        variations: { select: { stok: true, ekFiyat: true } } },
    });
    prods.forEach((p) => prodMap.set(p.id, p));
  }

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d60 = new Date(now.getTime() - 60 * 86400000);

  const [views30, views60, viewsAll] = await Promise.all([
    prisma.catalogView.groupBy({ by: ['catalogId'], where: { tenantId, catalogId: { in: catIds }, createdAt: { gte: d30 } }, _count: true }),
    prisma.catalogView.groupBy({ by: ['catalogId'], where: { tenantId, catalogId: { in: catIds }, createdAt: { gte: d60, lt: d30 } }, _count: true }),
    prisma.catalogView.groupBy({ by: ['catalogId'], where: { tenantId, catalogId: { in: catIds } }, _count: true }),
  ]);

  // Tüm talepler (durum bilgisiyle)
  const reqsAll = await prisma.catalogRequest.findMany({
    where: { tenantId, catalogId: { in: catIds } },
    select: { catalogId: true, toplam: true, indirim: true, durum: true, createdAt: true },
  });

  const stats: Record<string, any> = {};
  for (const cat of catalogs) {
    const cid = cat.id;
    const pids: string[] = (cat.productIds as string[]) || [];
    const v30 = views30.find((v) => v.catalogId === cid)?._count || 0;
    const vPrev = views60.find((v) => v.catalogId === cid)?._count || 0;
    const vAll = viewsAll.find((v) => v.catalogId === cid)?._count || 0;

    const catReqs = reqsAll.filter((r) => r.catalogId === cid);
    const basarili = catReqs.filter((r) => r.durum === 'onaylandi');
    const bekleyen = catReqs.filter((r) => r.durum === 'bekliyor');
    const iptal = catReqs.filter((r) => r.durum === 'iptal');
    const sum = (arr: typeof catReqs) => arr.reduce((s, r) => s + (r.toplam || 0), 0);

    // Son 30 gün
    const reqs30 = catReqs.filter((r) => new Date(r.createdAt).getTime() >= d30.getTime());
    const reqsPrev = catReqs.filter((r) => { const t = new Date(r.createdAt).getTime(); return t >= d60.getTime() && t < d30.getTime(); });

    // Stok analizi
    let urunSayisi = pids.length;
    let stokluUrun = 0;
    let toplamStok = 0;
    let toplamAlis = 0;
    let toplamSatis = 0;
    for (const pid of pids) {
      const p = prodMap.get(pid);
      if (!p || !p.aktif) continue;
      const vars = p.variations || [];
      let stok: number;
      let satisDeger: number;
      if (vars.length > 0) {
        stok = vars.reduce((s: number, v: any) => s + (v.stok || 0), 0);
        satisDeger = vars.reduce((s: number, v: any) => s + ((p.satisFiyat || 0) + (v.ekFiyat || 0)) * (v.stok || 0), 0);
      } else {
        stok = p.stokAdeti || 0;
        satisDeger = (p.satisFiyat || 0) * stok;
      }
      if (stok <= 0) continue;
      stokluUrun++;
      toplamStok += stok;
      toplamAlis += (p.alisFiyat || 0) * stok;
      toplamSatis += satisDeger;
    }

    stats[cid] = {
      goruntulenme: vAll, goruntulenme30: v30, goruntulenme30Prev: vPrev,
      siparis: catReqs.length, siparis30: reqs30.length, siparis30Prev: reqsPrev.length,
      basariliSiparis: basarili.length, basariliCiro: sum(basarili),
      bekleyenSiparis: bekleyen.length, bekleyenCiro: sum(bekleyen),
      iptalSiparis: iptal.length, iptalCiro: sum(iptal),
      ciro: sum(basarili), ciro30: sum(reqs30.filter((r) => r.durum === 'onaylandi')),
      ciro30Prev: sum(reqsPrev.filter((r) => r.durum === 'onaylandi')),
      urunSayisi, stokluUrun, toplamStok, toplamAlis, toplamSatis,
    };
  }
  res.json({ ok: true, stats });
}));

// Katalog güncel stok maliyet/değer raporu — ürün bazlı (yalnız aktif & stok>0)
router.get('/catalogs/:id/stock-report', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const cat = await prisma.customCatalog.findFirst({ where: { id: req.params.id, tenantId }, select: { id: true, ad: true, slug: true, productIds: true } });
  if (!cat) throw new ApiError(404, 'Katalog bulunamadı');
  const pids: string[] = (cat.productIds as string[]) || [];
  const rows: any[] = [];
  const totals = { stokluUrun: 0, toplamStok: 0, toplamAlis: 0, toplamSatis: 0, kar: 0, marj: 0 };
  if (pids.length) {
    const prods = await prisma.product.findMany({
      where: { id: { in: pids }, tenantId, aktif: true },
      select: { id: true, ad: true, salesCode: true, sku: true, stokAdeti: true, alisFiyat: true, satisFiyat: true,
        variations: { select: { ad: true, deger: true, stok: true, ekFiyat: true } } },
    });
    const order = new Map(pids.map((id, i) => [id, i]));
    prods.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    for (const p of prods) {
      const vars = p.variations || [];
      let stok: number;
      let toplamSatis: number;
      let varRows: any[] = [];
      if (vars.length > 0) {
        stok = vars.reduce((s, v) => s + (v.stok || 0), 0);
        toplamSatis = vars.reduce((s, v) => s + ((p.satisFiyat || 0) + (v.ekFiyat || 0)) * (v.stok || 0), 0);
        varRows = vars
          .filter((v) => (v.stok || 0) > 0)
          .map((v) => ({ ad: v.ad, deger: v.deger, stok: v.stok || 0, ekFiyat: v.ekFiyat || 0, birimSatis: (p.satisFiyat || 0) + (v.ekFiyat || 0) }));
      } else {
        stok = p.stokAdeti || 0;
        toplamSatis = (p.satisFiyat || 0) * stok;
      }
      if (stok <= 0) continue;
      const toplamAlis = (p.alisFiyat || 0) * stok;
      const kar = toplamSatis - toplamAlis;
      const satisFiyatEfektif = stok > 0 ? toplamSatis / stok : (p.satisFiyat || 0);
      rows.push({
        id: p.id, ad: p.ad, kod: p.salesCode || p.sku || '', stok,
        alisFiyat: p.alisFiyat || 0, satisFiyatEfektif,
        toplamAlis, toplamSatis, kar, marj: toplamSatis > 0 ? (kar / toplamSatis) * 100 : 0,
        variations: varRows,
      });
      totals.stokluUrun++;
      totals.toplamStok += stok;
      totals.toplamAlis += toplamAlis;
      totals.toplamSatis += toplamSatis;
    }
  }
  totals.kar = totals.toplamSatis - totals.toplamAlis;
  totals.marj = totals.toplamSatis > 0 ? (totals.kar / totals.toplamSatis) * 100 : 0;
  res.json({ ok: true, catalog: { id: cat.id, ad: cat.ad, slug: cat.slug }, rows, totals });
}));

router.post('/catalogs', asyncHandler(async (req: Request, res: Response) => {
  const { ad, whatsapp, productIds, kampanyalar } = req.body || {};
  if (!ad) throw new ApiError(422, 'Katalog adı gerekli');
  const slug = genToken(12);
  const cat = await prisma.customCatalog.create({
    data: { tenantId: req.tenantId!, ad, slug, whatsapp: whatsapp || null, productIds: productIds || [], kampanyalar: kampanyalar || [] }
  });
  res.status(201).json({ ok: true, catalog: cat });
}));

router.put('/catalogs/:id', asyncHandler(async (req: Request, res: Response) => {
  const found = await prisma.customCatalog.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!found) throw new ApiError(404, 'Katalog bulunamadı');
  const { ad, aktif, whatsapp, productIds, kampanyalar } = req.body || {};
  const data: any = {};
  if (ad !== undefined) data.ad = ad;
  if (aktif !== undefined) data.aktif = !!aktif;
  if (whatsapp !== undefined) data.whatsapp = whatsapp || null;
  if (productIds !== undefined) data.productIds = productIds;
  if (kampanyalar !== undefined) data.kampanyalar = kampanyalar;
  const updated = await prisma.customCatalog.update({ where: { id: found.id }, data });
  res.json({ ok: true, catalog: updated });
}));

router.delete('/catalogs/:id', asyncHandler(async (req: Request, res: Response) => {
  await prisma.customCatalog.deleteMany({ where: { id: req.params.id, tenantId: req.tenantId! } });
  res.json({ ok: true });
}));

router.get('/catalog-requests', asyncHandler(async (req: Request, res: Response) => {
  const { catalogId, durum, search, from, to } = req.query as any;
  const where: any = { tenantId: req.tenantId! };
  if (catalogId) where.catalogId = catalogId;
  if (durum && durum !== 'all') where.durum = durum;
  if (search) where.OR = [
    { talepNo: { contains: search, mode: 'insensitive' } },
    { musteri: { contains: search, mode: 'insensitive' } },
  ];
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to + 'T23:59:59Z');
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 20);
  const [rows, total] = await Promise.all([
    prisma.catalogRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { customer: { select: { id: true, ad: true, instagram: true, telefon: true } } } } as any),
    prisma.catalogRequest.count({ where }),
  ]);
  // İstatistikler
  const allReqs = await prisma.catalogRequest.findMany({ where: { tenantId: req.tenantId! }, select: { durum: true, toplam: true, createdAt: true } });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayCount = allReqs.filter(r => new Date(r.createdAt) >= today).length;
  const stats = {
    toplam: allReqs.length,
    bugun: todayCount,
    beklemede: allReqs.filter(r => r.durum === 'beklemede').length,
    beklemedeTutar: allReqs.filter(r => r.durum === 'beklemede').reduce((s, r) => s + (r.toplam || 0), 0),
    rezervde: allReqs.filter(r => r.durum === 'rezervde').length,
    rezervdeTutar: allReqs.filter(r => r.durum === 'rezervde').reduce((s, r) => s + (r.toplam || 0), 0),
    odemeBekleyen: allReqs.filter(r => r.durum === 'odeme_bekliyor').length,
    odemeBekleyenTutar: allReqs.filter(r => r.durum === 'odeme_bekliyor').reduce((s, r) => s + (r.toplam || 0), 0),
    tamamlanan: allReqs.filter(r => r.durum === 'tamamlandi').length,
    tamamlananTutar: allReqs.filter(r => r.durum === 'tamamlandi').reduce((s, r) => s + (r.toplam || 0), 0),
    iptal: allReqs.filter(r => r.durum === 'iptal').length,
    iptalTutar: allReqs.filter(r => r.durum === 'iptal').reduce((s, r) => s + (r.toplam || 0), 0),
  };
  res.json({ ok: true, rows, total, page, limit, stats });
}));

router.patch('/catalog-requests/:id', asyncHandler(async (req: Request, res: Response) => {
  const found = await prisma.catalogRequest.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!found) throw new ApiError(404, 'Talep bulunamadı');
  const { durum, tahsilat, odemeYontemi, odemeNotu, tahsilatLinki } = req.body || {};
  const data: any = {};

  // Tahsilat linki (k.kartı tahsilat linki) — kalıcı olarak sepet detayında tutulur
  if (tahsilatLinki !== undefined) data.tahsilatLinki = tahsilatLinki ? String(tahsilatLinki).trim() : null;

  // Durum değişikliği
  if (durum) {
    if (!['beklemede', 'rezervde', 'odeme_bekliyor', 'tamamlandi', 'iptal'].includes(durum)) throw new ApiError(422, 'Geçersiz durum');
    data.durum = durum;
    if (durum === 'iptal') { data.iptalZamani = new Date(); data.iptalSebebi = 'manual'; }
    if (durum === 'iptal' && found.orderId) { import('../store/catalog.trigger').then(m => m.cancelLinkedOrder(found.orderId)).catch(() => null); }
    if (durum === 'tamamlandi' && !found.odemeTarihi) { data.odemeTarihi = new Date(); }
  }

  // Ödeme onayı
  if (tahsilat !== undefined) {
    const yeniTahsilat = Number(tahsilat) || 0;
    data.tahsilat = yeniTahsilat;
    if (odemeYontemi) data.odemeYontemi = odemeYontemi;
    if (odemeNotu !== undefined) data.odemeNotu = odemeNotu;

    // Otomatik tamamlandi durumuna geçir (toplam karşılandıysa)
    if (yeniTahsilat >= (found.toplam - (found.indirim || 0)) && !durum) {
      data.durum = 'tamamlandi';
      if (!found.odemeTarihi) data.odemeTarihi = new Date();
    }

    // Gelir kaydı farkı
    const kayitli = found.gelirKaydedilen || 0;
    const gelirDelta = yeniTahsilat > kayitli ? yeniTahsilat - kayitli : 0;
    if (gelirDelta > 0) {
      data.gelirKaydedilen = yeniTahsilat;
      await creditIncome(prisma, req.tenantId!, {
        tutar: gelirDelta,
        kanal: 'online',
        odemeYontemi: odemeYontemi || found.odemeYontemi || null,
        aciklama: `Katalog tahsilatı #${found.talepNo}${found.musteri ? ' - ' + found.musteri : ''}`,
        kategori: 'Katalog Satışı',
        createdBy: req.auth?.userId || null,
      }).catch(() => null);
    }
  }

  if (Object.keys(data).length === 0) throw new ApiError(422, 'Güncellenecek alan yok');
  const updated = await prisma.catalogRequest.update({ where: { id: found.id }, data });

  // Ödeme onayı WhatsApp bildirimi
  if ((data.durum === 'tamamlandi' || (tahsilat !== undefined && Number(tahsilat) > 0)) && found.telefon) {
    import('../store/catalog.cron').then(m => m.sendCatalogPaymentConfirmation(req.tenantId!, found.talepNo, found.telefon!, found.musteri || '', Number(tahsilat) || updated.tahsilat || 0)).catch(() => null);
  }

  res.json({ ok: true, request: updated });
}));

// Sayaç durdur/başlat (kredi kartı vs. manual kontrol)
router.patch('/catalog-requests/:id/timer', asyncHandler(async (req: Request, res: Response) => {
  const found = await prisma.catalogRequest.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!found) throw new ApiError(404, 'Talep bulunamadı');
  const { action, dakika } = req.body || {};
  const data: any = {};
  if (action === 'stop') {
    data.kartOdeme = true;
    data.rezervBitis = null;
  } else if (action === 'start') {
    const dk = Number(dakika) || 30;
    data.kartOdeme = false;
    data.rezervBitis = new Date(Date.now() + dk * 60000);
  } else {
    throw new ApiError(422, 'Geçersiz action: stop veya start');
  }
  const updated = await prisma.catalogRequest.update({ where: { id: found.id }, data });
  res.json({ ok: true, request: updated });
}));

// Manuel sipariş oluştur (WP bekleniyor → doğrudan tetikle)
router.post('/catalog-requests/:id/manual-trigger', asyncHandler(async (req: Request, res: Response) => {
  const found = await prisma.catalogRequest.findFirst({ where: { id: req.params.id, tenantId: req.tenantId!, durum: 'beklemede' } });
  if (!found) throw new ApiError(404, 'Beklemede olan talep bulunamadı');

  // catalogOrderTrigger ile aynı işlemi yap
  const { catalogOrderTrigger } = await import('./catalog.trigger');
  const updated = await catalogOrderTrigger(req.tenantId!, found.talepNo, found.telefon || '', 'manual');
  if (!updated) throw new ApiError(400, 'Sipariş tetiklenemedi');
  res.json({ ok: true, request: updated });
}));

// Katalog ayarları
router.get('/catalog-settings', asyncHandler(async (req: Request, res: Response) => {
  let settings = await prisma.catalogSetting.findUnique({ where: { tenantId: req.tenantId! } });
  if (!settings) {
    settings = await prisma.catalogSetting.create({ data: { tenantId: req.tenantId! } });
  }
  res.json({ ok: true, settings });
}));

router.put('/catalog-settings', asyncHandler(async (req: Request, res: Response) => {
  const { rezervSureDk, otomatikIptal, bildirimAktif, hatirlatmaDk, siparisOnayMesaji, dekontHatirlatmaDk, dekontIsteMesaji, kartOdemeMesaji, dekontAlindiMesaji, iptalMesaji, odemeOnayMesaji } = req.body || {};
  const settings = await prisma.catalogSetting.upsert({
    where: { tenantId: req.tenantId! },
    update: {
      ...(rezervSureDk !== undefined && { rezervSureDk: Number(rezervSureDk) }),
      ...(otomatikIptal !== undefined && { otomatikIptal: Boolean(otomatikIptal) }),
      ...(bildirimAktif !== undefined && { bildirimAktif: Boolean(bildirimAktif) }),
      ...(hatirlatmaDk !== undefined && { hatirlatmaDk: String(hatirlatmaDk) }),
      ...(siparisOnayMesaji !== undefined && { siparisOnayMesaji: siparisOnayMesaji || null }),
      ...(dekontHatirlatmaDk !== undefined && { dekontHatirlatmaDk: String(dekontHatirlatmaDk) }),
      ...(dekontIsteMesaji !== undefined && { dekontIsteMesaji: dekontIsteMesaji || null }),
      ...(kartOdemeMesaji !== undefined && { kartOdemeMesaji: kartOdemeMesaji || null }),
      ...(dekontAlindiMesaji !== undefined && { dekontAlindiMesaji: dekontAlindiMesaji || null }),
      ...(iptalMesaji !== undefined && { iptalMesaji: iptalMesaji || null }),
      ...(odemeOnayMesaji !== undefined && { odemeOnayMesaji: odemeOnayMesaji || null }),
    },
    create: { tenantId: req.tenantId!, rezervSureDk: Number(rezervSureDk) || 30, otomatikIptal: otomatikIptal ?? true, bildirimAktif: bildirimAktif ?? true, hatirlatmaDk: hatirlatmaDk || '10,20' },
  });
  res.json({ ok: true, settings });
}));

// ═══════════ Görsel Profesyonelleştir (Arka Plan) ═══════════

// Toplu enhance başlat — ürünlerin job'larını oluştur, worker arka planda işler
router.post('/catalogs/:id/enhance-start', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const cat = await prisma.customCatalog.findFirst({ where: { id: req.params.id, tenantId } });
  if (!cat) throw new ApiError(404, 'Katalog bulunamadı');
  const { productIds, prompt, referenceImage } = req.body || {};
  const ids: string[] = Array.isArray(productIds) ? productIds : [];
  if (ids.length === 0) throw new ApiError(422, 'En az 1 ürün seçin');
  const prods = await prisma.product.findMany({ where: { tenantId, id: { in: ids }, aktif: true } });
  const jobs: any[] = [];
  const refImg = typeof referenceImage === 'string' && referenceImage.length > 0 ? referenceImage : null;
  for (const p of prods) {
    const img = Array.isArray(p.images) ? (p.images as any[])[0] : null;
    if (!img) continue;
    // Aynı ürün için zaten pending/processing job varsa tekrar oluşturma
    const existing = await prisma.enhanceJob.findFirst({ where: { tenantId, productId: p.id, status: { in: ['pending', 'processing'] } } });
    if (existing) continue;
    const job = await prisma.enhanceJob.create({ data: { tenantId, catalogId: cat.id, productId: p.id, prompt: prompt || null, referenceImage: refImg, oldImage: img } });
    jobs.push(job);
  }
  // Worker'ı tetikle (non-blocking)
  processEnhanceQueue(tenantId).catch(() => {});
  res.json({ ok: true, created: jobs.length, total: ids.length });
}));

// Enhance job listesi (katalog bazlı veya tümü)
router.get('/enhance-jobs', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { catalogId, status } = req.query as any;
  const where: any = { tenantId };
  if (catalogId) where.catalogId = catalogId;
  if (status) where.status = status;
  const rows = await prisma.enhanceJob.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
  res.json({ ok: true, rows });
}));

// Prompt kütüphanesi — kalıcı prompt presetleri
router.get('/enhance-prompts', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const rows = await prisma.enhancePromptPreset.findMany({ where: { tenantId }, orderBy: [{ kullanim: 'desc' }, { createdAt: 'desc' }] });
  res.json({ ok: true, rows });
}));

router.post('/enhance-prompts', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { baslik, prompt } = req.body || {};
  if (!prompt || !String(prompt).trim()) throw new ApiError(422, 'Prompt boş olamaz');
  const row = await prisma.enhancePromptPreset.create({
    data: { tenantId, baslik: String(baslik || '').trim() || 'Prompt', prompt: String(prompt).trim() },
  });
  res.json({ ok: true, row });
}));

router.post('/enhance-prompts/:id/use', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const row = await prisma.enhancePromptPreset.findFirst({ where: { id: req.params.id, tenantId } });
  if (!row) throw new ApiError(404, 'Bulunamadı');
  await prisma.enhancePromptPreset.update({ where: { id: row.id }, data: { kullanim: { increment: 1 } } });
  res.json({ ok: true });
}));

router.delete('/enhance-prompts/:id', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  await prisma.enhancePromptPreset.deleteMany({ where: { id: req.params.id, tenantId } });
  res.json({ ok: true });
}));

// Tek bir job'ı onayla — seçilen varyant(lar)ı ürüne kaydet, kapağı başa al
router.post('/enhance-jobs/:id/approve', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const job = await prisma.enhanceJob.findFirst({ where: { id: req.params.id, tenantId } });
  if (!job) throw new ApiError(404, 'Job bulunamadı');

  // Üretilen varyant havuzu (yeni çoklu alan; yoksa eski tekil newImage)
  const pool: string[] = (Array.isArray(job.newImages) && job.newImages.length > 0)
    ? (job.newImages as string[])
    : (job.newImage ? [job.newImage] : []);
  if (pool.length === 0) throw new ApiError(422, 'Henüz işlenmemiş');

  const body = req.body || {};
  // Geri uyum: gövde yoksa eski davranış (tek görsel = newImage/ilk varyant)
  let selected: string[] = Array.isArray(body.selected) ? body.selected.filter((u: any) => typeof u === 'string') : [];
  // Yalnızca üretilen havuzdaki URL'lere izin ver
  selected = selected.filter((u) => pool.includes(u));
  if (selected.length === 0) selected = [pool[0]];
  let cover: string = typeof body.cover === 'string' && selected.includes(body.cover) ? body.cover : selected[0];

  // Ürünün görselini güncelle: kapak başa, ardından diğer seçilenler, sonra mevcut orijinaller
  const prod = await prisma.product.findUnique({ where: { id: job.productId } });
  if (prod) {
    const existing = Array.isArray(prod.images) ? [...(prod.images as any[])] : [];
    // Eski orijinal kaynak görseli (job.oldImage) ve üretilen tüm varyantları mevcut listeden ayıkla
    const rest = existing.filter((u) => u !== job.oldImage && !pool.includes(u));
    const ordered = [cover, ...selected.filter((u) => u !== cover), ...rest];
    const seen = new Set<string>();
    const finalImgs = ordered.filter((u) => (u && !seen.has(u)) ? (seen.add(u), true) : false);
    await prisma.product.update({ where: { id: prod.id }, data: { images: finalImgs } });
  }
  await prisma.enhanceJob.update({ where: { id: job.id }, data: { status: 'approved', selectedImages: selected, coverImage: cover, newImage: cover } });
  res.json({ ok: true });
}));

// Reddet
router.post('/enhance-jobs/:id/reject', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const job = await prisma.enhanceJob.findFirst({ where: { id: req.params.id, tenantId } });
  if (!job) throw new ApiError(404, 'Job bulunamadı');
  await prisma.enhanceJob.update({ where: { id: job.id }, data: { status: 'rejected' } });
  res.json({ ok: true });
}));

// Tekrar dene (yeni prompt ile opsiyonel)
router.post('/enhance-jobs/:id/retry', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const job = await prisma.enhanceJob.findFirst({ where: { id: req.params.id, tenantId } });
  if (!job) throw new ApiError(404, 'Job bulunamadı');
  const { prompt } = req.body || {};
  await prisma.enhanceJob.update({ where: { id: job.id }, data: { status: 'pending', newImage: null, error: null, prompt: prompt !== undefined ? (prompt || null) : job.prompt } });
  processEnhanceQueue(tenantId).catch(() => {});
  res.json({ ok: true });
}));

// Kuyruktaki (bekleyen) işlemleri iptal et — çoklu veya tümü
router.post('/enhance-jobs/cancel', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { ids, all, catalogId } = req.body || {};
  const where: any = { tenantId, status: 'pending' };
  if (catalogId) where.catalogId = String(catalogId);
  if (!all) {
    const list: string[] = Array.isArray(ids) ? ids.map((x: any) => String(x)) : [];
    if (list.length === 0) throw new ApiError(422, 'En az 1 işlem seçin');
    where.id = { in: list };
  }
  const r = await prisma.enhanceJob.deleteMany({ where });
  res.json({ ok: true, cancelled: r.count });
}));

// Tek bir bekleyen işlemi iptal et
router.post('/enhance-jobs/:id/cancel', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const job = await prisma.enhanceJob.findFirst({ where: { id: req.params.id, tenantId } });
  if (!job) throw new ApiError(404, 'Job bulunamadı');
  if (job.status !== 'pending') throw new ApiError(422, 'Sadece bekleyen işlemler iptal edilebilir');
  await prisma.enhanceJob.delete({ where: { id: job.id } });
  res.json({ ok: true });
}));
// Arka plan worker: pending job'ları sırayla işle
// Bir job 'processing'de bu süreden uzun kalırsa (ör. sunucu yeniden başladı / çağrı asıldı) takılmış sayılır
const ENHANCE_STALE_MS = 4 * 60 * 1000;

async function processEnhanceQueue(tenantId: string) {
  const MAX_CONCURRENT = 1;
  // Takılı kalmış processing job'ları kurtar -> pending'e döndür ki kuyruk kilitlenmesin
  const staleBefore = new Date(Date.now() - ENHANCE_STALE_MS);
  await prisma.enhanceJob.updateMany({
    where: { tenantId, status: 'processing', updatedAt: { lt: staleBefore } },
    data: { status: 'pending' },
  });

  const processing = await prisma.enhanceJob.count({ where: { tenantId, status: 'processing' } });
  if (processing >= MAX_CONCURRENT) return;

  const next = await prisma.enhanceJob.findFirst({ where: { tenantId, status: 'pending' }, orderBy: { createdAt: 'asc' } });
  if (!next) return;

  await prisma.enhanceJob.update({ where: { id: next.id }, data: { status: 'processing' } });
  try {
    const result = await enhanceProductImage(next.oldImage, next.prompt || undefined, next.referenceImage || undefined, 3);
    await prisma.enhanceJob.update({ where: { id: next.id }, data: { status: 'done', newImage: result.image, newImages: result.images } });
  } catch (e: any) {
    await prisma.enhanceJob.update({ where: { id: next.id }, data: { status: 'done', error: e?.message || 'Hata oluştu' } });
  }
  // Sonraki job'a geç
  setTimeout(() => processEnhanceQueue(tenantId).catch(() => {}), 500);
}

// Periyodik kurtarma: restart sonrası / tetiklenmemiş bekleyen job'ları sürekli işle.
// Bekleyen veya takılı job'ı olan tüm tenant'lar için kuyruğu canlı tut.
let _enhanceTickRunning = false;
async function enhanceQueueTick() {
  if (_enhanceTickRunning) return;
  _enhanceTickRunning = true;
  try {
    const staleBefore = new Date(Date.now() - ENHANCE_STALE_MS);
    const active = await prisma.enhanceJob.findMany({
      where: { OR: [{ status: 'pending' }, { status: 'processing', updatedAt: { lt: staleBefore } }] },
      select: { tenantId: true },
      distinct: ['tenantId'],
      take: 100,
    });
    for (const a of active) {
      await processEnhanceQueue(a.tenantId).catch(() => {});
    }
  } catch { /* yoksay */ } finally {
    _enhanceTickRunning = false;
  }
}
setInterval(() => { enhanceQueueTick().catch(() => {}); }, 30 * 1000);
// İlk başlatmada da bir tur çalıştır (sunucu açılınca bekleyenleri yakala)
setTimeout(() => { enhanceQueueTick().catch(() => {}); }, 5000);

// ═══════════ Katalog Kupon CRUD ═══════════════════════════════════════════════

// Kuponları listele
router.get('/catalogs/:catalogId/coupons', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const coupons = await prisma.catalogCoupon.findMany({
    where: { tenantId, catalogId: req.params.catalogId },
    orderBy: { createdAt: 'desc' }
  });
  res.json(coupons);
}));

// Kupon oluştur
router.post('/catalogs/:catalogId/coupons', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const catalogId = req.params.catalogId;
  const cat = await prisma.customCatalog.findFirst({ where: { id: catalogId, tenantId } });
  if (!cat) throw new ApiError(404, 'Katalog bulunamadı');

  const { code, tip, deger, maxKullanim, baslangic, bitis } = req.body || {};
  if (!code || typeof code !== 'string') throw new ApiError(422, 'Kupon kodu zorunlu');
  if (!deger || Number(deger) <= 0) throw new ApiError(422, 'İndirim değeri zorunlu');

  const cleanCode = code.trim().toUpperCase();
  const existing = await prisma.catalogCoupon.findUnique({ where: { catalogId_code: { catalogId, code: cleanCode } } });
  if (existing) throw new ApiError(422, 'Bu kupon kodu zaten mevcut');

  const coupon = await prisma.catalogCoupon.create({
    data: {
      tenantId,
      catalogId,
      code: cleanCode,
      tip: tip === 'tutar' ? 'tutar' : 'yuzde',
      deger: Number(deger),
      maxKullanim: maxKullanim ? Number(maxKullanim) : null,
      baslangic: baslangic ? new Date(baslangic) : null,
      bitis: bitis ? new Date(bitis) : null,
    }
  });
  res.json(coupon);
}));

// Kupon güncelle
router.patch('/catalogs/:catalogId/coupons/:id', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const coupon = await prisma.catalogCoupon.findFirst({ where: { id: req.params.id, tenantId, catalogId: req.params.catalogId } });
  if (!coupon) throw new ApiError(404, 'Kupon bulunamadı');

  const data: any = {};
  if (req.body.code !== undefined) data.code = String(req.body.code).trim().toUpperCase();
  if (req.body.tip !== undefined) data.tip = req.body.tip === 'tutar' ? 'tutar' : 'yuzde';
  if (req.body.deger !== undefined) data.deger = Number(req.body.deger);
  if (req.body.maxKullanim !== undefined) data.maxKullanim = req.body.maxKullanim ? Number(req.body.maxKullanim) : null;
  if (req.body.baslangic !== undefined) data.baslangic = req.body.baslangic ? new Date(req.body.baslangic) : null;
  if (req.body.bitis !== undefined) data.bitis = req.body.bitis ? new Date(req.body.bitis) : null;
  if (req.body.aktif !== undefined) data.aktif = Boolean(req.body.aktif);

  const updated = await prisma.catalogCoupon.update({ where: { id: coupon.id }, data });
  res.json(updated);
}));

// Kupon sil
router.delete('/catalogs/:catalogId/coupons/:id', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const coupon = await prisma.catalogCoupon.findFirst({ where: { id: req.params.id, tenantId, catalogId: req.params.catalogId } });
  if (!coupon) throw new ApiError(404, 'Kupon bulunamadı');
  await prisma.catalogCoupon.delete({ where: { id: coupon.id } });
  res.json({ ok: true });
}));

// ─── Katalog Canlı İzleme Endpoint'leri ───
router.get('/catalog-live', asyncHandler(async (req: Request, res: Response) => {
  const { catalogId } = req.query;
  const visitors = getActiveVisitors(req.tenantId!, catalogId as string | undefined);
  const stats = getVisitorStats(req.tenantId!);
  // Katalog adlarını al
  const catalogIds = [...new Set(visitors.map(v => v.catalogId))];
  const catalogs = catalogIds.length > 0
    ? await prisma.customCatalog.findMany({ where: { id: { in: catalogIds } }, select: { id: true, ad: true } })
    : [];
  const catalogMap = Object.fromEntries(catalogs.map(c => [c.id, c.ad]));
  const enrichedVisitors = visitors.map(v => ({
    ...v,
    catalogAd: catalogMap[v.catalogId] || 'Bilinmiyor',
    sureDk: Math.round((Date.now() - v.girisZamani) / 60000),
  }));
  res.json({ ok: true, visitors: enrichedVisitors, stats, toplam: visitors.length });
}));

// ───────── BirFatura Ayarları ─────────
async function ensureBirFaturaAyar(tenantId: string) {
  let ayar = await prisma.birFaturaAyar.findUnique({ where: { tenantId } });
  if (!ayar) {
    ayar = await prisma.birFaturaAyar.create({ data: { tenantId, token: crypto.randomUUID() } });
  }
  return ayar;
}

router.get('/birfatura/ayar', asyncHandler(async (req: Request, res: Response) => {
  const ayar = await ensureBirFaturaAyar(req.tenantId!);
  const kategoriler = await prisma.productCategory.findMany({
    where: { tenantId: req.tenantId! },
    select: { id: true, ad: true },
    orderBy: { ad: 'asc' },
  });
  res.json({ ...ayar, kategoriler });
}));

router.post('/birfatura/ayar', asyncHandler(async (req: Request, res: Response) => {
  await ensureBirFaturaAyar(req.tenantId!);
  const b = req.body || {};
  const data: any = {};
  if (b.aktif != null) data.aktif = !!b.aktif;
  if (b.indirimModu != null) data.indirimModu = String(b.indirimModu);
  if (b.kdvOrani != null) data.kdvOrani = Number(b.kdvOrani) || 18;
  if (b.kategoriKdv != null && typeof b.kategoriKdv === 'object') {
    const m: Record<string, number> = {};
    for (const [k, v] of Object.entries(b.kategoriKdv as Record<string, any>)) {
      const num = Number(v);
      if (k && Number.isFinite(num)) m[k] = num;
    }
    data.kategoriKdv = m;
  }
  if (Array.isArray(b.faturaDurumlari)) {
    const allow = ['yeni', 'hazirlaniyor', 'kargoda', 'tamamlandi', 'iptal'];
    data.faturaDurumlari = b.faturaDurumlari.map((x: any) => String(x)).filter((x: string) => allow.includes(x));
  }
  if (b.otomatikKesim != null) data.otomatikKesim = !!b.otomatikKesim;
  if (b.eFaturaTipi != null) data.eFaturaTipi = b.eFaturaTipi === 'eFatura' ? 'eFatura' : 'eArsiv';
  if (b.faturaOnEki !== undefined) data.faturaOnEki = b.faturaOnEki ? String(b.faturaOnEki) : null;
  if (b.faturaAciklama !== undefined) data.faturaAciklama = b.faturaAciklama ? String(b.faturaAciklama) : null;
  if (b.sepetteGoster != null) data.sepetteGoster = !!b.sepetteGoster;
  if (b.bildirimKesilince != null) data.bildirimKesilince = !!b.bildirimKesilince;
  if (b.bildirimBekleyen != null) data.bildirimBekleyen = !!b.bildirimBekleyen;
  const ayar = await prisma.birFaturaAyar.update({ where: { tenantId: req.tenantId! }, data });
  const kategoriler = await prisma.productCategory.findMany({
    where: { tenantId: req.tenantId! },
    select: { id: true, ad: true },
    orderBy: { ad: 'asc' },
  });
  res.json({ ...ayar, kategoriler });
}));

router.post('/birfatura/token-yenile', asyncHandler(async (req: Request, res: Response) => {
  await ensureBirFaturaAyar(req.tenantId!);
  const ayar = await prisma.birFaturaAyar.update({ where: { tenantId: req.tenantId! }, data: { token: crypto.randomUUID() } });
  res.json(ayar);
}));

router.get('/birfatura/faturalar', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const faturalar = await prisma.birFaturaFatura.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  const faturaIds = faturalar.map((f) => f.orderId);
  const faturaliSet = new Set(faturaIds);

  const custSel = { customer: { select: { ad: true, telefon: true, instagram: true } } };
  const [faturaOrders, kargoOrders, iptalOrders] = await Promise.all([
    faturaIds.length ? prisma.storeOrder.findMany({ where: { tenantId, id: { in: faturaIds } }, include: custSel }) : Promise.resolve([] as any[]),
    prisma.storeOrder.findMany({ where: { tenantId, durum: 'kargoda' }, orderBy: { createdAt: 'desc' }, include: custSel }),
    prisma.storeOrder.findMany({ where: { tenantId, durum: 'iptal' }, orderBy: { createdAt: 'desc' }, take: 200, include: custSel }),
  ]);
  const orderMap = new Map<string, any>(faturaOrders.map((o: any) => [o.id, o]));

  const tutarOf = (o: any) => (o ? (Number(o.tahsilat) > 0 ? Number(o.tahsilat) : Number(o.toplam)) : 0);
  const displayNoOf = (o: any) => o?.orderNo ? `#${o.orderYil || ''}${String(o.orderNo).padStart(3, '0')}` : (o ? `#${String(o.id).slice(-6)}` : '');
  const rowOf = (o: any, kategori: string, fatura?: any) => ({
    orderId: o?.id || fatura?.orderId,
    sipNo: o?.sipNo || fatura?.sipNo || '',
    displayNo: displayNoOf(o),
    durum: o?.durum || '',
    musteri: o?.customer?.ad || o?.musteriHandle || fatura?.musteri || '',
    telefon: o?.customer?.telefon || '',
    tutar: tutarOf(o),
    kdvDahil: true,
    createdAt: o?.createdAt || fatura?.createdAt,
    kategori,
    faturali: kategori === 'odenen',
    invoiceNo: fatura?.invoiceNo || null,
    invoiceLink: fatura?.invoiceLink || null,
  });

  // Ödenenler = faturası kesilmiş siparişler
  const odenen = faturalar.map((f) => rowOf(orderMap.get(f.orderId), 'odenen', f));
  // Kalan/Bekleyen = kargoda ve henüz faturalanmamış
  const bekleyen = kargoOrders.filter((o: any) => !faturaliSet.has(o.id)).map((o: any) => rowOf(o, 'bekleyen'));
  // İptal Edilenler
  const iptal = iptalOrders.map((o: any) => rowOf(o, 'iptal'));

  const toplamTutar = odenen.reduce((s, r) => s + (r.tutar || 0), 0);
  const stats = {
    toplam: odenen.length + bekleyen.length,
    bekleyen: bekleyen.length,
    odenen: odenen.length,
    toplamTutar,
  };
  res.json({ stats, odenen, bekleyen, iptal });
}));

// ── Mükerrer müşteriler: telefon (telKey) bazlı gruplar + ad/instagram adayları ──
router.get('/customers/duplicates', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const customers = await prisma.customer.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
  // telKey / igKey backfill (boş olanları anında doldur)
  for (const c of customers) {
    const patch: any = {};
    if (!c.telKey) { const tk = telKey(c.telefon); if (tk) { c.telKey = tk; patch.telKey = tk; } }
    if (!(c as any).igKey) { const ik = igKey(c.instagram); if (ik) { (c as any).igKey = ik; patch.igKey = ik; } }
    if (Object.keys(patch).length) await prisma.customer.update({ where: { id: c.id }, data: patch }).catch(() => {});
  }
  const orderCounts = await prisma.storeOrder.groupBy({ by: ['customerId'], where: { tenantId, customerId: { not: null } }, _count: { _all: true } });
  const ocMap = new Map<string, number>();
  for (const o of orderCounts) if (o.customerId) ocMap.set(o.customerId, o._count._all);

  const enrich = (c: any) => ({ id: c.id, ad: c.ad, telefon: c.telefon, musteriNo: c.musteriNo, instagram: c.instagram, bakiye: c.bakiye || 0, siparisSayisi: ocMap.get(c.id) || 0, createdAt: c.createdAt });

  // Telefon grupları (telKey aynı)
  const byTel = new Map<string, any[]>();
  for (const c of customers) { if (!c.telKey) continue; const arr = byTel.get(c.telKey) || []; arr.push(c); byTel.set(c.telKey, arr); }
  const telefonGruplari = [...byTel.entries()]
    .filter(([, arr]) => arr.length > 1)
    .map(([key, arr]) => ({ telKey: key, telefon: arr.find((x) => x.telefon)?.telefon || key, uyeler: arr.map(enrich) }))
    .sort((a, b) => b.uyeler.length - a.uyeler.length);

  // Instagram grupları (igKey aynı = aynı kullanıcı adı, büyük/küçük harf duyarsız) — birleştirilebilir mükerrer
  const byIg = new Map<string, any[]>();
  for (const c of customers) { const ik = (c as any).igKey; if (!ik) continue; const arr = byIg.get(ik) || []; arr.push(c); byIg.set(ik, arr); }
  const instagramGruplari = [...byIg.entries()]
    .filter(([, arr]) => arr.length > 1)
    .map(([key, arr]) => ({ igKey: key, instagram: arr.find((x) => x.instagram)?.instagram || key, uyeler: arr.map(enrich) }))
    .sort((a, b) => b.uyeler.length - a.uyeler.length);

  res.json({ telefonGruplari, instagramGruplari });
}));

// ── Mükerrer birleştirme: seçilen ana kayda (keepId) diğerlerini taşı ──
router.post('/customers/merge', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const keepId = String(req.body?.keepId || '');
  const mergeIds: string[] = Array.isArray(req.body?.mergeIds) ? req.body.mergeIds.filter((x: any) => x && x !== keepId) : [];
  if (!keepId || !mergeIds.length) throw new ApiError(422, 'keepId ve en az bir mergeId gerekli.');
  const keep = await prisma.customer.findFirst({ where: { id: keepId, tenantId } });
  if (!keep) throw new ApiError(404, 'Ana müşteri bulunamadı.');
  const olds = await prisma.customer.findMany({ where: { id: { in: mergeIds }, tenantId } });
  if (!olds.length) throw new ApiError(404, 'Birleştirilecek müşteri bulunamadı.');
  const oldIds = olds.map((o) => o.id);

  await prisma.$transaction(async (tx) => {
    const where = { tenantId, customerId: { in: oldIds } } as any;
    const to = { customerId: keepId } as any;
    await tx.storeOrder.updateMany({ where, data: to });
    await tx.customerLedger.updateMany({ where, data: to });
    await tx.catalogRequest.updateMany({ where, data: to }).catch(() => {});
    await tx.stokHareket.updateMany({ where, data: to }).catch(() => {});
    await tx.productReview.updateMany({ where, data: to }).catch(() => {});
    await tx.productView.updateMany({ where, data: to }).catch(() => {});
    await tx.notificationSub.updateMany({ where, data: to }).catch(() => {});
    await tx.destekTalebi.updateMany({ where, data: to }).catch(() => {});
    await tx.whatsappConversation.updateMany({ where, data: to }).catch(() => {});

    const patch: any = { bakiye: (keep.bakiye || 0) + olds.reduce((s, o) => s + (o.bakiye || 0), 0) };
    if (!keep.telKey) patch.telKey = telKey(keep.telefon) || olds.find((o) => o.telKey)?.telKey || null;
    if (!keep.telefon) patch.telefon = olds.find((o) => o.telefon)?.telefon || null;
    if (!keep.instagram) patch.instagram = olds.find((o) => o.instagram)?.instagram || null;
    if (!(keep as any).igKey) patch.igKey = igKey(keep.instagram) || olds.find((o) => (o as any).igKey)?.igKey || igKey(olds.find((o) => o.instagram)?.instagram) || null;
    if (!keep.email) patch.email = olds.find((o) => o.email)?.email || null;
    if (!keep.adres) patch.adres = olds.find((o) => o.adres)?.adres || null;
    await tx.customer.update({ where: { id: keepId }, data: patch });
    await tx.customer.deleteMany({ where: { id: { in: oldIds }, tenantId } });
  });

  res.json({ ok: true, keepId, merged: oldIds.length });
}));

// ── telKey + igKey backfill (tüm müşteriler) ──
router.post('/customers/backfill-telkey', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const customers = await prisma.customer.findMany({ where: { tenantId }, select: { id: true, telefon: true, telKey: true, instagram: true, igKey: true } });
  let n = 0;
  for (const c of customers) {
    const patch: any = {};
    if (!c.telKey) { const tk = telKey(c.telefon); if (tk) patch.telKey = tk; }
    if (!c.igKey) { const ik = igKey(c.instagram); if (ik) patch.igKey = ik; }
    if (Object.keys(patch).length) { await prisma.customer.update({ where: { id: c.id }, data: patch }); n++; }
  }
  res.json({ ok: true, guncellenen: n });
}));

// ─── Personel hareket logları ───────────────────────────────────────────────
router.get('/audit', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize || '50'), 10) || 50));
  const q = String(req.query.q || '').trim();
  const entity = String(req.query.entity || '').trim();
  const action = String(req.query.action || '').trim();
  const userId = String(req.query.userId || '').trim();
  const where: any = { tenantId };
  if (entity) where.entity = entity;
  if (action) where.action = action;
  if (userId) where.userId = userId;
  if (q) where.OR = [
    { userName: { contains: q, mode: 'insensitive' } },
    { detail: { contains: q, mode: 'insensitive' } },
    { action: { contains: q, mode: 'insensitive' } },
    { hedef: { contains: q, mode: 'insensitive' } },
    { kime: { contains: q, mode: 'insensitive' } },
    { neden: { contains: q, mode: 'insensitive' } },
  ];
  const kime = String(req.query.kime || '').trim();
  if (kime) where.kime = { contains: kime, mode: 'insensitive' };
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  if (from || to) where.createdAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to + 'T23:59:59') } : {}) };
  const [rows, total, users, actFacet, entFacet] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({ where: { tenantId }, select: { id: true, fullName: true, unvan: true, role: true } }),
    prisma.auditLog.groupBy({ by: ['action'], where: { tenantId }, _count: { action: true } }),
    prisma.auditLog.groupBy({ by: ['entity'], where: { tenantId }, _count: { entity: true } }),
  ]);
  const facets = {
    actions: actFacet.map((a) => ({ value: a.action, count: a._count.action })).sort((a, b) => b.count - a.count),
    entities: entFacet.map((e) => ({ value: e.entity, count: e._count.entity })).sort((a, b) => b.count - a.count),
  };
  res.json({ rows, total, page, pageSize, users, facets });
}));

// ═══════════ İade ve Değişim İşlemleri ═══════════
// İade ayarlarını StoreSetting.config.iade altından oku
async function getIadeSettings(tenantId: string) {
  const ss = await prisma.storeSetting.findUnique({ where: { tenantId }, select: { config: true } }).catch(() => null);
  const cfg: any = (ss?.config as any) || {};
  const iade = cfg.iade || {};
  return {
    sebepler: Array.isArray(iade.sebepler) && iade.sebepler.length ? iade.sebepler : ['Beğenmedi', 'Beden/numara uymadı', 'Yanlış ürün', 'Ürün defolu/hasarlı', 'Diğer'],
    defoKategoriAd: iade.defoKategoriAd || 'Defo',
    varsayilanYontem: iade.varsayilanYontem || 'bakiye',
    waBildirimAktif: !!iade.waBildirimAktif,
    waSablon: iade.waSablon || 'Merhaba {ad}, {sipNo} numaralı siparişinizdeki iade/değişim talebiniz işleme alınmıştır. İade tutarı {tutar} hesabınıza bakiye olarak tanımlanmıştır.',
  };
}

// Sipariş sorgulama: sipNo / token ile siparişi ve ürünlerini getir
router.get('/iade/order-lookup', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const sip = String((req.query.sip || '') as string).trim();
  if (!sip) throw new ApiError(400, 'Sipariş/sepet numarası gerekli.');
  const order = await prisma.storeOrder.findFirst({
    where: { tenantId, OR: [{ sipNo: { equals: sip, mode: 'insensitive' } }, { token: sip }] },
    include: { customer: { select: { id: true, ad: true, telefon: true, bakiye: true } } },
  });
  if (!order) throw new ApiError(404, 'Bu numarayla sipariş bulunamadı.');
  const items = (Array.isArray(order.items) ? (order.items as any[]) : []).map((it, i) => ({
    idx: i, productId: it.productId || null, ad: it.ad || 'Ürün', varyasyon: it.varyasyon || null,
    adet: Number(it.adet) || 1, fiyat: Number(it.fiyat) || 0, stokDusuldu: !!it.stokDusuldu,
  }));
  res.json({
    id: order.id, sipNo: order.sipNo, durum: order.durum, toplam: order.toplam, tahsilat: order.tahsilat,
    customer: order.customer ? { id: order.customer.id, ad: order.customer.ad, telefon: order.customer.telefon, bakiye: order.customer.bakiye } : null,
    musteriHandle: order.musteriHandle, items,
  });
}));

// Defo ürününü Defo kategorisi altında oluştur/bul ve stoğunu artır
async function ensureDefoUrun(tx: any, tenantId: string, defoKatAd: string, src: { productId?: string | null; ad: string; varyasyon?: string | null; fiyat?: number }, adet: number, who?: string | null) {
  // Defo kategorisi
  let kat = await tx.productCategory.findFirst({ where: { tenantId, ad: defoKatAd } });
  if (!kat) kat = await tx.productCategory.create({ data: { tenantId, ad: defoKatAd } });
  const defoAd = `[DEFO] ${src.ad}${src.varyasyon ? ' - ' + src.varyasyon : ''}`;
  let defo = await tx.product.findFirst({ where: { tenantId, kategoriId: kat.id, ad: defoAd } });
  if (!defo) {
    defo = await tx.product.create({ data: {
      tenantId, ad: defoAd, kategoriId: kat.id, satisFiyat: Number(src.fiyat) || 0, alisFiyat: 0,
      stokAdeti: 0, aktif: false, onlineMagaza: false, canliSatis: false,
      aciklama: 'İade sürecinde defolu/kullanılamaz bulunan ürün', createdBy: who || null,
    } });
  }
  const pr = await tx.product.update({ where: { id: defo.id }, data: { stokAdeti: { increment: adet } }, select: { stokAdeti: true } });
  await logStok(tx, tenantId, { productId: defo.id, yon: 'giris', tip: 'defo', kanal: 'manuel', miktar: adet, stokSonra: pr.stokAdeti, kullanici: who || null, aciklama: `${src.ad} defolu iade — Defo deposuna alındı` });
  return defo.id;
}

// Tamamlanınca stok (defo/stoğa) ve bakiye işlemlerini uygula (bir kez)
async function applyIadeProcessing(tx: any, tenantId: string, kayit: any, order: any, cfg: any, who: string | null) {
  const kayitItems: any[] = Array.isArray(kayit.items) ? kayit.items : [];
  for (const it of kayitItems) {
    const adet = Math.max(1, Number(it.adet) || 1);
    if (it.defo) {
      await ensureDefoUrun(tx, tenantId, cfg.defoKategoriAd, { productId: it.productId, ad: it.ad, varyasyon: it.varyasyon, fiyat: it.fiyat }, adet, who);
    } else if (it.productId) {
      if (it.varyasyon) {
        const v = await tx.productVariation.findFirst({ where: { productId: it.productId, tenantId, deger: it.varyasyon } });
        if (v) await tx.productVariation.update({ where: { id: v.id }, data: { stok: { increment: adet } } });
      }
      const pr = await tx.product.update({ where: { id: it.productId }, data: { stokAdeti: { increment: adet } }, select: { stokAdeti: true } }).catch(() => null);
      await logStok(tx, tenantId, { productId: it.productId, varyasyon: it.varyasyon || null, yon: 'giris', tip: 'iade', kanal: 'manuel', miktar: adet, stokSonra: pr?.stokAdeti ?? null, orderId: order?.id, sipNo: kayit.sipNo, customerId: kayit.customerId, kullanici: who, aciklama: `${it.ad} iade — stoğa döndü` });
    }
  }
  // İade tutarı müşteri bakiyesine (mağaza kredisi) — sadece 'iade' tipinde
  if (kayit.tip === 'iade' && kayit.customerId && Number(kayit.iadeTutar) > 0) {
    await tx.customer.update({ where: { id: kayit.customerId }, data: { bakiye: { increment: Number(kayit.iadeTutar) } } });
    await tx.customerLedger.create({ data: { tenantId, customerId: kayit.customerId, tip: 'iade', tutar: Number(kayit.iadeTutar), aciklama: `${kayit.sipNo || ''} iade${kayit.genelSebep ? ' — ' + kayit.genelSebep : ''}`.trim(), refId: kayit.orderId, kullanici: who } });
  }
}

// Yeni iade/değişim talebi oluştur (durum: onay_bekliyor) — stok/bakiye henüz uygulanmaz
router.post('/iade', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { orderId, tip, items, degisimUrunler, genelSebep } = req.body as any;
  if (!orderId || !Array.isArray(items) || items.length === 0) throw new ApiError(400, 'Sipariş ve en az bir ürün seçilmeli.');
  if (tip !== 'iade' && tip !== 'degisim') throw new ApiError(400, 'Geçersiz işlem tipi.');
  const order = await prisma.storeOrder.findFirst({ where: { id: orderId, tenantId } });
  if (!order) throw new ApiError(404, 'Sipariş bulunamadı.');
  const who = await actorName(req.auth?.userId);
  const orderItems: any[] = Array.isArray(order.items) ? (order.items as any[]) : [];

  const kayitItems: any[] = [];
  let tutar = 0;
  for (const sel of items) {
    const adet = Math.max(1, Number(sel.adet) || 1);
    const src = orderItems.find((o) => (sel.idx != null && orderItems.indexOf(o) === sel.idx) || (o.productId && o.productId === sel.productId && (o.varyasyon || null) === (sel.varyasyon || null))) || sel;
    const ad = src?.ad || sel.ad || 'Ürün';
    const fiyat = Number(src?.fiyat) || Number(sel.fiyat) || 0;
    const defo = !!sel.defo;
    tutar += adet * fiyat;
    kayitItems.push({ productId: sel.productId || null, ad, varyasyon: sel.varyasyon || null, adet, fiyat, sebep: sel.sebep || genelSebep || null, defo, durum: defo ? 'defo' : 'stok' });
  }

  const cust = order.customerId ? await prisma.customer.findUnique({ where: { id: order.customerId }, select: { ad: true, telefon: true } }).catch(() => null) : null;
  const lastNo = await prisma.iadeKayit.findFirst({ where: { tenantId }, orderBy: { talepNo: 'desc' }, select: { talepNo: true } }).catch(() => null);
  const talepNo = (lastNo?.talepNo || 1000) + 1;

  const kayit = await prisma.iadeKayit.create({ data: {
    tenantId, talepNo, orderId: order.id, sipNo: order.sipNo, customerId: order.customerId,
    customerAd: cust?.ad || order.musteriHandle || null, customerTel: cust?.telefon || null,
    tip, durum: 'onay_bekliyor', items: kayitItems,
    degisimUrunler: Array.isArray(degisimUrunler) && degisimUrunler.length ? degisimUrunler : undefined,
    iadeTutar: tutar, yontem: 'bakiye', genelSebep: genelSebep || null, kullanici: who,
  } });

  await logAudit(req, tip, 'iade', kayit.id, `${tip === 'iade' ? 'İade' : 'Değişim'} talebi: ${items.length} ürün (${order.sipNo || ''})`, { neden: genelSebep || null, meta: { tutar } });
  res.json({ ok: true, id: kayit.id, talepNo, tutar });
}));

// Talep durumunu güncelle (onay_bekliyor → islemde → tamamlandi / reddedildi)
router.patch('/iade/:id/durum', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { durum, redNedeni } = req.body as any;
  const VALID = ['onay_bekliyor', 'islemde', 'tamamlandi', 'reddedildi'];
  if (!VALID.includes(durum)) throw new ApiError(400, 'Geçersiz durum.');
  const kayit = await prisma.iadeKayit.findFirst({ where: { id: req.params.id, tenantId } });
  if (!kayit) throw new ApiError(404, 'Talep bulunamadı.');
  const cfg = await getIadeSettings(tenantId);
  const who = await actorName(req.auth?.userId);

  await prisma.$transaction(async (tx) => {
    // Tamamlandıya geçiş + henüz işlenmemişse stok/bakiye uygula
    if (durum === 'tamamlandi' && !kayit.islendi) {
      const order = kayit.orderId ? await tx.storeOrder.findUnique({ where: { id: kayit.orderId } }) : null;
      await applyIadeProcessing(tx, tenantId, kayit, order, cfg, who);
      await tx.iadeKayit.update({ where: { id: kayit.id }, data: { durum, islendi: true } });
    } else {
      await tx.iadeKayit.update({ where: { id: kayit.id }, data: { durum, redNedeni: durum === 'reddedildi' ? (redNedeni || null) : kayit.redNedeni } });
    }
  });

  await logAudit(req, 'guncelle', 'iade', kayit.id, `Talep durumu: ${durum}`, { neden: redNedeni || null });

  // Tamamlandı + WhatsApp bilgilendirme (best-effort)
  if (durum === 'tamamlandi' && cfg.waBildirimAktif && kayit.customerTel) {
    const body = cfg.waSablon
      .replace(/\{ad\}/g, kayit.customerAd || 'Müşteri')
      .replace(/\{sipNo\}/g, kayit.sipNo || '')
      .replace(/\{tutar\}/g, Number(kayit.iadeTutar).toLocaleString('tr-TR') + ' TL');
    void enqueueIadeNotification(tenantId, { phone: kayit.customerTel, body });
  }
  res.json({ ok: true });
}));

// Talep sil
router.delete('/iade/:id', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const kayit = await prisma.iadeKayit.findFirst({ where: { id: req.params.id, tenantId } });
  if (!kayit) throw new ApiError(404, 'Talep bulunamadı.');
  if (kayit.islendi) throw new ApiError(422, 'Tamamlanmış (stok/bakiye işlenmiş) talep silinemez.');
  await prisma.iadeKayit.delete({ where: { id: kayit.id } });
  await logAudit(req, 'sil', 'iade', kayit.id, 'İade/değişim talebi silindi');
  res.json({ ok: true });
}));

// İade kayıtları listesi + istatistik (sayfa dashboard + müşteri raporu)
router.get('/iade', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { customerId, orderId, q, tur, durum, sebep, from, to } = req.query as Record<string, string>;
  const where: any = { tenantId };
  if (customerId) where.customerId = customerId;
  if (orderId) where.orderId = orderId;
  if (tur && (tur === 'iade' || tur === 'degisim')) where.tip = tur;
  if (durum) where.durum = durum;
  if (q) where.OR = [
    { sipNo: { contains: q, mode: 'insensitive' } },
    { customerAd: { contains: q, mode: 'insensitive' } },
    { customerTel: { contains: q } },
    { genelSebep: { contains: q, mode: 'insensitive' } },
  ];
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); where.createdAt.lte = d; }
  }
  let rows = await prisma.iadeKayit.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
  // Neden filtresi (item bazında — uygulama katmanında)
  if (sebep) rows = rows.filter((r) => (Array.isArray(r.items) ? (r.items as any[]) : []).some((it) => (it.sebep || r.genelSebep || '') === sebep));

  // İstatistikler (tüm tenant — filtreden bağımsız genel görünüm)
  const all = await prisma.iadeKayit.findMany({ where: { tenantId }, select: { tip: true, durum: true, iadeTutar: true, genelSebep: true, items: true } });
  const stats = {
    toplam: all.length,
    iade: all.filter((r) => r.tip === 'iade').length,
    degisim: all.filter((r) => r.tip === 'degisim').length,
    onay_bekliyor: all.filter((r) => r.durum === 'onay_bekliyor').length,
    islemde: all.filter((r) => r.durum === 'islemde').length,
    tamamlandi: all.filter((r) => r.durum === 'tamamlandi').length,
    reddedildi: all.filter((r) => r.durum === 'reddedildi').length,
    toplamTutar: all.reduce((s, r) => s + (Number(r.iadeTutar) || 0), 0),
  };
  // Neden dağılımı
  const nedenMap: Record<string, number> = {};
  for (const r of all) {
    const its = Array.isArray(r.items) ? (r.items as any[]) : [];
    if (its.length === 0) { const s = r.genelSebep || 'Belirtilmemiş'; nedenMap[s] = (nedenMap[s] || 0) + 1; }
    for (const it of its) { const s = it.sebep || r.genelSebep || 'Belirtilmemiş'; nedenMap[s] = (nedenMap[s] || 0) + 1; }
  }
  const nedenDagilimi = Object.entries(nedenMap).map(([sebep, count]) => ({ sebep, count })).sort((a, b) => b.count - a.count);

  res.json({ rows, stats, nedenDagilimi });
}));

// İade ayarları oku
router.get('/iade/settings', asyncHandler(async (req: Request, res: Response) => {
  res.json(await getIadeSettings(req.tenantId!));
}));

// İade ayarları kaydet
router.put('/iade/settings', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const b = req.body as any;
  const ss = await prisma.storeSetting.findUnique({ where: { tenantId }, select: { config: true } }).catch(() => null);
  const cfg: any = (ss?.config as any) || {};
  cfg.iade = {
    sebepler: Array.isArray(b.sebepler) ? b.sebepler.filter((x: any) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()) : undefined,
    defoKategoriAd: typeof b.defoKategoriAd === 'string' && b.defoKategoriAd.trim() ? b.defoKategoriAd.trim() : 'Defo',
    varsayilanYontem: b.varsayilanYontem === 'nakit' ? 'nakit' : 'bakiye',
    waBildirimAktif: !!b.waBildirimAktif,
    waSablon: typeof b.waSablon === 'string' ? b.waSablon : undefined,
  };
  await prisma.storeSetting.upsert({ where: { tenantId }, create: { tenantId, config: cfg }, update: { config: cfg } });
  await logAudit(req, 'guncelle', 'ayar', null, 'İade/değişim ayarları güncellendi');
  res.json(await getIadeSettings(tenantId));
}));

export default router;