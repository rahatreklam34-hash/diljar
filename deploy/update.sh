#!/usr/bin/env bash
# Diljar - RUTIN GUNCELLEME
# GitHub'daki guncel kodu ceker, derler ve servisi yeniden baslatir.
# Kullanim (sunucuda):  cd /var/www/finanstakip && bash deploy/update.sh
set -e
APP_DIR=/var/www/finanstakip
cd "$APP_DIR"

echo "==> [1/5] GitHub'dan guncel kod cekiliyor (git pull)..."
git pull

echo "==> [2/5] Bagimliliklar (npm install)..."
npm install

echo "==> [3/5] Prisma client + sema senkronu..."
cd "$APP_DIR/packages/backend"
npx prisma generate
npx prisma db push --accept-data-loss
cd "$APP_DIR"

echo "==> [4/5] Derleniyor (build)..."
npm run build

echo "==> [5/5] Servis yeniden baslatiliyor..."
pm2 restart finanstakip-api --update-env
sleep 3
echo -n "Saglik kontrolu: "
curl -s http://localhost:3000/api/v1/health; echo
echo ""
echo "GUNCELLEME TAMAM. Tarayicida Ctrl+F5 yapip kontrol edin."
