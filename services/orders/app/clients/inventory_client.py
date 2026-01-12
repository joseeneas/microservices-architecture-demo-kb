"""
HTTP client for communicating with the Inventory service.

This module provides functions to validate inventory items and check stock availability.
"""
import httpx
from typing import Optional, List

# Use internal Docker network hostname
INVENTORY_SERVICE_URL = "http://inventory:8000"
TIMEOUT = 5.0  # seconds


async def get_all_items(token: Optional[str] = None) -> List[dict]:
    """
    Retrieve all inventory items from the Inventory service.
    
    Returns:
        List of inventory items
        
    Raises:
        httpx.HTTPError: If there's a network error or the service is unavailable
    """
    try:
        headers = {"Authorization": f"Bearer {token}"} if token else None
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(f"{INVENTORY_SERVICE_URL}/", headers=headers)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError:
        raise


async def get_item_by_sku(sku: str, token: Optional[str] = None) -> Optional[dict]:
    """
    Find an inventory item by SKU.
    
    Args:
        sku: The SKU to search for
        
    Returns:
        Inventory item data if found, None otherwise
        
    Raises:
        httpx.HTTPError: If there's a network error or the service is unavailable
    """
    try:
        items = await get_all_items(token)
        for item in items:
            if item.get('sku') == sku:
                return item
        return None
    except httpx.HTTPError:
        raise


async def validate_items_exist(skus: List[str], token: Optional[str] = None) -> tuple[bool, Optional[str]]:
    """
    Validate that all provided SKUs exist in inventory.
    
    Args:
        skus: List of SKUs to validate
        
    Returns:
        Tuple of (all_exist: bool, missing_sku: Optional[str])
        If all exist, returns (True, None)
        If any missing, returns (False, first_missing_sku)
        
    Raises:
        httpx.HTTPError: If there's a network error or the service is unavailable
    """
    try:
        items = await get_all_items(token)
        existing_skus = {item['sku'] for item in items}
        
        for sku in skus:
            if sku not in existing_skus:
                return False, sku
        
        return True, None
    except httpx.HTTPError:
        raise


async def check_stock_availability(sku: str, required_qty: int, token: Optional[str] = None) -> tuple[bool, int]:
    """
    Check if there's sufficient stock for an order.
    
    Args:
        sku: The SKU to check
        required_qty: Quantity required
        
    Returns:
        Tuple of (available: bool, current_stock: int)
        
    Raises:
        httpx.HTTPError: If there's a network error or the service is unavailable
    """
    try:
        item = await get_item_by_sku(sku, token)
        if item is None:
            return False, 0
        
        current_qty = item.get('qty', 0)
        return current_qty >= required_qty, current_qty
    except httpx.HTTPError:
        raise


async def reduce_inventory(sku: str, quantity: int, token: Optional[str] = None) -> tuple[bool, Optional[str]]:
    """
    Reduce inventory quantity for a specific SKU.
    
    Args:
        sku: The SKU to reduce inventory for
        quantity: Amount to reduce
        
    Returns:
        Tuple of (success: bool, error_message: Optional[str])
        
    Raises:
        httpx.HTTPError: If there's a network error or the service is unavailable
    """
    try:
        # First, get the item to find its ID and current quantity
        item = await get_item_by_sku(sku, token)
        if item is None:
            return False, f"SKU '{sku}' not found"
        
        item_id = item['id']
        current_qty = item['qty']
        new_qty = current_qty - quantity
        
        if new_qty < 0:
            return False, f"Insufficient inventory for SKU '{sku}'. Available: {current_qty}, Requested: {quantity}"
        
        # Update the inventory via PUT endpoint
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            headers = {"Authorization": f"Bearer {token}"} if token else None
            response = await client.put(
                f"{INVENTORY_SERVICE_URL}/{item_id}",
                json={"qty": new_qty},
                headers=headers
            )
            
            if response.status_code == 200:
                return True, None
            else:
                return False, f"Failed to update inventory: {response.text}"
    
    except httpx.HTTPError as e:
        return False, f"Inventory service error: {str(e)}"


async def restore_inventory(sku: str, quantity: int, token: Optional[str] = None) -> tuple[bool, Optional[str]]:
    """
    Restore (increase) inventory quantity for a specific SKU.
    Used for compensating transactions or order cancellations.
    
    Args:
        sku: The SKU to restore inventory for
        quantity: Amount to add back
        
    Returns:
        Tuple of (success: bool, error_message: Optional[str])
        
    Raises:
        httpx.HTTPError: If there's a network error or the service is unavailable
    """
    try:
        # Get the item to find its ID and current quantity
        item = await get_item_by_sku(sku, token)
        if item is None:
            return False, f"SKU '{sku}' not found"
        
        item_id = item['id']
        current_qty = item['qty']
        new_qty = current_qty + quantity
        
        # Update the inventory via PUT endpoint
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            headers = {"Authorization": f"Bearer {token}"} if token else None
            response = await client.put(
                f"{INVENTORY_SERVICE_URL}/{item_id}",
                json={"qty": new_qty},
                headers=headers
            )
            
            if response.status_code == 200:
                return True, None
            else:
                return False, f"Failed to restore inventory: {response.text}"
    
    except httpx.HTTPError as e:
        return False, f"Inventory service error: {str(e)}"
