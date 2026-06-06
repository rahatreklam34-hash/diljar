#!/usr/bin/env bash
echo "=== HTTPS health ==="
curl -s --resolve diljar.com:443:127.0.0.1 https://diljar.com/api/v1/health; echo
echo "=== HTTP->HTTPS redirect ==="
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" --resolve diljar.com:80:127.0.0.1 http://diljar.com/
echo "=== index ==="
curl -s --resolve diljar.com:443:127.0.0.1 -o /dev/null -w "HTTP %{http_code}, %{size_download} bytes\n" https://diljar.com/
echo "=== login over https ==="
printf '%s' '{"email":"admin@diljar.com","password":"Admin1234!"}' > /tmp/lg.json
curl -s --resolve diljar.com:443:127.0.0.1 -X POST https://diljar.com/api/v1/auth/login -H "Content-Type: application/json" --data-binary @/tmp/lg.json -o /dev/null -w "login HTTP %{http_code}\n"
echo "=== cert bilgisi ==="
certbot certificates 2>/dev/null | grep -E "Certificate Name|Domains|Expiry"
