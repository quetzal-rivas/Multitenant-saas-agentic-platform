"""
Production Pydantic v2 Models for Decoupled Hub-and-Spoke Agent Platform
Includes Dynamic Generation Request, Checkpoint Metadata, and Gateway Schemas
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field


class ChatGenerateRequest(BaseModel):
    """
    Inbound generation payload from Next.js UI or ElevenLabs voice webhook
    """
    thread_id: str = Field(..., description="Unique conversational session key used for PostgresSaver hydration")
    tenant_id: str = Field(..., description="Multi-tenant identifier for Supabase RLS and Vault credential scoping")
    profile_id: str = Field(..., description="Target persona configuration ID (e.g. sales_persona, dev_persona)")
    message: str = Field(..., description="Incoming user query or voice transcript")
    stream: bool = Field(default=False, description="Whether to stream token chunks or return unified response")


class ToolExecutionLog(BaseModel):
    """
    Audit log of an individual tool executed via the upstream MCP Gateway proxy
    """
    tool_name: str
    server_provider: str
    arguments: Dict[str, Any]
    output: Any
    latency_ms: float
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class CheckpointMetadata(BaseModel):
    """
    Audit metadata stored inside PostgresSaver checkpoints table
    """
    thread_id: str
    tenant_id: str
    profile_id: str
    checkpoint_id: str
    step: int
    parent_checkpoint_id: Optional[str] = None
    tools_executed: List[str] = Field(default_factory=list)
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class ChatGenerateResponse(BaseModel):
    """
    Outbound response sent to Next.js UI
    """
    thread_id: str
    tenant_id: str
    profile_id: str
    checkpoint_id: str
    message: str
    role: str = "assistant"
    compiled_tools_count: int
    compiled_tools_names: List[str]
    tool_executions: List[ToolExecutionLog] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class VaultCredentialItem(BaseModel):
    """
    Pre-authenticated spoke connection in Supabase Vault
    """
    provider: str
    account_name: Optional[str] = None
    scopes: List[str] = Field(default_factory=list)
    is_active: bool = True
    connected_at: str


class GatewayToolsCompilation(BaseModel):
    """
    Resolved schema array emitted by the platform MCP Gateway
    """
    tenant_id: str
    profile_id: str
    tools: List[Dict[str, Any]]
    system_prompt_addendum: str
    bound_servers: List[str]
    token_budget: int


class ProfileWorkerBlueprint(BaseModel):
    """
    Child worker configuration within an Agent Team Profile Blueprint
    """
    id: str = Field(default_factory=lambda: f"wkr_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}")
    profile_id: Optional[str] = None
    name: str = Field(..., description="e.g. CRM Specialist, Billing Clerk")
    role: str = Field(..., description="Worker title or operational responsibility")
    system_prompt: str = Field(..., description="Specific directives for this worker")
    mcp_tools: List[str] = Field(default_factory=list, description="Array of allowed tools, e.g. ['crm.add_lead', 'crm.tag_contact']")
    avatar_icon: str = Field(default="bot", description="UI icon or avatar key")


class ProfileTeamBlueprint(BaseModel):
    """
    The Team Profile Blueprint (stored in relational profiles table)
    """
    id: str = Field(..., description="UUID or unique slug for the team profile")
    tenant_id: str = Field(..., description="Tenant owner ID secured via RLS")
    name: str = Field(..., description="e.g. Front Desk Automation Team, Night Audit Team")
    supervisor_prompt: str = Field(..., description="Master corporate directives and routing rules for the supervisor node")
    routing_strategy: str = Field(default="supervisor_router", description="Routing architecture")
    workers: List[ProfileWorkerBlueprint] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class CreateTeamProfileRequest(BaseModel):
    """
    Inbound payload from Agent Team Builder UI
    """
    name: str
    supervisor_prompt: str
    routing_strategy: str = "supervisor_router"
    workers: List[ProfileWorkerBlueprint]
    heartbeat_enabled: bool = False
    heartbeat_rate_minutes: int = 15
    heartbeat_goal: str = "Monitor the supervisor board and claim new tasks."


class ThreadInstance(BaseModel):
    """
    Execution instance spawned dynamically from a Team Profile Blueprint
    """
    id: str = Field(default_factory=lambda: f"inst_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}")
    thread_id: str = Field(..., description="Unique thread key for LangGraph PostgresSaver (e.g. fresh_chat_session_889)")
    tenant_id: str
    profile_id: str
    title: str = "New Session Instance"
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    last_active_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class OrganizationCreateRequest(BaseModel):
    name: str

class InviteUserRequest(BaseModel):
    email: str

class AcceptInviteRequest(BaseModel):
    token: str

