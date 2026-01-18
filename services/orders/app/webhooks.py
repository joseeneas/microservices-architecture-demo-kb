"""
Webhook system for sending order event notifications.

Allows external systems to subscribe to order events (created, status_changed, etc.)
"""
import os
import httpx
from typing import Dict, Any
import asyncio


# Webhook URLs (in production, these would be stored in a database)
WEBHOOK_URLS = os.getenv("WEBHOOK_URLS", "").split(",")
WEBHOOK_URLS = [url.strip() for url in WEBHOOK_URLS if url.strip()]


async def send_webhook(event_type: str, data: Dict[str, Any]) -> None:
    """
    Send webhook notifications to all registered URLs.
    
    Args:
        event_type: Type of event (e.g., "order.created", "order.status_changed")
        data: Event data payload
    """
    if not WEBHOOK_URLS:
        return
    
    payload = {
        "event": event_type,
        "data": data,
        "timestamp": data.get("created_at", "")
    }
    
    async with httpx.AsyncClient(timeout=5.0) as client:
        tasks = []
        for url in WEBHOOK_URLS:
            tasks.append(send_single_webhook(client, url, payload))
        
        # Send all webhooks concurrently
        await asyncio.gather(*tasks, return_exceptions=True)


async def send_single_webhook(client: httpx.AsyncClient, url: str, payload: Dict[str, Any]) -> None:
    """
    Send a webhook to a single URL.
    
    Args:
        client: HTTP client
        url: Webhook URL
        payload: Event payload
    """
    try:
        response = await client.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code >= 400:
            print(f"Webhook failed for {url}: HTTP {response.status_code}")
    except Exception as e:
        print(f"Webhook error for {url}: {str(e)}")


def notify_order_created(order_data: Dict[str, Any]) -> None:
    """
    Notify that an order was created.
    
    Args:
        order_data: Order data
    """
    asyncio.create_task(send_webhook("order.created", order_data))


def notify_order_status_changed(order_id: str, old_status: str, new_status: str) -> None:
    """
    Notify that an order status changed.
    
    Args:
        order_id: Order ID
        old_status: Previous status
        new_status: New status
    """
    data = {
        "order_id": order_id,
        "old_status": old_status,
        "new_status": new_status
    }
    asyncio.create_task(send_webhook("order.status_changed", data))


def notify_order_updated(order_data: Dict[str, Any]) -> None:
    """
    Notify that an order was updated.
    
    Args:
        order_data: Order data
    """
    asyncio.create_task(send_webhook("order.updated", order_data))


def notify_order_deleted(order_id: str) -> None:
    """
    Notify that an order was deleted.
    
    Args:
        order_id: Order ID
    """
    data = {"order_id": order_id}
    asyncio.create_task(send_webhook("order.deleted", data))
