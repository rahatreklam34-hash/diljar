#!/usr/bin/env bash
# Diljar - SaaS'tan BIREYSEL MODA GECIS (TEK SEFERLIK calistir)
# Once veritabani yedegi alir, eski super admin hesabini temizler,
# yeni semayi uygular, derler ve servisi yeniden baslatir.
# Kullanim (sunucuda):  cd /var/www/finanstakip && bash deploy/bireysel-gecis.sh
set -e
APP_DIR=/var/www/finanstakip
cd "$APP_DIR"

echo "==> [1/6] Veritabani yedegi aliniyor (guvenlik icin)..."
mkdir -p /root/diljar-yedek
sudo -u postgres pg_dump finanstakip | gzip > "/root/diljar-yedek/oncesi-$(date +%F-%H%M).sql.gz"
echo "    Yedek alindi: /root/diljar-yedek/"

echo "==> [2/6] GitHub'dan guncel kod cekiliyor..."
git pull

echo "==> [3/6] Eski super admin hesabi temizleniyor (varsa)..."
cd "$APP_DIR/packages/backend"
npx prisma db execute --schema=prisma/schema.prisma --stdin <<'SQL' || true
DELETE FROM "User" WHERE role = 'SUPER_ADMIN';
SQL

echo "==> [4/6] Yeni sema veritabanina uygulaniyor..."
npx prisma db push --accept-data-loss
npx prisma generate
cd "$APP_DIR"

echo "==> [5/6] Derleniyor (build)..."
npm run build

echo "==> [6/6] Servis yeniden baslatiliyor..."
pm2 restart finanstakip-api --update-env
sleep 3
echo -n "Saglik kontrolu: "
curl -s http://localhost:3000/api/v1/health; echo
echo ""
echo "BIREYSEL MODA GECIS TAMAM."
echo "Bundan sonra her guncellemede sadece sunu calistir: bash deploy/update.sh"
