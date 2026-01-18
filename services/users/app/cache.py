"""
Redis caching utilities for the Users service.

Provides caching functionality to improve performance by reducing database queries.
"""
import os
import json
from typing import Optional, Any
import redis
from functools import wraps

# Initialize Redis client
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

# Cache TTLs (in seconds)
USER_CACHE_TTL = 300  # 5 minutes
ANALYTICS_CACHE_TTL = 60  # 1 minute
LIST_CACHE_TTL = 120  # 2 minutes


def get_cache(key: str) -> Optional[Any]:
    """
    Get a value from Redis cache.
    
    Args:
        key: Cache key
    
    Returns:
        Cached value or None if not found
    """
    try:
        value = redis_client.get(key)
        if value:
            return json.loads(value)
        return None
    except Exception as e:
        print(f"Cache get error: {e}")
        return None

def set_cache(key: str, value: Any, ttl: int = 300) -> bool:
    """
    Set a value in Redis cache with TTL.
    
    Args:
        key: Cache key
        value: Value to cache (will be JSON serialized)
        ttl: Time to live in seconds
    
    Returns:
        True if successful, False otherwise
    """
    try:
        redis_client.setex(key, ttl, json.dumps(value))
        return True
    except Exception as e:
        print(f"Cache set error: {e}")
        return False

def delete_cache(key: str) -> bool:
    """
    Delete a key from Redis cache.
    
    Args:
        key: Cache key to delete
    
    Returns:
        True if successful, False otherwise
    """
    try:
        redis_client.delete(key)
        return True
    except Exception as e:
        print(f"Cache delete error: {e}")
        return False

def delete_pattern(pattern: str) -> bool:
    """
    Delete all keys matching a pattern.
    
    Args:
        pattern: Pattern to match (e.g., "users:*")
    
    Returns:
        True if successful, False otherwise
    """
    try:
        keys = redis_client.keys(pattern)
        if keys:
            redis_client.delete(*keys)
        return True
    except Exception as e:
        print(f"Cache delete pattern error: {e}")
        return False

def cache_result(key_prefix: str, ttl: int = 300):
    """
    Decorator to cache function results.
    
    Args:
        key_prefix: Prefix for the cache key
        ttl: Time to live in seconds
    
    Example:
        @cache_result("user", ttl=300)
        def get_user(user_id: int):
            return db.query(User).filter(User.id == user_id).first()
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Build cache key from function args
            cache_key = f"{key_prefix}:{':'.join(str(arg) for arg in args)}"
            
            # Try to get from cache
            cached = get_cache(cache_key)
            if cached is not None:
                return cached
            
            # Execute function and cache result
            result = func(*args, **kwargs)
            if result is not None:
                set_cache(cache_key, result, ttl)
            
            return result
        return wrapper
    return decorator
   