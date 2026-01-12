"""
Pydantic schemas for request/response validation in the Inventory service.

These schemas define the structure of data for API requests and responses.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

class InventoryItemBase(BaseModel):
    """Base schema with common inventory item attributes."""
    sku: str
    qty: int

class InventoryItemCreate(InventoryItemBase):
    """Schema for creating a new inventory item."""
    pass

class InventoryItemUpdate(BaseModel):
    """Schema for updating an existing inventory item. All fields are optional."""
    sku: Optional[str] = None
    qty: Optional[int] = None

class InventoryItem(InventoryItemBase):
    """
    Schema for inventory item responses, includes all database fields.
    
    Attributes:
        id (int): Inventory item's unique identifier
        sku (str): Stock Keeping Unit
        qty (int): Quantity available
        created_at (datetime): When the item was created
    """
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True
