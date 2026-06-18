"""Default message templates for new users."""
from app.crypto import enc
from app.models import Template, db

DEFAULT_TEMPLATE_NAME = "Weekly Schedule (default)"
DEFAULT_TEMPLATE_BODY = (
    "*Note*\nSchedule for this week:\n"
    "* Saturday: 12:00pm - 1:30pm\n* Sunday: 12:00pm - 1:30pm\n*Kindly Acknowledge*"
)


def seed_default_template_for_user(user_id):
    if Template.query.filter_by(user_id=user_id, name=DEFAULT_TEMPLATE_NAME).first():
        return False
    n = Template.query.filter_by(user_id=user_id).count()
    db.session.add(Template(
        user_id=user_id,
        name=DEFAULT_TEMPLATE_NAME,
        content_enc=enc(DEFAULT_TEMPLATE_BODY),
        position=n,
    ))
    return True


def ensure_default_template(user_id):
    if Template.query.filter_by(user_id=user_id).count() == 0:
        seed_default_template_for_user(user_id)
        db.session.commit()
