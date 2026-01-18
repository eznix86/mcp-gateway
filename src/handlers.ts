import type { SearchFilters, ToolCatalogEntry } from "./types.js";
import { SearchEngine } from "./search.js";
import { JobManager } from "./jobs.js";
import { ConnectionManager } from "./connections.js";

export class HandlerRegistry {
  constructor(
    private searchEngine: SearchEngine,
    private connections: ConnectionManager,
    private jobManager: JobManager,
  ) {}

  async handleSearch(args: any): Promise<{ content: Array<{ type: "text"; text: string }> }> {
    const { query, limit = 10, filters = {} } = args;
    const results = this.searchEngine.search(query, filters, limit);
    return { content: [{ type: "text" as const, text: JSON.stringify({ query, found: results.length, results }, null, 2) }] };
  }

  async handleDescribe(args: any): Promise<{ content: Array<{ type: "text"; text: string }> }> {
    const tool = this.searchEngine.getTool(args.id);
    if (!tool) throw new Error(`TOOL_NOT_FOUND: ${args.id}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(tool, null, 2) }] };
  }

  async handleInvoke(args: any): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
    const [serverKey, toolName] = args.id.split("::");
    const client = this.connections.getClient(serverKey);
    if (!client) throw new Error(`SERVER_NOT_FOUND: ${serverKey}`);
    const tool = this.searchEngine.getTool(args.id);
    if (!tool) throw new Error(`TOOL_NOT_FOUND: ${args.id}`);

    const result = await Promise.race([
      client.callTool({ name: toolName, arguments: args.args }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), args.timeoutMs || 30000)),
    ]);

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }

  async handleInvokeAsync(args: any): Promise<{ content: Array<{ type: "text"; text: string }> }> {
    const job = this.jobManager.createJob(args.id, args.args, args.priority || 0);
    this.jobManager.processQueue();
    return { content: [{ type: "text" as const, text: JSON.stringify({ jobId: job.id, status: "queued" }, null, 2) }] };
  }

  async handleInvokeStatus(args: any): Promise<{ content: Array<{ type: "text"; text: string }> }> {
    const job = this.jobManager.getJob(args.jobId);
    if (!job) throw new Error(`JOB_NOT_FOUND: ${args.jobId}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(job, null, 2) }] };
  }
}
