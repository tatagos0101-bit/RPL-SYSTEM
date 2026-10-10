from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from config import JWT_SECRET_KEY, JWT_ALGORITHM
from database import get_db
from models.user import User
from services.auth_cookie import AUTH_COOKIE_NAME

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        auth_token = token or request.cookies.get(AUTH_COOKIE_NAME)
        if not auth_token:
            raise credentials_error
        payload = jwt.decode(auth_token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if payload.get("scope") == "upload":
            raise credentials_error
        user_id_str = payload.get("sub")
        if user_id_str is None:
            raise credentials_error
        user_id = int(user_id_str)
    except (JWTError, ValueError, TypeError):
        raise credentials_error

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_error
    if user.status == "suspended":
        raise credentials_error
    return user


def require_librarian(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "librarian":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Librarian access required")
    return current_user


def require_member(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "member":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Member access required")
    return current_user
