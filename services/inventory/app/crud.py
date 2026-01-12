"""
CRUD (Create, Read, Update, Delete) operations for the Inventory service.

This module contains all database operations for inventory management.
"""
from typing import List, Optional
from sqlalchemy.orm import Session
from . import models, schemas

def get_inventory_item(db: Session, item_id: int) -> Optional[models.InventoryItem]:
    """
    Retrieve a single inventory item by ID.
    
    Args:
        db: Database session
        item_id: ID of the inventory item to retrieve
        
    Returns:
        InventoryItem object or None if not found
    """
    return db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()

def get_inventory_item_by_sku(db: Session, sku: str) -> Optional[models.InventoryItem]:
    """
    Retrieve an inventory item by SKU.
    
    Args:
        db: Database session
        sku: SKU to search for
        
    Returns:
        InventoryItem object or None if not found
    """
    return db.query(models.InventoryItem).filter(models.InventoryItem.sku == sku).first()

def get_inventory_items(db: Session, skip: int = 0, limit: int = 100) -> List[models.InventoryItem]:
    """
    Retrieve a list of inventory items with pagination.
    
    Args:
        db: Database session
        skip: Number of records to skip (offset)
        limit: Maximum number of records to return
        
    Returns:
        List of InventoryItem objects
    """
    return db.query(models.InventoryItem).offset(skip).limit(limit).all()

def create_inventory_item(db: Session, item: schemas.InventoryItemCreate) -> models.InventoryItem:
    """
    Create a new inventory item in the database.
    
    Args:
        db: Database session
        item: Inventory item data to create
        
    Returns:
        Created InventoryItem object
    """
    db_item = models.InventoryItem(sku=item.sku, qty=item.qty)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

def update_inventory_item(db: Session, item_id: int, item: schemas.InventoryItemUpdate) -> Optional[models.InventoryItem]:
    """
    Update an existing inventory item.
    
    Args:
        db: Database session
        item_id: ID of the inventory item to update
        item: Updated item data (only provided fields will be updated)
        
    Returns:
        Updated InventoryItem object or None if not found
    """
    db_item = get_inventory_item(db, item_id)
    if db_item is None:
        return None
    
    update_data = item.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_item, key, value)
    
    db.commit()
    db.refresh(db_item)
    return db_item

def delete_inventory_item(db: Session, item_id: int) -> bool:
    """
    Delete an inventory item from the database.
    
    Args:
        db: Database session
        item_id: ID of the inventory item to delete
        
    Returns:
        True if item was deleted, False if not found
    """
    db_item = get_inventory_item(db, item_id)
    if db_item is None:
        return False
    
    db.delete(db_item)
    db.commit()
    return True
