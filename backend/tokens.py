import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Ensure backend directory is prioritized in sys.path over any external PYTHONPATH entries
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

try:
    from backend.database import run_query
except ImportError:
    from database import run_query


load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SECRET_KEY = os.getenv("SECRET_KEY", "")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def create_access_token(user: dict) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user["id"]), "role": user["role"], "exp": expires_at}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (jwt.PyJWTError, TypeError, ValueError):
        raise error
    user = run_query(
        "SELECT id, name, email, role FROM users WHERE id = %s",
        (user_id,),
        fetch="one",
    )
    if user is None:
        raise error
    return user


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user["role"] != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
