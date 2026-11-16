"""Saving the schedule table must not wipe a group's photo, WhatsApp flag or id.

Run:  python tests/test_group_sync.py
"""
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask  # noqa: E402

from app.models import Group, db  # noqa: E402
from app.routes.user_routes import _sync_groups  # noqa: E402


def main():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite://"
    db.init_app(app)
    with app.app_context():
        db.create_all()
        uid, other = uuid.uuid4(), uuid.uuid4()
        db.session.add_all([
            Group(user_id=uid, name="A", schedule=[], photo_path="u/a.png", wa_linked=True, position=0),
            Group(user_id=uid, name="B", schedule=[], photo_path="u/b.png", position=1),
            Group(user_id=uid, name="C", schedule=[], position=2),
            Group(user_id=other, name="A", schedule=[], photo_path="o/a.png", position=0),
        ])
        db.session.commit()
        a, b, c = Group.query.filter_by(user_id=uid).order_by(Group.position).all()
        a_id, b_id = a.id, b.id

        # reorder, rename B (matched by id), drop C, add D, A sent without an id (matched by name)
        sched = [{"day": "Monday", "from": "3:00pm", "to": "4:30pm"}]
        _sync_groups(uid, [
            {"id": b_id, "name": "B renamed", "schedule": sched},
            {"name": "A", "schedule": []},
            {"name": "D", "schedule": []},
        ])
        db.session.commit()

        rows = Group.query.filter_by(user_id=uid).order_by(Group.position).all()
        assert [r.name for r in rows] == ["B renamed", "A", "D"], [r.name for r in rows]
        assert rows[0].id == b_id and rows[0].photo_path == "u/b.png" and rows[0].schedule == sched
        assert rows[1].id == a_id and rows[1].photo_path == "u/a.png" and rows[1].wa_linked is True
        assert rows[2].photo_path is None and rows[2].wa_linked is False
        # another user's rows are never touched, even with a matching name
        o = Group.query.filter_by(user_id=other).one()
        assert o.name == "A" and o.photo_path == "o/a.png"
    print("ok")


if __name__ == "__main__":
    main()
