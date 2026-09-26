"""
Database Connection & Connection Pooling Infrastructure
Supavisor (Transaction Mode, Port 5432) Compliance for Serverless Lambda Containers
"""

import os
import logging
from typing import Optional, Any
from contextlib import asynccontextmanager

logger = logging.getLogger("uvicorn.error")

# Global Pool Cache
_DB_POOL: Optional[Any] = None

DATABASE_URL = os.environ.get(
    "DATABASE_URL", 
    "postgresql://postgres:supabase-password@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require"
)

# Pool configuration optimized for AWS Free Tier Lambda concurrency
POOL_MIN_SIZE = int(os.environ.get("DB_POOL_MIN_SIZE", "1"))
POOL_MAX_SIZE = int(os.environ.get("DB_POOL_MAX_SIZE", "5"))
POOL_TIMEOUT = float(os.environ.get("DB_POOL_TIMEOUT", "10.0"))


async def init_db_pool():
    """
    Initialize connection pool at global application scope.
    Uses psycopg_pool.AsyncConnectionPool for high-throughput non-blocking operations.
    """
    global _DB_POOL
    try:
        from psycopg_pool import AsyncConnectionPool
        
        # Configure transactional mode connection pool for Supavisor
        _DB_POOL = AsyncConnectionPool(
            conninfo=DATABASE_URL,
            min_size=POOL_MIN_SIZE,
            max_size=POOL_MAX_SIZE,
            timeout=POOL_TIMEOUT,
            open=False
        )
        await _DB_POOL.open()
        logger.info("[Database] Supavisor AsyncConnectionPool initialized successfully.")
    except Exception as exc:
        logger.warning(f"[Database] Could not initialize psycopg_pool ({exc}). Running in serverless emulation mode.")
        _DB_POOL = None


async def get_db_pool():
    """
    Retrieve singleton connection pool instance
    """
    global _DB_POOL
    if _DB_POOL is None:
        await init_db_pool()
    return _DB_POOL


async def close_db_pool():
    """
    Gracefully drain pool connections on container shutdown
    """
    global _DB_POOL
    if _DB_POOL is not None:
        await _DB_POOL.close()
        _DB_POOL = None
        logger.info("[Database] Connection pool closed.")


@asynccontextmanager
async def get_tenant_db_connection(tenant_id: str):
    """
    Acquire a connection and set tenant isolation context for RLS
    """
    pool = await get_db_pool()
    if pool is not None:
        async with pool.connection() as conn:
            # Set RLS session variable for current query scope
            async with conn.cursor() as cur:
                await cur.execute("SET LOCAL app.current_tenant_id = %s;", (tenant_id,))
            yield conn
    else:
        # Fallback pseudo-connection for sandboxed execution
        yield None
