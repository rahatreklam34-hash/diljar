import cron from 'node-cron';
import { autoCancelStaleReservations } from '../modules/store/live.routes';
import { pollFacebookComments, pollInstagramComments, refreshSavedIgTokens } from '../modules/store/fbLive';
import { processOutbox, runPaymentReminderTick } from '../modules/whatsapp/wa.service';
import { syncTemplateStatuses } from '../modules/whatsapp/wa.templates';
import { processWorkflowTick } from '../modules/whatsapp/wa.workflow';
import { runCatalogReminderTick, runCatalogAutoCancelTick } from '../modules/store/catalog.cron';

export function startCron() {
  // Her dakika: 5 dk içinde kayıt gelmeyen rezerve siparişleri iptal et
  cron.schedule('* * * * *', () => {
    autoCancelStaleReservations().catch((e) => console.error('[cron] rezerve', e));
  });

  // Her dakika: ödeme yapmayanlara ayarlı saatlerde otomatik toplu ödeme hatırlatması
  cron.schedule('* * * * *', () => {
    runPaymentReminderTick().catch((e) => console.error('[cron] wa-reminder', e));
  });

  // Her dakika: katalog talepleri - ödeme hatırlatma
  cron.schedule('* * * * *', () => {
    runCatalogReminderTick().catch((e) => console.error('[cron] catalog-reminder', e));
  });

  // Her dakika: katalog talepleri - otomatik iptal (rezerv süresi dolmuş)
  cron.schedule('* * * * *', () => {
    runCatalogAutoCancelTick().catch((e) => console.error('[cron] catalog-cancel', e));
  });

  // Her 2 sn: aktif yayınlara bağlı Facebook canlı yorumlarını çek + sipariş oluştur (anlık yansıma)
  setInterval(() => {
    pollFacebookComments().catch((e) => console.error('[cron] fb', e));
  }, 2000);

  // Her 2 sn: aktif yayınlara bağlı Instagram canlı yorumlarını çek + sipariş oluştur (anlık yansıma)
  setInterval(() => {
    pollInstagramComments().catch((e) => console.error('[cron] ig', e));
  }, 2000);

  // Her 12 saat: kayıtlı Instagram token'larını yenile → token kalıcı kalır, bir daha sıfırlanmaz
  cron.schedule('0 */12 * * *', () => {
    refreshSavedIgTokens().catch((e) => console.error('[cron] ig-refresh', e));
  });
  // Başlangıçta bir kez (gecikmeli) yenile
  setTimeout(() => { refreshSavedIgTokens().catch((e) => console.error('[cron] ig-refresh', e)); }, 30000);

  // Her 5 sn: WhatsApp giden kuyruğunu işle (throttle + günlük limit + sticky/dengeli dağıtım)
  setInterval(() => {
    processOutbox().catch((e) => console.error('[cron] wa-outbox', e));
  }, 5000);

  // Her 3 dk: WhatsApp şablon onay durumlarını Meta'dan senkronla (webhook gecikirse yedek)
  cron.schedule('*/3 * * * *', () => {
    syncTemplateStatuses().catch((e) => console.error('[cron] wa-tpl-sync', e));
  });

  // Her dakika: bekleyen görsel workflow run'larını uyandır (delay sonrası güncel veriyle devam)
  cron.schedule('* * * * *', () => {
    processWorkflowTick().catch((e) => console.error('[cron] wa-workflow', e));
  });
}
