import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../lib/http';
import { createShipment, queryShipment, getGonderici, trackingUrl } from './cargo.service';
import { notifyOrderSms } from '../sms/netgsm.service';
import { logAudit } from '../store/store.routes';
import { env } from '../../config/env';

const router = Router();

const CARGO_LABEL: Record<string, string> = {
  yurtici: 'Yurtiçi Kargo', aras: 'Aras Kargo', surat: 'Sürat Kargo', mng: 'MNG Kargo', ptt: 'PTT Kargo',
};
const LABEL_TO_PROVIDER: Record<string, string> = Object.fromEntries(Object.entries(CARGO_LABEL).map(([k, v]) => [v, k]));

// Kargo durum bilgisi: gönderici tanımlı mı, hangi taşıyıcılar aktif
router.get('/status', asyncHandler(async (req: Request, res: Response) => {
  const gonderici = await getGonderici(req.tenantId!);
  const settings = await prisma.integrationSetting.findMany({ where: { scope: 'TENANT', tenantId: req.tenantId!, category: 'CARGO' } });
  const isTrue = (v: any) => v === true || v === 'true' || v === 1 || v === '1';
  const carriers = settings.filter((s) => s.provider !== 'gonderici' && s.enabled).map((s) => {
    const cfg = (s.config as any) || {};
    return { provider: s.provider, label: CARGO_LABEL[s.provider] || s.provider, varsayilan: isTrue(cfg.varsayilan), kapidaOdeme: isTrue(cfg.kapidaOdeme) };
  });
  // Varsayilan firma en uste
  carriers.sort((a, b) => (a.varsayilan === b.varsayilan ? 0 : a.varsayilan ? -1 : 1));
  res.json({ gondericiTanimli: !!gonderici, gonderici: gonderici ? { unvan: gonderici.unvan, il: gonderici.il, ilce: gonderici.ilce } : null, carriers });
}));

// Aktif firmalar arasindan varsayilan firmayi sec (isaretli yoksa ilk aktif)
async function resolveDefaultProvider(tenantId: string): Promise<string | null> {
  const settings = await prisma.integrationSetting.findMany({ where: { scope: 'TENANT', tenantId, category: 'CARGO', enabled: true } });
  const carriers = settings.filter((s) => s.provider !== 'gonderici');
  if (!carriers.length) return null;
  const isTrue = (v: any) => v === true || v === 'true' || v === 1 || v === '1';
  const def = carriers.find((s) => isTrue(((s.config as any) || {}).varsayilan));
  return (def || carriers[0]).provider;
}

// Sipariş için kargo gönderisi oluştur (API veya manuel takip no)
router.post('/shipment', asyncHandler(async (req: Request, res: Response) => {
  const { orderId, provider, odeme, desi, kg, manualTracking, alici } = req.body || {};
  if (!orderId) throw new ApiError(422, 'Sipariş gerekli.');
  // Firma gelmediyse varsayilan firmayi sunucu tarafinda sec
  const useProvider = provider || await resolveDefaultProvider(req.tenantId!);
  if (!useProvider) throw new ApiError(422, 'Aktif kargo firması bulunamadı. Entegrasyonlardan bir firma ekleyin.');
  const order = await prisma.storeOrder.findFirst({ where: { id: orderId, tenantId: req.tenantId! }, include: { customer: true } });
  if (!order) throw new ApiError(404, 'Sipariş bulunamadı.');
  if (order.durum === 'iptal') throw new ApiError(409, 'Bu sepet iptal edilmiştir; kargo oluşturulamaz.');

  // Mükerrer kargo koruması — daha önce kargolandıysa kullanıcı onayı (force) gerekir
  const zatenKargolandi = !!order.kargoZamani || ['kargoda', 'teslim', 'tamamlandi'].includes(order.durum);
  if (zatenKargolandi && !req.body?.force) {
    throw new ApiError(409, 'Bu gönderi daha önce kargolandı. Tekrar kargolamak istediğinize emin misiniz?');
  }

  // Kalan bakiye kontrolü — ödeme tamamlanmadan kargo oluşturulamaz
  const kalanBakiye = (Number(order.toplam) || 0) - (Number(order.tahsilat) || 0);
  if (kalanBakiye > 0.01) throw new ApiError(422, `Bu sepetin tahsil edilmemiş borcu var (Kalan: ${kalanBakiye.toFixed(2)} TL). Ödeme tamamlanmadan kargolanamaz.`);

  // Alıcı bilgisi: gövdeden gelen > müşteri kaydı > sipariş adresi
  const al = alici || {};
  const aliciBilgi = {
    ad: al.ad || order.customer?.ad || order.musteriHandle || 'Müşteri',
    telefon: al.telefon || order.customer?.telefon || '',
    il: al.il || '',
    ilce: al.ilce || '',
    adres: al.adres || order.adres || order.customer?.adres || '',
  };

  const cargoKey = order.sipNo || (order.orderNo ? `${order.orderYil}${String(order.orderNo).padStart(4, '0')}` : order.id.slice(-10));
  // Tahsilatlı (kapıda ödeme) tespiti: gövdeden gelen tahsilat bayrağı > sipariş ödeme yöntemi
  const tahsilat = req.body?.tahsilat != null
    ? !!req.body.tahsilat
    : /kapida|kapıda|tahsilat|cod/i.test(order.odemeYontemi || '');
  const codTutar = tahsilat ? Math.max(0, (order.toplam || 0) - (order.tahsilat || 0)) : 0;
  const result = await createShipment(req.tenantId!, {
    provider: useProvider,
    cargoKey,
    alici: aliciBilgi,
    odeme: odeme === 'alici' ? 'alici' : 'gonderici',
    tahsilat,
    codTutar,
    desi: Number(desi) || 1,
    kg: Number(kg) || 1,
    aciklama: `Sipariş ${cargoKey}`,
    manualTracking: manualTracking || undefined,
  });

  const firmaLabel = CARGO_LABEL[useProvider] || useProvider;
  // Yurtiçi otomatik gönderide gerçek takip no henüz oluşmamış olabilir (paket taranınca oluşur);
  // bu durumda kargoTakip null bırakılır, poller/sorgu ile gerçek numara otomatik çekilir.
  const realTracking = result.trackingNo && result.trackingNo !== cargoKey ? result.trackingNo : null;
  const updated = await prisma.storeOrder.update({
    where: { id: order.id },
    data: { durum: 'kargoda', kargoFirmasi: firmaLabel, kargoTakip: realTracking, cargoKey, kargoTip: result.kargoTip || null, kargoOdeme: odeme === 'alici' ? 'alici' : 'gonderici', kargoZamani: new Date(), kargoDurum: 'Kargo Hazırlanıyor', kargoAsama: 'hazirlaniyor' },
  });

  // Log + SMS bildirimi (kargoya verildi)
  try {
    await prisma.orderEvent.create({ data: { tenantId: req.tenantId!, orderId: order.id, kullanici: 'Sistem', islem: 'Kargo gönderisi oluşturuldu', detay: `${firmaLabel} · ${realTracking ? 'Takip: ' + realTracking : 'Takip no bekleniyor'}${result.manual ? ' (manuel)' : ''}` } });
  } catch { /* */ }
  try {
    const tnt = await prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { name: true } });
    const no2 = order.orderNo ? `${order.orderYil}-${String(order.orderNo).padStart(3, '0')}` : order.id.slice(-5);
    void notifyOrderSms(req.tenantId!, 'shipped', { phone: order.customer?.telefon, ad: order.customer?.ad, no: no2, tutar: order.toplam, kargo: firmaLabel, takip: realTracking || undefined, firma: tnt?.name || '', sepetLink: (order as any).token ? `${env.APP_DOMAIN}/sepet/${(order as any).token}` : undefined });
  } catch { /* */ }

  await logAudit(req, 'kargola', 'siparis', order.id, `${firmaLabel}${realTracking ? ' · ' + realTracking : ''}`, { hedef: order.sipNo || (order.orderNo ? `${order.orderYil}-${String(order.orderNo).padStart(3, '0')}` : order.id.slice(-5)), kime: order.customer?.ad || (order as any).musteriHandle || null, neden: 'Kargo gönderisi oluşturuldu', meta: { firma: firmaLabel, takip: realTracking || null, manuel: !!result.manual } });
  res.json({ ok: true, trackingNo: realTracking, cargoKey, takipBekliyor: !realTracking && useProvider === 'yurtici', trackingUrl: realTracking ? (result.trackingUrl || trackingUrl(useProvider, realTracking)) : '', manual: result.manual, durum: updated.durum, kargoFirmasi: firmaLabel });
}));

// Sipariş kargo durumu sorgula (Yurtiçi otomatik; diğerlerinde kayıtlı durum + takip linki)
router.get('/track/:orderId', asyncHandler(async (req: Request, res: Response) => {
  const order = await prisma.storeOrder.findFirst({ where: { id: req.params.orderId, tenantId: req.tenantId! } });
  if (!order) throw new ApiError(404, 'Sipariş bulunamadı.');
  const provider = order.kargoFirmasi ? (LABEL_TO_PROVIDER[order.kargoFirmasi] || (/(yurtiçi|yurtici)/i.test(order.kargoFirmasi) ? 'yurtici' : '')) : '';
  const referans = order.cargoKey || order.sipNo || null;
  // Gerçek Yurtiçi takip no (referanstan farklı). Henüz oluşmadıysa null → link gösterilmez, canlı sorgu ile çekilir.
  const realTakip = order.kargoTakip && order.kargoTakip !== order.cargoKey && order.kargoTakip !== order.sipNo ? order.kargoTakip : null;
  const base = {
    takip: realTakip,
    referans,
    kargoFirmasi: order.kargoFirmasi || null,
    kargoTip: order.kargoTip || null,
    kargoZamani: order.kargoZamani || null,
    trackingUrl: provider && realTakip ? trackingUrl(provider, realTakip) : '',
  };
  // Yurtiçi -> canlı sorgu; cargoKey (referans) ile gerçek takip numarasını otomatik çek
  if (provider === 'yurtici' && (referans || realTakip)) {
    try {
      const sonuc = await queryShipment(req.tenantId!, 'yurtici', order.cargoKey || referans || realTakip!);
      const data: any = { kargoDurum: sonuc.asamaLabel || sonuc.durum };
      if (sonuc.asama) data.kargoAsama = sonuc.asama;
      if (sonuc.ucret != null) data.kargoMaliyet = sonuc.ucret;
      if (sonuc.teslim && order.durum !== 'teslim') data.durum = 'teslim';
      // Yurtiçi gerçek kargo takip numarası oluştuysa otomatik kaydet (müşteri bununla takip eder)
      const yeniReal = sonuc.trackingNumber && sonuc.trackingNumber !== referans ? sonuc.trackingNumber : null;
      if (yeniReal && yeniReal !== order.kargoTakip) {
        data.kargoTakip = yeniReal;
        try { await prisma.orderEvent.create({ data: { tenantId: req.tenantId!, orderId: order.id, kullanici: 'Sistem', islem: 'Yurtiçi takip numarası alındı', detay: yeniReal } }); } catch { /* */ }
      }
      try { await prisma.storeOrder.update({ where: { id: order.id }, data }); } catch { /* */ }
      const yeniTakip = yeniReal || realTakip;
      return res.json({ ...base, takip: yeniTakip, trackingUrl: yeniTakip ? trackingUrl(provider, yeniTakip) : '', durum: sonuc.asamaLabel || sonuc.durum, asama: sonuc.asama, asamaLabel: sonuc.asamaLabel, ucret: sonuc.ucret, teslim: sonuc.teslim, hareketler: sonuc.hareketler, live: true, takipBekliyor: !yeniTakip });
    } catch (e: any) {
      return res.json({ ...base, durum: order.kargoDurum || 'Kargoda', teslim: order.durum === 'teslim', hareketler: [], live: false, takipBekliyor: !realTakip, hata: e?.message || 'Durum sorgulanamadı' });
    }
  }
  if (!realTakip) return res.json({ ...base, durum: order.kargoDurum || (order.durum === 'kargoda' ? 'Kargoya verildi' : 'Henüz kargolanmadı'), teslim: order.durum === 'teslim', hareketler: [], live: false, takipBekliyor: provider === 'yurtici' });
  return res.json({ ...base, durum: order.kargoDurum || 'Kargoda', teslim: order.durum === 'teslim', hareketler: [], live: false });
}));

// Kargo İşlemleri raporu: kargolanmış (kargoZamani dolu) siparişler — sayfalı
// KPI özet: toplam kargo, teslim edildi, yolda, teslim edilmedi, toplam tutar
router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  const { from, to, odeme } = req.query as Record<string, string>;
  const base: any = { tenantId: req.tenantId!, kargoZamani: { not: null } };
  if (from || to) {
    base.kargoZamani = {};
    if (from) base.kargoZamani.gte = new Date(from);
    if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); base.kargoZamani.lte = d; }
  }
  // Kargo ücretini kim ödüyor: kargoTip ön ekinden (AÖ=alıcı, GÖ=gönderici)
  if (odeme === 'alici') base.kargoTip = { startsWith: 'AÖ' };
  else if (odeme === 'gonderici') base.kargoTip = { startsWith: 'GÖ' };
  const teslimW = { OR: [{ durum: 'teslim' }, { kargoAsama: 'teslim' }] };
  const yoldaW = { kargoAsama: { in: ['kabul', 'dagitim'] } };
  const edilmediW = { kargoAsama: 'teslim_edilemedi' };
  const iadeW = { kargoAsama: 'iade' };
  const [toplamKargo, teslimEdildi, yolda, teslimEdilmedi, iadeSurecinde, tutarAgg, maliyetAgg] = await Promise.all([
    prisma.storeOrder.count({ where: base }),
    prisma.storeOrder.count({ where: { ...base, ...teslimW } }),
    prisma.storeOrder.count({ where: { ...base, durum: { not: 'teslim' }, ...yoldaW } }),
    prisma.storeOrder.count({ where: { ...base, ...edilmediW } }),
    prisma.storeOrder.count({ where: { ...base, ...iadeW } }),
    prisma.storeOrder.aggregate({ where: base, _sum: { toplam: true } }),
    prisma.storeOrder.aggregate({ where: base, _sum: { kargoMaliyet: true } }),
  ]);
  const hazirlaniyor = Math.max(0, toplamKargo - teslimEdildi - yolda - teslimEdilmedi - iadeSurecinde);
  res.json({ toplamKargo, hazirlaniyor, teslimEdildi, yolda, teslimEdilmedi, iadeSurecinde, toplamTutar: tutarAgg._sum.toplam || 0, toplamMaliyet: maliyetAgg._sum.kargoMaliyet || 0 });
}));

router.get('/shipments', asyncHandler(async (req: Request, res: Response) => {
  const { from, to, durum, q, odeme, sort } = req.query as Record<string, string>;
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize || '50'), 10) || 50));
  const where: any = { tenantId: req.tenantId!, kargoZamani: { not: null } };
  if (durum === 'teslim') where.OR = [{ durum: 'teslim' }, { kargoAsama: 'teslim' }];
  else if (durum === 'yolda') where.AND = [{ durum: { not: 'teslim' } }, { kargoAsama: { in: ['kabul', 'dagitim'] } }];
  else if (durum === 'kabul') where.AND = [{ durum: { not: 'teslim' } }, { kargoAsama: 'kabul' }];
  else if (durum === 'dagitim') where.AND = [{ durum: { not: 'teslim' } }, { kargoAsama: 'dagitim' }];
  else if (durum === 'teslimedilmedi') where.kargoAsama = 'teslim_edilemedi';
  else if (durum === 'iade') where.kargoAsama = 'iade';
  else if (durum === 'hazirlaniyor') where.AND = [{ durum: { not: 'teslim' } }, { OR: [{ kargoAsama: 'hazirlaniyor' }, { kargoAsama: null }] }];
  // Ödeme tipi filtresi: kargoTip ön ekinden (AÖ=alıcı, GÖ=gönderici)
  if (odeme === 'alici') where.kargoTip = { startsWith: 'AÖ' };
  else if (odeme === 'gonderici') where.kargoTip = { startsWith: 'GÖ' };
  if (from || to) {
    where.kargoZamani = {};
    if (from) where.kargoZamani.gte = new Date(from);
    if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); where.kargoZamani.lte = d; }
    where.kargoZamani.not = undefined;
  }
  if (q && q.trim()) {
    const s = q.trim();
    const qOr = [
      { kargoTakip: { contains: s, mode: 'insensitive' } },
      { cargoKey: { contains: s, mode: 'insensitive' } },
      { kargoFirmasi: { contains: s, mode: 'insensitive' } },
      { customer: { ad: { contains: s, mode: 'insensitive' } } },
      { customer: { telefon: { contains: s } } },
    ];
    if (where.OR) { where.AND = [{ OR: where.OR }, { OR: qOr }]; delete where.OR; }
    else where.OR = qOr;
  }
  const orderBy = sort === 'maliyet_asc' ? { kargoMaliyet: 'asc' as const }
    : sort === 'maliyet_desc' ? { kargoMaliyet: 'desc' as const }
    : sort === 'tarih_asc' ? { kargoZamani: 'asc' as const }
    : { kargoZamani: 'desc' as const };
  const [total, rows, maliyetAgg] = await Promise.all([
    prisma.storeOrder.count({ where }),
    prisma.storeOrder.findMany({
      where, orderBy, skip: (page - 1) * pageSize, take: pageSize,
      include: { customer: { select: { ad: true, telefon: true } } },
    }),
    prisma.storeOrder.aggregate({ where, _sum: { kargoMaliyet: true } }),
  ]);
  const items = rows.map((o) => {
    const provider = o.kargoFirmasi ? (LABEL_TO_PROVIDER[o.kargoFirmasi] || (/(yurtiçi|yurtici)/i.test(o.kargoFirmasi) ? 'yurtici' : '')) : '';
    const referans = o.cargoKey || o.sipNo || null;
    // Gerçek Yurtiçi takip no: cargoKey/sipNo'dan farklı olmalı (aksi halde bizim referansımızdır, Yurtiçi'de geçersiz)
    const realTakip = o.kargoTakip && o.kargoTakip !== o.cargoKey && o.kargoTakip !== o.sipNo ? o.kargoTakip : null;
    const takipBekliyor = provider === 'yurtici' && !realTakip && o.durum !== 'teslim';
    return {
      id: o.id,
      siparisNo: o.sipNo || (o.orderNo ? `${o.orderYil}-${String(o.orderNo).padStart(3, '0')}` : o.id.slice(-5)),
      musteri: o.customer?.ad || o.musteriHandle || '-',
      telefon: o.customer?.telefon || null,
      token: o.token || null,
      kargoFirmasi: o.kargoFirmasi || '-',
      kargoTakip: realTakip,
      takipBekliyor,
      referans,
      kargoTip: o.kargoTip || null,
      kargoDurum: o.kargoDurum || null,
      kargoAsama: o.kargoAsama || (o.durum === 'teslim' ? 'teslim' : 'hazirlaniyor'),
      kargoMaliyet: o.kargoMaliyet ?? null,
      kargoOdeme: o.kargoTip?.startsWith('AÖ') ? 'alici' : o.kargoTip?.startsWith('GÖ') ? 'gonderici' : (o.kargoOdeme === 'alici' ? 'alici' : 'gonderici'),
      durum: o.durum,
      kargoZamani: o.kargoZamani,
      toplam: o.toplam || 0,
      provider,
      trackingUrl: provider && realTakip ? trackingUrl(provider, realTakip) : '',
      canQuery: provider === 'yurtici',
      cargoKey: referans,
    };
  });
  res.json({ items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), toplamMaliyet: maliyetAgg._sum.kargoMaliyet || 0 });
}));

// Elle "teslim edildi" işaretle (API'siz firmalar için)
router.post('/:orderId/teslim', asyncHandler(async (req: Request, res: Response) => {
  const order = await prisma.storeOrder.findFirst({ where: { id: req.params.orderId, tenantId: req.tenantId! } });
  if (!order) throw new ApiError(404, 'Sipariş bulunamadı.');
  const updated = await prisma.storeOrder.update({ where: { id: order.id }, data: { durum: 'teslim', kargoDurum: 'Teslim Edildi', kargoAsama: 'teslim' } });
  try { await prisma.orderEvent.create({ data: { tenantId: req.tenantId!, orderId: order.id, kullanici: 'Sistem', islem: 'Kargo teslim edildi', detay: 'Elle işaretlendi' } }); } catch { /* */ }
  res.json({ ok: true, durum: updated.durum });
}));

export default router;
