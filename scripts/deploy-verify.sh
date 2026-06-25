#!/bin/bash
# Smoke tests after deploy. Usage: ./scripts/deploy-verify.sh
set -e
set -a
[ -f .env ] && . ./.env
set +a

BASE="https://${DUCKDNS_DOMAIN}"
echo "Testing $BASE ..."

echo -n "Health: "
curl -sf "$BASE/health" | python3 -m json.tool

echo -n "Mobile config: "
curl -sf "$BASE/api/mobile/config" | python3 -m json.tool

echo -n "Login page: "
code=$(curl -so /dev/null -w "%{http_code}" "$BASE/login")
echo "HTTP $code"
[ "$code" = "200" ] || exit 1

echo "OK — run manual WAHA QR + login tests in the browser."
