"""
SQLAlchemy ORM models for the Inventory service.

Defines the database schema for inventory-related tables.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from .database import Base

class InventoryItem(Base):
    """
    Inventory item model representing a product in stock.
    
    Attributes:
        id (int): Primary key, auto-incremented inventory item ID
        sku (str): Stock Keeping Unit (unique identifier for the product)
        qty (int): Quantity available in inventory
        created_at (datetime): Timestamp when the item was created
    """
    __tablename__ = "inventory"
    
    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String, unique=True, index=True, nullable=False)
    qty = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
