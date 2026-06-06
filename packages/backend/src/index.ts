import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { startCron } from './jobs/cron';

async function main() {
  const app = createApp();
  await prisma.$connect();
  startCron();
  app.listen(env.PORT, () => {
    console.log(`[${env.APP_NAME}] API çalışıyor: http://localhost:${env.PORT}/api/v1`);
  });
}

main().catch((e) => {
  console.error('Başlatma hatası:', e);
  process.exit(1);
});

process.on('SIGINT', async () => { await prisma.$disconnect(); process.exit(0); });
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });
