"""
Authentication and authorization utilities for Orders service.

Validates JWT tokens issued by the Users service.
"""
import logging
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# JWT settings (must match Users service)
SECRET_KEY = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"
ALGORITHM = "HS256"

# Security scheme for JWT bearer tokens
security = HTTPBearer()


class TokenData(BaseModel):
    """Data extracted from JWT token."""
    user_id: int
    email: str
    role: str


class CurrentUser(BaseModel):
    """Current authenticated user information."""
    id: int
    email: str
    role: str
    token: str


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> CurrentUser:
    """
    FastAPI dependency to get the current authenticated user from JWT token.
    
    Args:
        credentials: HTTP Authorization credentials (injected)
        
    Returns:
        Current authenticated user information
        
    Raises:
        HTTPException: 401 if token is invalid
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_str: str = payload.get("sub")
        email: str = payload.get("email")
        role: str = payload.get("role")
        
        if user_id_str is None or email is None or role is None:
            raise credentials_exception
            
        user_id = int(user_id_str)
        return CurrentUser(id=user_id, email=email, role=role, token=token)
    except (JWTError, ValueError) as e:
        logger.error(f"JWT validation error: {e}")
        raise credentials_exception


def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """
    FastAPI dependency to require admin role.
    
    Args:
        current_user: Current authenticated user (injected)
        
    Returns:
        Current user if they are an admin
        
    Raises:
        HTTPException: 403 if user is not an admin
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user
