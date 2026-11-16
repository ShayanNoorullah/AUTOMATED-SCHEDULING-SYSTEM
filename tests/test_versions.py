"""Schedule versions: snapshot before a change, skip duplicates, prune, restore.

Run:  python tests/test_versions.py
"""
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask  # noqa: E402

import app.routes.user_routes as ur  # noqa: E402
from app.models import Group, ScheduleVersion, db  # noqa: E402


def main():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite://"
    db.init_app(app)
    with app.app_context():
        db.create_all()
        uid, other = uuid.uuid4(), uuid.uuid4()
        mon = [{"day": "Monday", "from": "3:00pm", "to": "4:30pm"}]
        db.session.add_all([
            Group(user_id=uid, name="A", schedule=mon, photo_path="u/a.png", position=0),
            Group(user_id=uid, name="B", schedule=[], position=1),
        ])
        db.session.commit()

        def versions(u=uid):
            return ScheduleVersion.query.filter_by(user_id=u).order_by(ScheduleVersion.id).all()

        # snapshot, then an identical one is skipped
        ur._snapshot_groups(uid, "Schedule saved"); db.session.commit()
        ur._snapshot_groups(uid, "Schedule saved"); db.session.commit()
        assert len(versions()) == 1
        v1 = versions()[0].id

        # change: A moves, B is deleted
        ur._sync_groups(uid, [{"name": "A", "schedule": [{"day": "Friday", "from": "1:00pm", "to": ""}]}])
        db.session.commit()
        assert [g.name for g in Group.query.filter_by(user_id=uid)] == ["A"]

        # another user cannot restore it; the owner can
        assert ur._restore_version(other, v1) is False
        assert ur._restore_version(uid, v1) is True
        db.session.commit()
        rows = Group.query.filter_by(user_id=uid).order_by(Group.position).all()
        assert [g.name for g in rows] == ["A", "B"] and rows[0].schedule == mon
        assert rows[0].photo_path == "u/a.png"            # same row, photo kept
        assert len(versions()) == 2                       # the pre-restore state was saved too

        # only the newest VERSIONS_KEEP are kept
        ur.VERSIONS_KEEP = 3
        for i in range(6):
            rows[0].nickname = f"n{i}"
            db.session.commit()
            ur._snapshot_groups(uid, f"edit {i}")
            db.session.commit()
        assert len(versions()) == 3 and versions()[-1].reason == "edit 5"
    print("ok")


if __name__ == "__main__":
    main()
