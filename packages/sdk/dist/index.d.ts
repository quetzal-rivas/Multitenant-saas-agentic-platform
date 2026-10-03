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
    content: Array<{
        type: string;
        text?: string;
    } | Record<string, unknown>>;
    isError?: boolean;
    [key: string]: unknown;
}
export interface McpServerInfo {
    name: string;
    version: string;
}
export declare class ContextControlError extends Error {
    readonly statusCode?: number | undefined;
    readonly rpcCode?: number | undefined;
    constructor(message: string, statusCode?: number | undefined, rpcCode?: number | undefined);
}
export declare class ContextControlMcpClient {
    private readonly endpoint;
    private readonly apiKey;
    private readonly fetcher;
    private nextId;
    private initialization?;
    constructor(options: ContextControlOptions);
    initialize(): Promise<McpServerInfo>;
    listTools(): Promise<McpTool[]>;
    callTool(name: string, args?: Record<string, unknown>): Promise<McpToolResult>;
    ping(): Promise<void>;
    private initializeOnce;
    private request;
    private notify;
    private send;
    private readJson;
}
export declare class ContextControl {
    readonly mcp: ContextControlMcpClient;
    constructor(options: ContextControlOptions);
}
