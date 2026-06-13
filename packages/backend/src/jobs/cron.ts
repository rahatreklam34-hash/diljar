import cron from 'node-cron';
import { autoCancelStaleReservations } from '../modules/store/live.routes';
import { pollFacebookComments, pollInstagramComments, refreshSavedIgTokens } from '../modules/store/fbLive';

export function startCron() {
  // Her dakika: 5 dk içinde kayıt gelmeyen rezerve siparişleri iptal et
  cron.schedule('* * * * *', () => {
    autoCancelStaleReservations().catch((e) => console.error('[cron] rezerve', e));
  });

  // Her 5 sn: aktif yayınlara bağlı Facebook canlı yorumlarını çek + sipariş oluştur
  setInterval(() => {
    pollFacebookComments().catch((e) => console.error('[cron] fb', e));
  }, 5000);

  // Her 5 sn: aktif yayınlara bağlı Instagram canlı yorumlarını çek + sipariş oluştur
  setInterval(() => {
    pollInstagramComments().catch((e) => console.error('[cron] ig', e));
  }, 5000);

  // Her 12 saat: kayıtlı Instagram token'larını yenile → token kalıcı kalır, bir daha sıfırlanmaz
  cron.schedule('0 */12 * * *', () => {
    refreshSavedIgTokens().catch((e) => console.error('[cron] ig-refresh', e));
  });
  // Başlangıçta bir kez (gecikmeli) yenile
  setTimeout(() => { refreshSavedIgTokens().catch((e) => console.error('[cron] ig-refresh', e)); }, 30000);
}
