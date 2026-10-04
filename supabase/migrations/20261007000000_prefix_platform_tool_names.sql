-- Migration: 20261007000000_prefix_platform_tool_names.sql
-- Description: Platform MCP tools are now prefixed `contextcontrol_` (mcp-builder naming
-- guidance). Rewrite stored tool names in key whitelists and Agent Studio instances.
-- Idempotent: names already prefixed are left alone.

CREATE OR REPLACE FUNCTION pg_temp.prefix_tool_names(names TEXT[])
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
    SELECT COALESCE(array_agg(DISTINCT
        CASE n
            WHEN 'list_mcp_profiles'     THEN 'contextcontrol_list_profiles'
            WHEN 'get_mcp_profile'       THEN 'contextcontrol_get_profile'
            WHEN 'create_mcp_profile'    THEN 'contextcontrol_create_profile'
            WHEN 'update_mcp_profile'    THEN 'contextcontrol_update_profile'
            WHEN 'archive_mcp_profile'   THEN 'contextcontrol_archive_profile'
            WHEN 'list_scheduled_tasks'  THEN 'contextcontrol_list_tasks'
            WHEN 'get_scheduled_task'    THEN 'contextcontrol_get_task'
            WHEN 'schedule_deferred_task' THEN 'contextcontrol_schedule_task'
            WHEN 'cancel_scheduled_task' THEN 'contextcontrol_cancel_task'
            WHEN 'list_api_keys'         THEN 'contextcontrol_list_api_keys'
            ELSE n
        END), '{}')
    FROM unnest(names) AS n;
$$;

UPDATE public.mcp_api_keys
SET tools_whitelist = pg_temp.prefix_tool_names(tools_whitelist)
WHERE tools_whitelist && ARRAY['list_mcp_profiles','get_mcp_profile','create_mcp_profile','update_mcp_profile',
    'archive_mcp_profile','list_scheduled_tasks','get_scheduled_task','schedule_deferred_task',
    'cancel_scheduled_task','list_api_keys']::TEXT[];

UPDATE public.agent_sessions
SET allowed_tools = pg_temp.prefix_tool_names(allowed_tools)
WHERE allowed_tools && ARRAY['list_mcp_profiles','get_mcp_profile','create_mcp_profile','update_mcp_profile',
    'archive_mcp_profile','list_scheduled_tasks','get_scheduled_task','schedule_deferred_task',
    'cancel_scheduled_task','list_api_keys']::TEXT[];
