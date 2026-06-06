import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { autoCancelStaleReservations } from '../modules/store/live.routes';

/** Süresi dolan trial'ları TRIAL_EXPIRED yapar, dönem sonu gelen abonelikleri PAST_DUE yapar. */
export async function runExpiryChecks() {
  const now = new Date();
  const expiredTrials = await prisma.tenant.updateMany({
    where: { status: 'TRIAL', trialEndsAt: { lt: now } },
    data: { status: 'TRIAL_EXPIRED' },
  });
  const pastDue = await prisma.tenant.updateMany({
    where: {
      status: 'ACTIVE',
      subscriptions: { some: { status: 'ACTIVE', currentPeriodEnd: { lt: now } } },
    },
    data: { status: 'PAST_DUE' },
  });
  if (expiredTrials.count || pastDue.count) {
    console.log(`[cron] trial_expired=${expiredTrials.count} past_due=${pastDue.count}`);
  }
}

export function startCron() {
  // Her gün 00:05'te çalışır
  cron.schedule('5 0 * * *', () => {
    runExpiryChecks().catch((e) => console.error('[cron] hata', e));
  });
  // Her dakika: 5 dk içinde kayıt gelmeyen rezerve siparişleri iptal et
  cron.schedule('* * * * *', () => {
    autoCancelStaleReservations().catch((e) => console.error('[cron] rezerve', e));
  });
  // Sunucu açılışında bir kez çalıştır
  runExpiryChecks().catch(() => {});
}
