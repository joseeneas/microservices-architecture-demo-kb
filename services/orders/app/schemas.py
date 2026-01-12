"""
Pydantic schemas for request/response validation in the Orders service.

These schemas define the structure of data for API requests and responses.
"""
from datetime import datetime
from typing import Optional, List
from decimal import Decimal
from pydantic import BaseModel, Field


class OrderItem(BaseModel):
    """Schema for an order line item."""
    sku: str = Field(..., description="Product SKU from inventory")
    quantity: int = Field(..., gt=0, description="Quantity ordered")
    price: Decimal = Field(..., ge=0, description="Price per unit")


class OrderBase(BaseModel):
    """Base schema with common order attributes."""
    user_id: int
    total: Decimal
    status: str = "pending"
    items: List[OrderItem] = Field(default_factory=list, description="Order line items")


class OrderCreate(BaseModel):
    """Schema for creating a new order."""
    id: str
    user_id: int
    total: Decimal
    status: Optional[str] = "pending"
    items: List[OrderItem] = Field(default_factory=list, description="Order line items")


class OrderUpdate(BaseModel):
    """Schema for updating an existing order. All fields are optional."""
    user_id: Optional[int] = None
    total: Optional[Decimal] = None
    status: Optional[str] = None
    items: Optional[List[OrderItem]] = None


class Order(OrderBase):
    """
    Schema for order responses, includes all database fields.
    
    Attributes:
        id (str): Order's unique identifier
        user_id (int): ID of the user who placed the order
        total (Decimal): Total amount of the order
        status (str): Order status
        items (List[OrderItem]): Order line items
        created_at (datetime): When the order was created
    """
    id: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class OrderEvent(BaseModel):
    """
    Schema for order timeline events.
    
    Attributes:
        id (int): Event ID
        order_id (str): Order identifier
        event_type (str): Type of event (created, status_changed, updated)
        description (str): Human-readable event description
        old_value (str): Previous value (optional)
        new_value (str): New value (optional)
        user_id (int): User who triggered the event (optional)
        created_at (datetime): When the event occurred
    """
    id: int
    order_id: str
    event_type: str
    description: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    user_id: Optional[int] = None
    created_at: datetime
    
    class Config:
        from_attributes = True
