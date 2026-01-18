#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, existsSync, watch } from "fs";
import { homedir } from "os";
import { join } from "path";

import type { GatewayConfig } from "./src/types.js";
import { SearchEngine } from "./src/search.js";
import { JobManager } from "./src/jobs.js";
import { ConnectionManager } from "./src/connections.js";
import { HandlerRegistry } from "./src/handlers.js";

const DEFAULT_CONFIG_PATH = join(homedir(), ".config", "mcp-gateway", "config.json");

function loadConfig(path: string): GatewayConfig {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8"));
}

class MCPGateway {
  private server: Server;
  private config: GatewayConfig;
  private configPath: string;
  private searchEngine = new SearchEngine();
  private jobManager = new JobManager();
  private connections: ConnectionManager;
  private handlers: HandlerRegistry;

  constructor(configPath?: string) {
    this.configPath = configPath || process.env.MCP_GATEWAY_CONFIG || DEFAULT_CONFIG_PATH;
    this.config = loadConfig(this.configPath);

    this.server = new Server({ name: "mcp-gateway", version: "1.0.0" }, { capabilities: { tools: {} } });

    this.connections = new ConnectionManager(this.searchEngine, this.jobManager);
    this.handlers = new HandlerRegistry(this.searchEngine, this.connections, this.jobManager);

    this.jobManager.setExecuteJob(this.executeJob.bind(this));
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        { name: "gateway.search", description: "Search tools with BM25 scoring", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number", default: 10 }, filters: { type: "object", properties: { server: { type: "string" } } } }, required: ["query"] } },
        { name: "gateway.describe", description: "Get tool schema", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
        { name: "gateway.invoke", description: "Execute tool synchronously", inputSchema: { type: "object", properties: { id: { type: "string" }, args: { type: "object" }, timeoutMs: { type: "number" } }, required: ["id", "args"] } },
        { name: "gateway.invoke_async", description: "Execute tool asynchronously", inputSchema: { type: "object", properties: { id: { type: "string" }, args: { type: "object" }, priority: { type: "number" } }, required: ["id", "args"] } },
        { name: "gateway.invoke_status", description: "Check job status", inputSchema: { type: "object", properties: { jobId: { type: "string" } }, required: ["jobId"] } },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        switch (name) {
          case "gateway.search": return await this.handlers.handleSearch(args);
          case "gateway.describe": return await this.handlers.handleDescribe(args);
          case "gateway.invoke": return await this.handlers.handleInvoke(args);
          case "gateway.invoke_async": return await this.handlers.handleInvokeAsync(args);
          case "gateway.invoke_status": return await this.handlers.handleInvokeStatus(args);
          default: throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }
    });
  }

  private async executeJob(job: any): Promise<void> {
    job.status = "running";
    job.startedAt = Date.now();
    job.logs.push("Started execution");

    try {
      const result = await this.handlers.handleInvoke({ id: job.toolId, args: job.args, timeoutMs: 60000 });
      job.status = "completed";
      job.result = result;
      job.finishedAt = Date.now();
      job.logs.push("Completed successfully");
    } catch (error: any) {
      job.status = "failed";
      job.error = error.message;
      job.finishedAt = Date.now();
      job.logs.push(`Failed: ${error.message}`);
    }
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
