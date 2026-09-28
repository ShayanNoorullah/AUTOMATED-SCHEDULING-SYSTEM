# Deploy scheduler extras + Lists to OCI (app-only rebuild).
# Does NOT create new OCI resources — rebuilds existing Always Free app container.

$key = "C:\Users\Asus\Downloads\ssh-key-2026-06-25.key"
$vm = "ubuntu@161.118.253.199"
$src = "D:\SSIES Schedule Automation"

Write-Host "=== SCP app/templates/static/docker/supabase + compose files ==="
scp -i $key -o StrictHostKeyChecking=accept-new `
  -r "$src\app" "$src\templates" "$src\static" "$src\docker" "$src\supabase" `
  "$src\app.py" "$src\requirements.txt" "$src\Dockerfile" "$src\docker-compose.prod.yml" `
  "${vm}:~/ssies/"
if ($LASTEXITCODE -ne 0) { throw "scp failed: $LASTEXITCODE" }

Write-Host "=== Rebuild app only (no new OCI charges) ==="
ssh -i $key -o StrictHostKeyChecking=accept-new $vm @"
set -e
cd ~/ssies
docker compose -f docker-compose.prod.yml up -d --build app
docker compose -f docker-compose.prod.yml ps
curl -sS http://127.0.0.1:5000/health || curl -sS https://ssies-schedule.duckdns.org/health || true
"@
if ($LASTEXITCODE -ne 0) { throw "remote rebuild failed: $LASTEXITCODE" }

Write-Host "=== Done ==="
