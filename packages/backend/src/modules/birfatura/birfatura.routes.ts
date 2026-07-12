import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/http';

// BirFatura entegrasyon ucları — `token` header ile kimlik (Clerk auth'tan ÖNCE mount edilir).
// Eski C#/MySQL controller'ının (birfatura1.txt) Node.js/Prisma/PostgreSQL portu.
// sepetw.com → diljar.com olarak güncellendi.

const router = Router();

const SITE = 'www.diljar.com';
const IMG_PREFIX = 'https://diljar.com';

function getToken(req: Request): string {
  const h = (req.headers['token'] || req.headers['Token']) as string | undefined;
  return (h || '').toString().trim();
}

async function resolveTenant(req: Request): Promise<{ tenantId: string; kdvOrani: number; kategoriKdv: Record<string, number>; faturaDurumlari: string[] } | null> {
  const token = getToken(req);
  if (!token) return null;
  const ayar = await prisma.birFaturaAyar.findFirst({ where: { token, aktif: true } });
  if (!ayar) return null;
  const kk = (ayar as any).kategoriKdv && typeof (ayar as any).kategoriKdv === 'object' ? (ayar as any).kategoriKdv as Record<string, number> : {};
  const durumlar = Array.isArray((ayar as any).faturaDurumlari) && (ayar as any).faturaDurumlari.length ? (ayar as any).faturaDurumlari as string[] : ['kargoda'];
  return { tenantId: ayar.tenantId, kdvOrani: Number(ayar.kdvOrani) || 18, kategoriKdv: kk, faturaDurumlari: durumlar };
}

function round4(n: number): number {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

// ── 1) /orderStatus ──
router.post('/orderStatus', asyncHandler(async (req: Request, res: Response) => {
  const t = await resolveTenant(req);
  if (!t) return res.status(401).json({ error: 'Geçersiz token.' });
  res.json({
    OrderStatus: [
      { Id: 1, Value: 'Hazırlanıyor' },
      { Id: 2, Value: 'Onaylandı' },
      { Id: 3, Value: 'Gönderildi' },
      { Id: 4, Value: 'Kapandı' },
      { Id: 5, Value: 'İptal Edildi' },
      { Id: 6, Value: 'İade Edildi' },
    ],
  });
}));

// ── 2) /paymentMethods ──
router.post('/paymentMethods', asyncHandler(async (req: Request, res: Response) => {
  const t = await resolveTenant(req);
  if (!t) return res.status(401).json({ error: 'Geçersiz token.' });
  const rows = await prisma.storeOrder.findMany({
    where: { tenantId: t.tenantId, odemeYontemi: { not: null } },
    select: { odemeYontemi: true },
    distinct: ['odemeYontemi'],
  });
  let list = rows
    .map((r) => (r.odemeYontemi || '').trim())
    .filter(Boolean)
    .map((v, i) => ({ Id: i + 1, Value: v }));
  if (list.length === 0) {
    list = [
      { Id: 1, Value: 'Kredi Kartı' },
      { Id: 2, Value: 'Banka EFT-Havale' },
      { Id: 3, Value: 'Kapıda Ödeme Nakit' },
      { Id: 4, Value: 'Kapıda Ödeme Kredi Kartı' },
      { Id: 5, Value: 'iyzico' },
    ];
  }
  res.json({ PaymentMethods: list });
}));

function paymentTypeId(odemeYontemi: string): number {
  const l = (odemeYontemi || '').toLowerCase();
  if (l.includes('kredi') && l.includes('kart')) return 1;
  if (l.includes('kapıda') && l.includes('nakit')) return 3;
  if (l.includes('kapıda') && l.includes('kredi')) return 4;
  if (l.includes('havale') || l.includes('eft') || l.includes('bank')) return 2;
  if (l.includes('nakit')) return 3;
  if (l.includes('iyzico') || l.includes('pay')) return 5;
  return 1;
}

// ── 3) /orders — faturalanmamış, durum=kargoda siparişler ──
router.post('/orders', asyncHandler(async (req: Request, res: Response) => {
  const t = await resolveTenant(req);
  if (!t) return res.status(401).json({ error: 'Geçersiz token.' });

  const [orders, customers, products, invoiced] = await Promise.all([
    prisma.storeOrder.findMany({
      where: { tenantId: t.tenantId, durum: { in: t.faturaDurumlari } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { customer: true },
    }),
    prisma.customer.findMany({ where: { tenantId: t.tenantId } }),
    prisma.product.findMany({ where: { tenantId: t.tenantId }, select: { id: true, ad: true, salesCode: true, barkod: true, marka: true, images: true, kdv: true, kategoriId: true } }),
    prisma.birFaturaFatura.findMany({ where: { tenantId: t.tenantId }, select: { orderId: true } }),
  ]);

  const invoicedSet = new Set(invoiced.map((f) => f.orderId));
  const normH = (s: any) => String(s || '').replace(/^@/, '').trim().toLowerCase();
  const normT = (s: any) => String(s || '').replace(/\D/g, '');
  const byInsta = new Map<string, any>();
  const byTel = new Map<string, any>();
  for (const c of customers as any[]) {
    if (c.instagram) byInsta.set(normH(c.instagram), c);
    if (c.telefon) byTel.set(normT(c.telefon), c);
  }
  const prodMap = new Map<string, any>();
  for (const p of products as any[]) prodMap.set(p.id, p);

  const out: any[] = [];
  for (const o of orders as any[]) {
    if (invoicedSet.has(o.id)) continue;
    let cust: any = o.customer || null;
    if (!cust && o.musteriHandle) {
      cust = byInsta.get(normH(o.musteriHandle)) || byTel.get(normT(o.musteriHandle)) || null;
    }
    const ad = cust?.ad || o.musteriHandle || '';
    const adres = o.adres || cust?.adres || '';
    const il = o.il || cust?.il || '';
    const ilce = o.ilce || cust?.ilce || '';
    const tel = cust?.telefon || '';

    const items: any[] = Array.isArray(o.items) ? o.items : [];
    let sumInc = 0;
    let sumExc = 0;
    const details = items.map((it) => {
      const p = it.productId ? prodMap.get(it.productId) : null;
      const adet = Number(it.adet) || 1;
      const birimInc = Number(it.fiyat) || 0;
      // KDV önceliği: kalemde tanımlı -> ürün KDV'si -> kategori varsayılanı -> mağaza varsayılanı
      const katKdv = p?.kategoriId != null ? t.kategoriKdv[p.kategoriId] : undefined;
      const itemKdv = (it.kdv != null ? Number(it.kdv) : (p?.kdv != null ? Number(p.kdv) : (katKdv != null ? Number(katKdv) : t.kdvOrani))) || 0;
      const birimExc = round4(birimInc / (1 + itemKdv / 100));
      sumInc += birimInc * adet;
      sumExc += birimExc * adet;
      const vary = it.varyasyon || it.beden || '';
      const pImg = Array.isArray(p?.images) ? p.images[0] : '';
      let img = it.gorsel || pImg || '';
      if (img && typeof img === 'string' && img.startsWith('/')) img = IMG_PREFIX + img;
      return {
        ProductNote: '',
        CommissionUnitTaxExcluding: 0,
        CommissionUnitTaxIncluding: 0,
        ProductId: 0,
        ProductCode: p?.salesCode || p?.barkod || '',
        Barcode: p?.barkod || '',
        ProductBrand: p?.marka || 'Muhtelif',
        ProductName: p?.ad || it.ad || 'Ürün',
        ProductImage: img || '',
        Variants: vary ? [{ Type: 'Varyasyon', Value: String(vary) }] : [],
        ProductQuantityType: 'Adet',
        ProductQuantity: adet,
        VatRate: itemKdv,
        ProductUnitPriceTaxExcluding: birimExc,
        ProductUnitPriceTaxIncluding: birimInc,
        DiscountUnitTaxExcluding: 0,
        DiscountUnitTaxIncluding: 0,
        ExtraFeesUnit: [],
      };
    });

    const totalInc = round4(sumInc > 0 ? sumInc : (Number(o.tahsilat) > 0 ? Number(o.tahsilat) : Number(o.toplam) || 0));
    const totalExc = round4(sumExc > 0 ? sumExc : totalInc);

    out.push({
      InvoiceTypeId: null,
      InvoiceDate: '',
      InvoiceExplanation: '',
      SalesChannelWebSite: SITE,
      CommissionTotalTaxExcluding: 0,
      CommissionTotalTaxIncluding: 0,
      OrderId: o.id,
      OrderCode: o.sipNo || o.orderNo?.toString() || o.id,
      OrderDate: new Date(o.createdAt).toISOString(),
      CustomerId: cust?.id || o.id,
      BillingName: ad,
      BillingAddress: adres,
      BillingTown: ilce,
      BillingCity: il,
      BillingMobilePhone: tel,
      BillingPhone: '',
      SSNTCNo: '',
      Email: cust?.email || cust?.instagram || '',
      ShippingId: o.id,
      ShippingName: ad,
      ShippingAddress: adres,
      ShippingTown: ilce,
      ShippingCity: il,
      ShippingCountry: 'Türkiye',
      ShippingZipCode: '',
      ShippingPhone: tel,
      ShipCompany: o.kargoFirmasi || '',
      CargoCampaignCode: '',
      PaymentTypeId: paymentTypeId(o.odemeYontemi || ''),
      PaymentType: (o.odemeYontemi || '').trim() || 'Bilinmiyor',
      Currency: 'TRY',
      CurrencyRate: 1,
      TotalPaidTaxExcluding: totalExc,
      TotalPaidTaxIncluding: totalInc,
      ProductsTotalTaxExcluding: totalExc,
      ProductsTotalTaxIncluding: totalInc,
      ShippingChargeTotalTaxExcluding: 0,
      ShippingChargeTotalTaxIncluding: 0,
      DiscountTotalTaxExcluding: 0,
      DiscountTotalTaxIncluding: 0,
      ExtraFees: [],
      OrderDetails: details,
    });
  }

  res.json({ Orders: out });
}));

function statusText(id: number): string {
  switch (id) {
    case 1: return 'hazirlaniyor';
    case 2: return 'hazirlaniyor';
    case 3: return 'kargoda';
    case 4: return 'tamamlandi';
    case 5: return 'iptal';
    case 6: return 'iptal';
    default: return 'hazirlaniyor';
  }
}

// ── 4) /orderCargoUpdate ──
router.post('/orderCargoUpdate', asyncHandler(async (req: Request, res: Response) => {
  const t = await resolveTenant(req);
  if (!t) return res.status(401).json({ error: 'Geçersiz token.' });
  const b = req.body || {};
  const orderId = String(b.orderId || '');
  if (!orderId) return res.status(400).json({ error: 'orderId gerekli.' });
  const order = await prisma.storeOrder.findFirst({ where: { tenantId: t.tenantId, OR: [{ id: orderId }, { sipNo: orderId }] } });
  if (!order) return res.json({ success: false });
  await prisma.storeOrder.update({
    where: { id: order.id },
    data: {
      durum: statusText(Number(b.orderStatusId) || 3),
      kargoFirmasi: b.cargoCompany || order.kargoFirmasi,
      kargoTakip: b.cargoTrackingCode || order.kargoTakip,
    },
  });
  res.json({ success: true });
}));

// ── 5) /invoiceLinkUpdate ──
router.post('/invoiceLinkUpdate', asyncHandler(async (req: Request, res: Response) => {
  const t = await resolveTenant(req);
  if (!t) return res.status(401).json({ error: 'Geçersiz token.' });
  const b = req.body || {};
  const orderId = String(b.orderId || '');
  if (!orderId) return res.status(400).json({ error: 'orderId gerekli.' });
  const order = await prisma.storeOrder.findFirst({ where: { tenantId: t.tenantId, OR: [{ id: orderId }, { sipNo: orderId }] } });
  const realId = order?.id || orderId;
  await prisma.birFaturaFatura.upsert({
    where: { tenantId_orderId: { tenantId: t.tenantId, orderId: realId } },
    update: { invoiceLink: b.invoiceLink || '', invoiceNo: b.invoiceNo || '' },
    create: { tenantId: t.tenantId, orderId: realId, sipNo: order?.sipNo || null, invoiceLink: b.invoiceLink || '', invoiceNo: b.invoiceNo || '' },
  });
  res.json({ success: true });
}));

// ── health ──
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'OK', service: 'BirFatura API', version: '1.0.0', site: SITE });
});

export default router;
