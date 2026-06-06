#!/usr/bin/env bash
# FinansTakip - Ubuntu 22.04 VPS ilk kurulum scripti
# Kullanım:  sudo bash deploy/setup.sh
# Bu script'i ROOT yetkisiyle çalıştırın. Domain ve şifreleri kendinize göre güncelleyin.
set -euo pipefail

# ───────── Ayarlanacak değişkenler ─────────
APP_DIR="/var/www/finanstakip"
DB_NAME="finanstakip"
DB_USER="finanstakip"
DB_PASS="DEGISTIR_guclu_bir_sifre"
DOMAIN="diljar.com"
REPO_URL="https://github.com/KULLANICI/finanstakip-saas.git"   # kendi repo adresiniz

echo "==> Sistem güncelleniyor"
apt-get update -y && apt-get upgrade -y

echo "==> Gerekli paketler"
apt-get install -y curl git ufw nginx

echo "==> Firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "==> Node.js 20 (NodeSource)"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pm2

echo "==> PostgreSQL"
apt-get install -y postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" || true
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" || true

echo "==> Uygulama klonlanıyor"
mkdir -p "$(dirname "$APP_DIR")"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

echo "==> Backend .env oluşturuluyor (yoksa)"
if [ ! -f packages/backend/.env ]; then
  cp packages/backend/.env.example packages/backend/.env
  sed -i "s#postgresql://finanstakip:CHANGE_ME@localhost:5432/finanstakip?schema=public#postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?schema=public#" packages/backend/.env
  sed -i "s#NODE_ENV=development#NODE_ENV=production#" packages/backend/.env
  sed -i "s#APP_DOMAIN=.*#APP_DOMAIN=https://${DOMAIN}#" packages/backend/.env
  # rastgele JWT secret'lar
  ACC=$(openssl rand -hex 32); REF=$(openssl rand -hex 32)
  sed -i "s#JWT_SECRET=.*#JWT_SECRET=\"${ACC}\"#" packages/backend/.env
  sed -i "s#JWT_REFRESH_SECRET=.*#JWT_REFRESH_SECRET=\"${REF}\"#" packages/backend/.env
  echo "   .env oluşturuldu — lütfen SEED_ADMIN_* değerlerini kontrol edin."
fi

echo "==> Bağımlılıklar kuruluyor"
npm install

echo "==> Veritabanı şeması + seed"
cd packages/backend
npx prisma db push
npx prisma db seed || true
cd "$APP_DIR"

echo "==> Build"
npm run build

echo "==> Loglar + uploads klasörü"
mkdir -p /var/log/finanstakip
mkdir -p "$APP_DIR/packages/backend/uploads"

echo "==> PM2 ile backend başlatılıyor"
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root | tail -n 1 | bash || true

echo "==> Nginx yapılandırması"
cp deploy/nginx.conf /etc/nginx/sites-available/finanstakip
sed -i "s/diljar.com/${DOMAIN}/g" /etc/nginx/sites-available/finanstakip
ln -sf /etc/nginx/sites-available/finanstakip /etc/nginx/sites-enabled/finanstakip
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> SSL için Certbot"
apt-get install -y certbot python3-certbot-nginx
echo "Şimdi DNS A kaydınızı bu sunucuya yönlendirin, ardından şunu çalıştırın:"
echo "   sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"

echo "==> Otomatik yedekleme (cron)"
cp deploy/backup.sh /usr/local/bin/finanstakip-backup.sh
chmod +x /usr/local/bin/finanstakip-backup.sh
( crontab -l 2>/dev/null; echo "0 3 * * * DB_NAME=${DB_NAME} DB_USER=${DB_USER} /usr/local/bin/finanstakip-backup.sh" ) | crontab -

echo "✔ Kurulum tamamlandı. http://${DOMAIN} açılmalı (SSL sonrası https)."
echo "  Süper admin: packages/backend/.env içindeki SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD"
