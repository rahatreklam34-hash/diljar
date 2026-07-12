import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../lib/http';
import { nextOrderNo, logEvent } from './store.routes';
import { campaignAdjust, promoteWaitingStock } from './live.routes';
import bcrypt from 'bcryptjs';

const router = Router();

// Varsayılan kâr çarpanı: alış fiyatı × 2.10 = otomatik satış fiyatı
export const PRICE_MULT = 2.10;
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const norm = (s: string) => (s || '').toLowerCase().replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/^@/, '').trim();
const genToken = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
const genCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

// ─── Tedarikçi Yönetimi (admin) ──────────────────────────────────────────────

router.get('/suppliers', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const list = await prisma.supplier.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' } });
  res.json(list.map((s) => ({ ...s, pinHash: undefined })));
}));

router.post('/suppliers', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const { ad, pin } = req.body || {};
  if (!ad) throw new ApiError(400, 'Ad zorunludur');
  const rawPin = pin || genCode();
  const loginCode = genCode() + genCode();
  const pinHash = await bcrypt.hash(String(rawPin), 10);
  const s = await prisma.supplier.create({ data: { tenantId: t, ad, loginCode, pinHash } });
  res.status(201).json({ ...s, pinHash: undefined, loginCode, pin: rawPin });
}));

router.patch('/suppliers/:id', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const { aktif, ad } = req.body || {};
  const s = await prisma.supplier.updateMany({ where: { id: req.params.id, tenantId: t }, data: { ...(ad !== undefined ? { ad } : {}), ...(aktif !== undefined ? { aktif } : {}) } });
  res.json({ ok: true, count: s.count });
}));

router.delete('/suppliers/:id', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  await prisma.supplier.updateMany({ where: { id: req.params.id, tenantId: t }, data: { aktif: false } });
  res.json({ ok: true });
}));

// Tedarikçinin ürünleri + satışları (admin görünümü)
router.get('/suppliers/:id/products', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const prods = await prisma.freeProduct.findMany({ where: { tenantId: t, supplierId: req.params.id, aktif: true }, orderBy: { createdAt: 'desc' } });
  res.json(prods);
}));

router.get('/suppliers/:id/sales', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const orders = await prisma.liveOrder.findMany({ where: { tenantId: t, supplierId: req.params.id, drop: true, durum: { in: ['onaylandi', 'rezerve'] } }, orderBy: { createdAt: 'desc' } });
  // Ürün bazlı gruplama: adet + beden kırılımı + ciro (admin = satış tutarı)
  const map = new Map<string, { freeProductId: string | null; ad: string; image: string | null; toplam: number; bedenler: Record<string, number>; ciro: number; alisToplam: number }>();
  for (const o of orders) {
    const key = o.freeProductId || o.urun;
    if (!map.has(key)) map.set(key, { freeProductId: o.freeProductId || null, ad: o.urun, image: o.gorsel || null, toplam: 0, bedenler: {}, ciro: 0, alisToplam: 0 });
    const e = map.get(key)!;
    e.toplam++; e.ciro += o.tutar || 0; e.alisToplam += o.alis || 0;
    if (o.beden) e.bedenler[o.beden] = (e.bedenler[o.beden] || 0) + 1;
  }
  res.json([...map.values()].map((e) => ({ ...e, ciro: round2(e.ciro), alisToplam: round2(e.alisToplam) })));
}));

// Tedarikçi hesap özeti (borç / ödenen / kalan) + ödeme listesi (admin)
router.get('/suppliers/:id/account', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const sid = req.params.id;
  const orders = await prisma.liveOrder.findMany({ where: { tenantId: t, supplierId: sid, drop: true, durum: { in: ['onaylandi', 'rezerve'] } } });
  const borc = round2(orders.reduce((s, o) => s + (o.alis || 0), 0));
  const adet = orders.length;
  const payments = await prisma.supplierPayment.findMany({ where: { tenantId: t, supplierId: sid }, orderBy: { createdAt: 'desc' } });
  const odenen = round2(payments.reduce((s, p) => s + (p.tutar || 0), 0));
  res.json({ borc, odenen, kalan: round2(borc - odenen), adet, payments });
}));

router.post('/suppliers/:id/payments', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const { tutar, not } = req.body || {};
  const amt = Number(tutar) || 0;
  if (amt <= 0) throw new ApiError(400, 'Geçerli bir tutar girin');
  const p = await prisma.supplierPayment.create({ data: { tenantId: t, supplierId: req.params.id, tutar: round2(amt), not: not || null } });
  res.status(201).json(p);
}));

router.delete('/suppliers/:id/payments/:pid', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  await prisma.supplierPayment.deleteMany({ where: { id: req.params.pid, tenantId: t, supplierId: req.params.id } });
  res.json({ ok: true });
}));

// ─── Geçici Ürün CRUD ────────────────────────────────────────────────────────

router.get('/products', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const prods = await prisma.freeProduct.findMany({ where: { tenantId: t, aktif: true }, include: { supplier: { select: { ad: true } } }, orderBy: { createdAt: 'desc' } });
  res.json(prods.map((p) => ({ ...p, supplierAd: p.supplier?.ad || null })));
}));

// Toplu fiyat güncelleme (admin): çarpan ile (alış×çarpan) veya sabit satış fiyatı
router.post('/products/bulk-price', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const { ids, multiplier, satisFiyat } = req.body || {};
  const where: any = { tenantId: t, aktif: true };
  if (Array.isArray(ids) && ids.length > 0) where.id = { in: ids };
  const prods = await prisma.freeProduct.findMany({ where });
  let count = 0;
  for (const p of prods) {
    let nf: number;
    if (multiplier !== undefined && multiplier !== null && Number(multiplier) > 0) nf = round2((p.alisFiyat || 0) * Number(multiplier));
    else if (satisFiyat !== undefined && Number(satisFiyat) >= 0) nf = round2(Number(satisFiyat));
    else continue;
    await prisma.freeProduct.update({ where: { id: p.id }, data: { satisFiyat: nf } });
    count++;
  }
  res.json({ ok: true, count });
}));

router.post('/products/bulk-edit', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const { ids, ad, marka, cinsiyet } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) throw new ApiError(400, 'Ürün seçilmedi');
  const setAd = typeof ad === 'string' && ad.trim() !== '';
  const setMarka = typeof marka === 'string' && marka.trim() !== '';
  const setCinsiyet = typeof cinsiyet === 'string' && cinsiyet.trim() !== '';
  if (!setAd && !setMarka && !setCinsiyet) throw new ApiError(400, 'Değiştirilecek alan yok');
  const data: any = {};
  if (setAd) data.ad = ad.trim();
  if (setMarka) data.marka = marka.trim();
  if (setCinsiyet) data.cinsiyet = cinsiyet.trim();
  const r = await prisma.freeProduct.updateMany({ where: { tenantId: t, aktif: true, id: { in: ids } }, data });
  res.json({ ok: true, count: r.count });
}));

router.post('/products', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const { ad, images, bedenler, satisFiyat, alisFiyat, supplierId, variations, cinsiyet, aciklama } = req.body || {};
  if (!ad) throw new ApiError(400, 'Ürün adı zorunludur');

  // Satış kodu havuzundan çek
  let salesCode: string | null = null;
  const sc = await prisma.salesCode.findFirst({ where: { tenantId: t, used: false }, orderBy: { createdAt: 'asc' } });
  if (sc) { salesCode = sc.code; await prisma.salesCode.update({ where: { id: sc.id }, data: { used: true } }); }

  // Varyasyonlar: ya doğrudan gönderilir [{deger,stok}] ya da virgüllü beden string'inden üretilir
  let vars: { deger: string; stok: number }[] = [];
  if (Array.isArray(variations) && variations.length > 0) {
    vars = variations.map((v: any) => ({ deger: String(v.deger || v), stok: Number(v.stok) || 1 }));
  } else if (bedenler) {
    vars = String(bedenler).split(',').map((b) => b.trim()).filter(Boolean).map((b) => ({ deger: b, stok: 1 }));
  }

  const alis = Number(alisFiyat) || 0;
  // Satış fiyatı verilmediyse otomatik: alış × 2.10
  const satis = Number(satisFiyat) > 0 ? round2(Number(satisFiyat)) : round2(alis * PRICE_MULT);

  const p = await prisma.freeProduct.create({
    data: {
      tenantId: t,
      supplierId: supplierId || null,
      ad,
      salesCode,
      cinsiyet: cinsiyet || null,
      aciklama: aciklama || null,
      images: images || [],
      variations: vars,
      alisFiyat: alis,
      satisFiyat: satis,
    },
  });
  await promoteWaitingStock(t, { freeProductId: p.id }).catch((e) => console.error('[promoteWaitingStock]', e));
  res.status(201).json(p);
}));

router.patch('/products/:id', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const { ad, images, variations, satisFiyat, alisFiyat, aktif, cinsiyet, aciklama, marka, kategoriId } = req.body || {};
  const data: any = {};
  if (ad !== undefined) data.ad = ad;
  if (cinsiyet !== undefined) data.cinsiyet = cinsiyet || null;
  if (marka !== undefined) data.marka = marka || null;
  if (kategoriId !== undefined) data.kategoriId = kategoriId || null;
  if (aciklama !== undefined) data.aciklama = aciklama || null;
  if (images !== undefined) data.images = images;
  if (variations !== undefined) data.variations = variations;
  if (satisFiyat !== undefined) data.satisFiyat = round2(Number(satisFiyat));
  if (alisFiyat !== undefined) {
    data.alisFiyat = Number(alisFiyat);
    // Satış fiyatı açıkça gönderilmediyse alış değişince otomatik yeniden hesapla
    if (satisFiyat === undefined) data.satisFiyat = round2((Number(alisFiyat) || 0) * PRICE_MULT);
  }
  if (aktif !== undefined) data.aktif = aktif;
  await prisma.freeProduct.updateMany({ where: { id: req.params.id, tenantId: t }, data });
  const p = await prisma.freeProduct.findFirst({ where: { id: req.params.id, tenantId: t } });
  await promoteWaitingStock(t, { freeProductId: req.params.id }).catch((e) => console.error('[promoteWaitingStock]', e));
  res.json(p);
}));

router.delete('/products/:id', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  await prisma.freeProduct.updateMany({ where: { id: req.params.id, tenantId: t }, data: { aktif: false } });
  res.json({ ok: true });
}));

// ─── DROPSHOPING: Bekleyen Siparişler ────────────────────────────────────────
// Tedarikçiye ait (drop) ürünlerden yapılan satışlar. Admin teslim alınca kapatır.

router.get('/pending-orders', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const closed = req.query.closed === '1' || req.query.closed === 'true';
  const orders = await prisma.liveOrder.findMany({
    where: { tenantId: t, drop: true, durum: { in: ['onaylandi', 'rezerve'] }, teslimAlindi: closed },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  // Tedarikçi adlarını ekle
  const supIds = [...new Set(orders.map((o) => o.supplierId).filter(Boolean) as string[])];
  const sups = supIds.length ? await prisma.supplier.findMany({ where: { tenantId: t, id: { in: supIds } }, select: { id: true, ad: true } }) : [];
  const supMap = new Map(sups.map((s) => [s.id, s.ad]));
  res.json(orders.map((o) => ({
    id: o.id,
    urun: o.urun,
    beden: o.beden,
    user: o.user,
    gorsel: o.gorsel,
    tutar: o.tutar,
    alis: o.alis,
    durum: o.durum,
    teslimAlindi: o.teslimAlindi,
    supplierId: o.supplierId,
    supplierAd: o.supplierId ? (supMap.get(o.supplierId) || null) : null,
    createdAt: o.createdAt,
  })));
}));

router.post('/pending-orders/:id/close', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  await prisma.liveOrder.updateMany({ where: { id: req.params.id, tenantId: t, drop: true }, data: { teslimAlindi: true } });
  res.json({ ok: true });
}));

router.post('/pending-orders/:id/reopen', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  await prisma.liveOrder.updateMany({ where: { id: req.params.id, tenantId: t, drop: true }, data: { teslimAlindi: false } });
  res.json({ ok: true });
}));

// ─── Tedarikçi Login (public — JWT üretir) ───────────────────────────────────
// NOT: Bu uç /api/v1/public/supplier/login altına da mount edilecek.
// Burada da tutuyoruz ki admin token ile test edilebilsin.
router.post('/supplier-login', asyncHandler(async (req: Request, res: Response) => {
  const { loginCode, pin } = req.body || {};
  if (!loginCode || !pin) throw new ApiError(400, 'loginCode ve pin zorunludur');
  const s = await prisma.supplier.findFirst({ where: { loginCode, aktif: true } });
  if (!s) throw new ApiError(401, 'Geçersiz giriş kodu');
  const ok = await bcrypt.compare(String(pin), s.pinHash);
  if (!ok) throw new ApiError(401, 'Hatalı PIN');
  const jwt = await import('jsonwebtoken');
  const token = jwt.default.sign({ supplierId: s.id, tenantId: s.tenantId, type: 'supplier' }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });
  res.json({ token, supplier: { id: s.id, ad: s.ad } });
}));

// ─── Paylaşılabilir Katalog (admin) ──────────────────────────────────────────

router.get('/catalogs', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const list = await prisma.freeCatalog.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' } });
  res.json(list.map((c) => ({ ...c, urunSayisi: Array.isArray(c.productIds) ? (c.productIds as any[]).length : 0 })));
}));

router.post('/catalogs', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const { ad, whatsapp, productIds } = req.body || {};
  if (!ad) throw new ApiError(400, 'Katalog adı zorunludur');
  const c = await prisma.freeCatalog.create({
    data: {
      tenantId: t,
      ad: String(ad),
      token: genToken(),
      whatsapp: whatsapp ? String(whatsapp) : '05334413472',
      productIds: Array.isArray(productIds) ? productIds : [],
    },
  });
  res.status(201).json(c);
}));

router.patch('/catalogs/:id', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const { ad, aktif, whatsapp, productIds } = req.body || {};
  const data: any = {};
  if (ad !== undefined) data.ad = String(ad);
  if (aktif !== undefined) data.aktif = !!aktif;
  if (whatsapp !== undefined) data.whatsapp = whatsapp ? String(whatsapp) : null;
  if (productIds !== undefined) data.productIds = Array.isArray(productIds) ? productIds : [];
  await prisma.freeCatalog.updateMany({ where: { id: req.params.id, tenantId: t }, data });
  const c = await prisma.freeCatalog.findFirst({ where: { id: req.params.id, tenantId: t } });
  res.json(c);
}));

router.delete('/catalogs/:id', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  await prisma.freeCatalog.deleteMany({ where: { id: req.params.id, tenantId: t } });
  res.json({ ok: true });
}));

export default router;
