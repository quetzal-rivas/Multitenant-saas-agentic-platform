/**
 * Model Context Protocol (MCP) & Backend Types
 * Conforms to MCP Spec (2024-11-05) + Proprietary Context Control Engine
 */

export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, any>;
}

export interface McpJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface McpToolInputSchema {
  type: 'object';
  properties: Record<
    string,
    {
      type: string;
      description?: string;
      enum?: string[];
      default?: any;
      items?: any;
      properties?: Record<string, any>;
      required?: string[];
    }
  >;
  required?: string[];
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: McpToolInputSchema;
  serverId: string;
  serverName: string;
  category: 'workspace' | 'dev' | 'comm' | 'database' | 'context-control' | 'productivity';
  enabled?: boolean;
}

export interface McpPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export type OAuthProvider = 'google' | 'github' | 'slack' | 'notion';

export interface OAuthConnection {
  provider: OAuthProvider;
  accountName: string;
  accountEmail: string;
  avatarUrl?: string;
  scopes: string[];
  isConnected: boolean;
  connectedAt?: string;
  tokenType?: string;
}

export interface HostedMcpServer {
  id: string;
  name: string;
  slug: string;
  provider: OAuthProvider | 'postgres' | 'context-control';
  icon: string;
  description: string;
  category: 'workspace' | 'developer' | 'productivity' | 'data' | 'core';
  requiresOAuth: boolean;
  oauthProvider?: OAuthProvider;
  tools: McpTool[];
  status: 'active' | 'beta' | 'maintenance';
  isSubscribed: boolean;
  isConnected: boolean;
  connectedUser?: {
    name: string;
    email: string;
    avatarUrl?: string;
  };
  scopesRequired: string[];
}

export type SkillCategory =
  | 'reasoning'
  | 'context'
  | 'coding'
  | 'enterprise'
  | 'data'
  | 'agentic'
  | 'security'
  | 'productivity';

export type SkillSource = 'platform' | 'community' | 'custom';

export interface SkillAuthor {
  name: string;
  handle?: string;
  avatar?: string;
  verified?: boolean;
}

export interface McpSkill {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: SkillCategory;
  systemPromptAddendum: string;
  source?: SkillSource;
  author?: SkillAuthor;
  version?: string;
  tags?: string[];
  tokenEstimate?: number;
  requiredTools?: string[];
  downloads?: number;
  rating?: number;
  stars?: number;
  isInLibrary?: boolean;
  isEnabled?: boolean;
  compatibility?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export type SkillItem = McpSkill & {
  source: SkillSource;
  version: string;
  tags: string[];
  tokenEstimate: number;
  isInLibrary: boolean;
};

export interface McpServerProfile {
  id: string;
  name: string;
  slug: string;
  description: string;
  apiKey: string;
  tokenBudget: number;
  selectedToolNames: string[];
  selectedSkillNames: string[];
  boundContextProfileSlugs: string[];
  createdAt: string;
  updatedAt: string;
  lastActive?: string;
}
