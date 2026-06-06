# FinansTakip SaaS

Çok kiracılı (multi-tenant) finans takip platformu. Tek kullanıcılı/localStorage tabanlı uygulamadan; gerçek backend, PostgreSQL veritabanı, kimlik doğrulama, abonelik + kredi sistemi, yönetim paneli ve destek merkezi olan bir SaaS'a dönüştürülmüştür.

## Mimari

```
finanstakip-saas/            (npm workspaces monorepo)
├── packages/
│   ├── frontend/   React + Vite + Tailwind (SPA)
│   └── backend/    Express + Prisma + PostgreSQL (REST API: /api/v1)
└── deploy/         Nginx, PM2, setup.sh, backup.sh
```

- **Tenant izolasyonu:** Shared-DB + row-level (`tenantId`). Hem auth middleware hem Prisma istemci uzantısı ile çift katmanlı.
- **Kimlik doğrulama:** JWT access token (15 dk) + httpOnly cookie refresh token (7 gün).
- **Abonelik yaşam döngüsü:** Kayıt → 7 gün TRIAL → süre dolunca TRIAL_EXPIRED (yazma kilitli) → admin manuel aktivasyon → ACTIVE. Ayrıca FROZEN/PAST_DUE/CANCELLED.
- **Roller:** `SUPER_ADMIN` (platform yöneticisi, /admin) ve `TENANT_OWNER` (firma kullanıcısı).
- **Ödeme:** Şimdilik manuel/havale. Admin panelden ödeme onayı + aktivasyon. (iyzico/Stripe için soyutlama bırakıldı.)

## Yerel Geliştirme

Önkoşullar: Node.js 20+, PostgreSQL 14+.

```bash
# 1) Bağımlılıklar
npm install

# 2) Backend ortamı
cp packages/backend/.env.example packages/backend/.env
#   .env içindeki DATABASE_URL'i kendi PostgreSQL bilgilerinizle güncelleyin

# 3) Şema + seed (süper admin + planlar)
cd packages/backend
npx prisma db push
npx prisma db seed
cd ../..

# 4) Backend (terminal 1)
npm run dev:backend     # http://localhost:3000/api/v1

# 5) Frontend (terminal 2)
npm run dev:frontend    # http://localhost:5173  (/api -> 3000 proxy)
```

Varsayılan süper admin (.env'den): `admin@diljar.com` / `Admin1234!`
→ Giriş yapınca otomatik `/admin` yönetim paneline yönlenir.

Yeni firma denemek için `/register` ekranından kayıt olun (7 gün trial başlar).

## Canlıya Alma (Ubuntu VPS)

1. Yeni bir Ubuntu 22.04 VPS edinin, root SSH ile bağlanın.
2. `deploy/setup.sh` içindeki `DB_PASS`, `DOMAIN`, `REPO_URL` değerlerini düzenleyin.
3. Çalıştırın:
   ```bash
   git clone <REPO_URL> /tmp/ft && cd /tmp/ft
   sudo bash deploy/setup.sh
   ```
   Script şunları yapar: Node + PostgreSQL + Nginx + PM2 kurulumu, DB oluşturma,
   `.env` üretimi (rastgele JWT secret), `prisma db push` + seed, build, PM2 başlatma,
   Nginx yapılandırması, günlük yedek cron'u.
4. DNS yönlendirmesi: `diljar.com` (ve `www`) **A kaydını** VPS IP'sine yönlendirin.
5. SSL:
   ```bash
   sudo certbot --nginx -d diljar.com -d www.diljar.com
   ```
6. Canlı domain değişince: `packages/backend/.env` içindeki `APP_DOMAIN`'i ve Nginx
   `server_name`'i güncelleyip `npm run build` + `pm2 restart finanstakip-api` + `systemctl reload nginx`.

### Güncelleme (deploy sonrası)
```bash
cd /var/www/finanstakip
git pull
npm install
cd packages/backend && npx prisma db push && cd ../..
npm run build
pm2 restart finanstakip-api
sudo systemctl reload nginx
```

## API Özeti (`/api/v1`)
- `auth`: register, login, refresh, logout, me
- Veri: `bootstrap` (tüm tenant verisi) + `cari-hesaplar`, `cari-hareketler`, `hareketler`, `kasa-banka`, `kredi-kartlari`, `birikim`, `cekler`, `personeller`, `personel-hareketler`, `duzenli-odemeler`, `emanet`, `hedefler`, `loglar` (POST/PATCH/DELETE)
- Özel: `kredi-kartlari/:id/odeme`, `kredi-kartlari/:id/harcama`
- `subscription`, `plans`, `credits`
- `support/tickets` (+ mesajlar)
- `uploads` (dosya yükleme)
- `admin/*`: tenants (freeze/activate/credit), payments (confirm/reject), revenue, tickets, audit, stats — yalnız SUPER_ADMIN

## Güvenlik
- helmet, CORS (yalnız APP_DOMAIN), rate limit (auth ve genel), Zod doğrulama, bcrypt şifre hash, tenant scope zorlaması.
- Secret'lar yalnız `.env` içinde, repoya dahil değil.
