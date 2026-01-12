"""
Enhanced validation utilities for the Orders service.

Provides additional business logic validation beyond schema validation.
"""
from typing import List, Tuple
from decimal import Decimal
from . import schemas


def validate_order_items(items: List[schemas.OrderItem]) -> Tuple[bool, str]:
    """
    Validate order items for business rules.
    
    Args:
        items: List of order items
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not items:
        return False, "Order must contain at least one item"
    
    if len(items) > 100:
        return False, "Order cannot contain more than 100 items"
    
    # Check for duplicate SKUs
    skus = [item.sku for item in items]
    if len(skus) != len(set(skus)):
        return False, "Order contains duplicate SKUs"
    
    # Validate quantities and prices
    for item in items:
        if item.quantity <= 0:
            return False, f"Item {item.sku}: quantity must be positive"
        
        if item.quantity > 10000:
            return False, f"Item {item.sku}: quantity exceeds maximum (10000)"
        
        if item.price < 0:
            return False, f"Item {item.sku}: price cannot be negative"
        
        if item.price > Decimal('1000000'):
            return False, f"Item {item.sku}: price exceeds maximum (1,000,000)"
    
    return True, ""


def validate_order_total(items: List[schemas.OrderItem], claimed_total: Decimal) -> Tuple[bool, str]:
    """
    Validate that the order total matches the sum of item prices.
    
    Args:
        items: List of order items
        claimed_total: The total claimed by the client
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    calculated_total = sum(
        Decimal(str(item.price)) * item.quantity 
        for item in items
    )
    
    # Allow small rounding differences (up to 0.01)
    if abs(calculated_total - claimed_total) > Decimal('0.01'):
        return False, f"Order total mismatch: calculated ${calculated_total}, claimed ${claimed_total}"
    
    return True, ""


def validate_order_status_transition(old_status: str, new_status: str) -> Tuple[bool, str]:
    """
    Validate that a status transition is allowed.
    
    Args:
        old_status: Current order status
        new_status: New order status
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    # Define valid transitions
    valid_transitions = {
        "pending": ["processing", "cancelled"],
        "processing": ["shipped", "cancelled"],
        "shipped": ["delivered", "cancelled"],
        "delivered": [],  # Terminal state
        "cancelled": ["pending"],  # Can be reactivated
    }
    
    if old_status not in valid_transitions:
        return False, f"Unknown status: {old_status}"
    
    if new_status not in valid_transitions:
        return False, f"Unknown status: {new_status}"
    
    if old_status == new_status:
        return True, ""  # No change is valid
    
    if new_status not in valid_transitions[old_status]:
        return False, f"Invalid status transition: {old_status} -> {new_status}"
    
    return True, ""
