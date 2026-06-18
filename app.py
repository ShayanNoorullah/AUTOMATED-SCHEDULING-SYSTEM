"""SSIES WhatsApp Schedule Sender — entry point."""
import os

from app import create_app
from app.config import Config

app = create_app()

if __name__ == "__main__":
    db_display = Config.DATABASE_URL.split("@")[-1] if "@" in Config.DATABASE_URL else Config.DATABASE_URL
    print("Starting SSIES WhatsApp Schedule Sender…")
    print("Database:", db_display)
    print("Supabase:", "configured" if Config.supabase_configured() else "NOT configured — set run.local.bat")
    port = int(os.environ.get("PORT", 5000))
    print(f"Open your browser at: http://localhost:{port}")

    if os.environ.get("USE_WAITRESS") == "1":
        from waitress import serve
        serve(app, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
    else:
        app.run(debug=False, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
