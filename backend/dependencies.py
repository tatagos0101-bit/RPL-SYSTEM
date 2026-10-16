from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from database import get_db
from models.auth_session import AuthSession
from models.user import User
from services.auth_cookie import AUTH_COOKIE_NAME
from services.auth_sessions import session_claims, session_is_current

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_session_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    auth_token = token or request.cookies.get(AUTH_COOKIE_NAME)
    claims = session_claims(auth_token) if auth_token else None
    if claims is None:
        raise credentials_error
    user_id, sid = claims
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_error
    if user.status == "suspended":
        raise credentials_error
    if not session_is_current(db.get(AuthSession, sid), user):
        raise credentials_error
    return user


def get_current_user(current_user: User = Depends(get_session_user)) -> User:
    if current_user.must_change_password:
        raise HTTPException(status_code=403, detail="Password change required.")
    return current_user


def require_librarian(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "librarian":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Librarian access required")
    return current_user


def require_member(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "member":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Member access required")
    return current_user
