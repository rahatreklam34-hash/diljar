#!/usr/bin/env bash
B="http://localhost:3000/api/v1"
EM="integtest$(date +%s)@example.com"
cat > /tmp/reg.json <<JSON
{"fullName":"Test Kullanici","companyName":"IntegTest","phone":"05550000000","email":"$EM","password":"Test1234"}
JSON
echo "=== REGISTER RAW ==="
REG=$(curl -s -X POST "$B/auth/register" -H "Content-Type: application/json" --data-binary @/tmp/reg.json)
echo "$REG" | head -c 400; echo
TOKEN=$(echo "$REG" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{console.log(JSON.parse(s).accessToken||'')}catch(e){console.log('')}})")
echo "token len: ${#TOKEN}"
cat > /tmp/pt.json <<JSON
{"enabled":true,"mode":"TEST","config":{"merchant_id":"TESTMID","merchant_key":"TESTKEY","merchant_salt":"TESTSALT"}}
JSON
echo "=== PUT /integrations/paytr ==="
curl -s -X PUT "$B/integrations/paytr" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/pt.json -w "\nHTTP %{http_code}\n" | head -5
