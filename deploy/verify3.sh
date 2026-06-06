#!/usr/bin/env bash
B="https://diljar.com/api/v1"
R="--resolve diljar.com:443:127.0.0.1 -s"
printf '%s' '{"email":"admin@diljar.com","password":"Admin1234!"}' > /tmp/al.json
TOKEN=$(curl $R -X POST "$B/auth/login" -H "Content-Type: application/json" --data-binary @/tmp/al.json | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{console.log(JSON.parse(s).accessToken)})")
echo "=== admin/integrations/catalog ==="
curl $R "$B/admin/integrations/catalog" -H "Authorization: Bearer $TOKEN" | head -c 200; echo
echo "=== admin/integrations (liste, tablo testi) ==="
curl $R "$B/admin/integrations" -H "Authorization: Bearer $TOKEN" -w "\nHTTP %{http_code}\n"
echo "=== admin/integrations PUT paytr (test kaydi) ==="
printf '%s' '{"enabled":true,"mode":"TEST","config":{"merchant_id":"123456","merchant_key":"testkey","merchant_salt":"testsalt"}}' > /tmp/pt.json
curl $R -X PUT "$B/admin/integrations/paytr" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/pt.json | head -c 250; echo
echo "=== DB tablo ==="
sudo -u postgres psql -d finanstakip -tc "SELECT scope, provider, enabled FROM \"IntegrationSetting\";" 2>&1
