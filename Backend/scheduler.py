"""
Backend/scheduler.py - AWS EventBridge Scheduler & Free Tier Serverless Deferred Task Dispatcher

Dynamically schedules ephemeral single-use AWS EventBridge Scheduler rules (at target_time)
to wake up the stateless LangGraph AWS Lambda container for deferred agent execution.
Cost: 0$/month within AWS Free Tier (14M Scheduler invocations/mo + 1M Lambda invocations/mo).
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional

import boto3

logger = logging.getLogger("serverless_scheduler")
logger.setLevel(logging.INFO)

AWS_REGION = os.getenv("AWS_REGION", "us-east-2")
LAMBDA_TARGET_ARN = os.getenv("LAMBDA_TARGET_ARN", "")
SCHEDULER_ROLE_ARN = os.getenv("SCHEDULER_ROLE_ARN", "")


def get_scheduler_client():
    """Initializes boto3 EventBridge Scheduler client using AWS environment credentials"""
    try:
        return boto3.client("scheduler", region_name=AWS_REGION)
    except Exception as exc:
        logger.warning(f"[Scheduler] Could not initialize boto3 scheduler client: {exc}")
        return None


def schedule_deferred_task_eventbridge(
    task_id: str,
    target_time_iso: str,
    payload: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Creates a single-use EventBridge Scheduler rule set to fire at target_time_iso.
    Wakes up the AWS Lambda function with the task_id payload.
    """
    client = get_scheduler_client()
    schedule_name = f"deferred_task_{task_id.replace('-', '_')[:50]}"

    try:
        # Format ISO timestamp for EventBridge Scheduler `at()` syntax: at(YYYY-MM-DDTHH:MM:SS)
        dt = datetime.fromisoformat(target_time_iso.replace("Z", "+00:00"))
        at_expression = f"at({dt.strftime('%Y-%m-%dT%H:%M:%S')})"

        if not client or not LAMBDA_TARGET_ARN or not SCHEDULER_ROLE_ARN:
            logger.info(f"[Scheduler Local Mode] Task {task_id} registered for target time {target_time_iso}.")
            return {
                "success": True,
                "mode": "local_mock_or_supabase_polling",
                "schedule_name": schedule_name,
                "at_expression": at_expression,
                "target_time": target_time_iso,
            }

        response = client.create_schedule(
            Name=schedule_name,
            GroupName="default",
            ScheduleExpression=at_expression,
            FlexibleTimeWindow={"Mode": "OFF"},
            Target={
                "Arn": LAMBDA_TARGET_ARN,
                "RoleArn": SCHEDULER_ROLE_ARN,
                "Input": json.dumps({"action": "execute_deferred_task", "task_id": task_id, "payload": payload}),
                "RetryPolicy": {"MaximumRetryAttempts": 2},
            },
            ActionAfterCompletion="DELETE", // Auto-clean ephemeral schedule after execution
        )

        logger.info(f"[EventBridge Scheduler] Created schedule {schedule_name} for target time {at_expression}")
        return {
            "success": True,
            "mode": "aws_eventbridge_scheduler",
            "schedule_arn": response.get("ScheduleArn"),
            "schedule_name": schedule_name,
            "at_expression": at_expression,
        }
    except Exception as exc:
        logger.error(f"[EventBridge Scheduler Error] Failed to schedule task {task_id}: {exc}")
        return {
            "success": False,
            "error": str(exc),
            "schedule_name": schedule_name,
            "target_time": target_time_iso,
        }
