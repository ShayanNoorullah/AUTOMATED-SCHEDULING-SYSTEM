# SSIES WhatsApp Schedule Sender

A secured multi-portal web application for automating weekly class schedule messages to WhatsApp groups and contacts. Built for SSIES coaching groups with **role-based access** (user, admin, superadmin), **Supabase Auth**, and **Supabase PostgreSQL**.

Run the app on your **Windows PC** (free) with **Supabase free tier** for database and authentication. WhatsApp sending supports **WAHA (Docker)**, **Selenium + Chrome**, or **direct `wa.me` / invite links** only.

## Portals

| Role | URL | Capabilities |
|------|-----|--------------|
| **User** | `/` | Groups, schedules, templates, contacts, Open in WhatsApp, Automated Send, profile |
| **Admin** | `/admin` | Create/manage users (role=user only), disable accounts, password reset |
| **Superadmin** | `/superadmin` | Full system control — admins, settings, WAHA config, global audit, user data inspector |

Public self-registration is **disabled**. Admins create accounts via the admin portal.

## User dashboard highlights

| Area | What it does |
|------|----------------|
| **Groups / Schedule table** | Manage weekly schedules and per-group messages |
| **Open in WhatsApp** | Client-side `wa.me` and group invite links — no session linking |
| **Automated Send** | WAHA or Selenium — link session, select targets, send in bulk |
| **Templates** | Reusable message templates (default weekly schedule seeded for new users) |
| **Profile** (`/profile`) | Display name, password, account info |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3, Flask, Flask-SQLAlchemy |
| Database | Supabase PostgreSQL (required for production) |
| Auth | Supabase Auth (JWT in httpOnly cookies) |
| Security | Flask-WTF CSRF, Flask-Limiter, Flask-Talisman (HTTPS) |
| Encryption | Fernet (messages/contacts at rest) |
| WhatsApp | WAHA (Docker HTTP API), Selenium + undetected-chromedriver, or direct links |
| Frontend | Server-rendered HTML, dashboard + portal layouts, vanilla JavaScript |

## Prerequisites

- **Windows 10/11** with Python 3.10+
- **Google Chrome** (if using Selenium — update `version_main` in `whatsapp_sender.py` when Chrome updates)
- **Docker Desktop** (optional, for WAHA automated send)
- **Supabase account** (free tier at [supabase.com](https://supabase.com))
- **WhatsApp account** for linking (WAHA QR or Chrome on first automated send)

---

## Setup Guide

### Step 1: Install dependencies

```bat
install.bat
```

### Step 2: Create Supabase project

1. Sign up at [supabase.com](https://supabase.com) → **New project**
2. Save your **database password**
3. Go to **Project Settings → API** and copy:
   - Project URL → `SUPABASE_URL`
   - `anon` `public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server only, never commit)
   - JWT Secret → `SUPABASE_JWT_SECRET`

### Step 3: Configure Supabase Auth

1. **Authentication → Providers** → enable **Email**
2. **Authentication → Settings** → **disable** “Enable email signups” (admin-only provisioning)
3. Set minimum password length to **8**
4. **Authentication → URL Configuration** → add redirect URLs:
   - `http://localhost:5000/login`
   - Your Cloudflare Tunnel URL if used (see below)

### Step 4: Run database migrations

1. Open **Supabase Dashboard → SQL Editor → New query**
2. Run, in order:
   - [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql)
   - [`supabase/migrations/002_group_invite_link.sql`](supabase/migrations/002_group_invite_link.sql)
3. Verify tables include: `profiles`, `groups`, `templates`, `contacts`, `audit_log`, `release_log`, `system_settings`

### Step 5: Configure local run file

```bat
copy run.local.example.bat run.local.bat
```

Edit **`run.local.bat`** (git-ignored) with your Supabase keys, database URL, superadmin email, and run settings (`PORT`, `USE_WAITRESS`, etc.).

Legacy: `env.bat` still works as a fallback but `run.local.bat` is preferred.

| Variable | Where to get it |
|----------|-----------------|
| `SUPABASE_URL` | Project Settings → API |
| `SUPABASE_ANON_KEY` | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API (service_role) |
| `SUPABASE_JWT_SECRET` | Project Settings → API → JWT Secret |
| `DATABASE_URL` | Project Settings → Database → Connection string (URI, **pooler**, port **6543**) |
| `SUPERADMIN_EMAIL` | **Your email** — only this account becomes superadmin |
| `APP_ENCRYPTION_KEY` | Generate below |
| `APP_SECRET_KEY` | Any long random string |

Generate encryption key:

```bat
python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"
```

`DATABASE_URL` example:

```
postgresql://postgres.xxxx:YOUR_PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=require
```

### Step 6: Create your superadmin account

1. In Supabase **Authentication → Users**, click **Add user** → create a user with your `SUPERADMIN_EMAIL` and a password
2. Run the app: `run.bat`
3. Open [http://localhost:5000/login](http://localhost:5000/login) and sign in
4. On first login, your profile is created with **superadmin** role automatically

### Step 7: Create admins and users

- **Superadmin** → `/superadmin/admins` → create administrators
- **Admin** → `/admin/users` → create regular users
- Users sign in at `/login` with the email/password you set

---

## Zero-cost deployment

| Component | Cost | How |
|-----------|------|-----|
| Database + Auth | Free | Supabase free tier (500 MB, 50k MAU) |
| App server | Free | Run on your Windows PC via `run.bat` |
| WhatsApp automation | Free | WAHA (Docker) or Selenium on same PC |
| Remote access (optional) | Free | [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) |

### Production mode (waitress)

In `run.local.bat` or `env.bat`:

```bat
set USE_WAITRESS=1
```

### HTTPS via Cloudflare Tunnel

1. Install `cloudflared`
2. Run: `cloudflared tunnel --url http://localhost:5000`
3. Set `FORCE_HTTPS=1` in `run.local.bat`
4. Add the tunnel URL to Supabase redirect URLs

---

## Role permissions

### User
- Manage own groups, templates, contacts, schedules
- Open chats via direct links or automated send (WAHA / Selenium)
- Profile and password change (`/profile`)
- Config backup/restore

### Admin
- Everything a user can do
- Create, edit, disable, delete **users** (role=user only)
- Send password reset emails
- View own admin activity log
- **Cannot** manage other admins or system settings

### Superadmin (one account only)
- Everything an admin can do
- Manage admins (create, demote, delete)
- Promote users to admin
- System settings (maintenance mode, site name, WAHA provider, defaults)
- Global audit log + CSV export
- Inspect and edit any user's schedule data (`/?asUser=<uuid>`)

---

## Security

- JWT tokens stored in **httpOnly cookies** (not localStorage)
- `SUPABASE_SERVICE_ROLE_KEY` only on server (`run.local.bat` / `env.bat`, git-ignored)
- Rate limiting on login (`10/minute`)
- CSRF protection on form routes; API blueprints exempt (cookie auth)
- Row Level Security policies in Supabase migration
- Fernet encryption for message/phone fields in database
- Maintenance mode blocks release for non-admin users

---

## Project structure

```
app/
  __init__.py          Flask factory
  config.py            Environment config
  models.py            SQLAlchemy models (UUID profiles)
  auth/decorators.py   JWT auth + role guards
  routes/              auth, user, admin, superadmin blueprints
  services/            audit, users, whatsapp, waha_client, whatsapp_links
docker/
  waha-compose.yml     WAHA Docker service
supabase/migrations/   SQL schema + RLS
templates/
  auth/                Login, forgot password
  user/                Schedule dashboard, profile
  portal/              Shared admin/superadmin layout
  admin/               Admin portal pages
  superadmin/          Superadmin portal pages
static/css/            dashboard.css, portal.css, components.css
static/js/             api.js, waha.js, whatsapp.js, theme.js, portal.js
whatsapp_sender.py     Selenium WhatsApp automation
app.py                 Entry point
run.bat                Loads run.local.bat and starts the app
```

## WhatsApp automation

### Option A — WAHA (recommended for automated send)

Headless automated sending without launching Chrome for each message.

1. Install [Docker Desktop](https://www.docker.com/) and run WAHA:
   ```bat
   cd docker
   set WAHA_API_KEY=your-secret-key
   docker compose -f waha-compose.yml up -d
   ```
2. In **Superadmin → Settings → WhatsApp / WAHA**, set:
   - Provider: **WAHA**
   - Base URL: `http://localhost:3000`
   - API key: **exactly** the same as `WAHA_API_KEY` when you started Docker
   - Session name: `default` (WAHA Core free image only supports this name)
3. Click **Test connection** — must show **Connected** before linking.
4. In the user dashboard → **Automated Send** → **Start / Show QR** → scan with WhatsApp.
5. If linking fails, use **Reset & new QR** and scan within ~20 seconds.

**Group names** in SSIES must match the WhatsApp group name exactly (as seen in your linked account).

### Option B — Selenium (Chrome on Windows)

Set provider to **Selenium** in superadmin settings. First automated send opens Chrome for QR scan; session is cached in `whatsapp_session/`.

### Option C — Direct links only

Set provider to **Direct links only**. **Open in WhatsApp** sidebar uses `wa.me` / group invite links — no session linking or automated bulk send.

---

## API health check

```
GET /health
```

Returns database connectivity and release lock status.

## Legacy apps

- `whatsapp_scheduler.py` — old Tkinter desktop app (deprecated, kept for reference)
- `templates/index.html` — superseded by `templates/user/index.html`

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Login fails immediately | Check `SUPABASE_JWT_SECRET` matches dashboard |
| `relation "profiles" does not exist` | Run SQL migrations in Supabase |
| Cannot create users | Verify `SUPABASE_SERVICE_ROLE_KEY` in `run.local.bat` |
| Not becoming superadmin | `SUPERADMIN_EMAIL` must match login email exactly |
| Garbled messages | Same `APP_ENCRYPTION_KEY` on all machines |
| Chrome/send fails | Update `version_main` in `whatsapp_sender.py` |
| WAHA link fails / closes | API key must match Docker `WAHA_API_KEY`; session name must be `default` |
| WAHA unauthorized | Set API key in Superadmin settings (empty key is rejected) |
| Phone: "Couldn't link device" | Tap **Reset & new QR**; scan within ~20s; turn off VPN; update WhatsApp |
| WAHA session FAILED | `docker compose -f docker/waha-compose.yml restart` or **Reset & new QR** |
| Group not found (WAHA) | Group name in SSIES must match WhatsApp group name exactly |
| SSL connection error | Add `?sslmode=require` to `DATABASE_URL` |

## License

MIT — see [LICENSE](LICENSE).
