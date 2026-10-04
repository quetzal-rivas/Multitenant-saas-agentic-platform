export interface ContextControlOptions {
  apiKey: string;
  baseUrl: string;
  fetcher?: typeof fetch;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{ type: string; text?: string } | Record<string, unknown>>;
  isError?: boolean;
  [key: string]: unknown;
}

export interface McpServerInfo {
  name: string;
  version: string;
}

export interface McpProfile {
  id: string;
  name: string;
  description: string | null;
  token_budget: number;
  settings: Record<string, unknown>;
  is_active: boolean;
}

export interface ScheduledTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  target_time: string;
  created_at: string;
}

export interface ScheduleTaskInput {
  title: string;
  instructions: string;
  targetTime: string;
  profileId?: string;
}

interface RpcError {
  code: number;
  message: string;
}

interface RpcResponse<T> {
  id?: number;
  result?: T;
  error?: RpcError;
}

export class ContextControlError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly rpcCode?: number
  ) {
    super(message);
    this.name = 'ContextControlError';
  }
}

export class ContextControlMcpClient {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private nextId = 1;
  private initialization?: Promise<McpServerInfo>;

  constructor(options: ContextControlOptions) {
    if (!options.apiKey.trim()) throw new Error('Context Control API key is required.');
    if (!options.baseUrl.trim()) throw new Error('Context Control baseUrl is required.');

    const baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.endpoint = baseUrl.endsWith('/api/mcp/platform') ? baseUrl : `${baseUrl}/api/mcp/platform`;
    this.apiKey = options.apiKey;
    this.fetcher = options.fetcher ?? fetch;
  }

  async initialize(): Promise<McpServerInfo> {
    if (!this.initialization) {
      this.initialization = this.initializeOnce().catch((error) => {
        this.initialization = undefined;
        throw error;
      });
    }
    return this.initialization;
  }

  async listTools(): Promise<McpTool[]> {
    await this.initialize();
    const result = await this.request<{ tools: McpTool[] }>('tools/list', {});
    return result.tools;
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolResult> {
    await this.initialize();
    return this.request<McpToolResult>('tools/call', { name, arguments: args });
  }

  async ping(): Promise<void> {
    await this.initialize();
    await this.request<Record<string, never>>('ping', {});
  }

  private async initializeOnce(): Promise<McpServerInfo> {
    const result = await this.request<{
      protocolVersion: string;
      serverInfo: McpServerInfo;
    }>('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: '@contextcontrol/sdk', version: '0.1.0' },
    });
    await this.notify('notifications/initialized');
    return result.serverInfo;
  }

  private async request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    const response = await this.send({ jsonrpc: '2.0', id, method, params });
    const payload = await this.readJson(response);

    if (payload.error) {
      throw new ContextControlError(payload.error.message || 'MCP request failed.', response.status, payload.error.code);
    }
    if (payload.id !== id || !('result' in payload)) {
      throw new ContextControlError('MCP server returned an invalid JSON-RPC response.', response.status);
    }
    if (payload.result?.isError) {
      const message = payload.result.content?.find((item: any) => item.type === 'text')?.text;
      throw new ContextControlError(message || 'MCP tool execution failed.', response.status);
    }

    return payload.result as T;
  }

  private async notify(method: string): Promise<void> {
    const response = await this.send({ jsonrpc: '2.0', method });
    if (!response.ok) {
      throw new ContextControlError(`MCP notification failed with HTTP ${response.status}.`, response.status);
    }
  }

  private async send(payload: Record<string, unknown>): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new ContextControlError(
        error instanceof Error ? error.message : 'Unable to reach the Context Control MCP server.'
      );
    }

    if (!response.ok) {
      const body = await this.readJson(response).catch((): RpcResponse<any> => ({}));
      throw new ContextControlError(
        body.error?.message || `Context Control returned HTTP ${response.status}.`,
        response.status,
        body.error?.code
      );
    }
    return response;
  }

  private async readJson(response: Response): Promise<RpcResponse<any>> {
    try {
      return await response.json();
    } catch {
      throw new ContextControlError('Context Control returned an invalid JSON response.', response.status);
    }
  }
}

export class ContextControl {
  readonly mcp: ContextControlMcpClient;
  readonly profiles: {
    list: (options?: { limit?: number }) => Promise<McpProfile[]>;
  };
  readonly tasks: {
    list: (options?: { status?: 'scheduled' | 'active' | 'completed' | 'escalated'; limit?: number }) => Promise<ScheduledTask[]>;
    schedule: (input: ScheduleTaskInput) => Promise<ScheduledTask>;
  };

  constructor(options: ContextControlOptions) {
    this.mcp = new ContextControlMcpClient(options);
    this.profiles = {
      list: async (args = {}) => {
        const result = await this.mcp.callTool('contextcontrol_list_profiles', args);
        return (result.structuredContent as { profiles: McpProfile[] }).profiles;
      },
    };
    this.tasks = {
      list: async (args = {}) => {
        const result = await this.mcp.callTool('contextcontrol_list_tasks', args);
        return (result.structuredContent as { tasks: ScheduledTask[] }).tasks;
      },
      schedule: async (input) => {
        const result = await this.mcp.callTool('contextcontrol_schedule_task', {
          title: input.title,
          instructions: input.instructions,
          target_time: input.targetTime,
          ...(input.profileId ? { profile_id: input.profileId } : {}),
        });
        return (result.structuredContent as { task: ScheduledTask }).task;
      },
    };
  }
}
