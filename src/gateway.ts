import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import type { GatewayConfig } from "./types.js";
import { Config } from "./config.js";
import { SearchEngine } from "./search.js";
import { JobManager } from "./jobs.js";
import { ConnectionManager } from "./connections.js";
import { createServer } from "./handlers.js";

export class MCPGateway {
  private config: Config;
  private searchEngine: SearchEngine;
  private jobManager: JobManager;
  private connections: ConnectionManager;
  private server: McpServer;

  constructor(configPath?: string) {
    this.config = new Config(configPath);
    this.searchEngine = new SearchEngine();
    this.jobManager = new JobManager();
    this.connections = new ConnectionManager(this.searchEngine, this.jobManager);
    this.server = createServer(this.searchEngine, this.connections, this.jobManager);
  }

  async connectAll(): Promise<void> {
    const allConfig = this.config.getAll();
    const connections = Object.entries(allConfig)
      .filter(([_, c]) => c.enabled !== false)
      .map(([k, c]) => this.connections.connectWithRetry(k, c));
    const results = await Promise.allSettled(connections);

    let success = 0, failed = 0;
    for (const r of results) r.status === "fulfilled" ? success++ : failed++;

    this.searchEngine.warmup();
    console.error(`Connected: ${this.searchEngine.getTools().length} tools from ${success} servers (${failed} failed)`);
  }

  async startWithStdio(): Promise<void> {
    console.error("MCP Gateway starting (stdio)...");

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.log(`__MCP_GATEWAY_STDIO_READY__`);

    this.connectAll().catch((err) => {
      console.error(`Background connection error: ${err.message}`);
    });

    this.config.watch((cfg) => this.handleConfigChange(cfg));
  }

  async startWithHttp(port: number = 3000): Promise<StreamableHTTPServerTransport> {
    console.error(`MCP Gateway starting (http://localhost:${port})...`);
    await this.connectAll();

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await this.server.connect(transport);
    this.config.watch((cfg) => this.handleConfigChange(cfg));

    return transport;
  }

  private handleConfigChange(newConfig: GatewayConfig): void {
    const oldConfig = this.config.getAll();
    const oldServers = new Set(Object.keys(oldConfig));
    const newServers = new Set(Object.keys(newConfig));

    const toRemove = [...oldServers].filter((s) => !newServers.has(s));
    const toAdd = [...newServers].filter((s) => !oldServers.has(s));
    const toUpdate = [...newServers].filter((s) => oldServers.has(s));

    const doReload = async () => {
      for (const key of toRemove) {
        await this.connections.disconnect(key);
        console.error(`    ${key} disconnected`);
      }

      for (const key of toUpdate) {
        const oldC = oldConfig[key];
        const newC = newConfig[key];
        if (oldC && newC && oldC.enabled === false && newC.enabled !== false) {
          try { await this.connections.connectWithRetry(key, newC); console.error(`    ${key} connected`); } catch (e: any) { console.error(`    ${key} failed: ${e.message}`); }
        }
      }

      for (const key of toAdd) {
        const c = newConfig[key];
        if (c && c.enabled !== false) {
          try { await this.connections.connectWithRetry(key, c); console.error(`    ${key} connected`); } catch (e: any) { console.error(`    ${key} failed: ${e.message}`); }
        }
      }

      this.searchEngine.warmup();
      console.error(`Reloaded: ${this.searchEngine.getTools().length} tools from ${this.connections.getConnectedServers().length} servers`);
    };

    // Debounce reload
    setTimeout(() => doReload(), 1000);
  }

  async shutdown(): Promise<void> {
    console.error("Shutting down gateway...");
    this.config.stopWatching();
    await this.jobManager.shutdown();
    await this.connections.disconnectAll();
    console.error("Gateway shutdown complete");
  }
}
