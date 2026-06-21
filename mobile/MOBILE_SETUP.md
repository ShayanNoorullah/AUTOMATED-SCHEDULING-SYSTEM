# SSIES Mobile — Complete Setup Guide

This guide covers **building the APK**, **installing it on your Android phone**, and **connecting the app to your PC server**.

---

## Part 1: Build the APK (one-time)

You cannot build the APK inside the app — you build it on your PC, then copy it to your phone.

### Why your last command failed

When you ran `npx eas-cli login`, npm asked `Ok to proceed? (y)` and the install was **cancelled** because something other than `y` was entered. The project now includes `eas-cli` locally so you can use `npm run` without that prompt.

### Option A — Cloud build (recommended, no Android Studio)

1. Open **Command Prompt** in the project:
   ```bat
   cd "D:\SSIES Schedule Automation\mobile"
   npm install
   ```

2. Run the build script:
   ```bat
   build-apk.bat
   ```

3. When prompted to **log in to Expo**:
   - Press **Enter** or type `y` if npm asks to install anything
   - A browser opens — create a **free** Expo account (or sign in)
   - Return to the terminal when login succeeds

4. Wait for the cloud build (about **5–15 minutes**). At the end you get a **URL** like:
   ```text
   https://expo.dev/accounts/.../builds/...
   ```

5. Open that link on your PC or phone and tap **Download** to get `application-....apk`.

### Option B — Test without APK (fastest for development)

```bat
cd mobile
npx expo start
```

On your phone (same Wi‑Fi as PC):

1. Install **Expo Go** from Google Play Store
2. Scan the QR code shown in the terminal

This runs the app without building an APK. Good for testing before a full build.

### Option C — Local APK (advanced)

Requires **JDK 17** and **Android SDK** (install [Android Studio](https://developer.android.com/studio)).

Your PC currently has Java 11 and 24 — Gradle needs **17**. After installing Android Studio:

```bat
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
build-local-apk.bat
```

Output: `mobile\SSIES-Schedule-release.apk`

---

## Part 2: Install the APK on your Android phone

1. Copy the `.apk` file to your phone (USB cable, Google Drive, email, etc.)

2. On the phone, open the APK file. If Android blocks it:
   - **Settings → Security** (or **Apps → Special access**)
   - Enable **Install unknown apps** for your file manager or Chrome

3. Tap **Install**, then **Open**

4. You do **not** need the Play Store for this — it is a private app for your use.

---

## Part 3: Connect the app to your PC server

The phone cannot use `localhost` — that means the phone itself. You must use your **PC’s network address**.

### Step 1 — Start the backend on your PC

```bat
cd "D:\SSIES Schedule Automation"
run.bat
```

Leave this window open. Confirm you see:
```text
Running on http://127.0.0.1:5000
Running on http://192.168.x.x:5000
```

Note the **192.168.x.x** address (your LAN IP).

### Step 2 — Allow Windows Firewall (if connection fails)

1. **Windows Security → Firewall → Advanced settings**
2. **Inbound Rules → New Rule → Port → TCP 5000 → Allow**

Or temporarily allow when Windows asks while `run.bat` is running.

### Step 3 — Same Wi‑Fi

Phone and PC must be on the **same Wi‑Fi network** for LAN access.

### Step 4 — First launch in the app

1. Open **SSIES Schedule**
2. **Server URL:** `http://192.168.x.x:5000` (use your PC’s IP from Step 1)
3. Tap **Test and continue** — must succeed (checks `/health`)
4. **Sign in** with your SSIES email and password (same as web login)

### Using the app away from home (optional)

Use a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) on your PC:

```bat
cloudflared tunnel --url http://localhost:5000
```

Use the `https://....trycloudflare.com` URL as the server address in the app (works on mobile data anywhere).

---

## Part 4: WhatsApp features on mobile

| Feature | How it works on mobile |
|---------|-------------------------|
| **Groups / Schedule / Templates / Contacts** | Same as web — data syncs via your server |
| **Open WA** | Opens the **WhatsApp app** with `wa.me` or group invite links |
| **Automated Send** | Uses **WAHA only** (Docker on your PC). Selenium/Chrome cannot run on the phone |
| **Profile / Settings** | Under **More** tab |

### Link WhatsApp for automated send

1. On PC: WAHA Docker running + Superadmin → Settings → Provider = **WAHA**
2. In app: **Send** tab → **Start / QR** → scan with WhatsApp → Linked devices
3. If linking fails: **Reset QR**, scan within ~20 seconds

### Send a schedule

1. **Send** tab → select groups/contacts → **Send selected**
2. Group names must **exactly match** WhatsApp group names

---

## Part 5: Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm canceled` during eas login | Run `build-apk.bat` again; type **`y`** when npm asks to proceed |
| Cannot reach server | Same Wi‑Fi, `run.bat` running, correct IP, firewall port 5000 |
| Login fails | Same email/password as web; Supabase user must exist |
| Test connection OK but login fails | Check `SUPABASE_JWT_SECRET` in `run.local.bat` |
| Automated send disabled | Set WAHA provider in Superadmin (not Selenium) |
| Group not found | Group name in app must match WhatsApp exactly |
| WAHA QR fails | See main README WAHA section; use Reset QR |

---

## Quick reference

| Item | Value |
|------|--------|
| Build APK | `mobile\build-apk.bat` |
| Dev test | `mobile` → `npx expo start` → Expo Go |
| Server URL (LAN) | `http://YOUR_PC_IP:5000` |
| PC must run | `run.bat` + WAHA Docker (for automated send) |
| Login | Same Supabase user as web app |

For backend, WAHA, and Supabase setup, see the main [README.md](../README.md).
