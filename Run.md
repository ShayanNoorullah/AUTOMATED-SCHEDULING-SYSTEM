# SSIES — Run, Update & Operations Guide

Quick reference for starting, stopping, and updating SSIES in **local dev** (Windows PC) and **production** (Oracle Cloud + Docker).

| Mode | When to use | URL |
|------|-------------|-----|
| **Local** | Development, testing on your PC | `http://localhost:5000` |
| **Production** | 24/7 web + mobile + WAHA | `https://ssies-schedule.duckdns.org` (your DuckDNS name) |
| **Mobile** | Android APK — connects to local or production server | Set in app on first launch |

**First-time setup:** [README.md](README.md) (local + Supabase) · [DEPLOY.md](DEPLOY.md) (Oracle Cloud) · [mobile/MOBILE_SETUP.md](mobile/MOBILE_SETUP.md) (APK build)

---

## Prerequisites

| Component | Local | Production |
|-----------|-------|------------|
| Python 3.10+ | Yes | Inside Docker image |
| `run.local.bat` | Yes (from `run.local.example.bat`) | — |
| `.env` on VM | — | Yes (from `.env.production.example`) |
| Supabase project | Yes | Same project |
| Docker Desktop | Optional (WAHA) | Yes (on VM) |

---

## 1. Local development (Windows PC)

### First time

```bat
cd "D:\SSIES Schedule Automation"
install.bat
copy run.local.example.bat run.local.bat
```

Edit `run.local.bat` with Supabase keys, `DATABASE_URL`, `SUPERADMIN_EMAIL`, and secrets. See [README.md](README.md).

Create your superadmin in **Supabase → Authentication → Users**, then:

```bat
run.bat
```

Open: **http://localhost:5000/login**

### Run the web app

```bat
cd "D:\SSIES Schedule Automation"
run.bat
```

Leave the window open while using the app. Stop with `Ctrl+C`.

| Setting in `run.local.bat` | Purpose |
|----------------------------|---------|
| `PORT=5000` | Web port |
| `HOST=0.0.0.0` | Allow LAN/mobile access |
| `USE_WAITRESS=1` | Production-style server (optional locally) |
| `FORCE_HTTPS=1` | Only with Cloudflare Tunnel / reverse proxy |

### Run WAHA locally (automated WhatsApp send)

Requires [Docker Desktop](https://www.docker.com/) running.

```bat
cd "D:\SSIES Schedule Automation\docker"
set WAHA_API_KEY=your-secret-key-here
docker compose -f waha-compose.yml up -d
```

Check WAHA:

```bat
curl http://localhost:3000/health
```

In **Superadmin → Settings → WhatsApp / WAHA**:

- Provider: **WAHA**
- Base URL: `http://localhost:3000`
- API key: same as `WAHA_API_KEY` above
- Session name: `default`

Stop WAHA:

```bat
cd "D:\SSIES Schedule Automation\docker"
docker compose -f waha-compose.yml down
```

### Update local code

```bat
cd "D:\SSIES Schedule Automation"
git pull
install.bat
```

Restart `run.bat`. If WAHA config changed, restart WAHA container (see above).

---

## 2. Production (Oracle Cloud VM)

Stack: **Flask app** + **WAHA (ARM)** + **Caddy (HTTPS)** via `docker-compose.prod.yml`.

### SSH into the server

```powershell
ssh -i "C:\Users\Asus\Downloads\ssh-key-2026-06-25.key" ubuntu@161.118.253.199
```

Replace IP if your VM public IP changes (update DuckDNS too).

### Start / run the full stack

```bash
cd ~/ssies
docker compose -f docker-compose.prod.yml up -d --build
```

### Check status

```bash
docker compose -f docker-compose.prod.yml ps
```

All three services should be **running**: `app`, `waha`, `caddy`.

### Health checks

```bash
curl -s https://ssies-schedule.duckdns.org/health
curl -s https://ssies-schedule.duckdns.org/api/mobile/config
```

Expected: JSON with `"database": true` and Supabase keys for mobile.

### View logs

```bash
cd ~/ssies
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f waha
docker compose -f docker-compose.prod.yml logs -f caddy
```

Combined:

```bash
docker compose -f docker-compose.prod.yml logs -f app waha caddy
```

### Stop the stack

```bash
cd ~/ssies
docker compose -f docker-compose.prod.yml down
```

**Do not** remove the `waha-sessions` volume unless you want to re-link WhatsApp from scratch.

### Restart one service

```bash
cd ~/ssies
docker compose -f docker-compose.prod.yml restart app
docker compose -f docker-compose.prod.yml restart waha
docker compose -f docker-compose.prod.yml restart caddy
```

### Update production (deploy new code)

**On your Windows PC** — copy changed files to the VM:

```powershell
$key = "C:\Users\Asus\Downloads\ssh-key-2026-06-25.key"
$vm = "ubuntu@161.118.253.199"
$src = "D:\SSIES Schedule Automation"

scp -i $key -r "$src\app" "$src\templates" "$src\static" "$src\docker" "$src\app.py" "$src\requirements.txt" "$src\Dockerfile" "$src\docker-compose.prod.yml" "${vm}:~/ssies/"
```

**On the VM** — rebuild and restart:

```bash
cd ~/ssies
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

If only `.env` changed (no code):

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate app
```

### Upload mobile APK to server

```powershell
scp -i "C:\Users\Asus\Downloads\ssh-key-2026-06-25.key" "C:\path\to\your.apk" ubuntu@161.118.253.199:~/ssies/static/ssies-schedule.apk
```

```bash
cd ~/ssies
docker compose -f docker-compose.prod.yml restart app
```

Download page: **https://ssies-schedule.duckdns.org/mobile/download**

### Keep DuckDNS IP in sync (optional cron)

If the VM gets a new public IP:

```bash
cd ~/ssies
chmod +x docker/duckdns-update.sh
./docker/duckdns-update.sh
```

Cron (every 5 minutes):

```bash
crontab -e
# Add:
# */5 * * * * cd /home/ubuntu/ssies && ./docker/duckdns-update.sh >> /var/log/duckdns.log 2>&1
```

### After VM reboot

Docker starts automatically if enabled:

```bash
sudo systemctl enable docker
```

Containers use `restart: unless-stopped` — they come back up with Docker.

---

## 3. Mobile app (Android)

The APK does **not** embed the server URL. Users enter it on first launch.

### Build APK (Windows)

```bat
cd "D:\SSIES Schedule Automation\mobile"
build-apk.bat
```

Download the `.apk` from the Expo build link when finished.

### Connect the app

| Environment | Server URL |
|-------------|------------|
| **Production** | `https://ssies-schedule.duckdns.org` (no trailing slash) |
| **Local LAN** | `http://192.168.x.x:5000` (`ipconfig` on PC, same Wi‑Fi) |

1. Install APK on Android.
2. **Test and continue** — must pass `/health` and `/api/mobile/config`.
3. Sign in with the same Supabase email/password as the web app.

To switch servers: app menu → **Change server**.

### Update mobile app

Rebuild APK after code changes in `mobile/`, redistribute the new `.apk`. Users reinstall or install over the old version.

---

## 4. Common URLs

| Page | URL |
|------|-----|
| Login | `/login` |
| User dashboard | `/` |
| Admin | `/admin` |
| Superadmin | `/superadmin` |
| Health API | `/health` |
| Mobile config API | `/api/mobile/config` |
| APK download | `/mobile/download` |

**Production base:** `https://ssies-schedule.duckdns.org`

**Local base:** `http://localhost:5000`

---

## 5. Login credentials

| Item | Value |
|------|--------|
| Email | Whatever you set in Supabase Auth (e.g. `admin@ssies.com` = superadmin if it matches `SUPERADMIN_EMAIL`) |
| Password | Set in **Supabase → Authentication → Users** (not stored in this repo) |

Reset password: Supabase Dashboard → Users → select user → send reset or set new password.

---

## 6. Troubleshooting quick fixes

| Problem | Fix |
|---------|-----|
| `run.bat` — missing config | `copy run.local.example.bat run.local.bat` and fill in values |
| Local — cannot reach from phone | `HOST=0.0.0.0`, same Wi‑Fi, Windows Firewall port 5000 |
| Production — `502` | `docker compose -f docker-compose.prod.yml logs app` — check `DATABASE_URL` in `.env` |
| Production — redirect loop on `/health` | Rebuild `app` container (Talisman + Caddy fix in latest code) |
| Production — unstyled login | Rebuild `app` container (CSP fix in latest code) |
| WAHA — `arm64` manifest error | Use `devlikeapro/waha:arm` in `docker-compose.prod.yml` |
| WAHA — unauthorized | `WAHA_API_KEY` in `.env` must match Superadmin settings |
| Mobile — cannot reach server | Use `https://` for production; no trailing slash |
| Login fails everywhere | User must exist in Supabase; check email/password |

---

## 7. File reference

| File | Purpose |
|------|---------|
| `run.bat` | Start local Flask app |
| `run.local.bat` | Local secrets (git-ignored) |
| `install.bat` | `pip install -r requirements.txt` |
| `.env` | Production secrets on VM (git-ignored) |
| `docker-compose.prod.yml` | Production: app + waha + caddy |
| `docker/waha-compose.yml` | Local WAHA only |
| `docker/Caddyfile` | HTTPS reverse proxy |
| `mobile/build-apk.bat` | Cloud APK build via Expo EAS |

---

## 8. Daily workflow cheat sheet

### Use production (normal operation)

Nothing to run on your PC. Open:

**https://ssies-schedule.duckdns.org**

Mobile: server URL = same HTTPS address.

### Develop locally

```bat
run.bat
```

Optional WAHA:

```bat
cd docker && set WAHA_API_KEY=... && docker compose -f waha-compose.yml up -d
```

### Ship an update to production

1. Edit code on PC.
2. `scp` files to VM (or `git pull` on VM if using git).
3. `docker compose -f docker-compose.prod.yml up -d --build`
4. `curl -s https://ssies-schedule.duckdns.org/health`
