#!/usr/bin/env bash
B="https://diljar.com/api/v1"
R="--resolve diljar.com:443:127.0.0.1 -s"
echo "=== public/plans (anonim) ==="
curl $R "$B/public/plans" | head -c 200; echo
echo "=== admin login ==="
printf '%s' '{"email":"admin@diljar.com","password":"Admin1234!"}' > /tmp/al.json
TOKEN=$(curl $R -X POST "$B/auth/login" -H "Content-Type: application/json" --data-binary @/tmp/al.json | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{console.log(JSON.parse(s).accessToken)})")
echo "token alindi: ${TOKEN:0:20}..."
echo "=== admin/analytics ==="
curl $R "$B/admin/analytics" -H "Authorization: Bearer $TOKEN" | head -c 300; echo
echo "=== admin/stats ==="
curl $R "$B/admin/stats" -H "Authorization: Bearer $TOKEN" | head -c 200; echo
echo "=== register (telefonlu test firma) ==="
printf '%s' '{"fullName":"Test Kullanici","companyName":"Test Firma","phone":"05551234567","email":"test'$(date +%s)'@example.com","password":"Test1234"}' > /tmp/reg.json
curl $R -X POST "$B/auth/register" -H "Content-Type: application/json" --data-binary @/tmp/reg.json -o /dev/null -w "register HTTP %{http_code}\n"
