"""Database-backed sessions. Callers own the transaction and cookie response."""
import hmac
import secrets
from datetime import timedelta

from jose import JWTError, jwt

from config import ACCESS_TOKEN_EXPIRE_MIN, JWT_ALGORITHM, JWT_SECRET_KEY
from models.auth_session import AuthSession
from timezone_utils import as_ph, now_ph


def credential_digest(user) -> str:
    # Binding to the stored password hash also closes the login/reset race:
    # a session created from an old credential snapshot cannot authenticate later.
    return hmac.new(JWT_SECRET_KEY.encode(),
                    f"session:{user.id}:{user.password_hash}".encode(), "sha256").hexdigest()


def create_session_token(db, user) -> str:
    now = now_ph()
    db.query(AuthSession).filter(
        AuthSession.user_id == user.id, AuthSession.expires_at <= now,
    ).delete(synchronize_session=False)
    session = AuthSession(
        id=secrets.token_hex(32), user_id=user.id,
        credential_digest=credential_digest(user), created_at=now,
        expires_at=now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MIN),
    )
    db.add(session)
    db.flush()
    return jwt.encode({"sub": str(user.id), "sid": session.id, "scope": "session",
                       "exp": session.expires_at}, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def session_claims(token):
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM],
                             options={"require_exp": True, "require_sub": True})
        sid = payload.get("sid")
        if payload.get("scope") != "session" or not isinstance(sid, str) or len(sid) != 64:
            return None
        user_id = int(payload["sub"])
        return user_id, sid
    except (JWTError, ValueError, TypeError, KeyError):
        return None


def session_is_current(session, user) -> bool:
    return (session is not None and session.user_id == user.id
            and as_ph(session.expires_at) > now_ph()
            and hmac.compare_digest(session.credential_digest, credential_digest(user)))


def revoke_user_sessions(db, user_id):
    db.query(AuthSession).filter(AuthSession.user_id == user_id).delete(synchronize_session=False)


def revoke_token_session(db, token):
    claims = session_claims(token) if token else None
    if claims:
        user_id, sid = claims
        db.query(AuthSession).filter(AuthSession.id == sid, AuthSession.user_id == user_id).delete(synchronize_session=False)
