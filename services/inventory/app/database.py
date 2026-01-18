"""
Database configuration and session management for the Inventory service.

This module sets up the database connection using SQLAlchemy and provides
a session factory for database operations.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Get database URL from environment variable
# Create SQLAlchemy engine
# Create SessionLocal class for database sessions
# Base class for declarative models
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://inventory:inventory123@localhost:5432/inventorydb")
engine       = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base         = declarative_base()

def get_db():
    """
    Dependency function that provides a database session.
    
    Yields:
        Session: SQLAlchemy database session
        
    Usage:
        Use as a FastAPI dependency to inject database sessions into route handlers.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
