import hashlib
import re
import urllib.request
from pathlib import Path

BASE = "https://ssies-schedule.duckdns.org"
ROOT = Path(r"D:\SSIES Schedule Automation")

def fetch(path):
    r = urllib.request.urlopen(BASE + path, timeout=25)
    return r.status, r.read()

def md5(b):
    return hashlib.md5(b).hexdigest()[:12]

print("=== LIVE ===")
status, login = fetch("/login")
print("login", status, "len", len(login), md5(login))
text = login.decode("utf-8", "ignore")
print("css refs:", re.findall(r'href="([^"]+\.css[^"]*)"', text)[:10])
print("has Satoshi", "Satoshi" in text or "fontshare" in text)
print("has passkey", "passkey" in text.lower())
print("accent teal in html?", "#0d9488" in text or "#2dd4bf" in text)

for rel in [
    "/static/css/app.css",
    "/static/css/compat.css",
    "/static/css/components.css",
    "/static/js/chrome.js",
    "/static/js/theme.js",
]:
    local = ROOT / rel.lstrip("/")
    try:
        st, remote = fetch(rel)
        loc = local.read_bytes() if local.exists() else b""
        print(f"{rel}: live={md5(remote)} local={md5(loc) if loc else 'MISSING'} match={remote==loc if loc else False} live_len={len(remote)}")
    except Exception as e:
        print(rel, "FAIL", e)

# Spot-check key local markers in live app.css
try:
    _, css = fetch("/static/css/app.css")
    print("live app.css has --accent:#0d9488", b"--accent:#0d9488" in css or b"--accent: #0d9488" in css)
    print("live app.css has shell", b".shell{" in css)
except Exception as e:
    print("app.css fail", e)

print("health", fetch("/health")[1].decode())
