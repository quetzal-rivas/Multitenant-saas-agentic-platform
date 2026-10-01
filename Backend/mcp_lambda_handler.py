"""
AWS Lambda Handler for Platform Control MCP Server
Exposes handle_json_rpc via AWS Lambda event envelope for Stateless JSON-RPC over HTTPS / boto3.
"""

import json
import asyncio
import logging

from Backend.platform_control_mcp import handle_json_rpc

logger = logging.getLogger("mcp_lambda_handler")
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """
    AWS Lambda entrypoint. Accepts JSON-RPC payload either directly or via API Gateway event.
    """
    try:
        if isinstance(event, str):
            payload = json.loads(event)
        elif "body" in event:
            payload = json.loads(event["body"]) if isinstance(event["body"], str) else event["body"]
        else:
            payload = event

        loop = asyncio.get_event_loop()
        response = loop.run_until_complete(handle_json_rpc(payload))

        if "body" in event or "httpMethod" in event:
            return {
                "statusCode": 200,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps(response)
            }
        return response
    except Exception as exc:
        logger.error(f"Lambda MCP Handler error: {exc}")
        err_response = {
            "jsonrpc": "2.0",
            "id": None,
            "error": {"code": -32603, "message": str(exc)}
        }
        if "body" in event or "httpMethod" in event:
            return {
                "statusCode": 500,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps(err_response)
            }
        return err_response
