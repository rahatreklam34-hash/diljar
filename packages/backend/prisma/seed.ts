import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const prisma = new PrismaClient();

async function main() {
  // Bireysel mod: SaaS tohum verisi (süper admin, planlar) kaldırıldı.
  // İlk firma ve sahip kullanıcı /register ile oluşturulur.
  console.log('Seed: bireysel mod — ek tohum verisi yok.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
