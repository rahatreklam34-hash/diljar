import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@diljar.com').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin1234!';
  const name = process.env.SEED_ADMIN_NAME || 'Platform Yöneticisi';

  // Süper admin (tenant'sız)
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: { email, passwordHash, fullName: name, role: 'SUPER_ADMIN', emailVerified: true },
    });
    console.log(`✔ Süper admin oluşturuldu: ${email} / ${password}`);
  } else {
    console.log(`• Süper admin zaten var: ${email}`);
  }

  // Planlar
  const plans = [
    { name: 'Başlangıç', priceMonthly: 29900, priceYearly: 299000, creditPerMonth: 0, features: ['Tek kullanıcı', 'Temel raporlar', 'E-posta destek'] },
    { name: 'Profesyonel', priceMonthly: 59900, priceYearly: 599000, creditPerMonth: 100, features: ['Sınırsız cari', 'Gelişmiş raporlar', 'Öncelikli destek', 'Aylık 100 kredi'] },
    { name: 'Kurumsal', priceMonthly: 99900, priceYearly: 999000, creditPerMonth: 300, features: ['Tüm özellikler', 'Çoklu kullanıcı', '7/24 destek', 'Aylık 300 kredi'] },
  ];
  for (const p of plans) {
    const found = await prisma.plan.findFirst({ where: { name: p.name } });
    if (!found) {
      await prisma.plan.create({ data: { ...p, features: p.features as any } });
      console.log(`✔ Plan oluşturuldu: ${p.name}`);
    }
  }
  console.log('Seed tamamlandı.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
