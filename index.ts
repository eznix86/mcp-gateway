#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync, existsSync, watch } from "fs";
import { homedir } from "os";
import { join } from "path";

import type { GatewayConfig } from "./src/types.js";
import { SearchEngine } from "./src/search.js";
import { JobManager } from "./src/jobs.js";
import { ConnectionManager } from "./src/connections.js";
import { createServer } from "./src/handlers.js";

const DEFAULT_CONFIG_PATH = join(homedir(), ".config", "mcp-gateway", "config.json");

function loadConfig(path: string): GatewayConfig {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8"));
}

class MCPGateway {
  private config: GatewayConfig;
  private configPath: string;
  private searchEngine = new SearchEngine();
  private jobManager = new JobManager();
  private connections: ConnectionManager;
  private server: McpServer;

  constructor(configPath?: string) {
    this.configPath = configPath || process.env.MCP_GATEWAY_CONFIG || DEFAULT_CONFIG_PATH;
    this.config = loadConfig(this.configPath);
    this.connections = new ConnectionManager(this.searchEngine, this.jobManager);
    this.server = createServer(this.searchEngine, this.connections, this.jobManager);
  }

  async start(): Promise<void> {
    console.error("MCP Gateway starting...");

    const connections = Object.entries(this.config).filter(([_, c]) => c.enabled !== false).map(([k, c]) => this.connections.connectWithRetry(k, c));
    const results = await Promise.allSettled(connections);

    let success = 0, failed = 0;
    for (const r of results) r.status === "fulfilled" ? success++ : failed++;

    this.searchEngine.warmup();

    console.error(`Gateway ready: ${this.searchEngine.getTools().length} tools from ${success} servers (${failed} failed)`);

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.watchConfig();
  }

  private watchConfig() {
    if (!this.configPath) return;

    let timer: NodeJS.Timeout | null = null;
    watch(this.configPath, (event: string) => {
      if (event !== "change") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => this.reloadConfig(), 1000);
    });
    console.error(`  Watching config: ${this.configPath}`);
  }

  private async reloadConfig(): Promise<void> {
    const newConfig = loadConfig(this.configPath);
    const oldServers = new Set(Object.keys(this.config));
    const newServers = new Set(Object.keys(newConfig));

    const toRemove = [...oldServers].filter((s) => !newServers.has(s));
    const toAdd = [...newServers].filter((s) => !oldServers.has(s));
    const toUpdate = [...newServers].filter((s) => oldServers.has(s));

    for (const key of toRemove) {
      await this.connections.disconnect(key);
      console.error(`    ${key} disconnected`);
    }

    for (const key of toUpdate) {
      const oldC = this.config[key];
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

    this.config = newConfig;
    this.searchEngine.warmup();
    console.error(`Reloaded: ${this.searchEngine.getTools().length} tools from ${this.connections.getConnectedServers().length} servers`);
  }

  async stop(): Promise<void> {
    console.error("Shutting down gateway...");
    await this.jobManager.shutdown();
    await this.connections.disconnectAll();
    console.error("Gateway shutdown complete");
  }
}

const gateway = new MCPGateway(process.argv[2]);
gateway.start().catch((err) => { console.error("Fatal error:", err); process.exit(1); });
process.on("SIGINT", () => gateway.stop().then(() => process.exit(0)));
process.on("SIGTERM", () => gateway.stop().then(() => process.exit(0)));
