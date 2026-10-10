from fastapi import Response

from config import ACCESS_TOKEN_EXPIRE_MIN, ENVIRONMENT, HTTPS_ONLY, AUTH_COOKIE_SAMESITE

AUTH_COOKIE_NAME = "rpl_auth"


def _secure_cookie() -> bool:
    return ENVIRONMENT == "production" or HTTPS_ONLY


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=ACCESS_TOKEN_EXPIRE_MIN * 60,
        httponly=True,
        secure=_secure_cookie(),
        samesite=AUTH_COOKIE_SAMESITE,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        httponly=True,
        secure=_secure_cookie(),
        samesite=AUTH_COOKIE_SAMESITE,
        path="/",
    )
