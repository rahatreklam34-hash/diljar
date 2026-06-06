#!/usr/bin/env bash
set -e
# --- SSH sadece anahtar (paylasilan parola SSH icin gecersiz olsun) ---
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config || true
sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config || true
if [ -f /etc/ssh/sshd_config.d/50-cloud-init.conf ]; then
  sed -i 's/^PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config.d/50-cloud-init.conf || true
fi
(systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null) || true

# --- Gunluk PostgreSQL yedegi (cron 03:00) ---
mkdir -p /var/log/finanstakip
install -m 755 /var/www/finanstakip/deploy/backup.sh /usr/local/bin/finanstakip-backup.sh
sed -i 's/\r$//' /usr/local/bin/finanstakip-backup.sh
( crontab -l 2>/dev/null | grep -v finanstakip-backup ; echo "0 3 * * * DB_NAME=finanstakip DB_USER=finanstakip /usr/local/bin/finanstakip-backup.sh >> /var/log/finanstakip/backup.log 2>&1" ) | crontab -

echo "--- SSH ayar ---"
grep -E "^PasswordAuthentication" /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null
echo "--- cron ---"
crontab -l | grep finanstakip-backup
echo HARDEN_DONE
