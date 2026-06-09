import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../lib/http';
import { promoteReserved, campaignAdjust, recalcOpenCarts } from './live.routes';
import { notifyOrderSms } from '../sms/netgsm.service';

const router = Router();

// Musteri olusturunca rezerve canli siparislerini onayla (SIMPLE loop'tan once)
router.post('/customers', asyncHandler(async (req: Request, res: Response) => {
  const META2 = new Set(['id', 'tenantId', 'createdAt', 'updatedAt', 'createdBy', 'orders']);
  const data: any = {};
  for (const k of Object.keys(req.body || {})) if (!META2.has(k)) data[k] = req.body[k];
  const count = await prisma.customer.count({ where: { tenantId: req.tenantId! } });
  const created = await prisma.customer.create({ data: { ...data, musteriNo: 1000 + count + 1, tenantId: req.tenantId! } });
  await promoteReserved(req.tenantId!, created);
  res.status(201).json(created);
}));

// Musteri bakiye hareketleri
router.get('/customers/:id/ledger', asyncHandler(async (req: Request, res: Response) => {
  const c = await prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!c) throw new ApiError(404, 'Musteri bulunamadi');
  const ledger = await prisma.customerLedger.findMany({ where: { customerId: req.params.id, tenantId: req.tenantId! }, orderBy: { createdAt: 'desc' } });
  res.json(ledger);
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
    await tx.customerLedger.create({ data: { tenantId: req.tenantId!, customerId: c.id, tip, tutar: amt, aciklama: aciklama || null } });
    return updated;
  });
  res.json(result);
}));

const META = new Set(['id', 'tenantId', 'createdAt', 'updatedAt', 'createdBy', 'tenant', 'variations', 'product', 'customer', 'orders']);
function clean(body: any): any {
  const out: any = {};
  for (const k of Object.keys(body || {})) if (!META.has(k)) out[k] = body[k];
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

async function actorName(userId?: string): Promise<string> {
  if (!userId) return 'Sistem';
  const u = await prisma.user.findUnique({ where: { id: userId } });
  return u?.fullName || u?.email || 'Sistem';
}

export async function logEvent(tenantId: string, orderId: string, kullanici: string, islem: string, detay?: string) {
  try { await prisma.orderEvent.create({ data: { tenantId, orderId, kullanici, islem, detay: detay || null } }); } catch { /* */ }
}

// Iptal/silmede stoga geri don (sadece stogu dusurulmus kalemler)
async function returnStock(tx: any, tenantId: string, items: any[]) {
  for (const it of items || []) {
    if (!it?.productId || !it?.stokDusuldu) continue;
    const adet = Number(it.adet) || 1;
    if (it.varyasyon) {
      const v = await tx.productVariation.findFirst({ where: { productId: it.productId, tenantId, deger: it.varyasyon } });
      if (v) await tx.productVariation.update({ where: { id: v.id }, data: { stok: { increment: adet } } });
    }
    await tx.product.updateMany({ where: { id: it.productId, tenantId }, data: { stokAdeti: { increment: adet } } });
    if (it.liveOrderId) await tx.liveOrder.updateMany({ where: { id: it.liveOrderId, tenantId }, data: { durum: 'iptal', storeOrderId: null } });
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
  const [products, categories, salesCodes, customers, discountCodes, orders, storeSetting, variationTemplates, campaigns] = await Promise.all([
    prisma.product.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' }, include: { variations: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } }),
    prisma.productCategory.findMany({ where: { tenantId: t }, orderBy: { ad: 'asc' } }),
    prisma.salesCode.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' } }),
    prisma.customer.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' } }),
    prisma.discountCode.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' } }),
    prisma.storeOrder.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' }, include: { customer: true } }),
    prisma.storeSetting.findUnique({ where: { tenantId: t } }),
    prisma.variationTemplate.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' } }),
    prisma.campaign.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' } }),
  ]);
  res.json({ products, categories, salesCodes, customers, discountCodes, orders, storeSetting, variationTemplates, campaigns });
}));

// ───────── Generic CRUD ─────────
const SIMPLE: Record<string, string> = {
  'categories': 'productCategory',
  'customers': 'customer',
  'discounts': 'discountCode',
  'variations': 'productVariation',
  'variation-templates': 'variationTemplate',
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

// ───────── Kampanyalar ─────────
// Generic CRUD'dan ayri tutuluyor: kampanya eklendiginde/guncellendiginde/silindiginde
// acik (durum='sepet') siparis sepetlerinin indirimi recalcOpenCarts ile yeniden hesaplanir.
// Aksi halde kampanya pasif yapilsa bile eski hesaplanmis indirim sepette kalir.
router.post('/campaigns', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const created = await prisma.$transaction(async (tx) => {
    const c = await tx.campaign.create({ data: { ...clean(req.body), tenantId: t } });
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
    const c = await tx.campaign.update({ where: { id: req.params.id }, data: clean(req.body) });
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
    await tx.campaign.delete({ where: { id: req.params.id } });
    await recalcOpenCarts(tx, t);
  });
  res.json({ ok: true });
}));

// ───────── Products (barkod + satis kodu havuzu) ─────────
router.post('/products', asyncHandler(async (req: Request, res: Response) => {
  const b = clean(req.body);
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
    return p;
  });
  res.status(201).json(product);
}));
router.patch('/products/:id', asyncHandler(async (req: Request, res: Response) => {
  const found = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!found) throw new ApiError(404, 'Urun bulunamadi');
  const b = clean(req.body);
  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.product.update({ where: { id: req.params.id }, data: b });
    if (b.salesCode !== undefined && b.salesCode !== found.salesCode) {
      if (found.salesCode) await tx.salesCode.updateMany({ where: { tenantId: req.tenantId!, code: found.salesCode }, data: { used: false, productId: null } });
      if (b.salesCode) await tx.salesCode.updateMany({ where: { tenantId: req.tenantId!, code: b.salesCode }, data: { used: true, productId: p.id } });
    }
    if (Array.isArray(req.body.variations)) {
      await tx.productVariation.deleteMany({ where: { productId: p.id, tenantId: req.tenantId! } });
      let toplam = 0;
      for (const v of req.body.variations) {
        if (!v?.deger) continue;
        toplam += Number(v.stok) || 0;
        await tx.productVariation.create({ data: { tenantId: req.tenantId!, productId: p.id, ad: v.ad || 'Varyasyon', deger: v.deger, stok: Number(v.stok) || 0, ekFiyat: Number(v.ekFiyat) || 0 } });
      }
      // Varyasyonlu üründe toplam stok = varyasyon stokları toplamı
      if (req.body.variations.some((v: any) => v?.deger)) {
        await tx.product.update({ where: { id: p.id }, data: { stokAdeti: toplam } });
      }
    }
    return p;
  });
  res.json(updated);
}));
router.delete('/products/:id', asyncHandler(async (req: Request, res: Response) => {
  const found = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!found) throw new ApiError(404, 'Urun bulunamadi');
  await prisma.$transaction(async (tx) => {
    if (found.salesCode) await tx.salesCode.updateMany({ where: { tenantId: req.tenantId!, code: found.salesCode }, data: { used: false, productId: null } });
    await tx.product.delete({ where: { id: req.params.id } });
  });
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
  res.json(found);
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
  const created = await prisma.$transaction(async (tx) => {
    const seq = await nextOrderNo(tx, req.tenantId!);
    return tx.storeOrder.create({ data: { ...b, ...seq, tenantId: req.tenantId! } });
  });
  await logEvent(req.tenantId!, created.id, who, 'Sipariş oluşturuldu', `${created.orderYil}-${String(created.orderNo).padStart(3, '0')}`);
  // Sipariş alındı bildirimi (NetGSM SMS) — sessiz
  try {
    if (created.customerId) {
      const cst = await prisma.customer.findFirst({ where: { id: created.customerId, tenantId: req.tenantId! }, select: { telefon: true, ad: true } });
      const tnt = await prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { name: true } });
      const no2 = `${created.orderYil}-${String(created.orderNo).padStart(3, '0')}`;
      void notifyOrderSms(req.tenantId!, 'new', { phone: cst?.telefon, ad: cst?.ad, no: no2, tutar: created.toplam, firma: tnt?.name || '' });
    }
  } catch { /* */ }
  res.status(201).json(created);
}));

router.patch('/orders/:id', asyncHandler(async (req: Request, res: Response) => {
  const found = await prisma.storeOrder.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!found) throw new ApiError(404, 'Siparis bulunamadi');
  const who = await actorName(req.auth?.userId);
  const customLog = typeof req.body?._log === 'string' ? req.body._log : '';
  const manuelIndirim = req.body?.manuelIndirim === true;
  const body = clean(req.body);
  delete (body as any)._log;
  delete (body as any).manuelIndirim;
  // Tahsilat artışında otomatik gelir kaydı (çift kayıt önlenir: gelirKaydedilen takibi)
  let gelirDelta = 0;
  if (body.tahsilat !== undefined) {
    const yeniTahsilat = Number(body.tahsilat) || 0;
    const kayitli = found.gelirKaydedilen || 0;
    if (yeniTahsilat > kayitli) { gelirDelta = yeniTahsilat - kayitli; (body as any).gelirKaydedilen = yeniTahsilat; }
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
      await returnStock(tx, req.tenantId!, oItems);
      await reverseIncome(tx, req.tenantId!, found);
    }
    return tx.storeOrder.update({ where: { id: req.params.id }, data: body });
  });
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
    let event: 'approved' | 'shipped' | null = null;
    const yeni = updated.durum;
    if ((yeni === 'hazirlaniyor' || yeni === 'onaylandi') && yeni !== found.durum) event = 'approved';
    if (yeni === 'kargoda' && yeni !== found.durum) event = 'shipped';
    if (updated.kargoTakip && updated.kargoTakip !== (found as any).kargoTakip) event = 'shipped';
    if (event && updated.customerId) {
      const cst = await prisma.customer.findFirst({ where: { id: updated.customerId, tenantId: req.tenantId! }, select: { telefon: true, ad: true } });
      const tnt = await prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { name: true } });
      const no2 = updated.orderNo ? `${updated.orderYil}-${String(updated.orderNo).padStart(3, '0')}` : updated.id.slice(-5);
      void notifyOrderSms(req.tenantId!, event, { phone: cst?.telefon, ad: cst?.ad, no: no2, tutar: updated.toplam, kargo: (updated as any).kargoFirmasi || '', takip: (updated as any).kargoTakip || '', firma: tnt?.name || '' });
    }
  } catch { /* SMS hatasi siparisi etkilemez */ }
  res.json(updated);
}));

// Sepet iptal (stok iadesi + log; numara korunur)
router.post('/orders/:id/cancel', asyncHandler(async (req: Request, res: Response) => {
  const who = await actorName(req.auth?.userId);
  const updated = await prisma.$transaction(async (tx) => {
    const o = await tx.storeOrder.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!o) throw new ApiError(404, 'Siparis bulunamadi');
    const items: any[] = Array.isArray(o.items) ? (o.items as any) : [];
    await returnStock(tx, req.tenantId!, items);
    if (o.durum !== 'iptal') await reverseIncome(tx, req.tenantId!, o);
    return tx.storeOrder.update({ where: { id: o.id }, data: { durum: 'iptal' } });
  });
  await logEvent(req.tenantId!, updated.id, who, 'Sepet iptal edildi (stok iade)');
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
    if (removed) await returnStock(tx, req.tenantId!, [removed]);
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
    await returnStock(tx, req.tenantId!, items);
    if (found.durum !== 'iptal') await reverseIncome(tx, req.tenantId!, found);
    await tx.storeOrder.delete({ where: { id: req.params.id } });
  });
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
    await tx.product.update({ where: { id: p.id }, data: { stokAdeti: { decrement: adet } } });
    const ad = p.ad + (variationDeger ? ` (${variationDeger})` : '');
    const seq = await nextOrderNo(tx, req.tenantId!);
    const order = await tx.storeOrder.create({
      data: { tenantId: req.tenantId!, ...seq, kanal: 'canli', durum: 'yeni', items: [{ productId, ad, varyasyon: variationDeger || null, adet, fiyat, stokDusuldu: true }], araToplam: fiyat * adet, indirim: 0, toplam: fiyat * adet, not: `Canli yayin - ${user || ''}` },
    });
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
      await tx.product.update({ where: { id: p.id }, data: { stokAdeti: { decrement: adet } } });
      orderItems.push({ productId: p.id, ad: p.ad + (it.varyasyon ? ` (${it.varyasyon})` : ''), varyasyon: it.varyasyon || null, adet, fiyat, stokDusuldu: true });
    }
    const kamp = await campaignAdjust(tx, req.tenantId!, orderItems);
    const seq = await nextOrderNo(tx, req.tenantId!);
    return tx.storeOrder.create({ data: { tenantId: req.tenantId!, ...seq, kanal: 'magaza', durum: 'teslim', items: orderItems, araToplam: kamp.araToplam, indirim: kamp.indirim, kampanyalar: kamp.kampanyalar, toplam: kamp.toplam, tahsilat: kamp.toplam, gelirKaydedilen: kamp.toplam, odemeYontemi: odemeYontemi || 'Nakit', not: saticiAd ? `Kasa satışı - ${saticiAd}` : 'Kasa satışı' } });
  });
  // Gelir kaydı (ödeme yönlendirme + POS komisyonu uygulanır)
  try {
    await creditIncome(prisma, req.tenantId!, { tutar: order.toplam, kanal: 'kasa', odemeYontemi: odemeYontemi || 'Nakit', aciklama: `Kasa satışı #${order.orderYil}-${String(order.orderNo).padStart(3, '0')}`, kategori: 'Kasa Satışı', createdBy: req.auth?.userId || null });
    await logEvent(req.tenantId!, order.id, who, 'Kasa satışı tamamlandı', `${order.toplam.toLocaleString('tr-TR')}₺ (${odemeYontemi || 'Nakit'})`);
  } catch { /* */ }
  res.status(201).json({ ok: true, order });
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
    for (const it of items) {
      if (!it.productId) continue;
      const adet = it.adet || 1;
      if (it.varyasyon) {
        const v = await tx.productVariation.findFirst({ where: { productId: it.productId, tenantId: req.tenantId!, deger: it.varyasyon } });
        if (v) await tx.productVariation.update({ where: { id: v.id }, data: { stok: { increment: adet } } });
      }
      await tx.product.updateMany({ where: { id: it.productId, tenantId: req.tenantId! }, data: { stokAdeti: { increment: adet } } });
    }
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

export default router;
