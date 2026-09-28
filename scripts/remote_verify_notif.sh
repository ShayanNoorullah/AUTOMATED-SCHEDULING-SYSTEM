#!/bin/bash
set -e
cd ~/ssies
docker compose -f docker-compose.prod.yml exec -T app ls /app/templates/user/notifications.html
docker compose -f docker-compose.prod.yml exec -T app grep -c "View all notifications" /app/static/js/theme.js
docker compose -f docker-compose.prod.yml exec -T app grep -c 'html\[data-theme="dark"\] .da-ico' /app/static/css/app.css
docker compose -f docker-compose.prod.yml exec -T -w /app app python /tmp/verify_notif_deploy.py
