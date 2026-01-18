import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import type { SearchFilters } from "./types.js";
import { SearchEngine } from "./search.js";
import { JobManager } from "./jobs.js";
import { ConnectionManager } from "./connections.js";

export function createServer(
  searchEngine: SearchEngine,
  connections: ConnectionManager,
  jobManager: JobManager,
): McpServer {
  const server = new McpServer({ name: "mcp-gateway", version: "1.0.0" });

  server.registerTool(
    "gateway.search",
    {
      title: "Search Tools",
      description: "Search for tools across all connected MCP servers with BM25 scoring and fuzzy matching",
      inputSchema: {
        query: z.string(),
        limit: z.number().optional(),
        filters: z.object({ server: z.string() }).optional(),
      },
    },
    async ({ query, limit, filters }) => {
      const results = searchEngine.search(query, (filters as SearchFilters) || {}, limit || 10);
      return {
        content: [{ type: "text", text: JSON.stringify({ query, found: results.length, results }, null, 2) }],
      };
    },
  );

  server.registerTool(
    "gateway.describe",
    {
      title: "Describe Tool",
      description: "Get detailed information about a specific tool including full schema",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const tool = searchEngine.getTool(id);
      if (!tool) throw new Error(`TOOL_NOT_FOUND: ${id}`);
      return { content: [{ type: "text", text: JSON.stringify(tool, null, 2) }] };
    },
  );

  server.registerTool(
    "gateway.invoke",
    {
      title: "Invoke Tool",
      description: "Execute a tool synchronously and return the result",
      inputSchema: {
        id: z.string(),
        args: z.record(z.string(), z.unknown()),
        timeoutMs: z.number().optional(),
      },
    },
    async ({ id, args, timeoutMs }) => {
      const parts = id.split("::");
      const serverKey = parts[0];
      const toolName = parts[1];
      if (!serverKey || !toolName) throw new Error(`Invalid tool ID format: ${id}`);

      const client = connections.getClient(serverKey);
      if (!client) throw new Error(`SERVER_NOT_FOUND: ${serverKey}`);
      const tool = searchEngine.getTool(id);
      if (!tool) throw new Error(`TOOL_NOT_FOUND: ${id}`);

      const result = await Promise.race([
        client.callTool({ name: toolName, arguments: args }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs || 30000)),
      ]);

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "gateway.invoke_async",
    {
      title: "Invoke Tool Async",
      description: "Start an asynchronous tool execution and return a job ID for polling",
      inputSchema: {
        id: z.string(),
        args: z.record(z.string(), z.unknown()),
        priority: z.number().optional(),
      },
    },
    async ({ id, args, priority }) => {
      const job = jobManager.createJob(id, args, priority || 0);
      jobManager.processQueue();
      return { content: [{ type: "text", text: JSON.stringify({ jobId: job.id, status: "queued" }, null, 2) }] };
    },
  );

  server.registerTool(
    "gateway.invoke_status",
    {
      title: "Check Job Status",
      description: "Check the status of an async job",
      inputSchema: { jobId: z.string() },
    },
    async ({ jobId }) => {
      const job = jobManager.getJob(jobId);
      if (!job) throw new Error(`JOB_NOT_FOUND: ${jobId}`);
      return { content: [{ type: "text", text: JSON.stringify(job, null, 2) }] };
    },
  );

  return server;
}
