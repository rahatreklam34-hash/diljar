#!/usr/bin/env bash
# FinansTakip - Günlük PostgreSQL yedeği. Cron: 0 3 * * *
# Ortam: DB_NAME, DB_USER environment değişkenleri (cron satırında verilir)
set -euo pipefail

DB_NAME="${DB_NAME:-finanstakip}"
DB_USER="${DB_USER:-finanstakip}"
BACKUP_DIR="/var/backups/finanstakip"
STAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"
# pg_dump (peer/ident auth ile postgres kullanıcısı üzerinden)
sudo -u postgres pg_dump "$DB_NAME" | gzip > "$BACKUP_DIR/${DB_NAME}-${STAMP}.sql.gz"

# 7 günden eski yedekleri sil
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete

echo "Yedek alındı: $BACKUP_DIR/${DB_NAME}-${STAMP}.sql.gz"
