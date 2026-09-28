# Deploy app + upgrade WAHA NOWEB image (keeps session volumes; may need re-QR if session FAILED).
$key = "C:\Users\Asus\Downloads\ssh-key-2026-06-25.key"
$vm = "ubuntu@161.118.253.199"
$src = "D:\SSIES Schedule Automation"

Write-Host "=== SCP code ==="
scp -i $key -o StrictHostKeyChecking=accept-new `
  -r "$src\app" "$src\templates" "$src\static" "$src\docker" "$src\supabase" `
  "$src\app.py" "$src\requirements.txt" "$src\Dockerfile" "$src\docker-compose.prod.yml" `
  "${vm}:~/ssies/"
if ($LASTEXITCODE -ne 0) { throw "scp failed: $LASTEXITCODE" }

Write-Host "=== Pull WAHA 2026.9.1 + rebuild app (volumes preserved) ==="
ssh -i $key -o StrictHostKeyChecking=accept-new $vm @"
set -e
cd ~/ssies
docker compose -f docker-compose.prod.yml pull waha waha2 waha3 waha4 waha5 || true
docker compose -f docker-compose.prod.yml up -d --build app
# Recreate WAHA containers on new image without deleting volumes
docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps waha waha2 waha3 waha4 waha5
docker compose -f docker-compose.prod.yml ps
curl -sS https://ssies-schedule.duckdns.org/health || true
"@
if ($LASTEXITCODE -ne 0) { throw "remote deploy failed: $LASTEXITCODE" }
Write-Host "=== Done ==="
