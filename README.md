# SSIES WhatsApp Schedule Sender

A Windows-focused Flask web app that automates sending weekly class schedules to WhatsApp groups and individual contacts. Built for SSIES coaching groups (O-Level CS, Math, Accounts, PST, AKU Board Tuition, and more).

The primary app is the **Flask web UI** (`app.py`). A legacy **Tkinter desktop app** (`whatsapp_scheduler.py`) also exists for JSON-file-based use without a database.

## Features

- Web dashboard for managing groups, weekly schedules, message templates, and contacts
- One-click **Release** to send schedules to all configured WhatsApp targets
- Real-time send progress via server-sent events (SSE)
- Multi-user accounts with login rate-limiting and audit log
- Fernet encryption for messages and phone numbers at rest
- Optional **cloud PostgreSQL** for multi-device configuration sync
- Config export/import API
- Local SQLite fallback for single-machine use (no cloud DB required)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3, Flask, Flask-SQLAlchemy |
| Database | SQLite (default) or PostgreSQL (optional) |
| Auth | Werkzeug password hashing, Flask sessions |
| Encryption | `cryptography` (Fernet) |
| WhatsApp automation | Selenium + `undetected-chromedriver` |
| Frontend | Server-rendered HTML + vanilla JavaScript |

## Prerequisites

- **Windows 10/11**
- **Python 3.10+** with pip
- **Google Chrome** installed
- A **WhatsApp account** (QR scan required on first send)

> **Chrome version note:** The sender pins Chrome driver version in `whatsapp_sender.py` (`version_main=148`). If Chrome auto-updates and sending fails, update that value to match your installed Chrome major version.

## Quick Start (Local SQLite — Single Machine)

No cloud database needed. Data is stored in `instance/app.db`.

1. **Clone the repository**
   ```bat
   git clone https://github.com/YOUR_USER/YOUR_REPO.git
   cd "SSIES Schedule Automation"
   ```

2. **Install dependencies**
   ```bat
   install.bat
   ```
   Or manually:
   ```bat
   pip install -r requirements.txt
   ```

3. **Start the app**
   ```bat
   run.bat
   ```

4. **Open the web UI** at [http://localhost:5000](http://localhost:5000)

5. **Create your account** — the first visit shows a signup form (no users exist yet).

6. **Optional legacy import** — if you have an old `groups_config.json`, place it in the project root *before* first signup. Groups and settings will be imported automatically. Use `groups_config.example.json` as a template (copy and rename to `groups_config.json`).

## Environment Variables

Copy `env.example.bat` to `env.bat` and fill in values. `run.bat` loads `env.bat` automatically if it exists. `env.bat` is git-ignored and must never be committed.

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | No | Cloud PostgreSQL connection string. Leave unset to use local SQLite. |
| `APP_ENCRYPTION_KEY` | Yes (multi-device) | Fernet key for encrypting messages/contacts. **Must be identical on every machine** sharing the same database. |
| `APP_SECRET_KEY` | Recommended (multi-device) | Flask session secret. Keep consistent across devices. |
| `FORCE_HTTPS` | No | Set to `1` to enable secure session cookies when serving over HTTPS. |

If `APP_ENCRYPTION_KEY` and `APP_SECRET_KEY` are unset on a single machine, they are auto-generated and saved under `instance/`. For PostgreSQL multi-device sync, set them explicitly in `env.bat` on every PC.

**Generate keys:**

```bat
python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"
python -c "import secrets;print(secrets.token_hex(32))"
```

---

## PostgreSQL Setup (Cloud)

Use cloud PostgreSQL when you want the same groups, schedules, and settings on multiple PCs. WhatsApp login remains per-machine (stored in `whatsapp_session/`, not in the database).

The app creates all tables automatically on first startup — no manual SQL or migrations required.

### Option A: Neon

[Neon](https://neon.tech) offers a free tier with serverless PostgreSQL.

1. Sign up at [neon.tech](https://neon.tech) and create a new project.
2. In the Neon dashboard, open your project and go to **Connection Details**.
3. Copy the connection string. Choose:
   - **Pooled connection** (recommended) — better for short-lived connections
   - **Direct connection** — also works
4. The string should look like:
   ```
   postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/DBNAME?sslmode=require
   ```
5. If `sslmode=require` is missing, append `?sslmode=require` (or `&sslmode=require` if other query params exist).
6. Neon may provide `postgres://` — the app normalizes this to `postgresql://` automatically.

### Option B: Supabase

[Supabase](https://supabase.com) provides PostgreSQL with a web dashboard.

1. Create a new project at [supabase.com](https://supabase.com).
2. Wait for the database to finish provisioning.
3. Go to **Project Settings** → **Database**.
4. Under **Connection string**, select **URI** mode.
5. Copy the URI and replace `[YOUR-PASSWORD]` with your database password (set during project creation).
6. Connection options:
   - **Direct** (port `5432`) — standard connection
   - **Pooler** (port `6543`, mode `Transaction`) — connection pooling for many clients
7. Example:
   ```
   postgresql://postgres.xxxx:YOUR_PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres
   ```
8. Add `?sslmode=require` if not already present.

### Option C: Railway

[Railway](https://railway.app) offers one-click PostgreSQL provisioning.

1. Create a new project at [railway.app](https://railway.app).
2. Click **+ New** → **Database** → **PostgreSQL**.
3. Once provisioned, open the PostgreSQL service → **Variables** tab.
4. Copy the `DATABASE_URL` value. Railway often uses the `postgres://` scheme — the app handles this automatically.
5. Ensure SSL is enabled. Append `?sslmode=require` if the URL does not include SSL parameters.

### Connect the App (All Providers)

1. Copy the environment template:
   ```bat
   copy env.example.bat env.bat
   ```

2. Edit `env.bat` and set your connection string:
   ```bat
   set DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
   ```

3. Generate and set encryption keys (run the commands above), then add to `env.bat`:
   ```bat
   set APP_ENCRYPTION_KEY=your_fernet_key_here
   set APP_SECRET_KEY=your_random_session_secret_here
   ```

4. **Use the exact same** `APP_ENCRYPTION_KEY` and `APP_SECRET_KEY` on every PC that shares this database.

5. Start the app:
   ```bat
   run.bat
   ```

6. Verify the connection — the startup log prints the database host (credentials are masked):
   ```
   Database: HOST:5432/DBNAME
   ```

7. Tables are created automatically on first run:
   - `user` — accounts and settings
   - `group` — WhatsApp groups and schedules
   - `template` — reusable message templates
   - `contact` — individual WhatsApp contacts
   - `audit_log` — login and action history

### Multi-Device Sync Checklist

- [ ] Same `DATABASE_URL` in `env.bat` on all machines
- [ ] Same `APP_ENCRYPTION_KEY` on all machines
- [ ] Same `APP_SECRET_KEY` on all machines
- [ ] Each PC has its own `whatsapp_session/` folder (WhatsApp Web login is local)
- [ ] Do **not** copy `instance/` between machines when using PostgreSQL — keys come from `env.bat`

### PostgreSQL Troubleshooting

| Problem | Solution |
|---------|----------|
| Connection refused / SSL error | Add `?sslmode=require` to `DATABASE_URL` |
| Garbled messages or `InvalidToken` errors | `APP_ENCRYPTION_KEY` differs between machines — set the same key everywhere |
| `relation "user" does not exist` | Start the app once — `db.create_all()` creates tables on startup |
| Authentication failed | Double-check username, password, and host in the connection string |
| Password contains `@`, `#`, `%`, etc. | URL-encode special characters in the password portion of the URL |
| Works on one PC but not another | Confirm `env.bat` exists and is loaded (check startup log for correct database host) |

---

## WhatsApp First Run

1. Add at least one group (name must match the WhatsApp group name exactly) or contact.
2. In **Settings**, disable **Headless mode** for the first send so you can scan the QR code.
3. Click **Release** — Chrome opens WhatsApp Web.
4. Scan the QR code with your phone if prompted.
5. After login, the session is saved in `whatsapp_session/` and persists across restarts on that machine.
6. Re-enable headless mode once login is established (optional).

Debug screenshots on send failures are saved to `debug/` (git-ignored).

## Project Structure

```
SSIES Schedule Automation/
├── app.py                  # Main Flask web application
├── whatsapp_sender.py      # Selenium WhatsApp automation
├── whatsapp_scheduler.py   # Legacy Tkinter desktop app
├── requirements.txt
├── install.bat             # Install Python dependencies
├── run.bat                 # Start the Flask app
├── env.example.bat         # Environment variable template
├── groups_config.example.json  # Legacy import template
├── templates/
│   ├── index.html          # Main dashboard
│   └── login.html          # Login / signup page
├── LICENSE
└── README.md
```

**Git-ignored (local only — never commit):**

| Path | Purpose |
|------|---------|
| `env.bat` | Your secrets and database URL |
| `instance/` | SQLite DB, auto-generated encryption/session keys |
| `whatsapp_session/` | Chrome profile with WhatsApp Web login |
| `debug/` | Selenium failure screenshots |
| `groups_config.json` | Legacy config (may contain password hashes) |

## Security Notes

- Never commit `env.bat`, `instance/`, `groups_config.json`, or `whatsapp_session/`
- Rotate `APP_ENCRYPTION_KEY` and `APP_SECRET_KEY` if they are accidentally exposed
- The app binds to `localhost:5000` by default — do not expose it to the public internet without HTTPS and proper hardening
- Set `FORCE_HTTPS=1` only when serving behind a reverse proxy with TLS

## Publishing to GitHub

### Pre-push checklist

Confirm these files are **not** tracked:

```bat
git status
```

You should **not** see: `env.bat`, `instance/`, `whatsapp_session/`, `groups_config.json`, or `debug/`.

### Initial publish

1. Create a new empty repository on GitHub (no README, no .gitignore — this repo already has them).

2. Initialize and push:
   ```bat
   cd "D:\SSIES Schedule Automation"
   git init
   git add .
   git status
   git commit -m "Initial commit: SSIES WhatsApp Schedule Sender"
   git branch -M main
   git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
   git push -u origin main
   ```

3. Replace `YOUR_USER/YOUR_REPO` with your actual GitHub username and repository name.

## License

This project is licensed under the [MIT License](LICENSE).
