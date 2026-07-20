"""
Shared JWT authentication dependency.

Mirrors token creation in main.py: on login, create_token() signs a JWT with
SECRET_KEY (HS256) carrying {"user_id", "email", "role", "exp"} as claims.
This module decodes and validates that same token, and exposes a
require_role() dependency factory for restricting endpoints to specific
roles (e.g. "Engagement Partner"), the same way "Send to Client" and report
approval need to be restricted.

Usage in any router:

    from auth import get_current_user, require_role

    # any authenticated user:
    @app.get("/whoami")
    def whoami(current_user: dict = Depends(get_current_user)):
        return current_user

    # restricted to specific role(s):
    @app.put("/engagements/{id}/send-to-client")
    def send_to_client(id: int, current_user: dict = Depends(require_role("Engagement Partner"))):
        ...
"""

import os

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"

# tokenUrl only affects the "Authorize" button in /docs; the real login
# endpoint is POST /auth/login in main.py
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Decode and validate the JWT sent in the Authorization: Bearer header.
    Returns the token payload, e.g. {"user_id": 4, "email": "...", "role": "Engagement Partner", "exp": ...}
    Raises 401 if the token is missing, malformed, expired, or invalid.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise credentials_exception

    if payload.get("user_id") is None or payload.get("role") is None:
        raise credentials_exception

    return payload


def require_role(*allowed_roles: str):
    """
    Dependency factory. require_role("Engagement Partner") restricts a route
    to users with that role; pass multiple roles to allow any of them.
    """
    def _check(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(allowed_roles)}",
            )
        return current_user

    return _check