#!/bin/bash
# Update DuckDNS when your VM public IP changes. Run from cron every 5 minutes.
# Requires: DUCKDNS_DOMAIN, DUCKDNS_TOKEN in .env (same file as docker-compose.prod.yml)

set -a
[ -f .env ] && . ./.env
set +a

if [ -z "$DUCKDNS_DOMAIN" ] || [ -z "$DUCKDNS_TOKEN" ]; then
  echo "Set DUCKDNS_DOMAIN and DUCKDNS_TOKEN in .env" >&2
  exit 1
fi

SUB="${DUCKDNS_DOMAIN%%.duckdns.org}"
IP=$(curl -s https://ifconfig.me/ip || curl -s https://api.ipify.org)
curl -s "https://www.duckdns.org/update?domains=${SUB}&token=${DUCKDNS_TOKEN}&ip=${IP}"
echo
