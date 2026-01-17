"""
Orders Service API

This module implements a FastAPI-based microservice for managing orders with full CRUD operations.
It provides endpoints for creating, reading, updating, and deleting order data,
with PostgreSQL database persistence.

The service is designed to be part of a microservices architecture and includes
standard endpoints for service discovery and health monitoring.

Endpoints:
    GET /: List all orders with pagination
    GET /{order_id}: Get a single order by ID
    POST /: Create a new order
    PUT /{order_id}: Update an existing order
    DELETE /{order_id}: Delete an order
    GET /healthz: Health check endpoint for orchestration systems

Attributes:
    app (FastAPI): The FastAPI application instance configured with the title "orders-service"
"""
from typing import List
import csv
import io
import json
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from decimal import Decimal

from . import crud, models, schemas, auth
from .database import engine, get_db
from .clients import inventory_client

# Create database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="orders-service")

def log_order_event(
    db: Session,
    order_id: str,
    event_type: str,
    description: str,
    old_value: str = None,
    new_value: str = None,
    user_id: int = None
):
    """
    Helper function to log an order event to the timeline.
    
    Args:
        db: Database session
        order_id: Order identifier
        event_type: Type of event (e.g., "created", "status_changed", "updated")
        description: Human-readable description
        old_value: Previous value (optional)
        new_value: New value (optional)
        user_id: User who triggered the event (optional)
    """
    event = models.OrderEvent(
        order_id=order_id,
        event_type=event_type,
        description=description,
        old_value=old_value,
        new_value=new_value,
        user_id=user_id
    )
    db.add(event)
    db.commit()


@app.get("/healthz", response_model=dict)
def health():
    """
    Health check endpoint for the orders service.

    This endpoint is used by orchestration systems (like Kubernetes) to verify
    that the service is running and able to respond to requests.

    Returns:
        dict: A dictionary containing the health status of the service.
            - status (str): Always returns "healthy" when the service is operational.

    Example:
        GET /healthz
        Response: {"status": "healthy"}
    """
    return {"status": "healthy"}

@app.get("/", response_model=List[schemas.Order])
def list_orders(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.get_current_user)
):
    """
    List orders with pagination (authenticated users see their own, admins see all).

    Args:
        skip: Number of records to skip (default: 0)
        limit: Maximum number of records to return (default: 100)
        db: Database session (injected)
        current_user: Current authenticated user (injected)

    Returns:
        List of order objects
    """
    orders = crud.get_orders(db, skip=skip, limit=limit)
    # Filter by user_id unless admin
    if current_user.role != "admin":
        orders = [order for order in orders if order.user_id == current_user.id]
    return orders

@app.get("/analytics")
def get_analytics(
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.get_current_user)
):
    """
    Get order analytics (authenticated users see their own, admins see all).
    
    Returns:
        dict: Analytics data including order counts, revenue, status breakdown, recent orders
    """
    # Base query
    query = db.query(models.Order)
    
    # Filter by user_id unless admin
    if current_user.role != "admin":
        query = query.filter(models.Order.user_id == current_user.id)
    
    total_orders = query.count()
    
    # Total revenue (sum of all orders)
    total_revenue = query.with_entities(func.sum(models.Order.total)).scalar() or Decimal(0)
    
    # Orders by status
    status_counts = query.with_entities(
        models.Order.status, 
        func.count(models.Order.id)
    ).group_by(models.Order.status).all()
    status_breakdown = {status: count for status, count in status_counts}
    
    # Recent orders (last 7 days)
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    recent_orders_count = query.filter(models.Order.created_at >= seven_days_ago).count()
    
    # Get 5 most recent orders for display
    recent_orders = query.order_by(models.Order.created_at.desc()).limit(5).all()
    recent_orders_list = [
        {
            "id": order.id,
            "user_id": order.user_id,
            "total": str(order.total),
            "status": order.status,
            "created_at": order.created_at.isoformat()
        }
        for order in recent_orders
    ]
    
    return {
        "total_orders": total_orders,
        "total_revenue": str(total_revenue),
        "status_breakdown": status_breakdown,
        "recent_orders_7d": recent_orders_count,
        "recent_orders": recent_orders_list
    }


@app.get("/analytics/timeseries")
def get_timeseries(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.get_current_user)
):
    """
    Time-series for orders over the past N days (defaults to 30).

    Returns list of {date, orders, revenue} for each day inclusive.
    """
    days = max(1, min(days, 180))  # clamp to sane bounds
    start_dt = datetime.utcnow() - timedelta(days=days - 1)

    # Base query filtered by date range
    base_query = db.query(
        func.date_trunc('day', models.Order.created_at).label('day'),
        func.count(models.Order.id).label('orders'),
        func.coalesce(func.sum(models.Order.total), 0).label('revenue')
    ).filter(models.Order.created_at >= start_dt)

    if current_user.role != "admin":
        base_query = base_query.filter(models.Order.user_id == current_user.id)

    rows = (
        base_query
        .group_by(func.date_trunc('day', models.Order.created_at))
        .order_by(func.date_trunc('day', models.Order.created_at))
        .all()
    )

    # Map existing days
    data_map = {r.day.date(): {"orders": int(r.orders), "revenue": float(r.revenue)} for r in rows}

    # Fill missing days with zeros
    series = []
    for i in range(days):
        d = (start_dt + timedelta(days=i)).date()
        entry = data_map.get(d, {"orders": 0, "revenue": 0.0})
        series.append({"date": d.isoformat(), **entry})

    return {"days": days, "series": series}


@app.get("/analytics/forecast")
def get_revenue_forecast(
    days: int = 30,
    method: str = "auto",
    seasonality: str = "auto",  # 'none' | 'weekday' | 'auto'
    conf: float = 0.95,  # 0.80, 0.95, 0.99
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.get_current_user)
):
    """
    Forecast daily revenue for the next N days.

    Uses lightweight models implemented in pure Python:
    - linear: least-squares linear regression over daily revenue
    - exp: Holt's linear trend (double exponential smoothing)
    - auto: picks linear if trend is strong; otherwise exp

    Adds optional weekday seasonality and confidence bands.

    Returns history (last 90 days), forecast with bands, and recent anomalies.
    """
    days = max(1, min(days, 90))
    history_days = 90
    start_dt = datetime.utcnow() - timedelta(days=history_days - 1)

    # Aggregate daily revenue (respect auth scope)
    base = db.query(
        func.date_trunc('day', models.Order.created_at).label('day'),
        func.coalesce(func.sum(models.Order.total), 0).label('revenue')
    ).filter(models.Order.created_at >= start_dt)

    if current_user.role != "admin":
        base = base.filter(models.Order.user_id == current_user.id)

    rows = base.group_by(func.date_trunc('day', models.Order.created_at)) \
               .order_by(func.date_trunc('day', models.Order.created_at)) \
               .all()

    # Map by date and fill missing days
    hist_map = {r.day.date(): float(r.revenue) for r in rows}
    series = []
    for i in range(history_days):
        d = (start_dt + timedelta(days=i)).date()
        series.append({"date": d.isoformat(), "revenue": hist_map.get(d, 0.0)})

    y = [pt["revenue"] for pt in series]

    def linear_forecast(y_vals, horizon):
        n = len(y_vals)
        if n == 0:
            return [0.0] * horizon
        # t = 0..n-1
        t_sum = (n - 1) * n / 2
        t2_sum = (n - 1) * n * (2 * n - 1) / 6
        y_sum = sum(y_vals)
        ty_sum = sum(i * y_vals[i] for i in range(n))
        denom = n * t2_sum - t_sum * t_sum
        if denom == 0:
            b = 0.0
        else:
            b = (n * ty_sum - t_sum * y_sum) / denom
        a = (y_sum - b * t_sum) / n
        last_t = n - 1
        return [max(0.0, a + b * (last_t + m)) for m in range(1, horizon + 1)]

    def holt_linear(y_vals, horizon, alpha=0.5, beta=0.3):
        if not y_vals:
            return [0.0] * horizon, []
        L = y_vals[0]
        T = y_vals[1] - y_vals[0] if len(y_vals) > 1 else 0.0
        fitted = [L]  # initial fitted approx
        for i in range(1, len(y_vals)):
            y_t = y_vals[i]
            L_new = alpha * y_t + (1 - alpha) * (L + T)
            T_new = beta * (L_new - L) + (1 - beta) * T
            fitted.append(L + T)  # one-step-ahead fit for time i
            L, T = L_new, T_new
        forecast_vals = [max(0.0, L + m * T) for m in range(1, horizon + 1)]
        return forecast_vals, fitted

    # Pick model
    slope = 0.0
    if len(y) >= 2:
        # quick slope estimate via first/last
        slope = (y[-1] - y[0]) / max(1, len(y) - 1)
    avg = (sum(y) / len(y)) if y else 0.0
    strong_trend = avg > 0 and abs(slope) / max(1e-9, avg) > 0.02  # >2% change per day average

    if method not in ("auto", "linear", "exp", "hw"):
        method = "auto"

    # Optional Holt-Winters seasonal method (statsmodels)
    def holt_winters(y_vals, horizon, seasonal_periods=7):
        try:
            import pandas as pd
            from statsmodels.tsa.holtwinters import ExponentialSmoothing
            if not y_vals:
                return [0.0] * horizon, []
            idx = pd.date_range(end=pd.Timestamp.utcnow().normalize(), periods=len(y_vals), freq='D')
            s = pd.Series(y_vals, index=idx)
            model = ExponentialSmoothing(s, trend='add', seasonal='mul', seasonal_periods=seasonal_periods)
            fit = model.fit(optimized=True)
            fc = fit.forecast(horizon)
            fitted = fit.fittedvalues.reindex(s.index).fillna(method='bfill').tolist()
            return [max(0.0, float(v)) for v in fc.tolist()], [max(0.0, float(v)) for v in fitted]
        except Exception:
            # Fallback to exponential smoothing if statsmodels not available/fit fails
            fcast, fitted = holt_linear(y_vals, horizon)
            return fcast, fitted

    auto_pick = None
    use_weekday = False
    if method == "auto":
        if strong_trend and not use_weekday:
            auto_pick = "linear"
        elif use_weekday and len(y) >= 28:
            auto_pick = "hw"
        else:
            auto_pick = "exp"

    chosen_method = method if method != "auto" else auto_pick

    if chosen_method == "linear":
        y_hat = linear_forecast(y, days)
        fitted_hist = []
        # build fitted for linear
        n = len(y)
        if n >= 2:
            # recompute a,b from linear fit
            t_sum = (n - 1) * n / 2
            t2_sum = (n - 1) * n * (2 * n - 1) / 6
            y_sum = sum(y)
            ty_sum = sum(i * y[i] for i in range(n))
            denom = n * t2_sum - t_sum * t_sum
            b = 0.0 if denom == 0 else (n * ty_sum - t_sum * y_sum) / denom
            a = (y_sum - b * t_sum) / n
            fitted_hist = [max(0.0, a + b * i) for i in range(n)]
        chosen = "linear"
    elif chosen_method == "exp":
        y_hat, fitted_hist = holt_linear(y, days)
        chosen = "exp"
    elif chosen_method == "hw":
        y_hat, fitted_hist = holt_winters(y, days, seasonal_periods=7)
        chosen = "hw"
    else:
        # default fallback
        y_hat, fitted_hist = holt_linear(y, days)
        chosen = "exp"

    # Seasonality (weekday) auto-detect or enforced
    use_weekday = False
    if seasonality == "weekday":
        use_weekday = True
    elif seasonality == "auto":
        if len(series) >= 28 and sum(y) > 0:
            # compute weekday means
            import statistics
            by_wd = {i: [] for i in range(7)}
            for idx, pt in enumerate(series):
                wd = datetime.strptime(pt["date"], "%Y-%m-%d").date().weekday()
                by_wd[wd].append(pt["revenue"])
            wd_means = [ (sum(vals)/len(vals) if vals else 0.0) for wd, vals in sorted(by_wd.items()) ]
            overall = sum(y)/len(y)
            if overall > 0:
                try:
                    stdev = statistics.pstdev(wd_means)
                except Exception:
                    stdev = 0.0
                if stdev/overall > 0.1:
                    use_weekday = True

    # weekday factors
    wd_factor = {i: 1.0 for i in range(7)}
    if use_weekday and sum(y) > 0:
        by_wd = {i: [] for i in range(7)}
        for pt in series:
            wd = datetime.strptime(pt["date"], "%Y-%m-%d").date().weekday()
            by_wd[wd].append(pt["revenue"])
        overall = sum(y)/len(y)
        for i in range(7):
            m = (sum(by_wd[i])/len(by_wd[i])) if by_wd[i] else overall
            wd_factor[i] = (m/overall) if overall > 0 else 1.0

    # Apply seasonality to fitted (for residuals) and forecasts
    if use_weekday:
        for i, pt in enumerate(series):
            wd = datetime.strptime(pt["date"], "%Y-%m-%d").date().weekday()
            if i < len(fitted_hist):
                fitted_hist[i] *= wd_factor[wd]
        for m in range(days):
            # future weekday index
            pass

    # Residual std for bands
    import math
    residuals = []
    for i in range(min(len(y), len(fitted_hist))):
        residuals.append(y[i] - fitted_hist[i])
    sigma = (math.sqrt(sum(r*r for r in residuals)/len(residuals)) if residuals else 0.0)
    # map confidence to z (two-sided)
    if conf >= 0.99:
        z = 2.576
    elif conf >= 0.95:
        z = 1.96
    else:
        z = 1.282  # ~80%

    # Build forecast dates starting after last history date
    last_date = datetime.strptime(series[-1]["date"], "%Y-%m-%d").date() if series else datetime.utcnow().date()
    forecast = []
    for m in range(1, days + 1):
        nd = last_date + timedelta(days=m)
        y_f = float(y_hat[m - 1])
        if use_weekday:
            wd = nd.weekday()
            y_f *= wd_factor.get(wd, 1.0)
        lower = max(0.0, y_f - z * sigma)
        upper = max(lower, y_f + z * sigma)
        forecast.append({"date": nd.isoformat(), "revenue": y_f, "lower": lower, "upper": upper})

    # Anomalies for last 30 days based on residual z-score
    anomalies = []
    if residuals:
        mean_res = sum(residuals)/len(residuals)
        var = sum((r-mean_res)**2 for r in residuals)/len(residuals)
        std = math.sqrt(var) if var > 0 else 0.0
        recent = series[-30:] if len(series) > 30 else series
        for i, pt in enumerate(recent):
            idx = len(series) - len(recent) + i
            if idx < len(fitted_hist):
                res = pt["revenue"] - fitted_hist[idx]
                if std > 0 and abs(res - mean_res) / std >= 2.5:
                    anomalies.append({"date": pt["date"], "revenue": pt["revenue"], "z": (res - mean_res) / std})

    return {
        "days": days,
        "method": chosen,
        "seasonality": ("weekday" if use_weekday else "none"),
        "history": series,
        "forecast": forecast,
        "anomalies": anomalies,
    }

@app.get("/{order_id}", response_model=schemas.Order)
def get_order(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.get_current_user)
):
    """
    Get a single order by ID (owner or admin).

    Args:
        order_id: ID of the order to retrieve
        db: Database session (injected)
        current_user: Current authenticated user (injected)

    Returns:
        Order object

    Raises:
        HTTPException: 403 if not authorized
        HTTPException: 404 if order not found
    """
    db_order = crud.get_order(db, order_id=order_id)
    if db_order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Check ownership unless admin
    if current_user.role != "admin" and db_order.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this order"
        )
    
    return db_order

@app.post("/", response_model=schemas.Order, status_code=status.HTTP_201_CREATED)
async def create_order(
    order: schemas.OrderCreate,
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.get_current_user)
):
    """
    Create a new order with validation and inventory deduction (authenticated users only).
    
    This endpoint:
    - Validates user exists in the Users service
    - Validates inventory items exist in the Inventory service
    - Checks sufficient stock for the order items
    - Deducts inventory automatically (with rollback on failure)
    - Users can only create orders for themselves (unless admin)

    Args:
        order: Order data to create
        db: Database session (injected)
        current_user: Current authenticated user (injected)

    Returns:
        Created order object

    Raises:
        HTTPException: 400 if order ID already exists or validation fails
        HTTPException: 403 if not authorized
        HTTPException: 503 if dependent services are unavailable
    """
    # Check if order ID already exists
    db_order = crud.get_order(db, order_id=order.id)
    if db_order:
        raise HTTPException(status_code=400, detail="Order ID already exists")
    
    # Check authorization: users can only create orders for themselves (unless admin)
    if current_user.role != "admin" and order.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Can only create orders for yourself"
        )
    
    # Validate order data with other services
    is_valid, error_message = await crud.validate_order_data(order, token=current_user.token)
    if not is_valid:
        # Check if it's a service communication error
        if "Service communication error" in error_message:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=error_message
            )
        # Otherwise it's a validation error
        raise HTTPException(status_code=400, detail=error_message)
    
    # Process inventory deductions (only if order has items and status is active)
    if order.items and order.status != "cancelled":
        success, error_msg, _ = await crud.process_inventory_for_order(order.items, deduct=True, token=current_user.token)
        if not success:
            raise HTTPException(status_code=400, detail=error_msg)
    
    # Create the order in database
    try:
        db_order = crud.create_order(db=db, order=order)
        # Log order creation event
        log_order_event(
            db=db,
            order_id=order.id,
            event_type="created",
            description=f"Order created with status '{order.status}'",
            new_value=order.status,
            user_id=current_user.id
        )
        return db_order
    except Exception as e:
        # If order creation fails, inventory has already been rolled back by process_inventory_for_order
        raise HTTPException(status_code=500, detail=f"Failed to create order: {str(e)}")

@app.put("/{order_id}", response_model=schemas.Order)
async def update_order(
    order_id: str,
    order: schemas.OrderUpdate,
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.get_current_user)
):
    """
    Update an existing order with inventory management (owner or admin).
    
    Handles inventory restoration when cancelling orders,
    and inventory deduction when reactivating cancelled orders.

    Args:
        order_id: ID of the order to update
        order: Updated order data
        db: Database session (injected)
        current_user: Current authenticated user (injected)

    Returns:
        Updated order object

    Raises:
        HTTPException: 403 if not authorized
        HTTPException: 404 if order not found
    """
    # Get existing order
    existing_order = crud.get_order(db, order_id=order_id)
    if existing_order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Check ownership unless admin
    if current_user.role != "admin" and existing_order.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this order"
        )
    
    # Check if status is changing
    status_changed = False
    old_status = None
    new_status = None
    
    if order.status and order.status != existing_order.status:
        old_status = existing_order.status
        new_status = order.status
        status_changed = True
        
        # If cancelling an order, restore inventory
        if new_status == "cancelled" and old_status != "cancelled":
            if existing_order.items:
                success, error_msg, _ = await crud.process_inventory_for_order(
                    existing_order.items, 
                    deduct=False,
                    token=current_user.token
                )
                if not success:
                    raise HTTPException(status_code=400, detail=f"Failed to restore inventory: {error_msg}")
        
        # If reactivating a cancelled order, deduct inventory
        elif old_status == "cancelled" and new_status != "cancelled":
            if existing_order.items:
                success, error_msg, _ = await crud.process_inventory_for_order(
                    existing_order.items,
                    deduct=True,
                    token=current_user.token
                )
                if not success:
                    raise HTTPException(status_code=400, detail=f"Failed to deduct inventory: {error_msg}")
    
    # Update the order
    db_order = crud.update_order(db, order_id=order_id, order=order)
    if db_order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Log update events
    if status_changed:
        log_order_event(
            db=db,
            order_id=order_id,
            event_type="status_changed",
            description=f"Status changed from '{old_status}' to '{new_status}'",
            old_value=old_status,
            new_value=new_status,
            user_id=current_user.id
        )
    else:
        # Log general update if other fields changed
        log_order_event(
            db=db,
            order_id=order_id,
            event_type="updated",
            description="Order details updated",
            user_id=current_user.id
        )
    
    return db_order

@app.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.get_current_user)
):
    """
    Delete an order (owner or admin).

    Args:
        order_id: ID of the order to delete
        db: Database session (injected)
        current_user: Current authenticated user (injected)

    Returns:
        None (204 No Content)

    Raises:
        HTTPException: 403 if not authorized
        HTTPException: 404 if order not found
    """
    # Get existing order to check ownership
    existing_order = crud.get_order(db, order_id=order_id)
    if existing_order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Check ownership unless admin
    if current_user.role != "admin" and existing_order.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this order"
        )
    
    # Perform deletion
    success = crud.delete_order(db, order_id=order_id)
    if not success:
        raise HTTPException(status_code=404, detail="Order not found")


@app.get("/export/csv")
def export_orders_csv(
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.get_current_user)
):
    """
    Export orders to CSV (users see their own, admins see all).
    
    Returns:
        CSV file with columns: id, user_id, total, status, items_json, created_at
        items_json is a JSON-encoded array of order items
    """
    orders = crud.get_orders(db, skip=0, limit=10000)
    # Filter by user_id unless admin
    if current_user.role != "admin":
        orders = [order for order in orders if order.user_id == current_user.id]
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow(['id', 'user_id', 'total', 'status', 'items_json', 'created_at'])
    
    # Write data
    for order in orders:
        items_json = json.dumps(order.items) if order.items else '[]'
        writer.writerow([
            order.id,
            order.user_id,
            str(order.total),
            order.status,
            items_json,
            order.created_at.isoformat()
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=orders.csv"}
    )


@app.post("/import/csv")
async def import_orders_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.require_admin)
):
    """
    Import orders from CSV with upsert and auto-create logic (admin only).
    
    Expected CSV columns: id, user_id, total, status, items_json
    - items_json should be a JSON array of {sku, quantity, price}
    - Updates existing orders (matched by id)
    - Creates new orders
    - Auto-creates missing inventory items with qty=0
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
    inventory_created_count = 0
    
    for row_num, row in enumerate(reader, start=2):  # start=2 because row 1 is header
        try:
            order_id = row.get('id', '').strip()
            user_id_str = row.get('user_id', '').strip()
            total_str = row.get('total', '').strip()
            status = row.get('status', 'pending').strip()
            items_json_str = row.get('items_json', '[]').strip()
            
            if not order_id or not user_id_str:
                errors.append(f"Row {row_num}: Missing order ID or user_id")
                skipped_count += 1
                continue
            
            try:
                user_id = int(user_id_str)
                total = float(total_str) if total_str else 0.0
            except ValueError:
                errors.append(f"Row {row_num}: Invalid user_id or total")
                skipped_count += 1
                continue
            
            # Parse items JSON
            try:
                items = json.loads(items_json_str)
                if not isinstance(items, list):
                    errors.append(f"Row {row_num}: items_json must be a JSON array")
                    skipped_count += 1
                    continue
            except json.JSONDecodeError:
                errors.append(f"Row {row_num}: Invalid items_json format")
                skipped_count += 1
                continue
            
            # Auto-create missing inventory items
            for item in items:
                sku = item.get('sku', '')
                if not sku:
                    continue
                
                try:
                    existing_item = await inventory_client.get_item_by_sku(sku, token=current_user.token)
                    if not existing_item:
                        # Create inventory item with qty=0
                        import httpx
                        async with httpx.AsyncClient(timeout=5.0) as client:
                            headers = {"Authorization": f"Bearer {current_user.token}"}
                            response = await client.post(
                                "http://inventory:8000/",
                                json={"sku": sku, "qty": 0},
                                headers=headers
                            )
                            if response.status_code == 201:
                                inventory_created_count += 1
                except Exception as e:
                    errors.append(f"Row {row_num}: Failed to auto-create inventory item {sku}: {str(e)}")
            
            # Check if order exists (upsert logic)
            existing_order = crud.get_order(db, order_id=order_id)
            
            if existing_order:
                # Update existing order
                existing_order.user_id = user_id
                existing_order.total = total
                existing_order.status = status
                existing_order.items = items
                updated_count += 1
            else:
                # Create new order
                db_order = models.Order(
                    id=order_id,
                    user_id=user_id,
                    total=total,
                    status=status,
                    items=items
                )
                db.add(db_order)
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
        "inventory_created_count": inventory_created_count,
        "errors": errors[:10]  # Return first 10 errors to avoid huge responses
    }




@app.get("/{order_id}/timeline", response_model=List[schemas.OrderEvent])
def get_order_timeline(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.get_current_user)
):
    """
    Get the timeline of events for an order (owner or admin).
    
    Args:
        order_id: ID of the order
        db: Database session (injected)
        current_user: Current authenticated user (injected)
    
    Returns:
        List of order events in chronological order
    
    Raises:
        HTTPException: 403 if not authorized
        HTTPException: 404 if order not found
    """
    # Get the order to check authorization
    db_order = crud.get_order(db, order_id=order_id)
    if db_order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Check ownership unless admin
    if current_user.role != "admin" and db_order.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this order's timeline"
        )
    
    # Get all events for this order
    events = db.query(models.OrderEvent).filter(
        models.OrderEvent.order_id == order_id
    ).order_by(models.OrderEvent.created_at.asc()).all()
    
    return events
