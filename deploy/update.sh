#!/usr/bin/env bash
set -e
APP_DIR=/var/www/finanstakip
echo "=== kod cikartiliyor ==="
tar xzf /root/ft.tar.gz -C "$APP_DIR" 2>/dev/null || tar xzf /root/ft.tar.gz -C "$APP_DIR"
cd "$APP_DIR"
echo "=== npm install ==="
npm install
echo "=== prisma db push (sema guncelle) ==="
cd "$APP_DIR/packages/backend"
npx prisma db push --accept-data-loss
echo "=== build ==="
cd "$APP_DIR"
npm run build
echo "=== pm2 restart ==="
pm2 restart finanstakip-api --update-env
sleep 3
curl -s http://localhost:3000/api/v1/health; echo
echo UPDATE_DONE_OK
