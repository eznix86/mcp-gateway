import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import type { UpstreamConfig, ToolCatalogEntry } from "./types.js";
import { SearchEngine } from "./search.js";
import { JobManager } from "./jobs.js";

export class ConnectionManager {
  private upstreams = new Map<string, Client>();

  constructor(
    private searchEngine: SearchEngine,
    private jobManager: JobManager,
  ) {}

  async connect(serverKey: string, config: UpstreamConfig): Promise<void> {
    if (config.type === "local") {
      await this.connectLocal(serverKey, config);
    } else {
      await this.connectRemote(serverKey, config);
    }
  }

  private async connectLocal(serverKey: string, config: UpstreamConfig): Promise<void> {
    const [cmd, ...args] = config.command || [];
    if (!cmd) throw new Error(`Missing command for ${serverKey}`);

    const transport = new StdioClientTransport({ command: cmd, args });
    await this.connectTransport(serverKey, config, transport);
  }

  private async connectRemote(serverKey: string, config: UpstreamConfig): Promise<void> {
    const url = new URL(config.url || "");
    const transportType = config.transport || (url.protocol === "ws:" || url.protocol === "wss:" ? "websocket" : "streamable_http");
    const transport = transportType === "websocket" ? new WebSocketClientTransport(url) : new StreamableHTTPClientTransport(url);
    await this.connectTransport(serverKey, config, transport);
  }

  private async connectTransport(serverKey: string, config: UpstreamConfig, transport: any): Promise<void> {
    transport.onclose = () => console.error(`[${serverKey}] Connection closed`);
    transport.onerror = (error: Error) => {
      // Suppress JSON parse errors from server logs
      if (error.message.includes("JSON Parse error")) return;
      console.error(`[${serverKey}] Connection error:`, error.message);
    };

    const client = new Client({ name: `gateway-${serverKey}`, version: "1.0.0" }, {});
    await client.connect(transport);
    this.upstreams.set(serverKey, client);

    await this.refreshCatalog(serverKey, client);
    console.error(`[${serverKey}] Connected with ${this.countTools(serverKey)} tools`);
  }

  private async refreshCatalog(serverKey: string, client: Client): Promise<void> {
    const response = await client.listTools();
    for (const tool of response.tools) {
      const entry: ToolCatalogEntry = {
        id: `${serverKey}::${tool.name}`,
        server: serverKey,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      };
      this.searchEngine.addTool(entry);
    }
  }

  private countTools(serverKey: string): number {
    return this.searchEngine.getTools().filter((t) => t.server === serverKey).length;
  }

  async connectWithRetry(serverKey: string, config: UpstreamConfig, maxRetries = 5, baseDelay = 1000): Promise<void> {
    let lastError: Error | undefined;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.connect(serverKey, config);
      } catch (error) {
        lastError = error as Error;
        if (i < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, i);
          console.error(`[${serverKey}] Connection failed (${i + 1}/${maxRetries}), retry in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastError;
  }

  getClient(serverKey: string): Client | undefined {
    return this.upstreams.get(serverKey);
  }

  getAllClients(): Map<string, Client> {
    return new Map(this.upstreams);
  }

  async disconnect(serverKey: string): Promise<void> {
    const client = this.upstreams.get(serverKey);
    if (client) {
      await client.close();
      this.upstreams.delete(serverKey);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const [key] of this.upstreams) {
      await this.disconnect(key);
    }
  }

  getConnectedServers(): string[] {
    return Array.from(this.upstreams.keys());
  }
}
