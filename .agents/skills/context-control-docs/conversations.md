Source: app/docs/page.tsx (route: /docs?section=conversations)

Communication & Voice Engine · Section 03
# Persistent Threads & Audit Log
Durable conversation thread viewer backed by Supabase PostgreSQL checkpoint history and multi-channel audit logs.
UI Screenshot Preview
### 1. Overview & Strategic Purpose
The **Conversations** module provides full auditability and management across all past and active agent communication threads. It houses the platform's Live Voice Conference Engine, enabling agents to perform automated outbound telephone calls and answer inbound calls over standard PSTN phone lines using ElevenLabs Conversational AI and Twilio Telephony.
### 2. Key Capabilities & Architecture
* **Postgres Persistent Thread Audit:** Displays thread execution sessions stored in Supabase PostgreSQL (`public.thread_instances` and `public.checkpoints`). Tenants can inspect exact turn-by-turn message logs, token consumption per turn, and timestamped tool execution records.
* **Multi-Channel History:** View chat sessions, scheduled task executions, and voice call transcripts in a unified list.
* **Search & Filter:** Instantly search threads by customer ID, date range, or agent persona.