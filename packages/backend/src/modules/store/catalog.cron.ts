import { prisma } from '../../lib/prisma';
import { cancelLinkedOrder } from './catalog.trigger';
import { env } from '../../config/env';

/**
 * Katalog talep bildirimleri ve otomatik iptal cron işleri
 * Tüm mesaj şablonları CatalogSetting'den okunur
 */

function normalizePhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10) return '90' + digits;
  if (digits.length === 11 && digits.startsWith('0')) return '9' + digits;
  if (digits.startsWith('90') && digits.length >= 12) return digits;
  return digits;
}

async function enqueueWaMessage(tenantId: string, phone: string, body: string) {
  const customerPhone = normalizePhone(phone);
  if (customerPhone.length < 10) return;
  await prisma.whatsappOutbox.create({
    data: { tenantId, lineId: null, customerPhone, body, kind: 'auto', status: 'pending' },
  });
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

function buildTemplateVars(talep: any, extra: Record<string, string> = {}): Record<string, string> {
  const items = Array.isArray(talep.items) ? talep.items as any[] : [];
  const urunler = items.map((it: any) => `• ${it.ad || it.urunAd || '-'}${it.varyasyon ? ' (' + it.varyasyon + ')' : ''} x${it.adet || 1}`).join('\n');
  // talep.toplam zaten indirim düşülmüş net tutardır
  const netToplam = Number(talep.toplam) || 0;
  const indirimTutar = Number(talep.indirim) || 0;
  const araToplam = netToplam + indirimTutar;
  return {
    talepNo: talep.talepNo,
    sipNo: talep.sepetSipNo || '',
    musteri: talep.musteri || '-',
    araToplam: araToplam.toLocaleString('tr-TR') + '₺',
    indirim: indirimTutar > 0 ? indirimTutar.toLocaleString('tr-TR') + '₺' : '0₺',
    toplam: netToplam.toLocaleString('tr-TR') + '₺',
    urunler,
    kalanDk: '0',
    sepetLink: talep.sepetToken ? `${env.APP_DOMAIN || 'https://panel.diljar.com'}/sepet/${talep.sepetToken}` : '',
    ...extra,
  };
}

/**
 * Sipariş oluşturulduğunda müşteriye bildirim gönder (eski uyumluluk)
 */
export async function sendCatalogOrderNotification(tenantId: string, talepNo: string, telefon: string, musteri: string, toplam: number, rezervDk: number) {
  const setting = await prisma.catalogSetting.findUnique({ where: { tenantId } });
  if (setting && !setting.bildirimAktif) return;
  const defaultMsg = `📋 Siparişiniz alındı!\n\n🔢 Talep No: *{talepNo}*\n💰 Toplam: *{toplam}*\n⏱️ Rezerv Süresi: {kalanDk} dakika\n\nÜrünleriniz {kalanDk} dakika boyunca sizin için rezerve edilmiştir. Bu süre içinde ödemenizi tamamlayınız.\n\n⚠️ Süre dolduğunda ödeme yapılmamışsa siparişiniz otomatik iptal edilir.`;
  const template = setting?.siparisOnayMesaji || defaultMsg;
  const msg = fillTemplate(template, { talepNo, musteri, toplam: toplam.toLocaleString('tr-TR') + '₺', kalanDk: String(rezervDk), sipNo: '', urunler: '', sepetLink: '' });
  await enqueueWaMessage(tenantId, telefon, msg);
}

/**
 * Her dakika çalışan ödeme hatırlatma tick'i
 */
export async function runCatalogReminderTick() {
  const settings = await prisma.catalogSetting.findMany({ where: { bildirimAktif: true } });
  const now = Date.now();

  for (const setting of settings) {
    // --- Dekont hatırlatma ---
    const dekontDkler = ((setting as any).dekontHatirlatmaDk || '5').split(',').map((s: string) => Number(s.trim())).filter((n: number) => n > 0).sort((a: number, b: number) => a - b);

    if (dekontDkler.length > 0) {
      const dekontTalepler = await prisma.catalogRequest.findMany({
        where: {
          tenantId: setting.tenantId,
          wpIletildi: true,
          dekontAlindi: false,
          kartOdeme: false,
          durum: { in: ['rezervde', 'odeme_bekliyor'] },
          telefon: { not: null },
        },
      });

      for (const talep of dekontTalepler) {
        if (!talep.telefon) continue;
        const talepAge = (now - new Date(talep.updatedAt).getTime()) / 60000;
        const nextDekontDk = dekontDkler[talep.hatirlatmaSayisi];
        if (nextDekontDk === undefined) continue;

        if (talepAge >= nextDekontDk) {
          const kalanDk = talep.rezervBitis ? Math.max(0, Math.round((new Date(talep.rezervBitis).getTime() - now) / 60000)) : 0;
          const defaultDekontMsg = `⏰ Ödeme Hatırlatması\n\n🔢 Talep No: *{talepNo}*\n💰 Toplam: *{toplam}*\n⏱️ Kalan Süre: {kalanDk} dakika\n\nÖdemenizi henüz almadık. Ödeme yaptıysanız lütfen dekontunuzu bu sohbetten paylaşınız.\n\n⚠️ Süre dolduğunda ödeme yapılmamışsa siparişiniz otomatik iptal edilecektir.`;
          const template = (setting as any).dekontIsteMesaji || defaultDekontMsg;
          const vars = buildTemplateVars(talep, { kalanDk: String(kalanDk) });
          const msg = fillTemplate(template, vars);

          await enqueueWaMessage(setting.tenantId, talep.telefon, msg);
          await prisma.catalogRequest.update({
            where: { id: talep.id },
            data: { hatirlatmaSayisi: { increment: 1 }, sonHatirlatma: new Date(), durum: 'odeme_bekliyor' },
          });
        }
      }
    }

    // --- Genel hatırlatma (wpIletildi olmamış eski usul talepler, geriye uyumluluk) ---
    const hatirlatmalar = (setting.hatirlatmaDk || '').split(',').map(s => Number(s.trim())).filter(n => n > 0).sort((a, b) => a - b);
    if (!hatirlatmalar.length) continue;

    const eskiTalepler = await prisma.catalogRequest.findMany({
      where: {
        tenantId: setting.tenantId,
        durum: { in: ['rezervde', 'odeme_bekliyor'] },
        wpIletildi: false,
        kartOdeme: false,
        telefon: { not: null },
      },
    });

    for (const talep of eskiTalepler) {
      if (!talep.telefon) continue;
      const talepAge = (now - new Date(talep.createdAt).getTime()) / 60000;
      const nextHatirlatma = hatirlatmalar[talep.hatirlatmaSayisi];
      if (nextHatirlatma === undefined) continue;

      if (talepAge >= nextHatirlatma) {
        const kalanDk = talep.rezervBitis ? Math.max(0, Math.round((new Date(talep.rezervBitis).getTime() - now) / 60000)) : 0;
        const defaultMsg = `⏰ Ödeme Hatırlatması\n\n🔢 Talep No: *{talepNo}*\n💰 Toplam: *{toplam}*\n⏱️ Kalan Süre: {kalanDk} dakika\n\nÖdemenizi henüz almadık. Lütfen süre dolmadan ödemenizi tamamlayınız.`;
        const template = (setting as any).dekontIsteMesaji || defaultMsg;
        const vars = buildTemplateVars(talep, { kalanDk: String(kalanDk) });
        const msg = fillTemplate(template, vars);
        await enqueueWaMessage(setting.tenantId, talep.telefon, msg);
        await prisma.catalogRequest.update({
          where: { id: talep.id },
          data: { hatirlatmaSayisi: { increment: 1 }, sonHatirlatma: new Date(), durum: 'odeme_bekliyor' },
        });
      }
    }
  }
}

/**
 * Ödeme onaylandığında müşteriye bildirim gönder (ayarlardan şablon)
 */
export async function sendCatalogPaymentConfirmation(tenantId: string, talepNo: string, telefon: string, musteri: string, tahsilat: number) {
  const setting = await prisma.catalogSetting.findUnique({ where: { tenantId } });
  if (setting && !setting.bildirimAktif) return;
  const defaultMsg = `✅ Ödemeniz Onaylandı!\n\n🔢 Talep No: *{talepNo}*\n💰 Ödenen: *{toplam}*\n\nÖdemeniz başarıyla alınmıştır. Siparişiniz hazırlanmaya başlanmıştır.\n\nTeşekkür ederiz!`;
  const template = (setting as any)?.odemeOnayMesaji || defaultMsg;
  const msg = fillTemplate(template, { talepNo, musteri, toplam: tahsilat.toLocaleString('tr-TR') + '₺', sipNo: '', urunler: '', kalanDk: '', sepetLink: '' });
  await enqueueWaMessage(tenantId, telefon, msg);
}

/**
 * Her dakika çalışan otomatik iptal tick'i
 * Rezerv süresi dolan talepleri otomatik iptal et + bildirim gönder + stok iade
 * NOT: kartOdeme=true olan talepler atlanır (sayaç durmuş)
 */
export async function runCatalogAutoCancelTick() {
  const settings = await prisma.catalogSetting.findMany({ where: { otomatikIptal: true } });
  const now = new Date();

  for (const setting of settings) {
    const expiredTalepler = await prisma.catalogRequest.findMany({
      where: {
        tenantId: setting.tenantId,
        durum: { in: ['rezervde', 'odeme_bekliyor'] },
        kartOdeme: false,
        dekontAlindi: false,
        rezervBitis: { lte: now, not: null },
      },
    });

    for (const talep of expiredTalepler) {
      // Ödeme koruması: bağlı siparişe (Excel/manuel/kart) tahsilat işlenmişse iptal ETME
      const oid = (talep as any).orderId;
      if (oid) {
        const ord = await prisma.storeOrder.findUnique({ where: { id: oid }, select: { tahsilat: true } }).catch(() => null);
        if (ord && (Number(ord.tahsilat) || 0) > 0.01) {
          await prisma.catalogRequest.updateMany({ where: { id: talep.id }, data: { dekontAlindi: true } }).catch(() => {});
          continue;
        }
      }
      // Race-condition koruması: güncelleme anında koşulları tekrar kontrol et
      // Webhook arada dekontAlindi=true veya kartOdeme=true yapmış olabilir
      const result = await prisma.catalogRequest.updateMany({
        where: {
          id: talep.id,
          durum: { in: ['rezervde', 'odeme_bekliyor'] },
          dekontAlindi: false,
          kartOdeme: false,
          rezervBitis: { lte: now, not: null },
        },
        data: { durum: 'iptal', iptalZamani: now, iptalSebebi: 'timeout' },
      });

      // Eğer satır güncellenmemişse (arada dekont gelmiş veya kart ödeme yapılmış) atla
      if (result.count === 0) continue;

      // Bağlı StoreOrder'u iptal et + stok iade
      await cancelLinkedOrder((talep as any).orderId);

      if (talep.telefon && setting.bildirimAktif) {
        const defaultMsg = `❌ Sipariş İptal Edildi\n\n🔢 Talep No: *{talepNo}*\n💰 Tutar: *{toplam}*\n\nRezerv süreniz dolduğu ve ödeme yapılmadığı için siparişiniz otomatik olarak iptal edilmiştir.\n\nYeniden sipariş vermek isterseniz katalog linkinden tekrar sipariş oluşturabilirsiniz.`;
        const template = (setting as any)?.iptalMesaji || defaultMsg;
        const vars = buildTemplateVars(talep);
        const msg = fillTemplate(template, vars);
        await enqueueWaMessage(setting.tenantId, talep.telefon, msg);
      }
    }
  }
}
