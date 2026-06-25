# SSIES — Free Cloud Deployment (Web + APK + WAHA 24/7)

Deploy SSIES on **Oracle Cloud Always Free** with **Supabase**, **DuckDNS**, and **Docker**. Total cost: **$0** (within free-tier limits).

| Component | Service |
|-----------|---------|
| Database + Auth | Supabase (existing) |
| Flask + WAHA + HTTPS | Oracle VM + Docker Compose |
| Public URL | `https://YOUR_SUBDOMAIN.duckdns.org` |
| Mobile | Private APK + server URL |

---

## Phase 1 — Supabase production URL

Replace `YOUR_SUBDOMAIN` with your DuckDNS name (e.g. `ssies-schedule`).

### 1.1 Authentication URLs

Supabase Dashboard → **Authentication → URL Configuration**:

| Field | Value |
|-------|--------|
| **Site URL** | `https://YOUR_SUBDOMAIN.duckdns.org` |
| **Redirect URLs** | `https://YOUR_SUBDOMAIN.duckdns.org/login` |
| (optional, local dev) | `http://localhost:5000/login` |

### 1.2 Database

Use the **pooler** connection string (port **6543**), same as local setup:

```
postgresql://postgres.PROJECT:PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=require
```

### 1.3 Secrets

Generate on your PC (save for Phase 5 `.env`):

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

**Encryption key migration:** If you already have groups/contacts encrypted in Supabase from local dev, copy the **same** `APP_ENCRYPTION_KEY` from `run.local.bat` into production `.env`. A new key makes existing message/phone data unreadable.

### 1.4 Superadmin user

Ensure your superadmin exists in **Supabase → Authentication → Users** with the email matching `SUPERADMIN_EMAIL`.

---

## Phase 2 — Oracle Cloud VM

1. Sign up at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/) (card verification; Always Free resources are not billed if you stay within limits).
2. Create an **Ampere A1** instance:
   - Image: **Ubuntu 22.04 or 24.04**
   - Shape: **VM.Standard.A1.Flex** — recommend **2 OCPU**, **12 GB RAM**
   - **ARM64 note:** `docker-compose.prod.yml` uses `devlikeapro/waha:arm` (not `:latest`, which is amd64-only).
3. **Networking → Public IP** → reserve/assign a **public IPv4** to the instance.
4. **Security List** (VCN ingress rules): allow TCP **22**, **80**, **443** from `0.0.0.0/0`.
5. SSH in:

```bash
ssh ubuntu@YOUR_VM_PUBLIC_IP
```

6. On the VM, enable firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

7. Install Docker:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in
```

---

## Phase 3 — DuckDNS + HTTPS

1. Create a free account at [duckdns.org](https://www.duckdns.org).
2. Create subdomain `YOUR_SUBDOMAIN` → set IP to your **VM public IP**.
3. Copy your **DuckDNS token** (used in `.env` as `DUCKDNS_TOKEN`).

HTTPS is handled automatically by **Caddy** in `docker-compose.prod.yml` (Let’s Encrypt for your DuckDNS name).

### Keep DuckDNS in sync (if IP changes)

On the VM, in the project directory:

```bash
chmod +x docker/duckdns-update.sh
# Add to crontab (every 5 min):
crontab -e
# */5 * * * * cd /home/ubuntu/ssies && ./docker/duckdns-update.sh >> /var/log/duckdns.log 2>&1
```

---

## Phase 4 — Deploy with Docker

### 4.1 Clone and configure

```bash
git clone <your-repo-url> ssies
cd ssies
cp .env.production.example .env
nano .env   # fill all values
```

Required `.env` fields:

- `DUCKDNS_DOMAIN` — e.g. `ssies-schedule.duckdns.org`
- `DUCKDNS_TOKEN` — for optional IP updates
- All `SUPABASE_*` and `DATABASE_URL` values
- `SUPERADMIN_EMAIL`
- `APP_ENCRYPTION_KEY`, `APP_SECRET_KEY`
- `WAHA_API_KEY` — strong random string (same value used by WAHA container)

### 4.2 Start stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app
```

Services:

| Service | Role |
|---------|------|
| **caddy** | HTTPS reverse proxy (ports 80/443) |
| **app** | Flask + Waitress + scheduler |
| **waha** | WhatsApp HTTP API (internal only, port 3000 not public) |

WAHA settings are applied automatically when `DOCKER=1` (provider `waha`, base URL `http://waha:3000`).

### 4.3 Upload mobile APK (optional)

Copy your EAS-built APK to the server:

```bash
scp application.apk ubuntu@YOUR_VM_IP:~/ssies/static/ssies-schedule.apk
docker compose -f docker-compose.prod.yml restart app
```

Users download from: `https://YOUR_SUBDOMAIN.duckdns.org/mobile/download`

---

## Phase 5 — Verify deployment

Run these checks after deploy:

| # | Check | Expected |
|---|--------|----------|
| 1 | `curl -s https://YOUR_SUBDOMAIN.duckdns.org/health` | `"database": true` |
| 2 | Open `/login` in browser | Login page loads over HTTPS |
| 3 | Sign in as superadmin | Dashboard loads |
| 4 | Superadmin → Settings → WhatsApp / WAHA → **Test connection** | Connected |
| 5 | User dashboard → Automated Send → **Start / QR** | Scan with WhatsApp → linked |
| 6 | `docker compose -f docker-compose.prod.yml logs app` | Scheduler tick messages (every minute) |
| 7 | Settings → schedule a test job | `/api/scheduled-job` saves |

Quick health script on VM:

```bash
curl -sf "https://${DUCKDNS_DOMAIN}/health" | python3 -m json.tool
```

### WhatsApp on cloud VMs

Meta sometimes blocks datacenter IPs. If QR linking fails:

- Wait 24 hours and retry
- Ensure WAHA volume persists (`waha-sessions` — do not `docker volume rm` it)
- As last resort, consider a residential VPS (paid)

**Do not use Selenium** on the cloud VM — WAHA only in production.

---

## Phase 6 — Mobile (APK users)

Distribution is private (no Play Store).

### For each user with the APK

1. Install APK from `/mobile/download` or a shared Drive link.
2. Open app → **Server URL**: `https://YOUR_SUBDOMAIN.duckdns.org` (no trailing slash).
3. **Test and continue** → must pass `/health` and `/api/mobile/config`.
4. Sign in with SSIES email/password (created by admin).

### Admin checklist

- [ ] Share APK download link
- [ ] Share server URL (`https://…duckdns.org`)
- [ ] Create user accounts in admin portal
- [ ] Confirm WAHA is linked for automated send

---

## Phase 7 — Operations

### Updates

```bash
cd ~/ssies
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### Logs

```bash
docker compose -f docker-compose.prod.yml logs -f app waha caddy
```

### Restart after reboot

Containers use `restart: unless-stopped` — they start automatically when Docker starts. Enable Docker on boot:

```bash
sudo systemctl enable docker
```

### Backups

- **Supabase**: Dashboard → Database → backups (free tier limits)
- **App data**: Use in-app backup/export from Settings
- **WAHA session**: Backup volume `waha-sessions` if you migrate VMs

### Local dev vs production

| | Local (`run.bat`) | Production (Docker) |
|--|-------------------|---------------------|
| WAHA URL | `http://localhost:3000` | `http://waha:3000` (internal) |
| HTTPS | Optional (Cloudflare tunnel) | Caddy + DuckDNS |
| Provider default | Selenium | WAHA |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `502` from Caddy | `docker compose logs app` — check DATABASE_URL |
| Login works locally but not cloud | Supabase redirect URLs + `SUPABASE_JWT_SECRET` |
| Mobile “cannot reach server” | Use `https://` URL; APK needs internet, not LAN IP |
| WAHA unauthorized | `WAHA_API_KEY` in `.env` must match superadmin settings |
| `no matching manifest for linux/arm64` | Use `devlikeapro/waha:arm` in compose (already set for Ampere VMs) |
| `ERR_TOO_MANY_REDIRECTS` / `/health` loops | Rebuild app after fix: Talisman must not force HTTPS behind Caddy (`DOCKER=1`) |
| Login page unstyled (plain HTML) | Rebuild app: Talisman default CSP blocks inline CSS (`content_security_policy=False`) |
| Encrypted data garbled | Reuse original `APP_ENCRYPTION_KEY` from local dev |
| Certificate errors | Wait 1–2 min after first start for Let’s Encrypt |

---

## File reference

| File | Purpose |
|------|---------|
| [`Dockerfile`](Dockerfile) | Flask app image |
| [`docker-compose.prod.yml`](docker-compose.prod.yml) | app + waha + caddy |
| [`.env.production.example`](.env.production.example) | Env template |
| [`docker/Caddyfile`](docker/Caddyfile) | HTTPS reverse proxy |
| [`docker/duckdns-update.sh`](docker/duckdns-update.sh) | IP sync cron |
