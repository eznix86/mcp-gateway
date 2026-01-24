export interface UpstreamConfig {
  type: "local" | "remote";
  command?: string[];
  url?: string;
  transport?: "streamable_http" | "websocket";
  endpoint?: string;
  environment?: Record<string, string>; // Environment variables with support for {env:VAR_NAME} substitution
  enabled?: boolean;
  lazy?: boolean; // if true, only connect on first request
  idleTimeout?: number; // milliseconds before sleeping (default: 2hrs)
}

export interface GatewayConfig {
  [serverKey: string]: UpstreamConfig;
}

export interface ToolCatalogEntry {
  id: string;
  server: string;
  name: string;
  title?: string;
  description?: string;
  inputSchema?: any;
  outputSchema?: any;
}

export interface SearchFilters {
  server?: string;
  tags?: string[];
}

export interface JobRecord {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  toolId: string;
  args: any;
  priority?: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  result?: any;
  error?: string;
  logs: string[];
}

export interface SearchResult {
  id: string;
  server: string;
  name: string;
  description?: string;
  score: number;
}
