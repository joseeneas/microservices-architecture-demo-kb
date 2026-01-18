"""
    Inventory Service API

    This module implements a FastAPI-based microservice for managing inventory data with full CRUD operations.
    It provides endpoints for creating, reading, updating, and deleting inventory data,
    with PostgreSQL database persistence.

    The service exposes:
    - CRUD endpoints for inventory management
    - Health endpoint: Provides service health status for monitoring and orchestration

    This service is part of a microservices architecture demo and can be integrated
    with other services for complete inventory management functionality.
"""
from typing import List
import csv
import io
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from . import crud, models, schemas, auth
from .database import engine, get_db

# Create database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="inventory-service")

@app.get("/healthz", response_model=dict)
def health():
    """
    Health check endpoint for the inventory service.

    This endpoint is typically used by orchestrators (like Kubernetes) or load balancers
    to determine if the service is running and ready to accept requests.

    Returns:
        dict: A dictionary containing the health status of the service.
            - status (str): "healthy" if the service is operational.

    Example:
        GET /healthz
        Response: {"status": "healthy"}
    """
    return {"status": "healthy"}

@app.get("/", response_model=List[schemas.InventoryItem])
def list_inventory_items(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.get_current_user)
):
    """
    List all inventory items with pagination (authenticated users only).

    Args:
        skip: Number of records to skip (default: 0)
        limit: Maximum number of records to return (default: 100)
        db: Database session (injected)
        current_user: Current authenticated user (injected)

    Returns:
        List of inventory item objects
    """
    items = crud.get_inventory_items(db, skip=skip, limit=limit)
    return items

@app.get("/analytics")
def get_analytics(
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.get_current_user)
):
    """
    Get inventory analytics (authenticated users).
    
    Returns:
        dict: Analytics data including total items, low stock, out of stock
    """
    total_items = db.query(func.count(models.InventoryItem.id)).scalar()
    
    # Out of stock
    out_of_stock = db.query(func.count(models.InventoryItem.id)).filter(
        models.InventoryItem.qty == 0
    ).scalar()
    
    # Low stock (less than 20)
    low_stock = db.query(func.count(models.InventoryItem.id)).filter(
        models.InventoryItem.qty > 0,
        models.InventoryItem.qty < 20
    ).scalar()
    
    # Total quantity across all items
    total_quantity = db.query(func.sum(models.InventoryItem.qty)).scalar() or 0
    
    # Get low stock items for alerts (no hard limit)
    low_stock_items = db.query(models.InventoryItem).filter(
        models.InventoryItem.qty < 20
    ).order_by(models.InventoryItem.qty).all()
    
    low_stock_list = [
        {
            "id": item.id,
            "sku": item.sku,
            "qty": item.qty
        }
        for item in low_stock_items
    ]
    
    return {
        "total_items": total_items,
        "total_quantity": total_quantity,
        "out_of_stock": out_of_stock,
        "low_stock": low_stock,
        "low_stock_items": low_stock_list
    }

@app.get("/{item_id}", response_model=schemas.InventoryItem)
def get_inventory_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.get_current_user)
):
    """
    Get a single inventory item by ID (authenticated users only).

    Args:
        item_id: ID of the inventory item to retrieve
        db: Database session (injected)
        current_user: Current authenticated user (injected)

    Returns:
        Inventory item object

    Raises:
        HTTPException: 404 if item not found
    """
    db_item = crud.get_inventory_item(db, item_id=item_id)
    if db_item is None:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return db_item

@app.post("/", response_model=schemas.InventoryItem, status_code=status.HTTP_201_CREATED)
def create_inventory_item(
    item: schemas.InventoryItemCreate,
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.require_admin)
):
    """
    Create a new inventory item (admin only).

    Args:
        item: Inventory item data to create
        db: Database session (injected)
        current_user: Current authenticated admin user (injected)

    Returns:
        Created inventory item object

    Raises:
        HTTPException: 400 if SKU already exists
    """
    db_item = crud.get_inventory_item_by_sku(db, sku=item.sku)
    if db_item:
        raise HTTPException(status_code=400, detail="SKU already exists")
    return crud.create_inventory_item(db=db, item=item)

@app.put("/{item_id}", response_model=schemas.InventoryItem)
def update_inventory_item(
    item_id: int,
    item: schemas.InventoryItemUpdate,
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.require_admin)
):
    """
    Update an existing inventory item (admin only).

    Args:
        item_id: ID of the inventory item to update
        item: Updated item data
        db: Database session (injected)
        current_user: Current authenticated admin user (injected)

    Returns:
        Updated inventory item object

    Raises:
        HTTPException: 404 if item not found
    """
    db_item = crud.update_inventory_item(db, item_id=item_id, item=item)
    if db_item is None:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return db_item

@app.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_inventory_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.require_admin)
):
    """
    Delete an inventory item (admin only).

    Args:
        item_id: ID of the inventory item to delete
        db: Database session (injected)
        current_user: Current authenticated admin user (injected)

    Returns:
        None (204 No Content)

    Raises:
        HTTPException: 404 if item not found
    """
    success = crud.delete_inventory_item(db, item_id=item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Inventory item not found")


@app.get("/export/csv")
def export_inventory_csv(
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.get_current_user)
):
    """
    Export all inventory items to CSV (authenticated users).
    
    Returns:
        CSV file with columns: id, sku, qty, created_at
    """
    items = crud.get_inventory_items(db, skip=0, limit=10000)
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow(['id', 'sku', 'qty', 'created_at'])
    
    # Write data
    for item in items:
        writer.writerow([
            item.id,
            item.sku,
            item.qty,
            item.created_at.isoformat()
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=inventory.csv"}
    )


@app.post("/import/csv")
def import_inventory_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.require_admin)
):
    """
    Import inventory items from CSV with upsert logic (admin only).
    
    Expected CSV columns: sku, qty
    - Updates existing items (matched by SKU)
    - Creates new items
    - Returns summary of created/updated/skipped rows
    
    Args:
        file: CSV file upload
        db: Database session (injected)
        current_user: Current authenticated admin user (injected)
    
    Returns:
        dict: Summary with created_count, updated_count, skipped_count, and errors list
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    content = file.file.read().decode('utf-8')
    reader = csv.DictReader(io.StringIO(content))
    
    created_count = 0
    updated_count = 0
    skipped_count = 0
    errors = []
    
    for row_num, row in enumerate(reader, start=2):  # start=2 because row 1 is header
        try:
            sku = row.get('sku', '').strip()
            qty_str = row.get('qty', '').strip()
            
            if not sku or not qty_str:
                errors.append(f"Row {row_num}: Missing SKU or quantity")
                skipped_count += 1
                continue
            
            try:
                qty = int(qty_str)
                if qty < 0:
                    errors.append(f"Row {row_num}: Quantity cannot be negative")
                    skipped_count += 1
                    continue
            except ValueError:
                errors.append(f"Row {row_num}: Invalid quantity '{qty_str}'")
                skipped_count += 1
                continue
            
            # Check if item exists (upsert logic)
            existing_item = crud.get_inventory_item_by_sku(db, sku=sku)
            
            if existing_item:
                # Update existing item
                existing_item.qty = qty
                updated_count += 1
            else:
                # Create new item
                db_item = models.InventoryItem(sku=sku, qty=qty)
                db.add(db_item)
                created_count += 1
            
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
            skipped_count += 1
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
    return {
        "created_count": created_count,
        "updated_count": updated_count,
        "skipped_count": skipped_count,
        "errors": errors[:10]  # Return first 10 errors to avoid huge responses
    }