"""
SQLAlchemy ORM models for the Orders service.

Defines the database schema for order-related tables.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Numeric, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from .database import Base

class Order(Base):
    """
    Order model representing a customer order in the system.
    
    Attributes:
        id (str): Primary key, order ID (e.g., "A100", "B200")
        user_id (int): ID of the user who placed the order
        total (Decimal): Total amount of the order
        status (str): Order status (e.g., "pending", "completed", "cancelled")
        items (list): Order line items with SKU, quantity, and price (stored as JSON)
        created_at (datetime): Timestamp when the order was created
    """
    __tablename__ = "orders"
    
    id = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    total = Column(Numeric(10, 2), nullable=False, default=0.00)
    status = Column(String, nullable=False, default="pending")
    items = Column(JSONB, nullable=True, default=[])
    created_at = Column(DateTime, default=datetime.utcnow)


class OrderEvent(Base):
    """
    OrderEvent model representing historical events in an order's lifecycle.
    
    Attributes:
        id (int): Primary key, auto-incrementing event ID
        order_id (str): Foreign key to the order
        event_type (str): Type of event (e.g., "created", "status_changed", "updated")
        description (str): Human-readable description of the event
        old_value (str): Previous value (for changes, optional)
        new_value (str): New value (for changes, optional)
        user_id (int): ID of the user who triggered the event (optional)
        created_at (datetime): Timestamp when the event occurred
    """
    __tablename__ = "order_events"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    order_id = Column(String, ForeignKey("orders.id"), nullable=False, index=True)
    event_type = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    old_value = Column(String, nullable=True)
    new_value = Column(String, nullable=True)
    user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
