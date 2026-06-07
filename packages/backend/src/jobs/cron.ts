import cron from 'node-cron';
import { autoCancelStaleReservations } from '../modules/store/live.routes';

export function startCron() {
  // Her dakika: 5 dk içinde kayıt gelmeyen rezerve siparişleri iptal et
  cron.schedule('* * * * *', () => {
    autoCancelStaleReservations().catch((e) => console.error('[cron] rezerve', e));
  });
}
