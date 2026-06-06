#!/usr/bin/env bash
# FinansTakip sunucu kurulum (scp ile kod zaten /var/www/finanstakip içinde)
set -e
export DEBIAN_FRONTEND=noninteractive
APP_DIR=/var/www/finanstakip
DB_NAME=finanstakip
DB_USER=finanstakip
DOMAIN=diljar.com

echo "=== [1/9] APT paketleri ==="
apt-get update -y
apt-get install -y curl ufw nginx openssl ca-certificates gnupg

echo "=== [2/9] Firewall ==="
ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true
yes | ufw enable || true

echo "=== [3/9] Node.js 20 ==="
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2 || true
node -v

echo "=== [4/9] PostgreSQL ==="
apt-get install -y postgresql postgresql-contrib
systemctl enable --now postgresql

# .env yoksa oluştur (DB şifresi + JWT secret üret)
ENVFILE="$APP_DIR/packages/backend/.env"
if [ ! -f "$ENVFILE" ]; then
  DB_PASS=$(openssl rand -hex 16)
  ACC=$(openssl rand -hex 32)
  REF=$(openssl rand -hex 32)
  cat > "$ENVFILE" <<EOF
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?schema=public"
PORT=3000
NODE_ENV=production
JWT_SECRET="${ACC}"
JWT_REFRESH_SECRET="${REF}"
JWT_ACCESS_EXPIRES="15m"
JWT_REFRESH_EXPIRES="7d"
APP_NAME="FinansTakip"
APP_DOMAIN="https://${DOMAIN}"
TRIAL_DAYS=7
UPLOAD_DIR="./uploads"
MAX_UPLOAD_MB=10
SEED_ADMIN_EMAIL="admin@diljar.com"
SEED_ADMIN_PASSWORD="Admin1234!"
SEED_ADMIN_NAME="Platform Yoneticisi"
EOF
  echo ".env olusturuldu"
else
  DB_PASS=$(grep -oP '(?<=postgresql://'"${DB_USER}"':)[^@]+' "$ENVFILE")
  echo ".env zaten var"
fi

# DB kullanıcı + veritabanı
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
sudo -u postgres psql -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

echo "=== [5/9] npm install ==="
cd "$APP_DIR"
npm install

echo "=== [6/9] Prisma db push + seed ==="
cd "$APP_DIR/packages/backend"
npx prisma db push
npx prisma db seed || true

echo "=== [7/9] Build ==="
cd "$APP_DIR"
npm run build

echo "=== [8/9] PM2 ==="
mkdir -p /var/log/finanstakip "$APP_DIR/packages/backend/uploads"
pm2 delete finanstakip-api 2>/dev/null || true
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root | tail -n1 | bash || true

echo "=== [9/9] Nginx ==="
cp deploy/nginx.conf /etc/nginx/sites-available/finanstakip
ln -sf /etc/nginx/sites-available/finanstakip /etc/nginx/sites-enabled/finanstakip
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "BOOTSTRAP_DONE_OK"
