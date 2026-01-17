"""
CRUD (Create, Read, Update, Delete) operations for the Orders service.

This module contains all database operations for order management.
"""
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import delete as sqla_delete
import httpx
import logging
from . import models, schemas
from .clients import users_client, inventory_client

# Set up logging
logger = logging.getLogger(__name__)

def get_order(db: Session, order_id: str) -> Optional[models.Order]:
    """
    Retrieve a single order by ID.
    
    Args:
        db: Database session
        order_id: ID of the order to retrieve
        
    Returns:
        Order object or None if not found
    """
    return db.query(models.Order).filter(models.Order.id == order_id).first()

def get_orders(db: Session, skip: int = 0, limit: int = 100) -> List[models.Order]:
    """
    Retrieve a list of orders with pagination.
    
    Args:
        db: Database session
        skip: Number of records to skip (offset)
        limit: Maximum number of records to return
        
    Returns:
        List of Order objects
    """
    return db.query(models.Order).offset(skip).limit(limit).all()

async def process_inventory_for_order(items: List, deduct: bool = True, token: Optional[str] = None) -> Tuple[bool, Optional[str], List[str]]:
    """
    Process inventory deductions or restorations for order items.
    
    Args:
        items: List of order items with sku and quantity
        deduct: If True, deduct inventory; if False, restore inventory
        
    Returns:
        Tuple of (success: bool, error_message: Optional[str], processed_skus: List[str])
        processed_skus contains the SKUs that were successfully processed (for rollback)
    """
    processed_skus = []
    action = "deduction" if deduct else "restoration"
    
    try:
        for item in items:
            sku = item.sku if hasattr(item, 'sku') else item['sku']
            quantity = item.quantity if hasattr(item, 'quantity') else item['quantity']
            
            if deduct:
                success, error_msg = await inventory_client.reduce_inventory(sku, quantity, token)
                if success:
                    logger.info(f"Deducted {quantity} units of SKU '{sku}'")
                    processed_skus.append(sku)
                else:
                    # Rollback all previous deductions
                    logger.error(f"Failed to deduct inventory for SKU '{sku}': {error_msg}")
                    if processed_skus:
                        logger.info(f"Rolling back inventory deductions for {len(processed_skus)} items")
                        await rollback_inventory_deductions(items, processed_skus, token)
                    return False, f"Inventory {action} failed: {error_msg}", []
            else:
                success, error_msg = await inventory_client.restore_inventory(sku, quantity, token)
                if success:
                    logger.info(f"Restored {quantity} units of SKU '{sku}'")
                    processed_skus.append(sku)
                else:
                    logger.error(f"Failed to restore inventory for SKU '{sku}': {error_msg}")
                    # Continue with other restorations even if one fails
        
        return True, None, processed_skus
    
    except Exception as e:
        logger.error(f"Unexpected error during inventory {action}: {str(e)}")
        if deduct and processed_skus:
            await rollback_inventory_deductions(items, processed_skus, token)
        return False, f"Inventory {action} error: {str(e)}", []


async def rollback_inventory_deductions(items: List, processed_skus: List[str], token: Optional[str] = None) -> None:
    """
    Rollback inventory deductions for items that were successfully processed.
    
    Args:
        items: List of all order items
        processed_skus: List of SKUs that were successfully deducted
    """
    for item in items:
        sku = item.sku if hasattr(item, 'sku') else item['sku']
        if sku in processed_skus:
            quantity = item.quantity if hasattr(item, 'quantity') else item['quantity']
            success, error_msg = await inventory_client.restore_inventory(sku, quantity, token)
            if success:
                logger.info(f"Rollback: Restored {quantity} units of SKU '{sku}'")
            else:
                logger.error(f"Rollback failed for SKU '{sku}': {error_msg}")


async def validate_order_data(order: schemas.OrderCreate, token: Optional[str] = None) -> Tuple[bool, Optional[str]]:
    """
    Validate order data by checking user and inventory items exist.
    
    Args:
        order: Order data to validate
        
    Returns:
        Tuple of (is_valid: bool, error_message: Optional[str])
    """
    try:
        # Validate user exists
        user_exists = await users_client.validate_user_exists(order.user_id, token)
        if not user_exists:
            return False, f"User with ID {order.user_id} does not exist"
        
        # Validate inventory items if provided
        if order.items:
            skus = [item.sku for item in order.items]
            all_exist, missing_sku = await inventory_client.validate_items_exist(skus, token)
            if not all_exist:
                return False, f"Inventory item with SKU '{missing_sku}' does not exist"
            
            # Optionally check stock availability
            for item in order.items:
                available, current_stock = await inventory_client.check_stock_availability(
                    item.sku, item.quantity, token
                )
                if not available:
                    return False, f"Insufficient stock for SKU '{item.sku}'. Available: {current_stock}, Required: {item.quantity}"
        
        return True, None
    
    except httpx.HTTPError as e:
        return False, f"Service communication error: {str(e)}"


def create_order(db: Session, order: schemas.OrderCreate) -> models.Order:
    """
    Create a new order in the database.
    
    NOTE: This function assumes validation has already been performed.
    Use validate_order_data() before calling this function.
    
    Args:
        db: Database session
        order: Order data to create
        
    Returns:
        Created Order object
    """
    # Convert items to dict format for JSONB storage
    # Convert Decimal to string for JSON serialization
    items_data = [
        {
            'sku': item.sku,
            'quantity': item.quantity,
            'price': str(item.price)
        }
        for item in order.items
    ] if order.items else []
    
    db_order = models.Order(
        id=order.id,
        user_id=order.user_id,
        total=order.total,
        status=order.status,
        items=items_data
    )
    db.add(db_order)
    db.commit()
    db.refresh(db_order)
    return db_order

def update_order(db: Session, order_id: str, order: schemas.OrderUpdate) -> Optional[models.Order]:
    """
    Update an existing order.
    
    Args:
        db: Database session
        order_id: ID of the order to update
        order: Updated order data (only provided fields will be updated)
        
    Returns:
        Updated Order object or None if not found
    """
    db_order = get_order(db, order_id)
    if db_order is None:
        return None
    
    update_data = order.model_dump(exclude_unset=True)
    
    # Handle items serialization if items are being updated
    if 'items' in update_data and update_data['items'] is not None:
        items_data = [
            {
                'sku': item['sku'],
                'quantity': item['quantity'],
                'price': str(item['price']) if not isinstance(item['price'], str) else item['price']
            }
            for item in update_data['items']
        ]
        update_data['items'] = items_data
    
    for key, value in update_data.items():
        setattr(db_order, key, value)
    
    db.commit()
    db.refresh(db_order)
    return db_order

def delete_order(db: Session, order_id: str) -> bool:
    """
    Delete an order from the database.
    
    This also deletes any associated order_events rows to satisfy the
    foreign key constraint.
    
    Args:
        db: Database session
        order_id: ID of the order to delete
        
    Returns:
        True if order was deleted, False if not found
    """
    try:
        db_order = get_order(db, order_id)
        if db_order is None:
            return False
        
        # Delete dependent timeline events first to avoid FK constraint errors
        db.execute(
            sqla_delete(models.OrderEvent).where(models.OrderEvent.order_id == order_id)
        )
        # Flush to ensure child rows are removed before deleting parent
        db.flush()

        db.delete(db_order)
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete order {order_id}: {e}")
        return False
