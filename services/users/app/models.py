"""
SQLAlchemy ORM models for the Users service.

Defines the database schema for user-related tables.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from .database import Base

class User(Base):
    """
    User model representing a user in the system.
    
    Attributes:
        id (int): Primary key, auto-incremented user ID
        name (str): User's full name
        email (str): User's email address (unique)
        password_hash (str): Hashed password
        role (str): User role (admin, user)
        is_active (bool): Whether the user account is active
        created_at (datetime): Timestamp when the user was created
    """
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    preferences = Column(JSONB, default=dict, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
