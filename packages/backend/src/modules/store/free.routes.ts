import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../lib/http';
import { nextOrderNo, logEvent } from './store.routes';
import { campaignAdjust } from './live.routes';
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
  const orders = await prisma.freeOrder.findMany({ where: { tenantId: t, supplierId: req.params.id, durum: { in: ['onaylandi', 'rezerve'] } }, orderBy: { createdAt: 'desc' } });
  res.json(orders);
}));

// Tedarikçi hesap özeti (borç / ödenen / kalan) + ödeme listesi (admin)
router.get('/suppliers/:id/account', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const sid = req.params.id;
  const orders = await prisma.freeOrder.findMany({ where: { tenantId: t, supplierId: sid, durum: { in: ['onaylandi', 'rezerve'] } } });
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

router.post('/products', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const { ad, images, bedenler, satisFiyat, alisFiyat, supplierId, variations } = req.body || {};
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
      images: images || [],
      variations: vars,
      alisFiyat: alis,
      satisFiyat: satis,
    },
  });
  res.status(201).json(p);
}));

router.patch('/products/:id', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const { ad, images, variations, satisFiyat, alisFiyat, aktif } = req.body || {};
  const data: any = {};
  if (ad !== undefined) data.ad = ad;
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
  res.json(p);
}));

router.delete('/products/:id', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  await prisma.freeProduct.updateMany({ where: { id: req.params.id, tenantId: t }, data: { aktif: false } });
  res.json({ ok: true });
}));

// ─── Yayın Yönetimi ──────────────────────────────────────────────────────────

router.get('/active', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const stream = await prisma.freeStream.findFirst({ where: { tenantId: t, status: 'active' }, orderBy: { startedAt: 'desc' } });
  if (!stream) return res.json({ stream: null, orders: [] });
  const orders = await prisma.freeOrder.findMany({ where: { tenantId: t, streamId: stream.id }, orderBy: { createdAt: 'desc' } });
  res.json({ stream, orders });
}));

router.post('/start', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  await prisma.freeStream.updateMany({ where: { tenantId: t, status: 'active' }, data: { status: 'ended', endedAt: new Date() } });
  const s = await prisma.freeStream.create({ data: { tenantId: t, status: 'active', baslik: req.body?.baslik || null } });
  res.status(201).json(s);
}));

router.post('/end', asyncHandler(async (req: Request, res: Response) => {
  await prisma.freeStream.updateMany({ where: { tenantId: req.tenantId!, status: 'active' }, data: { status: 'ended', endedAt: new Date() } });
  res.json({ ok: true });
}));

router.get('/history', asyncHandler(async (req: Request, res: Response) => {
  const streams = await prisma.freeStream.findMany({ where: { tenantId: req.tenantId!, status: 'ended' }, orderBy: { endedAt: 'desc' }, include: { freeOrders: true }, take: 50 });
  const data = streams.map((s) => {
    const onayli = s.freeOrders.filter((o) => o.durum === 'onaylandi');
    const ciro = onayli.reduce((x, o) => x + o.tutar, 0);
    const kar = onayli.reduce((x, o) => x + (o.tutar - o.alis), 0);
    return { id: s.id, baslik: s.baslik, startedAt: s.startedAt, endedAt: s.endedAt, siparis: onayli.length, toplamSatir: s.freeOrders.length, ciro, kar };
  });
  res.json(data);
}));

// ─── Satış Extresi (anlık) ───────────────────────────────────────────────────

router.get('/extract', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const streamId = req.query.streamId as string | undefined;
  let where: any = { tenantId: t, durum: { in: ['onaylandi', 'rezerve'] } };
  if (streamId) { where.streamId = streamId; }
  else {
    const active = await prisma.freeStream.findFirst({ where: { tenantId: t, status: 'active' }, orderBy: { startedAt: 'desc' } });
    if (active) where.streamId = active.id;
  }
  const orders = await prisma.freeOrder.findMany({ where, include: { freeProduct: true } });
  // Ürün bazlı gruplama
  const map = new Map<string, { ad: string; image: string | null; toplam: number; bedenler: Record<string, number>; tutar: number; alis: number }>();
  for (const o of orders) {
    const key = o.freeProductId || o.urun;
    const img = o.freeProduct ? (Array.isArray(o.freeProduct.images) ? (o.freeProduct.images as any[])[0] || null : null) : null;
    if (!map.has(key)) map.set(key, { ad: o.urun, image: img, toplam: 0, bedenler: {}, tutar: 0, alis: 0 });
    const e = map.get(key)!;
    e.toplam++;
    e.tutar += o.tutar;
    e.alis += o.alis;
    if (o.beden) e.bedenler[o.beden] = (e.bedenler[o.beden] || 0) + 1;
  }
  res.json([...map.values()]);
}));

// ─── Sipariş Ekle ────────────────────────────────────────────────────────────

async function getFreeOrCreateCart(tx: any, tenantId: string, customerId: string | null, handle: string) {
  let cart = customerId
    ? await tx.storeOrder.findFirst({ where: { tenantId, durum: 'sepet', kanal: 'serbest', customerId } })
    : await tx.storeOrder.findFirst({ where: { tenantId, durum: 'sepet', kanal: 'serbest', musteriHandle: handle } });
  if (!cart) {
    const seq = await nextOrderNo(tx, tenantId);
    cart = await tx.storeOrder.create({ data: { tenantId, ...seq, durum: 'sepet', kanal: 'serbest', customerId: customerId || null, musteriHandle: handle || null, token: genToken(), items: [], araToplam: 0, indirim: 0, toplam: 0 } });
  }
  return cart;
}

async function findCustomerByHandle(tenantId: string, handle: string) {
  const h = norm(handle);
  const tel = handle.replace(/\D/g, '');
  if (!h && !tel) return null;
  const list = await prisma.customer.findMany({ where: { tenantId } });
  return list.find((c) => (h && (norm(c.instagram || '') === h || norm(c.ad || '') === h)) || (tel.length >= 7 && (c.telefon || '').replace(/\D/g, '') === tel)) || null;
}

router.post('/order', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const { streamId, user, beden, freeProductId, urun, fiyatOverride } = req.body || {};
  if (!streamId) throw new ApiError(400, 'Aktif yayın yok');

  const customer = await findCustomerByHandle(t, user || '');
  let logCartId: string | null = null; let logAd = '';

  const fo = await prisma.$transaction(async (tx) => {
    let durum = 'rezerve'; let tutar = 0; let alis = 0; let urunAd = urun || ''; let storeOrderId: string | null = null;
    let supplierId: string | null = null;
    let gorsel: string | null = null;

    if (freeProductId) {
      const fp = await tx.freeProduct.findFirst({ where: { id: freeProductId, tenantId: t } });
      if (fp) {
        urunAd = fp.ad; alis = fp.alisFiyat || 0; tutar = fp.satisFiyat || 0;
        supplierId = fp.supplierId || null;
        gorsel = Array.isArray(fp.images) ? ((fp.images as any[])[0] || null) : null;
        const ov = Number(fiyatOverride) || 0;
        if (ov > 0) tutar = ov;

        // Geçici stok düşür (JSON varyasyon)
        let okStock = false;
        const vars: { deger: string; stok: number }[] = Array.isArray(fp.variations) ? (fp.variations as any) : [];
        if (beden) {
          const idx = vars.findIndex((v) => v.deger === beden);
          if (idx >= 0 && vars[idx].stok >= 1) {
            vars[idx].stok--;
            await tx.freeProduct.update({ where: { id: fp.id }, data: { variations: vars } });
            okStock = true;
          }
        } else if (vars.length === 0) {
          okStock = true; // bedensiz ürün
        } else {
          // Herhangi bir stoklu beden var mı?
          okStock = vars.some((v) => v.stok >= 1);
        }

        if (!okStock) durum = 'stok_yok';
        else durum = customer ? 'onaylandi' : 'rezerve';
      }
    }

    const fo = await tx.freeOrder.create({ data: { tenantId: t, streamId, user, urun: urunAd, beden: beden || null, freeProductId: freeProductId || null, supplierId, durum, tutar, alis, storeOrderId: null } });

    if (durum === 'onaylandi' || durum === 'rezerve') {
      const cart = await getFreeOrCreateCart(tx, t, customer?.id || null, norm(user || ''));
      const items: any[] = Array.isArray(cart.items) ? (cart.items as any) : [];
      items.push({ freeOrderId: fo.id, freeProductId, ad: urunAd + (beden ? ` (${beden})` : ''), gorsel, varyasyon: beden || null, adet: 1, fiyat: tutar, durum });
      const tot = await campaignAdjust(tx, t, items);
      await tx.storeOrder.update({ where: { id: cart.id }, data: { items, ...tot } });
      storeOrderId = cart.id;
      await tx.freeOrder.update({ where: { id: fo.id }, data: { storeOrderId } });
      logCartId = cart.id; logAd = urunAd + (beden ? ` (${beden})` : '');
    }
    return fo;
  });

  if (logCartId) await logEvent(t, logCartId, user || 'Serbest Satış', 'Ürün eklendi (serbest satış)', logAd);
  res.status(201).json(fo);
}));

// ─── Sipariş İptal ───────────────────────────────────────────────────────────

router.post('/order/:id/iptal', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  let streamId = '';
  let logCartId: string | null = null; let logAd = '';

  await prisma.$transaction(async (tx) => {
    const fo = await tx.freeOrder.findFirst({ where: { id: req.params.id, tenantId: t } });
    if (!fo) return;
    streamId = fo.streamId || '';

    if ((fo.durum === 'onaylandi' || fo.durum === 'rezerve') && fo.freeProductId) {
      // Geçici stoğu iade et
      const fp = await tx.freeProduct.findFirst({ where: { id: fo.freeProductId, tenantId: t } });
      if (fp && fo.beden) {
        const vars: { deger: string; stok: number }[] = Array.isArray(fp.variations) ? (fp.variations as any) : [];
        const idx = vars.findIndex((v) => v.deger === fo.beden);
        if (idx >= 0) { vars[idx].stok++; await tx.freeProduct.update({ where: { id: fp.id }, data: { variations: vars } }); }
      }
    }

    if (fo.storeOrderId) {
      const cart = await tx.storeOrder.findFirst({ where: { id: fo.storeOrderId, tenantId: t } });
      if (cart) {
        const items = (Array.isArray(cart.items) ? (cart.items as any) : []).filter((it: any) => it.freeOrderId !== fo.id);
        if (items.length === 0 && cart.durum === 'sepet') {
          await tx.freeOrder.updateMany({ where: { storeOrderId: cart.id }, data: { storeOrderId: null } });
          await tx.storeOrder.delete({ where: { id: cart.id } });
        } else {
          await tx.storeOrder.update({ where: { id: cart.id }, data: { items, ...(await campaignAdjust(tx, t, items)) } });
        }
        logCartId = cart.id; logAd = fo.urun + (fo.beden ? ` (${fo.beden})` : '');
      }
    }
    await tx.freeOrder.update({ where: { id: fo.id }, data: { durum: 'iptal', storeOrderId: null } });
  });

  if (logCartId) await logEvent(t, logCartId, req.body?.user || 'Serbest Satış', 'Ürün iptal edildi (serbest satış)', logAd);
  const orders = streamId ? await prisma.freeOrder.findMany({ where: { tenantId: t, streamId }, orderBy: { createdAt: 'desc' } }) : [];
  res.json({ ok: true, orders });
}));

// ─── Hızlı Müşteri Kaydı + Rezerve Onayla ───────────────────────────────────

router.post('/musteri', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const { ad, telefon, instagram } = req.body || {};
  if (!telefon) throw new ApiError(422, 'Telefon zorunludur');
  const count = await prisma.customer.count({ where: { tenantId: t } });
  const customer = await prisma.customer.create({ data: { tenantId: t, musteriNo: 1000 + count + 1, ad: ad || instagram || telefon, telefon, instagram: instagram || null, not: 'Serbest satış kaydı' } });
  // Rezerve serbest siparişleri onayla
  const handles = [customer.instagram, customer.ad].filter(Boolean).map((x) => norm(x as string));
  const tel = (customer.telefon || '').replace(/\D/g, '');
  const reserved = await prisma.freeOrder.findMany({ where: { tenantId: t, durum: 'rezerve' } });
  for (const fo of reserved) {
    const h = norm(fo.user);
    if (handles.includes(h) || (tel.length >= 7 && fo.user.replace(/\D/g, '') === tel)) {
      await prisma.freeOrder.update({ where: { id: fo.id }, data: { durum: 'onaylandi' } });
      if (fo.storeOrderId) {
        const cart = await prisma.storeOrder.findFirst({ where: { id: fo.storeOrderId, tenantId: t } });
        if (cart) {
          const items = (Array.isArray(cart.items) ? (cart.items as any) : []).map((it: any) => it.freeOrderId === fo.id ? { ...it, durum: 'onaylandi' } : it);
          const adj = await campaignAdjust(prisma, t, items);
          await prisma.storeOrder.update({ where: { id: cart.id }, data: { items, araToplam: adj.araToplam, indirim: adj.indirim, kampanyalar: adj.kampanyalar, toplam: Math.max(0, adj.toplam + (cart.kargoUcreti || 0)), customerId: customer.id } });
        }
      }
    }
  }
  res.status(201).json(customer);
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

export default router;
