"""One-time scheduled sends (routes and the minute tick) and stopping a send in progress.

Run:  python tests/test_scheduled_messages.py
"""
import os
import sys
import time
import uuid
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask  # noqa: E402

import app.auth.decorators as decorators  # noqa: E402
import app.services.scheduler as sched  # noqa: E402
from app.models import Profile, ScheduledMessage, db  # noqa: E402
from app.routes.user_routes import bp  # noqa: E402


class FakeProfile:
    def __init__(self, uid):
        self.id = uid

    def is_superadmin(self):
        return False

    def is_admin(self):
        return True


def iso(dt):
    return dt.replace(microsecond=0).isoformat() + "Z"


def main():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite://"
    db.init_app(app)
    app.register_blueprint(bp)
    uid = uuid.uuid4()
    decorators.authenticate_request = lambda: FakeProfile(uid)
    now = datetime.utcnow()
    with app.app_context():
        db.create_all()
        db.session.add(Profile(id=uid, email="t@example.test", role="user", is_active=True))
        db.session.commit()

    c = app.test_client()
    post = lambda body: c.post("/api/scheduled-messages", json=body)  # noqa: E731
    one = [{"name": "CS", "message": "Hello"}]

    # ── validation ──
    assert post({"sendAt": "tomorrow", "targets": one}).status_code == 400
    assert post({"sendAt": (now + timedelta(hours=1)).isoformat(), "targets": one}).status_code == 400    # no timezone
    assert post({"sendAt": iso(now - timedelta(minutes=5)), "targets": one}).status_code == 400            # past
    assert post({"sendAt": iso(now + timedelta(days=61)), "targets": one}).status_code == 400
    assert post({"sendAt": iso(now + timedelta(hours=1)), "targets": [{"name": "CS", "message": "  "}]}).status_code == 400

    # ── create (a +05:00 time is stored as UTC), list, cancel ──
    r = post({"sendAt": (now + timedelta(hours=7)).replace(microsecond=0).isoformat() + "+05:00",
              "targets": one + [{"name": "Ali", "phone": "+92 300-1234567", "message": "Hi"}]})
    assert r.status_code == 200, r.get_json()
    m = r.get_json()
    assert m["sendAt"] == iso(now + timedelta(hours=2)), m["sendAt"]                          # 7 h ahead at +05:00 = 2 h UTC
    assert m["targets"][1]["phone"] == "923001234567" and m["status"] == "pending"
    later = post({"sendAt": iso(now + timedelta(hours=5)), "targets": one}).get_json()
    assert [x["id"] for x in c.get("/api/scheduled-messages").get_json()] == [m["id"], later["id"]]
    assert c.delete(f"/api/scheduled-messages/{later['id']}").status_code == 200
    assert c.get("/api/scheduled-messages").get_json()[1]["status"] == "cancelled"
    assert c.delete("/api/scheduled-messages/9999").status_code == 404

    # ── tick: due ones start; a busy account is retried until the grace runs out ──
    calls, answer = [], {"v": (True, None)}
    sched.run_release = lambda app_, user, headless, delay, targets, actor: calls.append(targets) or answer["v"]
    with app.app_context():
        due = db.session.get(ScheduledMessage, m["id"])
        due.send_at = datetime.utcnow() - timedelta(minutes=1)
        db.session.commit()
        sched.tick(app)
        assert len(calls) == 1 and calls[0][0] == {"name": "CS", "message": "Hello"}
        assert db.session.get(ScheduledMessage, m["id"]).status == "sent"
        sched.tick(app)
        assert len(calls) == 1                                                  # never twice
        assert db.session.get(ScheduledMessage, later["id"]).status == "cancelled"   # cancelled ones never send

        busy = ScheduledMessage(user_id=uid, send_at=datetime.utcnow() - timedelta(minutes=2), targets_enc=due.targets_enc)
        db.session.add(busy); db.session.commit()
        answer["v"] = (False, "Release already in progress for this account")
        sched.tick(app)
        assert busy.status == "pending"                                         # tries again next minute
        busy.send_at = datetime.utcnow() - timedelta(minutes=40)
        db.session.commit()
        sched.tick(app)
        assert busy.status == "failed" and "in progress" in busy.detail

    # ── stopping a send in progress ──
    import app.services.whatsapp as wa
    import app.services.whatsapp_provider as prov
    import app.services.waha_client as wc
    from contextlib import nullcontext
    sent = []
    prov.get_provider = lambda: "waha"
    prov.require_connected = lambda user_id=None: (True, None)
    prov.send_target = lambda name, message, **kw: sent.append(name) or time.sleep(0.05) or True
    wc.use_waha_user = lambda *a, **k: nullcontext()
    wa.audit = lambda *a, **k: None
    while not wa.status_queue.empty():
        wa.status_queue.get()
    assert wa.cancel_release(uid) is False                                      # nothing running
    targets = [{"name": f"G{i}", "message": "x"} for i in range(5)]
    ok, err = wa.run_release(app, uid, False, 30, targets)
    assert ok, err
    time.sleep(0.2)                                                             # first message sent, now waiting 30 s
    assert wa.cancel_release(uid) is True
    deadline = time.time() + 5
    while wa._user_release_lock(uid).locked() and time.time() < deadline:
        time.sleep(0.05)
    assert sent == ["G0"], sent
    msgs = []
    while not wa.status_queue.empty():
        msgs.append(wa.status_queue.get())
    assert msgs[-1].startswith("done:── Stopped: 1/5"), msgs
    print("ok")


if __name__ == "__main__":
    main()
