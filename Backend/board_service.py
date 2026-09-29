"""
Backend/board_service.py - Inter-Agent Delegation Board & Concurrency Claim Engine

Provides atomic state management for shared supervisor board tasks:
- Atomic lease claims with optimistic locking and automatic lease expiration.
- Task status lifecycle: open -> claimed -> in_progress -> done / failed.
- In-memory fallback for offline/local execution when PostgreSQL is unattached.
- Push wakeup event notifications to trigger subscribed agents.
"""

import logging
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

from Backend.database import get_db_pool

logger = logging.getLogger("uvicorn.error")

# In-memory fallback storage if PostgreSQL pool is unavailable
_IN_MEMORY_BOARD_TASKS: Dict[str, Dict[str, Any]] = {}
_IN_MEMORY_BOARD_EVENTS: List[Dict[str, Any]] = []


async def create_board_task(
    org_id: str,
    created_by_profile_id: str,
    title: str,
    description: str,
    idempotency_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Creates a new board task for inter-agent delegation within an organization.
    Triggers push wakeup notification to org agents.
    """
    task_id = str(uuid.uuid4())
    now = datetime.utcnow()

    pool = await get_db_pool()
    if pool:
        try:
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        INSERT INTO board_tasks (id, org_id, created_by_profile_id, title, description, status, idempotency_key, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, 'open', %s, %s, %s)
                        RETURNING id, org_id, created_by_profile_id, title, description, status, created_at;
                        """,
                        (task_id, org_id, created_by_profile_id, title, description, idempotency_key, now, now)
                    )
                    row = await cur.fetchone()
                    
                    # Log board event
                    await cur.execute(
                        """
                        INSERT INTO board_events (task_id, profile_id, event_type, payload)
                        VALUES (%s, %s, 'task_created', %s);
                        """,
                        (task_id, created_by_profile_id, f'{{"title": "{title}"}}')
                    )

            res = {
                "id": str(row[0]),
                "org_id": str(row[1]),
                "created_by_profile_id": str(row[2]),
                "title": row[3],
                "description": row[4],
                "status": row[5],
                "created_at": row[6].isoformat() if hasattr(row[6], "isoformat") else str(row[6])
            }
            await notify_board_push_wakeup(org_id=org_id, event_type="task_created", task_id=task_id)
            return res
        except Exception as exc:
            logger.warning(f"[Board Service] DB Error in create_board_task ({exc}), utilizing memory fallback.")

    # Fallback to in-memory store
    task_data = {
        "id": task_id,
        "org_id": org_id,
        "created_by_profile_id": created_by_profile_id,
        "title": title,
        "description": description,
        "status": "open",
        "claimed_by_profile_id": None,
        "lease_expires_at": None,
        "result": None,
        "idempotency_key": idempotency_key,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    _IN_MEMORY_BOARD_TASKS[task_id] = task_data
    _IN_MEMORY_BOARD_EVENTS.append({
        "task_id": task_id,
        "profile_id": created_by_profile_id,
        "event_type": "task_created",
        "created_at": now.isoformat()
    })
    await notify_board_push_wakeup(org_id=org_id, event_type="task_created", task_id=task_id)
    return task_data


async def list_board_tasks(
    org_id: str,
    status_filter: Optional[str] = None,
    claimed_by_profile_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Lists board tasks scoped by organization, with optional status filtering.
    Automatically handles lease expiry cleanup for stale tasks.
    """
    now = datetime.utcnow()
    pool = await get_db_pool()
    if pool:
        try:
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    # Clean up expired leases back to 'open'
                    await cur.execute(
                        """
                        UPDATE board_tasks 
                        SET status = 'open', claimed_by_profile_id = NULL, lease_expires_at = NULL, updated_at = NOW()
                        WHERE org_id = %s AND status IN ('claimed', 'in_progress') AND lease_expires_at < NOW();
                        """,
                        (org_id,)
                    )
                    
                    query = "SELECT id, org_id, created_by_profile_id, title, description, status, claimed_by_profile_id, lease_expires_at, result, created_at FROM board_tasks WHERE org_id = %s"
                    params = [org_id]

                    if status_filter:
                        query += " AND status = %s"
                        params.append(status_filter)
                    if claimed_by_profile_id:
                        query += " AND claimed_by_profile_id = %s"
                        params.append(claimed_by_profile_id)

                    query += " ORDER BY created_at DESC;"
                    await cur.execute(query, tuple(params))
                    rows = await cur.fetchall()
                    
                    tasks = []
                    for r in rows:
                        tasks.append({
                            "id": str(r[0]),
                            "org_id": str(r[1]),
                            "created_by_profile_id": str(r[2]),
                            "title": r[3],
                            "description": r[4],
                            "status": r[5],
                            "claimed_by_profile_id": str(r[6]) if r[6] else None,
                            "lease_expires_at": r[7].isoformat() if r[7] and hasattr(r[7], "isoformat") else (str(r[7]) if r[7] else None),
                            "result": r[8],
                            "created_at": r[9].isoformat() if hasattr(r[9], "isoformat") else str(r[9])
                        })
                    return tasks
        except Exception as exc:
            logger.warning(f"[Board Service] DB Error in list_board_tasks ({exc}), utilizing memory fallback.")

    # Fallback to in-memory store
    tasks = []
    for t in _IN_MEMORY_BOARD_TASKS.values():
        if t["org_id"] != org_id:
            continue
        # Check expired lease
        if t["status"] in ("claimed", "in_progress") and t.get("lease_expires_at"):
            exp = datetime.fromisoformat(t["lease_expires_at"])
            if exp < now:
                t["status"] = "open"
                t["claimed_by_profile_id"] = None
                t["lease_expires_at"] = None

        if status_filter and t["status"] != status_filter:
            continue
        if claimed_by_profile_id and t.get("claimed_by_profile_id") != claimed_by_profile_id:
            continue
        tasks.append(t)
    return sorted(tasks, key=lambda x: x["created_at"], reverse=True)


async def claim_board_task(
    task_id: str,
    claimed_by_profile_id: str,
    lease_seconds: int = 300
) -> Dict[str, Any]:
    """
    Atomically claims an open (or expired lease) task with optimistic lock concurrency control.
    """
    now = datetime.utcnow()
    lease_expires_at = now + timedelta(seconds=lease_seconds)

    pool = await get_db_pool()
    if pool:
        try:
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        UPDATE board_tasks
                        SET status = 'claimed',
                            claimed_by_profile_id = %s,
                            lease_expires_at = %s,
                            updated_at = NOW()
                        WHERE id = %s AND (status = 'open' OR lease_expires_at < NOW())
                        RETURNING id, org_id, title, status, claimed_by_profile_id, lease_expires_at;
                        """,
                        (claimed_by_profile_id, lease_expires_at, task_id)
                    )
                    row = await cur.fetchone()
                    if row:
                        await cur.execute(
                            "INSERT INTO board_events (task_id, profile_id, event_type) VALUES (%s, %s, 'task_claimed');",
                            (task_id, claimed_by_profile_id)
                        )
                        return {
                            "success": True,
                            "task_id": str(row[0]),
                            "org_id": str(row[1]),
                            "title": row[2],
                            "status": row[3],
                            "claimed_by_profile_id": str(row[4]),
                            "lease_expires_at": row[5].isoformat() if hasattr(row[5], "isoformat") else str(row[5])
                        }
                    else:
                        return {"success": False, "reason": "Task is already claimed by another agent or does not exist."}
        except Exception as exc:
            logger.warning(f"[Board Service] DB Error in claim_board_task ({exc}), utilizing memory fallback.")

    # Fallback to in-memory store
    t = _IN_MEMORY_BOARD_TASKS.get(task_id)
    if not t:
        return {"success": False, "reason": "Task not found."}
    
    # Check if claimable
    is_expired = False
    if t.get("lease_expires_at"):
        exp = datetime.fromisoformat(t["lease_expires_at"])
        if exp < now:
            is_expired = True

    if t["status"] == "open" or is_expired:
        t["status"] = "claimed"
        t["claimed_by_profile_id"] = claimed_by_profile_id
        t["lease_expires_at"] = lease_expires_at.isoformat()
        t["updated_at"] = now.isoformat()
        _IN_MEMORY_BOARD_EVENTS.append({
            "task_id": task_id,
            "profile_id": claimed_by_profile_id,
            "event_type": "task_claimed",
            "created_at": now.isoformat()
        })
        return {
            "success": True,
            "task_id": task_id,
            "org_id": t["org_id"],
            "title": t["title"],
            "status": "claimed",
            "claimed_by_profile_id": claimed_by_profile_id,
            "lease_expires_at": lease_expires_at.isoformat()
        }

    return {"success": False, "reason": f"Task already claimed by {t.get('claimed_by_profile_id')}."}


async def renew_task_claim(
    task_id: str,
    claimed_by_profile_id: str,
    lease_seconds: int = 300
) -> Dict[str, Any]:
    """
    Extends the lease duration for an actively claimed task.
    """
    now = datetime.utcnow()
    new_expires_at = now + timedelta(seconds=lease_seconds)

    pool = await get_db_pool()
    if pool:
        try:
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        UPDATE board_tasks
                        SET lease_expires_at = %s, updated_at = NOW()
                        WHERE id = %s AND claimed_by_profile_id = %s AND status IN ('claimed', 'in_progress')
                        RETURNING id, lease_expires_at;
                        """,
                        (new_expires_at, task_id, claimed_by_profile_id)
                    )
                    row = await cur.fetchone()
                    if row:
                        return {
                            "success": True,
                            "task_id": task_id,
                            "new_lease_expires_at": row[1].isoformat() if hasattr(row[1], "isoformat") else str(row[1])
                        }
                    return {"success": False, "reason": "Task not owned by claiming profile or inactive."}
        except Exception as exc:
            logger.warning(f"[Board Service] DB Error in renew_task_claim ({exc}), utilizing memory fallback.")

    t = _IN_MEMORY_BOARD_TASKS.get(task_id)
    if t and t.get("claimed_by_profile_id") == claimed_by_profile_id:
        t["lease_expires_at"] = new_expires_at.isoformat()
        t["updated_at"] = now.isoformat()
        return {"success": True, "task_id": task_id, "new_lease_expires_at": new_expires_at.isoformat()}

    return {"success": False, "reason": "Task not owned by claiming profile or inactive."}


async def complete_board_task(
    task_id: str,
    profile_id: str,
    result_summary: str
) -> Dict[str, Any]:
    """
    Marks a claimed board task as completed ('done') with result output.
    """
    now = datetime.utcnow()
    pool = await get_db_pool()
    if pool:
        try:
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        UPDATE board_tasks
                        SET status = 'done', result = %s, lease_expires_at = NULL, updated_at = NOW()
                        WHERE id = %s AND claimed_by_profile_id = %s
                        RETURNING id, org_id, title;
                        """,
                        (result_summary, task_id, profile_id)
                    )
                    row = await cur.fetchone()
                    if row:
                        await cur.execute(
                            "INSERT INTO board_events (task_id, profile_id, event_type, payload) VALUES (%s, %s, 'task_completed', %s);",
                            (task_id, profile_id, f'{{"result": "{result_summary[:100]}"}}')
                        )
                        await notify_board_push_wakeup(org_id=str(row[1]), event_type="task_completed", task_id=task_id)
                        return {"success": True, "task_id": task_id, "status": "done"}
                    return {"success": False, "reason": "Task is not currently claimed by this profile."}
        except Exception as exc:
            logger.warning(f"[Board Service] DB Error in complete_board_task ({exc}), utilizing memory fallback.")

    t = _IN_MEMORY_BOARD_TASKS.get(task_id)
    if t and t.get("claimed_by_profile_id") == profile_id:
        t["status"] = "done"
        t["result"] = result_summary
        t["lease_expires_at"] = None
        t["updated_at"] = now.isoformat()
        await notify_board_push_wakeup(org_id=t["org_id"], event_type="task_completed", task_id=task_id)
        return {"success": True, "task_id": task_id, "status": "done"}

    return {"success": False, "reason": "Task is not currently claimed by this profile."}


async def release_board_task(
    task_id: str,
    profile_id: str,
    reason: str = ""
) -> Dict[str, Any]:
    """
    Releases a claimed task back to 'open' status so another agent can pick it up.
    """
    now = datetime.utcnow()
    pool = await get_db_pool()
    if pool:
        try:
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        UPDATE board_tasks
                        SET status = 'open', claimed_by_profile_id = NULL, lease_expires_at = NULL, updated_at = NOW()
                        WHERE id = %s AND claimed_by_profile_id = %s
                        RETURNING id, org_id;
                        """,
                        (task_id, profile_id)
                    )
                    row = await cur.fetchone()
                    if row:
                        await cur.execute(
                            "INSERT INTO board_events (task_id, profile_id, event_type, payload) VALUES (%s, %s, 'task_released', %s);",
                            (task_id, profile_id, f'{{"reason": "{reason}"}}')
                        )
                        await notify_board_push_wakeup(org_id=str(row[1]), event_type="task_released", task_id=task_id)
                        return {"success": True, "task_id": task_id, "status": "open"}
                    return {"success": False, "reason": "Task is not currently claimed by this profile."}
        except Exception as exc:
            logger.warning(f"[Board Service] DB Error in release_board_task ({exc}), utilizing memory fallback.")

    t = _IN_MEMORY_BOARD_TASKS.get(task_id)
    if t and t.get("claimed_by_profile_id") == profile_id:
        t["status"] = "open"
        t["claimed_by_profile_id"] = None
        t["lease_expires_at"] = None
        t["updated_at"] = now.isoformat()
        await notify_board_push_wakeup(org_id=t["org_id"], event_type="task_released", task_id=task_id)
        return {"success": True, "task_id": task_id, "status": "open"}

    return {"success": False, "reason": "Task is not currently claimed by this profile."}


async def notify_board_push_wakeup(org_id: str, event_type: str, task_id: str):
    """
    Push wakeup notification: Emits event to wake up sleeping agents in org when a board task state changes.
    """
    logger.info(f"[Board Push Wakeup] Org {org_id}: Event {event_type} on Task {task_id}")
    # In AWS serverless mode, this can trigger an EventBridge custom event rule or SQS payload.
