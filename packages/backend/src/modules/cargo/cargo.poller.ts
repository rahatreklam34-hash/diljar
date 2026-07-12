import { prisma } from '../../lib/prisma';
import { queryShipment } from './cargo.service';

// Yurtici kargolarda 'kargoda' durumundaki gonderileri periyodik sorgular,
// teslim edildiyse siparis durumunu otomatik 'teslim'e ceker.
let started = false;
const INTERVAL_MS = 30 * 60 * 1000; // 30 dk

async function runOnce(): Promise<void> {
  // Yurtici + halen 'kargoda' olan, takip/cargoKey'i bulunan gonderiler
  const orders = await prisma.storeOrder.findMany({
    where: {
      durum: 'kargoda',
      kargoFirmasi: { contains: 'Yurt', mode: 'insensitive' },
      OR: [{ cargoKey: { not: null } }, { kargoTakip: { not: null } }],
    },
    select: { id: true, tenantId: true, cargoKey: true, kargoTakip: true },
    take: 300,
  });
  for (const o of orders) {
    const key = o.cargoKey || o.kargoTakip;
    if (!key) continue;
    try {
      const sonuc = await queryShipment(o.tenantId, 'yurtici', key);
      const data: any = { kargoDurum: sonuc.asamaLabel || sonuc.durum };
      if (sonuc.asama) data.kargoAsama = sonuc.asama;
      if (sonuc.ucret != null) data.kargoMaliyet = sonuc.ucret;
      if (sonuc.teslim) data.durum = 'teslim';
      // Gercek Yurtici kargo takip numarasi olustuysa otomatik kaydet (cargoKey/referanstan farkli olmali)
      const yeniReal = sonuc.trackingNumber && sonuc.trackingNumber !== o.cargoKey && sonuc.trackingNumber !== o.kargoTakip ? sonuc.trackingNumber : null;
      if (yeniReal) data.kargoTakip = yeniReal;
      await prisma.storeOrder.update({ where: { id: o.id }, data });
      if (yeniReal) {
        try { await prisma.orderEvent.create({ data: { tenantId: o.tenantId, orderId: o.id, kullanici: 'Sistem', islem: 'Yurtiçi takip numarası alındı', detay: yeniReal } }); } catch { /* */ }
      }
      if (sonuc.teslim) {
        try { await prisma.orderEvent.create({ data: { tenantId: o.tenantId, orderId: o.id, kullanici: 'Sistem', islem: 'Kargo teslim edildi', detay: 'Yurtiçi otomatik sorgu' } }); } catch { /* */ }
      }
    } catch { /* canli sorgu basarisiz -> sonraki turda tekrar dene */ }
  }
}

export function startCargoPoller(): void {
  if (started) return;
  started = true;
  // Ilk tur 1 dk sonra (acilis yukunu dagit), sonra periyodik
  setTimeout(() => { runOnce().catch(() => { /* */ }); }, 60 * 1000);
  setInterval(() => { runOnce().catch(() => { /* */ }); }, INTERVAL_MS);
}
