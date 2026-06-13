import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../lib/http';
import { createShipment, getGonderici, trackingUrl } from './cargo.service';
import { notifyOrderSms } from '../sms/netgsm.service';
import { env } from '../../config/env';

const router = Router();

const CARGO_LABEL: Record<string, string> = {
  yurtici: 'Yurtiçi Kargo', aras: 'Aras Kargo', surat: 'Sürat Kargo', mng: 'MNG Kargo', ptt: 'PTT Kargo',
};

// Kargo durum bilgisi: gönderici tanımlı mı, hangi taşıyıcılar aktif
router.get('/status', asyncHandler(async (req: Request, res: Response) => {
  const gonderici = await getGonderici(req.tenantId!);
  const settings = await prisma.integrationSetting.findMany({ where: { scope: 'TENANT', tenantId: req.tenantId!, category: 'CARGO' } });
  const carriers = settings.filter((s) => s.provider !== 'gonderici' && s.enabled).map((s) => ({ provider: s.provider, label: CARGO_LABEL[s.provider] || s.provider }));
  res.json({ gondericiTanimli: !!gonderici, gonderici: gonderici ? { unvan: gonderici.unvan, il: gonderici.il, ilce: gonderici.ilce } : null, carriers });
}));

// Sipariş için kargo gönderisi oluştur (API veya manuel takip no)
router.post('/shipment', asyncHandler(async (req: Request, res: Response) => {
  const { orderId, provider, odeme, desi, kg, manualTracking, alici } = req.body || {};
  if (!orderId) throw new ApiError(422, 'Sipariş gerekli.');
  if (!provider) throw new ApiError(422, 'Kargo firması seçin.');
  const order = await prisma.storeOrder.findFirst({ where: { id: orderId, tenantId: req.tenantId! }, include: { customer: true } });
  if (!order) throw new ApiError(404, 'Sipariş bulunamadı.');

  // Alıcı bilgisi: gövdeden gelen > müşteri kaydı > sipariş adresi
  const al = alici || {};
  const aliciBilgi = {
    ad: al.ad || order.customer?.ad || order.musteriHandle || 'Müşteri',
    telefon: al.telefon || order.customer?.telefon || '',
    il: al.il || '',
    ilce: al.ilce || '',
    adres: al.adres || order.adres || order.customer?.adres || '',
  };

  const cargoKey = order.orderNo ? `${order.orderYil}${String(order.orderNo).padStart(4, '0')}` : order.id.slice(-10);
  const result = await createShipment(req.tenantId!, {
    provider,
    cargoKey,
    alici: aliciBilgi,
    odeme: odeme === 'alici' ? 'alici' : 'gonderici',
    desi: Number(desi) || 1,
    kg: Number(kg) || 1,
    aciklama: `Sipariş ${cargoKey}`,
    manualTracking: manualTracking || undefined,
  });

  const firmaLabel = CARGO_LABEL[provider] || provider;
  const updated = await prisma.storeOrder.update({
    where: { id: order.id },
    data: { durum: 'kargoda', kargoFirmasi: firmaLabel, kargoTakip: result.trackingNo },
  });

  // Log + SMS bildirimi (kargoya verildi)
  try {
    await prisma.orderEvent.create({ data: { tenantId: req.tenantId!, orderId: order.id, kullanici: 'Sistem', islem: 'Kargo gönderisi oluşturuldu', detay: `${firmaLabel} · Takip: ${result.trackingNo}${result.manual ? ' (manuel)' : ''}` } });
  } catch { /* */ }
  try {
    const tnt = await prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { name: true } });
    const no2 = order.orderNo ? `${order.orderYil}-${String(order.orderNo).padStart(3, '0')}` : order.id.slice(-5);
    void notifyOrderSms(req.tenantId!, 'shipped', { phone: order.customer?.telefon, ad: order.customer?.ad, no: no2, tutar: order.toplam, kargo: firmaLabel, takip: result.trackingNo, firma: tnt?.name || '', sepetLink: (order as any).token ? `${env.APP_DOMAIN}/sepet/${(order as any).token}` : undefined });
  } catch { /* */ }

  res.json({ ok: true, trackingNo: result.trackingNo, trackingUrl: result.trackingUrl || trackingUrl(provider, result.trackingNo), manual: result.manual, durum: updated.durum, kargoFirmasi: firmaLabel });
}));

export default router;
