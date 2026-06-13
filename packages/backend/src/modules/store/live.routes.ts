import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../lib/http';
import { nextOrderNo, logEvent } from './store.routes';
import { getFbFeed, extractVideoId, clearFbState, getIgFeed, clearIgState } from './fbLive';
import { notifyOrderSms } from '../sms/netgsm.service';
import { env } from '../../config/env';

const router = Router();

const norm = (s: string) => (s || '').toLowerCase().replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/^@/, '').trim();
const genToken = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

async function findCustomerByHandle(tenantId: string, handle: string) {
  const h = norm(handle);
  const tel = handle.replace(/\D/g, '');
  if (!h && !tel) return null;
  const list = await prisma.customer.findMany({ where: { tenantId } });
  return list.find((c) => (h && (norm(c.instagram || '') === h || norm(c.ad || '') === h)) || (tel.length >= 7 && (c.telefon || '').replace(/\D/g, '') === tel)) || null;
}

// Aktif yayın kampanyalarını sepete uygula -> { araToplam, indirim, toplam, kampanyalar }
// ÖNEMLİ: Kampanya şartı (adet/tutar) ve indirim YALNIZCA onaylanmış kalemlerden hesaplanır.
// Rezerve / iptal / stok_yok / riskli kalemler kampanya şartına sayılmaz.
// (Sepete zaten yalnız onaylandi/rezerve eklenir; burada rezerve de elenir. 'durum' alanı
//  olmayan eski/online kalemler geriye dönük uyum için onaylandı varsayılır.)
export async function campaignAdjust(tx: any, tenantId: string, items: any[]) {
  const ara = items.reduce((s: number, it: any) => s + (Number(it.fiyat) || 0) * (Number(it.adet) || 1), 0);
  const valid = items.filter((it: any) => !it.durum || it.durum === 'onaylandi');
  let camps: any[] = [];
  try { camps = await tx.campaign.findMany({ where: { tenantId, aktif: true } }); } catch { camps = []; }
  if (!camps.length || !valid.length) return { araToplam: ara, indirim: 0, toplam: ara, kampanyalar: [] };
  const pids = [...new Set(valid.map((i: any) => i.productId).filter(Boolean))] as string[];
  const prods = pids.length ? await tx.product.findMany({ where: { tenantId, id: { in: pids } }, select: { id: true, kategoriId: true } }) : [];
  const catOf = new Map(prods.map((p: any) => [p.id, p.kategoriId]));
  const inScope = (c: any, it: any) => c.kapsam === 'hepsi' || (c.kapsam === 'urun' && it.productId === c.productId) || (c.kapsam === 'kategori' && catOf.get(it.productId) === c.kategoriId);
  const validAra = valid.reduce((s: number, it: any) => s + (Number(it.fiyat) || 0) * (Number(it.adet) || 1), 0);
  let indirim = 0;
  const kampanyalar: any[] = [];
  for (const c of camps) {
    let kIndirim = 0;
    if (c.tip === 'sepet_tutar') {
      if ((c.minTutar || 0) > 0 && validAra >= (c.minTutar || 0)) kIndirim = c.indirimTip === 'yuzde' ? validAra * c.indirimDeger / 100 : c.indirimDeger;
    } else if (c.tip === 'urun_adet') {
      // kapsamdaki onaylanmış kalemlerin toplam adedi ve tutarı
      const scoped = valid.filter((it: any) => it.productId && inScope(c, it));
      const toplamAdet = scoped.reduce((s: number, it: any) => s + (Number(it.adet) || 1), 0);
      const toplamTutar = scoped.reduce((s: number, it: any) => s + (Number(it.fiyat) || 0) * (Number(it.adet) || 1), 0);
      if (toplamAdet >= (c.minAdet || 1) && scoped.length > 0) {
        kIndirim = c.indirimTip === 'yuzde' ? toplamTutar * c.indirimDeger / 100 : c.indirimDeger;
      }
    }
    if (kIndirim > 0) {
      kIndirim = Math.round(kIndirim * 100) / 100;
      indirim += kIndirim;
      kampanyalar.push({ id: c.id, ad: c.ad, indirim: kIndirim, ozet: c.indirimTip === 'yuzde' ? `%${c.indirimDeger}` : `${c.indirimDeger}₺` });
    }
  }
  indirim = Math.min(Math.round(indirim * 100) / 100, ara);
  return { araToplam: ara, indirim, toplam: Math.max(0, ara - indirim), kampanyalar };
}

// Tenant'in acik (durum='sepet') siparis sepetlerini, kampanya tablosundaki son durumla yeniden hesapla.
// Kampanya pasiflestirildiginde/silindiginde/duzenlendiginde mevcut sepetlerdeki indirim guncel kalsin diye kullanilir.
export async function recalcOpenCarts(tx: any, tenantId: string) {
  const carts = await tx.storeOrder.findMany({ where: { tenantId, durum: 'sepet' } });
  for (const cart of carts) {
    const items: any[] = Array.isArray(cart.items) ? (cart.items as any) : [];
    const tot = await campaignAdjust(tx, tenantId, items);
    if (tot.araToplam !== cart.araToplam || tot.indirim !== cart.indirim || tot.toplam !== cart.toplam) {
      await tx.storeOrder.update({ where: { id: cart.id }, data: tot });
    }
  }
}

// Musterinin acik sepetini bul/olustur
async function getOrCreateCart(tx: any, tenantId: string, customerId: string | null, handle: string) {
  let cart = customerId
    ? await tx.storeOrder.findFirst({ where: { tenantId, durum: 'sepet', kanal: 'canli', customerId } })
    : await tx.storeOrder.findFirst({ where: { tenantId, durum: 'sepet', kanal: 'canli', musteriHandle: handle } });
  if (!cart) {
    const seq = await nextOrderNo(tx, tenantId);
    cart = await tx.storeOrder.create({ data: { tenantId, ...seq, durum: 'sepet', kanal: 'canli', customerId: customerId || null, musteriHandle: handle || null, token: genToken(), items: [], araToplam: 0, indirim: 0, toplam: 0 } });
  }
  return cart;
}

// Aktif yayin + siparisleri
router.get('/active', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const stream = await prisma.liveStream.findFirst({ where: { tenantId: t, status: 'active' }, orderBy: { startedAt: 'desc' } });
  if (!stream) return res.json({ stream: null, orders: [] });
  const orders = await prisma.liveOrder.findMany({ where: { tenantId: t, streamId: stream.id }, orderBy: { createdAt: 'desc' } });
  res.json({ stream, orders });
}));

router.post('/start', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  await prisma.liveStream.updateMany({ where: { tenantId: t, status: 'active' }, data: { status: 'ended', endedAt: new Date() } });
  const s = await prisma.liveStream.create({ data: { tenantId: t, status: 'active', baslik: req.body?.baslik || null } });
  // Kayıtlı Instagram token varsa yeni yayına otomatik bağla (her seferinde girme derdi yok)
  try {
    const ss = await prisma.storeSetting.findUnique({ where: { tenantId: t }, select: { igTokenSaved: true, igUserIdSaved: true } });
    if (ss?.igTokenSaved && ss?.igUserIdSaved) {
      clearIgState(s.id);
      await prisma.liveStream.update({ where: { id: s.id }, data: { igUserId: ss.igUserIdSaved, igToken: ss.igTokenSaved, igSince: new Date(Date.now() - 60 * 1000) } });
    }
  } catch { /* yoksa devam */ }
  res.status(201).json(s);
}));

router.post('/end', asyncHandler(async (req: Request, res: Response) => {
  await prisma.liveStream.updateMany({ where: { tenantId: req.tenantId!, status: 'active' }, data: { status: 'ended', endedAt: new Date() } });
  res.json({ ok: true });
}));

router.get('/history', asyncHandler(async (req: Request, res: Response) => {
  const streams = await prisma.liveStream.findMany({ where: { tenantId: req.tenantId!, status: 'ended' }, orderBy: { endedAt: 'desc' }, include: { orders: true }, take: 50 });
  const data = streams.map((s) => {
    const onayli = s.orders.filter((o) => o.durum === 'onaylandi');
    const ciro = onayli.reduce((x, o) => x + o.tutar, 0);
    const kar = onayli.reduce((x, o) => x + (o.tutar - o.alis), 0);
    return { id: s.id, baslik: s.baslik, startedAt: s.startedAt, endedAt: s.endedAt, siparis: onayli.length, toplamSatir: s.orders.length, ciro, kar };
  });
  res.json(data);
}));

// Yayin siparisi olustur (musteri eslesirse onaylandi, yoksa rezerve) + sepete ekle.
// Hem REST /order ucu hem de Facebook canli yorum poller'i bu fonksiyonu kullanir.
export async function placeLiveOrder(t: string, payload: any) {
  const { streamId, user, kod, beden, productId, variation, urun, saticiAd, fiyatOverride, freeProductId } = payload || {};
  if (!streamId) throw new ApiError(400, 'Aktif yayin yok');

  const customer = await findCustomerByHandle(t, user || '');

  let logCartId: string | null = null; let logAd = '';
  let smsInfo: { token: string; no: string; tutar: number; urun: string; beden: string; kod: string } | null = null;
  let lowStockSms: { urun: string; beden: string; kod: string } | null = null;
  const lo = await prisma.$transaction(async (tx) => {
    let durum = 'riskli'; let tutar = 0; let alis = 0; let urunAd = urun || kod; let storeOrderId: string | null = null;
    let drop = false; let supplierId: string | null = null; let gorsel: string | null = null;
    if (productId) {
      const p = await tx.product.findFirst({ where: { id: productId, tenantId: t } });
      if (p) {
        urunAd = p.ad; alis = p.alisFiyat || 0; tutar = p.satisFiyat || 0;
        let okStock = false;
        if (variation) {
          const v = await tx.productVariation.findFirst({ where: { productId, tenantId: t, deger: variation } });
          if (v) { tutar += v.ekFiyat || 0; if (v.stok >= 1) { await tx.productVariation.update({ where: { id: v.id }, data: { stok: { decrement: 1 } } }); okStock = true; } }
        } else if ((p.stokAdeti || 0) >= 1) okStock = true;
        const ov = Number(fiyatOverride) || 0;
        if (ov > 0) tutar = ov;
        if (okStock) {
          await tx.product.update({ where: { id: p.id }, data: { stokAdeti: { decrement: 1 } } });
          // Kayitli musteri -> onaylandi, degilse rezerve
          durum = customer ? 'onaylandi' : 'rezerve';
        } else {
          durum = 'stok_yok';
        }
      }
    } else if (freeProductId) {
      const fp = await tx.freeProduct.findFirst({ where: { id: freeProductId, tenantId: t } });
      if (fp) {
        urunAd = fp.ad; alis = fp.alisFiyat || 0; tutar = fp.satisFiyat || 0;
        drop = true; supplierId = fp.supplierId || null;
        const imgs = Array.isArray(fp.images) ? (fp.images as any[]) : [];
        gorsel = imgs.length ? imgs[0] : null;
        const vars: any[] = Array.isArray(fp.variations) ? (fp.variations as any[]) : [];
        const target = variation || beden || null;
        let okStock = false;
        if (target) {
          const idx = vars.findIndex((v) => v.deger === target);
          if (idx >= 0 && (Number(vars[idx].stok) || 0) >= 1) { vars[idx].stok = (Number(vars[idx].stok) || 0) - 1; okStock = true; }
        } else if (vars.length === 0) {
          okStock = true;
        }
        const ov = Number(fiyatOverride) || 0;
        if (ov > 0) tutar = ov;
        if (okStock) {
          await tx.freeProduct.update({ where: { id: fp.id }, data: { variations: vars } });
          durum = customer ? 'onaylandi' : 'rezerve';
        } else {
          durum = 'stok_yok';
        }
      }
    }

    const lord = await tx.liveOrder.create({ data: { tenantId: t, streamId, user, kod: kod || '', urun: urunAd, beden: beden || null, productId: productId || null, variation: variation || null, saticiAd: saticiAd || null, durum, tutar, alis, storeOrderId: null, freeProductId: freeProductId || null, supplierId, drop, gorsel } });

    // Onaylandi/rezerve ise sepete ekle
    if (durum === 'onaylandi' || durum === 'rezerve') {
      const cart = await getOrCreateCart(tx, t, customer?.id || null, norm(user || ''));
      const items: any[] = Array.isArray(cart.items) ? (cart.items as any) : [];
      items.push({ liveOrderId: lord.id, productId, freeProductId: freeProductId || null, drop, gorsel, ad: urunAd + (beden ? ` (${beden})` : ''), varyasyon: variation || beden || null, kod: kod || null, adet: 1, fiyat: tutar, stokDusuldu: true, durum });
      const tot = await campaignAdjust(tx, t, items);
      await tx.storeOrder.update({ where: { id: cart.id }, data: { items, ...tot } });
      storeOrderId = cart.id;
      await tx.liveOrder.update({ where: { id: lord.id }, data: { storeOrderId } });
      logCartId = cart.id; logAd = urunAd + (beden ? ` (${beden})` : '');
      // Sadece kayitli musteri eslesip onaylandiginda onay SMS'i hazirla
      if (durum === 'onaylandi' && customer?.telefon) {
        const cno = (cart.orderNo != null) ? `${cart.orderYil}-${String(cart.orderNo).padStart(3, '0')}` : String(cart.id).slice(-5);
        smsInfo = { token: cart.token, no: cno, tutar: tutar, urun: urunAd, beden: beden || variation || '', kod: kod || '' };
      }
    }
    // Kayitli musteri eslesti ama stok yetersiz -> yetersiz stok SMS'i hazirla
    if (durum === 'stok_yok' && customer?.telefon) {
      lowStockSms = { urun: urunAd, beden: beden || variation || '', kod: kod || '' };
    }
    return lord;
  });
  if (logCartId) await logEvent(t, logCartId, user || 'Canlı Yayın', 'Ürün eklendi (canlı yayın)', logAd);
  // Onay SMS'i (sepet linki ile) — transaction disinda, sessiz
  if (smsInfo && customer?.telefon) {
    try {
      const tnt = await prisma.tenant.findUnique({ where: { id: t }, select: { name: true } });
      const link = `${env.APP_DOMAIN}/sepet/${(smsInfo as any).token}`;
      void notifyOrderSms(t, 'approved', {
        phone: customer.telefon, ad: customer.ad, no: (smsInfo as any).no, tutar: (smsInfo as any).tutar,
        firma: tnt?.name || '', kullaniciadi: customer.instagram || '', instagram: customer.instagram || '',
        durum: 'Onaylandı', urun: (smsInfo as any).urun, beden: (smsInfo as any).beden, kod: (smsInfo as any).kod, sepetLink: link,
      });
    } catch (e: any) { console.error('[live SMS]', String(e?.message || e)); }
  }
  // Yetersiz stok SMS'i — sessiz
  if (lowStockSms && customer?.telefon) {
    try {
      const tnt = await prisma.tenant.findUnique({ where: { id: t }, select: { name: true } });
      void notifyOrderSms(t, 'lowstock', {
        phone: customer.telefon, ad: customer.ad, firma: tnt?.name || '',
        kullaniciadi: customer.instagram || '', instagram: customer.instagram || '', durum: 'Yetersiz Stok',
        urun: (lowStockSms as any).urun, beden: (lowStockSms as any).beden, kod: (lowStockSms as any).kod,
      });
    } catch (e: any) { console.error('[live SMS lowstock]', String(e?.message || e)); }
  }
  return lo;
}

// Stok geldiğinde (admin stok girişi / ürün güncelleme) bekleyen "stok_yok" canlı yayın
// siparişlerini eskiden yeniye doğru, stok yettiği sürece otomatik onayla/rezerve et.
export async function promoteWaitingStock(t: string, opts: { productId?: string | null; freeProductId?: string | null }) {
  const where: any = { tenantId: t, durum: 'stok_yok' };
  if (opts.productId) where.productId = opts.productId;
  else if (opts.freeProductId) where.freeProductId = opts.freeProductId;
  else return;
  const waiting = await prisma.liveOrder.findMany({ where, orderBy: { createdAt: 'asc' } });
  type PromoteResult = { logCartId: string; approved: { cartToken: string | null; no: string; tutar: number; urun: string; beden: string; kod: string; phone: string; ad: string; instagram: string } | null } | null;
  for (const w of waiting) {
    const logAd = w.urun + (w.beden ? ` (${w.beden})` : '');
    let result: PromoteResult = null;
    try {
      result = await prisma.$transaction(async (tx): Promise<PromoteResult> => {
        const cur = await tx.liveOrder.findFirst({ where: { id: w.id, tenantId: t } });
        if (!cur || cur.durum !== 'stok_yok') return null;
        let okStock = false;
        if (w.productId) {
          const p = await tx.product.findFirst({ where: { id: w.productId, tenantId: t } });
          if (!p) return null;
          if (w.variation) {
            const v = await tx.productVariation.findFirst({ where: { productId: w.productId, tenantId: t, deger: w.variation } });
            if (v && v.stok >= 1) { await tx.productVariation.update({ where: { id: v.id }, data: { stok: { decrement: 1 } } }); okStock = true; }
          } else if ((p.stokAdeti || 0) >= 1) okStock = true;
          if (okStock) await tx.product.update({ where: { id: p.id }, data: { stokAdeti: { decrement: 1 } } });
        } else if (w.freeProductId) {
          const fp = await tx.freeProduct.findFirst({ where: { id: w.freeProductId, tenantId: t } });
          if (!fp) return null;
          const vars: any[] = Array.isArray(fp.variations) ? (fp.variations as any[]) : [];
          const target = w.variation || w.beden || null;
          if (target) {
            const idx = vars.findIndex((v) => v.deger === target);
            if (idx >= 0 && (Number(vars[idx].stok) || 0) >= 1) { vars[idx].stok = (Number(vars[idx].stok) || 0) - 1; okStock = true; await tx.freeProduct.update({ where: { id: fp.id }, data: { variations: vars } }); }
          } else if (vars.length === 0) okStock = true;
        }
        if (!okStock) return null;
        const customer = await findCustomerByHandle(t, w.user || '');
        const durum = customer ? 'onaylandi' : 'rezerve';
        const cart = await getOrCreateCart(tx, t, customer?.id || null, norm(w.user || ''));
        const items: any[] = Array.isArray(cart.items) ? (cart.items as any) : [];
        items.push({ liveOrderId: w.id, productId: w.productId || null, freeProductId: w.freeProductId || null, drop: !!w.freeProductId, gorsel: w.gorsel || null, ad: logAd, varyasyon: w.variation || w.beden || null, kod: w.kod || null, adet: 1, fiyat: w.tutar, stokDusuldu: true, durum });
        const tot = await campaignAdjust(tx, t, items);
        await tx.storeOrder.update({ where: { id: cart.id }, data: { items, ...tot } });
        await tx.liveOrder.update({ where: { id: w.id }, data: { durum, storeOrderId: cart.id } });
        const cno = (cart.orderNo != null) ? `${cart.orderYil}-${String(cart.orderNo).padStart(3, '0')}` : String(cart.id).slice(-5);
        const approved = (durum === 'onaylandi' && customer?.telefon)
          ? { cartToken: cart.token, no: cno, tutar: w.tutar, urun: w.urun, beden: w.beden || w.variation || '', kod: w.kod || '', phone: customer.telefon, ad: customer.ad || '', instagram: customer.instagram || '' }
          : null;
        return { logCartId: cart.id, approved };
      });
    } catch (e: any) { console.error('[promoteWaitingStock]', String(e?.message || e)); continue; }
    if (!result) continue;
    await logEvent(t, result.logCartId, w.user || 'Canlı Yayın', 'Stok geldi - otomatik onay', logAd).catch(() => {});
    const ap = result.approved;
    if (ap) {
      try {
        const tnt = await prisma.tenant.findUnique({ where: { id: t }, select: { name: true } });
        const link = ap.cartToken ? `${env.APP_DOMAIN}/sepet/${ap.cartToken}` : undefined;
        void notifyOrderSms(t, 'approved', { phone: ap.phone, ad: ap.ad, no: ap.no, tutar: ap.tutar, firma: tnt?.name || '', kullaniciadi: ap.instagram, instagram: ap.instagram, durum: 'Onaylandı', urun: ap.urun, beden: ap.beden, kod: ap.kod, sepetLink: link });
      } catch (e: any) { console.error('[promoteWaitingStock SMS]', String(e?.message || e)); }
    }
  }
}

// Operatör arama/barkod kutusundan gelen "kod" (örn. "A12", "M A12", "A12 M") çözümü.
// productId verilmediyse kullanılır. Varyasyonlu üründe beden yoksa beden_gerekli döner.
async function resolveOperatorCode(t: string, raw: string): Promise<{ status: 'ok' | 'beden_gerekli' | 'yok'; payload?: any; kod?: string; bedenler?: string[] }> {
  const tokens = String(raw || '').toLowerCase().split(/[\s,.;:!?()\[\]\/\\"'+]+/).map((x) => x.trim()).filter(Boolean);
  const upper = tokens.map((x) => x.toUpperCase());
  if (!upper.length) return { status: 'yok' };
  const [products, frees] = await Promise.all([
    prisma.product.findMany({ where: { tenantId: t, aktif: true }, select: { id: true, ad: true, salesCode: true, barkod: true, variations: { select: { deger: true, barkod: true } } } }),
    prisma.freeProduct.findMany({ where: { tenantId: t, aktif: true }, select: { id: true, ad: true, salesCode: true, variations: true } }),
  ]);
  // 1) Varyasyon barkodu doğrudan
  for (const p of products) for (const v of p.variations || []) {
    if (v.barkod && upper.includes(String(v.barkod).toUpperCase())) return { status: 'ok', payload: { productId: p.id, variation: v.deger, beden: v.deger, urun: p.ad, kod: v.barkod } };
  }
  // 2) Satış kodu / barkod
  for (let i = 0; i < upper.length; i++) {
    const code = upper[i];
    if (code.length < 2) continue;
    const p = products.find((pp) => (pp.salesCode || '').toUpperCase() === code || (pp.barkod || '').toUpperCase() === code);
    if (p) {
      const degerler = (p.variations || []).map((v) => v.deger);
      if (degerler.length > 0) {
        const set = degerler.map((d) => d.toUpperCase());
        let beden: string | null = null;
        for (let j = 0; j < upper.length; j++) { if (j === i) continue; const idx = set.indexOf(upper[j]); if (idx >= 0) { beden = degerler[idx]; break; } }
        if (!beden) return { status: 'beden_gerekli', kod: p.salesCode || code, bedenler: degerler };
        return { status: 'ok', payload: { productId: p.id, variation: beden, beden, urun: p.ad, kod: p.salesCode || code } };
      }
      return { status: 'ok', payload: { productId: p.id, variation: null, beden: null, urun: p.ad, kod: p.salesCode || code } };
    }
    const fp = frees.find((ff) => (ff.salesCode || '').toUpperCase() === code);
    if (fp) {
      const vars = Array.isArray(fp.variations) ? (fp.variations as any[]).map((v) => v.deger) : [];
      if (vars.length > 0) {
        const set = vars.map((d: string) => d.toUpperCase());
        let beden: string | null = null;
        for (let j = 0; j < upper.length; j++) { if (j === i) continue; const idx = set.indexOf(upper[j]); if (idx >= 0) { beden = vars[idx]; break; } }
        if (!beden) return { status: 'beden_gerekli', kod: fp.salesCode || code, bedenler: vars };
        return { status: 'ok', payload: { freeProductId: fp.id, variation: beden, beden, urun: fp.ad, kod: fp.salesCode || code } };
      }
      return { status: 'ok', payload: { freeProductId: fp.id, variation: null, beden: null, urun: fp.ad, kod: fp.salesCode || code } };
    }
  }
  return { status: 'yok' };
}

router.post('/order', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const body = req.body || {};
  // Operatör yalnız kod yazdıysa (ürün seçili değilse) kod+beden çöz
  if (!body.productId && !body.freeProductId && body.kod) {
    const r = await resolveOperatorCode(t, String(body.kod));
    if (r.status === 'yok') throw new ApiError(404, 'Ürün bulunamadı: ' + String(body.kod).trim());
    if (r.status === 'beden_gerekli') throw new ApiError(422, `Beden belirtin (örn: M ${r.kod} veya ${r.kod} M)${r.bedenler && r.bedenler.length ? ' — Mevcut bedenler: ' + r.bedenler.join(', ') : ''}`);
    Object.assign(body, r.payload);
  }
  const lo = await placeLiveOrder(t, body);
  res.status(201).json(lo);
}));

// Siparis iptal + sepetten cikar + bekleyen talipliyi onayla
router.post('/order/:id/iptal', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  let streamId = '';
  let logCartId: string | null = null; let logAd = '';
  let cancelSms: { user: string; urun: string; beden: string; kod: string } | null = null;
  let promoteSms: { user: string; urun: string; beden: string; kod: string; token: string; no: string; tutar: number } | null = null;
  await prisma.$transaction(async (tx) => {
    const lo = await tx.liveOrder.findFirst({ where: { id: req.params.id, tenantId: t } });
    if (!lo) return;
    streamId = lo.streamId;
    if (lo.durum === 'onaylandi' || lo.durum === 'rezerve') {
      if (lo.productId) {
        if (lo.variation) { const v = await tx.productVariation.findFirst({ where: { productId: lo.productId, tenantId: t, deger: lo.variation } }); if (v) await tx.productVariation.update({ where: { id: v.id }, data: { stok: { increment: 1 } } }); }
        await tx.product.updateMany({ where: { id: lo.productId, tenantId: t }, data: { stokAdeti: { increment: 1 } } });
      } else if (lo.freeProductId) {
        const fp = await tx.freeProduct.findFirst({ where: { id: lo.freeProductId, tenantId: t } });
        if (fp) {
          const vars: any[] = Array.isArray(fp.variations) ? (fp.variations as any[]) : [];
          const target = lo.variation || lo.beden || null;
          if (target) { const idx = vars.findIndex((v) => v.deger === target); if (idx >= 0) { vars[idx].stok = (Number(vars[idx].stok) || 0) + 1; await tx.freeProduct.update({ where: { id: fp.id }, data: { variations: vars } }); } }
        }
      }
      // Sepetten cikar
      if (lo.storeOrderId) {
        const cart = await tx.storeOrder.findFirst({ where: { id: lo.storeOrderId, tenantId: t } });
        if (cart) {
          const items = (Array.isArray(cart.items) ? (cart.items as any) : []).filter((it: any) => it.liveOrderId !== lo.id);
          if (items.length === 0 && cart.durum === 'sepet') {
            // Sepette ürün kalmadı -> açık sepeti kapat (sil)
            await tx.liveOrder.updateMany({ where: { storeOrderId: cart.id }, data: { storeOrderId: null } });
            await tx.storeOrder.delete({ where: { id: cart.id } });
          } else {
            await tx.storeOrder.update({ where: { id: cart.id }, data: { items, ...(await campaignAdjust(tx, t, items)) } });
          }
          logCartId = cart.id; logAd = lo.urun + (lo.beden ? ` (${lo.beden})` : '');
        }
      }
      // Onaylanmis/rezerve siparis iptal edildi -> iptal SMS'i hazirla
      cancelSms = { user: lo.user, urun: lo.urun, beden: lo.beden || lo.variation || '', kod: lo.kod || '' };
    }
    await tx.liveOrder.update({ where: { id: lo.id }, data: { durum: 'iptal', storeOrderId: null } });
    // Bekleyen stok_yok talipli
    if (lo.productId) {
      const wait = await tx.liveOrder.findFirst({ where: { tenantId: t, streamId: lo.streamId, durum: 'stok_yok', productId: lo.productId, variation: lo.variation ?? null }, orderBy: { createdAt: 'asc' } });
      if (wait) {
        const p = await tx.product.findFirst({ where: { id: wait.productId!, tenantId: t } });
        let okStock = false;
        if (p) {
          if (wait.variation) { const v = await tx.productVariation.findFirst({ where: { productId: wait.productId!, tenantId: t, deger: wait.variation } }); if (v && v.stok >= 1) { await tx.productVariation.update({ where: { id: v.id }, data: { stok: { decrement: 1 } } }); okStock = true; } }
          else if ((p.stokAdeti || 0) >= 1) okStock = true;
          if (okStock) {
            await tx.product.update({ where: { id: p.id }, data: { stokAdeti: { decrement: 1 } } });
            const cust = await prisma.customer.findFirst({ where: { tenantId: t } }).catch(() => null);
            const matched = await findCustomerByHandle(t, wait.user);
            const cart = await getOrCreateCart(tx, t, matched?.id || null, norm(wait.user));
            const items: any[] = Array.isArray(cart.items) ? (cart.items as any) : [];
            items.push({ liveOrderId: wait.id, productId: wait.productId, ad: wait.urun + (wait.beden ? ` (${wait.beden})` : ''), varyasyon: wait.variation || wait.beden || null, adet: 1, fiyat: wait.tutar, stokDusuldu: true });
            await tx.storeOrder.update({ where: { id: cart.id }, data: { items, ...(await campaignAdjust(tx, t, items)) } });
            await tx.liveOrder.update({ where: { id: wait.id }, data: { durum: matched ? 'onaylandi' : 'rezerve', storeOrderId: cart.id } });
            if (matched?.telefon) {
              const wno = (cart.orderNo != null) ? `${cart.orderYil}-${String(cart.orderNo).padStart(3, '0')}` : String(cart.id).slice(-5);
              promoteSms = { user: wait.user, urun: wait.urun, beden: wait.beden || wait.variation || '', kod: wait.kod || '', token: cart.token, no: wno, tutar: wait.tutar };
            }
            void cust;
          }
        }
      }
    }
  });
  if (logCartId) await logEvent(t, logCartId, req.body?.user || 'Canlı Yayın', 'Ürün iptal edildi (canlı yayın)', logAd);
  // İptal SMS'i (iptal edilen siparisin musterisine) — sessiz
  if (cancelSms) {
    try {
      const cs: any = cancelSms;
      const cust = await findCustomerByHandle(t, cs.user);
      if (cust?.telefon) {
        const tnt = await prisma.tenant.findUnique({ where: { id: t }, select: { name: true } });
        const openCart = await prisma.storeOrder.findFirst({ where: { tenantId: t, customerId: cust.id, durum: 'sepet' }, select: { token: true } });
        void notifyOrderSms(t, 'cancel', {
          phone: cust.telefon, ad: cust.ad, firma: tnt?.name || '', kullaniciadi: cust.instagram || '',
          instagram: cust.instagram || '', durum: 'İptal', urun: cs.urun, beden: cs.beden, kod: cs.kod,
          sepetLink: openCart?.token ? `${env.APP_DOMAIN}/sepet/${openCart.token}` : undefined,
        });
      }
    } catch (e: any) { console.error('[live SMS cancel]', String(e?.message || e)); }
  }
  // Bekleyen talipli onaylandi -> onay SMS'i — sessiz
  if (promoteSms) {
    try {
      const ps: any = promoteSms;
      const cust = await findCustomerByHandle(t, ps.user);
      if (cust?.telefon) {
        const tnt = await prisma.tenant.findUnique({ where: { id: t }, select: { name: true } });
        void notifyOrderSms(t, 'approved', {
          phone: cust.telefon, ad: cust.ad, no: ps.no, tutar: ps.tutar, firma: tnt?.name || '',
          kullaniciadi: cust.instagram || '', instagram: cust.instagram || '', durum: 'Onaylandı',
          urun: ps.urun, beden: ps.beden, kod: ps.kod, sepetLink: ps.token ? `${env.APP_DOMAIN}/sepet/${ps.token}` : undefined,
        });
      }
    } catch (e: any) { console.error('[live SMS promote]', String(e?.message || e)); }
  }
  const orders = streamId ? await prisma.liveOrder.findMany({ where: { tenantId: t, streamId }, orderBy: { createdAt: 'desc' } }) : [];
  res.json({ ok: true, orders });
}));

// Hizli musteri kaydi (sadece telefon zorunlu) + rezerve siparisleri onayla
router.post('/musteri', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const { ad, telefon, instagram } = req.body || {};
  if (!telefon) throw new ApiError(422, 'Telefon zorunludur');
  const count = await prisma.customer.count({ where: { tenantId: t } });
  const customer = await prisma.customer.create({ data: { tenantId: t, musteriNo: 1000 + count + 1, ad: ad || instagram || telefon, telefon, instagram: instagram || null, not: 'Canlı yayın kaydı' } });
  await promoteReserved(t, customer);
  res.status(201).json(customer);
}));

// Kayitli musterinin rezerve siparislerini onaylandiya cevir + sepeti baglat
export async function promoteReserved(tenantId: string, customer: { id: string; instagram?: string | null; ad?: string | null; telefon?: string | null }) {
  const handles = [customer.instagram, customer.ad].filter(Boolean).map((x) => norm(x as string));
  const tel = (customer.telefon || '').replace(/\D/g, '');
  const reserved = await prisma.liveOrder.findMany({ where: { tenantId, durum: 'rezerve' } });
  const promotedCarts = new Set<string>();
  for (const lo of reserved) {
    const h = norm(lo.user);
    if (handles.includes(h) || (tel.length >= 7 && lo.user.replace(/\D/g, '') === tel)) {
      await prisma.liveOrder.update({ where: { id: lo.id }, data: { durum: 'onaylandi' } });
      // sepeti musteriye bagla + kalem durumunu onaylandi yap + kampanya indirimini yeniden hesapla
      if (lo.storeOrderId) {
        const cart = await prisma.storeOrder.findFirst({ where: { id: lo.storeOrderId, tenantId } });
        if (cart) {
          const items = (Array.isArray(cart.items) ? (cart.items as any) : []).map((it: any) => it.liveOrderId === lo.id ? { ...it, durum: 'onaylandi' } : it);
          const adj = await campaignAdjust(prisma, tenantId, items);
          await prisma.storeOrder.update({ where: { id: cart.id }, data: { items, araToplam: adj.araToplam, indirim: adj.indirim, kampanyalar: adj.kampanyalar, toplam: Math.max(0, adj.toplam + (cart.kargoUcreti || 0)), customerId: customer.id } });
          promotedCarts.add(cart.id);
        }
      }
    }
  }
  // Onaylanan her sepet icin tek bir onay SMS'i (sepet linki ile) — sessiz
  if (promotedCarts.size && customer.telefon) {
    try {
      const tnt = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
      for (const cid of promotedCarts) {
        const cart = await prisma.storeOrder.findFirst({ where: { id: cid, tenantId } });
        if (!cart) continue;
        const no = (cart.orderNo != null) ? `${cart.orderYil}-${String(cart.orderNo).padStart(3, '0')}` : String(cart.id).slice(-5);
        const oItems: any[] = Array.isArray(cart.items) ? (cart.items as any[]) : [];
        const ilk = oItems[0] || {};
        void notifyOrderSms(tenantId, 'approved', {
          phone: customer.telefon, ad: customer.ad, no, tutar: cart.toplam, firma: tnt?.name || '',
          kullaniciadi: customer.instagram || '', instagram: customer.instagram || '', durum: 'Onaylandı',
          urun: ilk.ad || '', beden: ilk.beden || ilk.varyasyon || '', kod: ilk.kod || '',
          sepetLink: cart.token ? `${env.APP_DOMAIN}/sepet/${cart.token}` : undefined,
        });
      }
    } catch (e: any) { console.error('[promote SMS]', String(e?.message || e)); }
  }
}

// ───────── Canlı Site Akışı (ziyaretçi presence + olay feed) ─────────
router.get('/activity', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const now = Date.now();
  const onlineCut = new Date(now - 60 * 1000);       // son 60 sn aktif = online
  const eventCut = new Date(now - 30 * 60 * 1000);   // son 30 dk olay feed
  const [visits, events] = await Promise.all([
    prisma.storeVisit.findMany({ where: { tenantId: t, updatedAt: { gte: onlineCut } }, orderBy: { updatedAt: 'desc' }, take: 500 }),
    prisma.storeEvent.findMany({ where: { tenantId: t, createdAt: { gte: eventCut } }, orderBy: { createdAt: 'desc' }, take: 40 }),
  ]);
  const ekran = { browse: 0, category: 0, product: 0, cart: 0, checkout: 0 } as Record<string, number>;
  const cihaz = { mobil: 0, web: 0 } as Record<string, number>;
  const kategoriMap = new Map<string, number>();
  const urunMap = new Map<string, number>();
  for (const v of visits) {
    ekran[v.screen] = (ekran[v.screen] || 0) + 1;
    if (v.device === 'mobil' || v.device === 'web') cihaz[v.device]++;
    if (v.screen === 'category' && v.label) kategoriMap.set(v.label, (kategoriMap.get(v.label) || 0) + 1);
    if (v.screen === 'product' && v.label) urunMap.set(v.label, (urunMap.get(v.label) || 0) + 1);
  }
  const sortMap = (m: Map<string, number>) => [...m.entries()].map(([ad, sayi]) => ({ ad, sayi })).sort((a, b) => b.sayi - a.sayi).slice(0, 12);
  // Son 30 dk olay sayıları (huni)
  const huni = { view: 0, category: 0, product: 0, cart_add: 0, cart_view: 0, checkout: 0, order: 0 } as Record<string, number>;
  for (const e of events) if (huni[e.type] !== undefined) huni[e.type]++;
  res.json({
    online: visits.length,
    ekran,
    cihaz,
    kategoriler: sortMap(kategoriMap),
    urunler: sortMap(urunMap),
    huni,
    feed: events.map((e) => ({ id: e.id, type: e.type, label: e.label, at: e.createdAt })),
    ts: now,
  });
}));

// Dönem bazlı ziyaretçi/cihaz/incelenen analitiği (Genel Bakış)
router.get('/overview', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 7));
  const since = new Date(Date.now() - days * 86400000);
  const [visits, productEvents] = await Promise.all([
    prisma.storeVisit.findMany({ where: { tenantId: t, createdAt: { gte: since } }, select: { device: true } }),
    prisma.storeEvent.findMany({ where: { tenantId: t, type: 'product', createdAt: { gte: since } }, select: { label: true } }),
  ]);
  const cihaz = { mobil: 0, web: 0 } as Record<string, number>;
  for (const v of visits) if (v.device === 'mobil' || v.device === 'web') cihaz[v.device]++;
  const viewMap = new Map<string, number>();
  for (const e of productEvents) if (e.label) viewMap.set(e.label, (viewMap.get(e.label) || 0) + 1);
  const enCokIncelenen = [...viewMap.entries()].map(([ad, sayi]) => ({ ad, sayi })).sort((a, b) => b.sayi - a.sayi).slice(0, 5);
  res.json({ ziyaretci: visits.length, cihaz, enCokIncelenen });
}));

// ───────── Facebook Canlı Yayın Yorum Bağlama ─────────
// Aktif yayını bir Facebook canlı videosuna bağla (videoId/URL + Sayfa erişim token'ı)
router.post('/fb/connect', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const { videoId, token } = req.body || {};
  if (!videoId || !token) throw new ApiError(422, 'Video ID/URL ve erişim token gerekli');
  const stream = await prisma.liveStream.findFirst({ where: { tenantId: t, status: 'active' }, orderBy: { startedAt: 'desc' } });
  if (!stream) throw new ApiError(400, 'Önce yayını başlatın');
  const vid = extractVideoId(String(videoId));

  // Token + video doğrulaması (basit erişim testi)
  try {
    const test = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(vid)}?fields=id&access_token=${encodeURIComponent(String(token))}`);
    const tj: any = await test.json();
    if (tj?.error) throw new ApiError(400, 'Facebook bağlantısı başarısız: ' + (tj.error?.message || 'geçersiz video/token'));
  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(502, 'Facebook doğrulaması yapılamadı');
  }

  clearFbState(stream.id);
  const updated = await prisma.liveStream.update({
    where: { id: stream.id },
    data: { fbVideoId: vid, fbToken: String(token), fbSince: new Date(Date.now() - 60 * 1000) },
  });
  res.json({ ok: true, videoId: updated.fbVideoId });
}));

router.post('/fb/disconnect', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const stream = await prisma.liveStream.findFirst({ where: { tenantId: t, status: 'active' }, orderBy: { startedAt: 'desc' } });
  if (stream) {
    clearFbState(stream.id);
    await prisma.liveStream.update({ where: { id: stream.id }, data: { fbVideoId: null, fbToken: null, fbSince: null } });
  }
  res.json({ ok: true });
}));

// FB bağlantı durumu + son çekilen yorum akışı
router.get('/fb/status', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const stream = await prisma.liveStream.findFirst({ where: { tenantId: t, status: 'active' }, orderBy: { startedAt: 'desc' } });
  if (!stream) return res.json({ connected: false, videoId: null, feed: [] });
  res.json({ connected: !!stream.fbVideoId, videoId: stream.fbVideoId, feed: stream.fbVideoId ? getFbFeed(stream.id) : [] });
}));

// ───────── Instagram Canlı Yayın Yorum Bağlama ─────────
// Aktif yayını bir Instagram hesabına bağla (Instagram erişim token'ı yeterli;
// hesap ID token'dan otomatik çözülür). Yayın açıkken canlı medya + yorumlar çekilir.
router.post('/ig/connect', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const { token } = req.body || {};
  if (!token) throw new ApiError(422, 'Instagram erişim token gerekli');
  const stream = await prisma.liveStream.findFirst({ where: { tenantId: t, status: 'active' }, orderBy: { startedAt: 'desc' } });

  let igToken = String(token).trim();

  // Opsiyonel: App Secret tanımlıysa token'ı 60 günlük uzun ömürlüye çevir/yenile
  if (env.IG_APP_SECRET) {
    try {
      // Kısa ömürlü token ise uzun ömürlüye çevir
      const ex = await fetch(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(env.IG_APP_SECRET)}&access_token=${encodeURIComponent(igToken)}`,
      );
      const ej: any = await ex.json();
      if (ej?.access_token) {
        igToken = ej.access_token;
      } else {
        // Zaten uzun ömürlü ise süreyi yenile (60 gün sıfırlanır)
        const rf = await fetch(
          `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(igToken)}`,
        );
        const rj: any = await rf.json();
        if (rj?.access_token) igToken = rj.access_token;
      }
    } catch { /* kısa token ile devam */ }
  }

  // Token doğrula + IG hesap ID'sini çöz
  let igUserId = '';
  let username = '';
  try {
    const me = await fetch(`https://graph.instagram.com/me?fields=user_id,username&access_token=${encodeURIComponent(igToken)}`);
    const mj: any = await me.json();
    if (mj?.error) throw new ApiError(400, 'Instagram bağlantısı başarısız: ' + (mj.error?.message || 'geçersiz token'));
    igUserId = String(mj.user_id || mj.id || '');
    username = String(mj.username || '');
  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(502, 'Instagram doğrulaması yapılamadı');
  }
  if (!igUserId) throw new ApiError(400, 'Instagram hesap ID çözülemedi');

  // Kalıcı kaydet → her yayında otomatik bağlanır, bir daha girmeye gerek yok
  await prisma.storeSetting.upsert({
    where: { tenantId: t },
    create: { tenantId: t, igTokenSaved: igToken, igUserIdSaved: igUserId },
    update: { igTokenSaved: igToken, igUserIdSaved: igUserId },
  });

  // Aktif yayın varsa hemen bağla
  if (stream) {
    clearIgState(stream.id);
    await prisma.liveStream.update({
      where: { id: stream.id },
      data: { igUserId, igToken, igSince: new Date(Date.now() - 60 * 1000) },
    });
  }
  res.json({ ok: true, igUserId, username, saved: true, bound: !!stream });
}));

router.post('/ig/disconnect', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  // Kalıcı kaydı da temizle (artık otomatik bağlanmasın)
  await prisma.storeSetting.updateMany({ where: { tenantId: t }, data: { igTokenSaved: null, igUserIdSaved: null } });
  const stream = await prisma.liveStream.findFirst({ where: { tenantId: t, status: 'active' }, orderBy: { startedAt: 'desc' } });
  if (stream) {
    clearIgState(stream.id);
    await prisma.liveStream.update({ where: { id: stream.id }, data: { igUserId: null, igToken: null, igSince: null } });
  }
  res.json({ ok: true });
}));

// IG bağlantı durumu + son çekilen yorum akışı
router.get('/ig/status', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const ss = await prisma.storeSetting.findUnique({ where: { tenantId: t }, select: { igTokenSaved: true, igUserIdSaved: true } });
  const saved = !!(ss?.igTokenSaved && ss?.igUserIdSaved);
  const stream = await prisma.liveStream.findFirst({ where: { tenantId: t, status: 'active' }, orderBy: { startedAt: 'desc' } });
  if (!stream) return res.json({ connected: false, igUserId: ss?.igUserIdSaved || null, feed: [], saved });

  // Kayıtlı token var ama yayın henüz bağlı değilse → güvenli otomatik bağla
  if (saved && !stream.igUserId) {
    clearIgState(stream.id);
    await prisma.liveStream.update({ where: { id: stream.id }, data: { igUserId: ss!.igUserIdSaved, igToken: ss!.igTokenSaved, igSince: new Date(Date.now() - 60 * 1000) } });
    return res.json({ connected: true, igUserId: ss!.igUserIdSaved, feed: getIgFeed(stream.id), saved });
  }
  res.json({ connected: !!stream.igUserId, igUserId: stream.igUserId, feed: stream.igUserId ? getIgFeed(stream.id) : [], saved });
}));

export default router;

// 5 dk icinde musteri kaydi gelmeyen rezerve siparisleri iptal et (cron)
export async function autoCancelStaleReservations() {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);
  const stale = await prisma.liveOrder.findMany({ where: { durum: 'rezerve', createdAt: { lt: cutoff } } });
  for (const lo of stale) {
    const cust = await findCustomerByHandle(lo.tenantId, lo.user);
    if (cust) {
      // Bu arada kayit olmus -> onayla + sepet kalemini onaylandi yap + indirimi yeniden hesapla
      await prisma.liveOrder.update({ where: { id: lo.id }, data: { durum: 'onaylandi' } });
      if (lo.storeOrderId) {
        const cart = await prisma.storeOrder.findFirst({ where: { id: lo.storeOrderId, tenantId: lo.tenantId } });
        if (cart) {
          const items = (Array.isArray(cart.items) ? (cart.items as any) : []).map((it: any) => it.liveOrderId === lo.id ? { ...it, durum: 'onaylandi' } : it);
          const adj = await campaignAdjust(prisma, lo.tenantId, items);
          await prisma.storeOrder.update({ where: { id: cart.id }, data: { items, araToplam: adj.araToplam, indirim: adj.indirim, kampanyalar: adj.kampanyalar, toplam: Math.max(0, adj.toplam + (cart.kargoUcreti || 0)), customerId: cust.id } });
        }
      }
      continue;
    }
    try {
      await prisma.$transaction(async (tx) => {
        if (lo.productId) {
          if (lo.variation) { const v = await tx.productVariation.findFirst({ where: { productId: lo.productId!, tenantId: lo.tenantId, deger: lo.variation } }); if (v) await tx.productVariation.update({ where: { id: v.id }, data: { stok: { increment: 1 } } }); }
          await tx.product.updateMany({ where: { id: lo.productId!, tenantId: lo.tenantId }, data: { stokAdeti: { increment: 1 } } });
        }
        if (lo.storeOrderId) {
          const cart = await tx.storeOrder.findFirst({ where: { id: lo.storeOrderId, tenantId: lo.tenantId } });
          if (cart) { const items = (Array.isArray(cart.items) ? (cart.items as any) : []).filter((it: any) => it.liveOrderId !== lo.id); await tx.storeOrder.update({ where: { id: cart.id }, data: { items, ...(await campaignAdjust(tx, lo.tenantId, items)) } }); }
        }
        await tx.liveOrder.update({ where: { id: lo.id }, data: { durum: 'iptal', storeOrderId: null, urun: lo.urun } });
      });
    } catch { /* */ }
  }
}
