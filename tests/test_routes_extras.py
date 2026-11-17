"""Route-level check for one-off changes, the calendar link and the installable-app files.

Uses an in-memory database and a stand-in signed-in user.
Run:  python tests/test_routes_extras.py
"""
import os
import sys
import uuid
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask  # noqa: E402

import app.auth.decorators as decorators  # noqa: E402
from app.models import Group, db  # noqa: E402
from app.routes.user_routes import bp  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class FakeProfile:
    def __init__(self):
        self.id = uuid.uuid4()

    def is_superadmin(self):
        return False

    def is_admin(self):
        return True


def main():
    app = Flask(__name__, static_folder=os.path.join(ROOT, "static"))
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite://"
    db.init_app(app)
    app.register_blueprint(bp)
    me = FakeProfile()
    signed_in = {"on": True}
    decorators.authenticate_request = lambda: me if signed_in["on"] else None
    today = datetime.utcnow().date().isoformat()

    with app.app_context():
        db.create_all()
        db.session.add_all([
            Group(user_id=me.id, name="CS Batch", schedule=[{"day": "Monday", "from": "3:00pm", "to": "4:30pm"}], position=0),
            Group(user_id=uuid.uuid4(), name="Someone else's", schedule=[], position=0),
        ])
        db.session.commit()
        mine = Group.query.filter_by(user_id=me.id).one().id
        other = Group.query.filter(Group.user_id != me.id).one().id

    c = app.test_client()
    post = lambda body: c.post("/api/schedule/exceptions", json=body)  # noqa: E731

    # validation
    assert post({"groupId": mine, "date": "soon", "kind": "cancel"}).status_code == 400
    assert post({"groupId": mine, "date": "2020-01-01", "kind": "cancel"}).status_code == 400          # in the past
    assert post({"groupId": mine, "date": today, "kind": "explode"}).status_code == 400
    assert post({"groupId": mine, "date": today, "kind": "move", "from": "whenever"}).status_code == 400
    assert post({"groupId": other, "date": today, "kind": "cancel"}).status_code == 404               # not my group

    # a move (time is normalised), a holiday, and an old change that gets cleaned up
    assert post({"groupId": mine, "date": today, "kind": "move", "from": "5 PM", "to": "18:00", "note": "room change"}).status_code == 200
    assert post({"groupId": None, "date": (datetime.utcnow() + timedelta(days=3)).date().isoformat(), "kind": "ignored"}).status_code == 200
    rows = c.get("/api/schedule/exceptions").get_json()
    assert [(r["groupName"], r["kind"], r["from"], r["to"]) for r in rows] == [("CS Batch", "move", "5:00pm", "6:00pm"), ("", "cancel", "", "")], rows
    assert rows[1]["groupId"] is None

    # calendar link: works without signing in, only with the right token
    url = c.get("/api/calendar-link").get_json()["url"]
    path = url.split("localhost", 1)[1]
    signed_in["on"] = False
    feed = c.get(path)
    assert feed.status_code == 200 and feed.mimetype == "text/calendar"
    body = feed.get_data(as_text=True)
    assert "SUMMARY:CS Batch" in body and "Someone else" not in body and "RRULE:FREQ=WEEKLY" in body
    assert f"DTSTART:{today.replace('-', '')}T170000" in body                                          # today's moved class
    assert c.get(path.replace(".ics", "x.ics")).status_code == 404
    assert c.get(f"/cal/{uuid.uuid4()}/{path.split('/')[-1]}").status_code == 404                      # someone else's id
    assert c.get(path + f"?group={other}").get_data(as_text=True).count("BEGIN:VEVENT") == 0
    assert c.get("/api/schedule/exceptions").status_code in (302, 401)                                 # API still needs a login

    # installable-app files are public and served from the root
    sw = c.get("/sw.js")
    assert sw.status_code == 200 and "javascript" in sw.mimetype and sw.headers["Cache-Control"] == "no-cache"
    assert c.get("/manifest.webmanifest").get_json()["start_url"] == "/"

    # remove
    signed_in["on"] = True
    assert c.delete(f"/api/schedule/exceptions/{rows[0]['id']}").status_code == 200
    assert c.delete(f"/api/schedule/exceptions/{rows[0]['id']}").status_code == 404
    assert len(c.get("/api/schedule/exceptions").get_json()) == 1

    # acknowledgements: only your own successful group sends can be checked
    from app.models import ReleaseLog
    with app.app_context():
        rows_ = [ReleaseLog(user_id=me.id, target_name="CS Batch", target_type="contact", status="success"),
                 ReleaseLog(user_id=me.id, target_name="CS Batch", target_type="group", status="failed"),
                 ReleaseLog(user_id=uuid.uuid4(), target_name="X", target_type="group", status="success")]
        db.session.add_all(rows_); db.session.commit()
        ids = [r.id for r in rows_]
    assert c.get(f"/api/release-history/{ids[0]}/acks").status_code == 400
    assert c.get(f"/api/release-history/{ids[1]}/acks").status_code == 400
    assert c.get(f"/api/release-history/{ids[2]}/acks").status_code == 404

    # WhatsApp assistant switch: off by default; turning it on starts from "now"
    import time as _t
    assert c.get("/api/assistant/whatsapp").get_json()["enabled"] is False
    on = c.put("/api/assistant/whatsapp", json={"enabled": True}).get_json()
    assert on["enabled"] is True and on["ready"] is False and on["linked"] is False
    from app.services import wa_assistant
    with app.app_context():
        st = wa_assistant.get_state(me.id)
    assert st["enabled"] and abs(st["last_ts"] - _t.time()) < 5 and st["pending"] is None
    assert c.put("/api/assistant/whatsapp", json={"enabled": False}).get_json()["enabled"] is False
    print("ok")


if __name__ == "__main__":
    main()
