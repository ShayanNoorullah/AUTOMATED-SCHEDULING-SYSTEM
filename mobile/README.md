# SSIES Schedule — Android App

User-portal mobile client for the SSIES WhatsApp Schedule Sender. Connects to your existing Flask backend over Wi‑Fi or Cloudflare Tunnel.

## Prerequisites

- Node.js 18+
- [Expo CLI](https://docs.expo.dev/) / EAS CLI for APK builds
- Flask app running (`run.bat`) on your PC
- Phone on same Wi‑Fi (LAN) or a public tunnel URL

## Setup

```bat
cd mobile
npm install
copy .env.example .env
```

Edit `.env` with your Supabase URL and anon key (optional if server exposes `/api/mobile/config`).

## Run in development

```bat
npx expo start
```

Scan the QR with Expo Go on Android, or press `a` for emulator.

## Build APK

### EAS Build (recommended)

```bat
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

Download the `.apk` from the Expo dashboard when the build completes.

### Local build (requires Android SDK + JDK 17)

Gradle/Android tooling requires **JDK 17**. If you have Android Studio installed:

```bat
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
build-local-apk.bat
```

Output: `SSIES-Schedule-release.apk` in the `mobile/` folder.

If local build fails (Java version, SDK), use **EAS Build** above instead.

## First launch

1. Enter server URL, e.g. `http://192.168.1.14:5000` (your PC LAN IP from `ipconfig`)
2. Sign in with your SSIES user email/password
3. Use tabs: Groups, Schedule, Open WA, Send, More

## Automated send on mobile

- Requires **WAHA** configured in Superadmin (Selenium cannot run on Android)
- Link WhatsApp under **Send** → Start / QR
- Group names must match WhatsApp exactly

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Cannot reach server | Same Wi‑Fi, `run.bat` running, firewall allows port 5000 |
| Login fails | Supabase keys in `.env` or `/api/mobile/config` on server |
| WAHA not connected | Docker WAHA running; API key matches Superadmin settings |

For backend, WAHA, and Supabase setup, see the main [README.md](../README.md).

**Full step-by-step guide:** [MOBILE_SETUP.md](MOBILE_SETUP.md)
