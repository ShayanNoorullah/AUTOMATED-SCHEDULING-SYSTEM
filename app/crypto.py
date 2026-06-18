from cryptography.fernet import InvalidToken

from app.config import Config

_fernet = Config.fernet()


def enc(text):
    if not text:
        return ""
    return _fernet.encrypt(text.encode()).decode()


def dec(token):
    if not token:
        return ""
    try:
        return _fernet.decrypt(token.encode()).decode()
    except (InvalidToken, Exception):
        return token
