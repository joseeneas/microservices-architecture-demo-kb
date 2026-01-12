"""
Pydantic schemas for request/response validation in the Users service.

These schemas define the structure of data for API requests and responses.
"""
from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, EmailStr, Field

class UserBase(BaseModel):
    """Base schema with common user attributes."""
    name: str
    email: EmailStr

class UserCreate(UserBase):
    """Schema for creating a new user by admin. Optional password; default will be used if omitted."""
    password: Optional[str] = Field(default=None, min_length=8, description="Temporary password (min 8 chars)")

class UserRegister(UserBase):
    """Schema for user registration with password."""
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")

class UserLogin(BaseModel):
    """Schema for user login."""
    email: EmailStr
    password: str

class Token(BaseModel):
    """Schema for JWT token response."""
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    """Schema for data stored in JWT token."""
    user_id: Optional[int] = None
    email: Optional[str] = None
    role: Optional[str] = None

class UserUpdate(BaseModel):
    """Schema for updating an existing user. All fields are optional."""
    name: Optional[str] = None
    email: Optional[EmailStr] = None

class User(UserBase):
    """
    Schema for user responses, includes all database fields except password.
    
    Attributes:
        id (int): User's unique identifier
        name (str): User's full name
        email (str): User's email address
        role (str): User role
        is_active (bool): Whether the account is active
        created_at (datetime): When the user was created
    """
    id: int
    role: str
    is_active: bool
    preferences: Dict[str, Any] = {}
    created_at: datetime
    
    class Config:
        from_attributes = True

class PreferencesUpdate(BaseModel):
    """Schema for updating user preferences."""
    preferences: Dict[str, Any]
