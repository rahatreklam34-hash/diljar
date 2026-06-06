#!/usr/bin/env bash
echo "=== dist/app.js middleware satirlari ==="
grep -nE "json|cookieParser|cors|helmet" /var/www/finanstakip/packages/backend/dist/app.js | head -20
echo
echo "=== login verbose ==="
printf '%s' '{"email":"admin@diljar.com","password":"Admin1234!"}' > /tmp/l3.json
curl -s -i -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" --data-binary @/tmp/l3.json | head -20
