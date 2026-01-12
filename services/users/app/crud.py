"""
CRUD (Create, Read, Update, Delete) operations for the Users service.

This module contains all database operations for user management.
"""
from typing import List, Optional
from sqlalchemy.orm import Session
from . import models, schemas

def get_user(db: Session, user_id: int) -> Optional[models.User]:
    """
    Retrieve a single user by ID.
    
    Args:
        db: Database session
        user_id: ID of the user to retrieve
        
    Returns:
        User object or None if not found
    """
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    """
    Retrieve a user by email address.
    
    Args:
        db: Database session
        email: Email address to search for
        
    Returns:
        User object or None if not found
    """
    return db.query(models.User).filter(models.User.email == email).first()

def get_users(db: Session, skip: int = 0, limit: int = 100) -> List[models.User]:
    """
    Retrieve a list of users with pagination.
    
    Args:
        db: Database session
        skip: Number of records to skip (offset)
        limit: Maximum number of records to return
        
    Returns:
        List of User objects
    """
    return db.query(models.User).offset(skip).limit(limit).all()

def create_user(db: Session, user: schemas.UserCreate) -> models.User:
    """
    Create a new user in the database.
    
    Args:
        db: Database session
        user: User data to create
        
    Returns:
        Created User object
    """
    db_user = models.User(name=user.name, email=user.email)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user(db: Session, user_id: int, user: schemas.UserUpdate) -> Optional[models.User]:
    """
    Update an existing user.
    
    Args:
        db: Database session
        user_id: ID of the user to update
        user: Updated user data (only provided fields will be updated)
        
    Returns:
        Updated User object or None if not found
    """
    db_user = get_user(db, user_id)
    if db_user is None:
        return None
    
    update_data = user.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_user, key, value)
    
    db.commit()
    db.refresh(db_user)
    return db_user

def delete_user(db: Session, user_id: int) -> bool:
    """
    Delete a user from the database.
    
    Args:
        db: Database session
        user_id: ID of the user to delete
        
    Returns:
        True if user was deleted, False if not found
    """
    db_user = get_user(db, user_id)
    if db_user is None:
        return False
    
    db.delete(db_user)
    db.commit()
    return True
