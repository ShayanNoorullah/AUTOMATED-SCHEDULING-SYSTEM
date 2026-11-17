"""The profile panel is shared by /profile and the in-app Profile view of the portal.

In the portal the password form lives in Settings → Security, so the panel must not repeat
it there (the ids would clash); on /profile it must still be there.
Run:  python tests/test_account_views.py
"""
import os
import sys
import uuid
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, render_template  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class FakeProfile:
    id = uuid.uuid4()
    email = "teacher@example.com"
    display_name = "Teacher"
    role = "user"
    is_active = True
    created_at = datetime(2026, 1, 1)
    last_login_at = datetime(2026, 11, 1)

    def photo_url(self):
        return None

    def display_label(self):
        return self.display_name


def main():
    app = Flask(__name__, template_folder=os.path.join(ROOT, "templates"), static_folder=os.path.join(ROOT, "static"))
    p = FakeProfile()
    with app.test_request_context("/"):
        portal = render_template("user/index.html", days=[], username=p.display_name, email=p.email, role=p.role,
                                 photo_url=None, csrf_token="", profile=p)
        page = render_template("user/profile.html", profile=p, back_url="/", back_label="Dashboard", use_portal=False)

    assert 'id="view-profile"' in portal and 'id="view-notifications"' in portal
    assert "Open Settings → Security" in portal
    assert portal.count('id="curPw"') == 1 and portal.count('id="newPw"') == 1   # only Settings' copy
    assert 'id="profileHeroName"' in portal and "teacher@example.com" in portal
    assert "js/account.js" in portal

    assert page.count('id="curPw"') == 1 and 'id="savePwBtn"' in page
    assert "Open Settings → Security" not in page
    assert "js/account.js" in page and "async function loadPwPending" not in page
    print("ok: account views")


if __name__ == "__main__":
    main()
