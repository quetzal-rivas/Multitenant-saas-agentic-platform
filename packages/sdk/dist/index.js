export class ContextControlError extends Error {
    statusCode;
    rpcCode;
    constructor(message, statusCode, rpcCode) {
        super(message);
        this.statusCode = statusCode;
        this.rpcCode = rpcCode;
        this.name = 'ContextControlError';
    }
}
export class ContextControlMcpClient {
    endpoint;
    apiKey;
    fetcher;
    nextId = 1;
    initialization;
    constructor(options) {
        if (!options.apiKey.trim())
            throw new Error('Context Control API key is required.');
        if (!options.baseUrl.trim())
            throw new Error('Context Control baseUrl is required.');
        const baseUrl = options.baseUrl.replace(/\/+$/, '');
        this.endpoint = baseUrl.endsWith('/api/mcp/platform') ? baseUrl : `${baseUrl}/api/mcp/platform`;
        this.apiKey = options.apiKey;
        this.fetcher = options.fetcher ?? fetch;
    }
    async initialize() {
        if (!this.initialization) {
            this.initialization = this.initializeOnce().catch((error) => {
                this.initialization = undefined;
                throw error;
            });
        }
        return this.initialization;
    }
    async listTools() {
        await this.initialize();
        const result = await this.request('tools/list', {});
        return result.tools;
    }
    async callTool(name, args = {}) {
        await this.initialize();
        return this.request('tools/call', { name, arguments: args });
    }
    async ping() {
        await this.initialize();
        await this.request('ping', {});
    }
    async initializeOnce() {
        const result = await this.request('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: '@contextcontrol/sdk', version: '0.1.0' },
        });
        await this.notify('notifications/initialized');
        return result.serverInfo;
    }
    async request(method, params) {
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
            const message = payload.result.content?.find((item) => item.type === 'text')?.text;
            throw new ContextControlError(message || 'MCP tool execution failed.', response.status);
        }
        return payload.result;
    }
    async notify(method) {
        const response = await this.send({ jsonrpc: '2.0', method });
        if (!response.ok) {
            throw new ContextControlError(`MCP notification failed with HTTP ${response.status}.`, response.status);
        }
    }
    async send(payload) {
        let response;
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
        }
        catch (error) {
            throw new ContextControlError(error instanceof Error ? error.message : 'Unable to reach the Context Control MCP server.');
        }
        if (!response.ok) {
            const body = await this.readJson(response).catch(() => ({}));
            throw new ContextControlError(body.error?.message || `Context Control returned HTTP ${response.status}.`, response.status, body.error?.code);
        }
        return response;
    }
    async readJson(response) {
        try {
            return await response.json();
        }
        catch {
            throw new ContextControlError('Context Control returned an invalid JSON response.', response.status);
        }
    }
}
export class ContextControl {
    mcp;
    profiles;
    tasks;
    constructor(options) {
        this.mcp = new ContextControlMcpClient(options);
        this.profiles = {
            list: async (args = {}) => {
                const result = await this.mcp.callTool('list_mcp_profiles', args);
                return result.structuredContent.profiles;
            },
        };
        this.tasks = {
            list: async (args = {}) => {
                const result = await this.mcp.callTool('list_scheduled_tasks', args);
                return result.structuredContent.tasks;
            },
            schedule: async (input) => {
                const result = await this.mcp.callTool('schedule_deferred_task', {
                    title: input.title,
                    instructions: input.instructions,
                    target_time: input.targetTime,
                    ...(input.profileId ? { profile_id: input.profileId } : {}),
                });
                return result.structuredContent.task;
            },
        };
    }
}
