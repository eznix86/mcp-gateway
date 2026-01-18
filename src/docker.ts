#!/usr/bin/env node

import packageJson from "../package.json" with { type: "json" };
import { MCPGateway } from "./gateway.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "http";

async function main() {
  const gateway = new MCPGateway();
  const transport = await gateway.startWithHttp(3000);

  const server = createServer(async (req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        name: "MCP Gateway",
        description: "Aggregate multiple MCP servers into a single gateway",
        version: packageJson.version,
        endpoints: {
          mcp: "/mcp",
          health: "/health"
        }
      }, null, 2));
      return;
    }

    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.url === "/mcp" && req.method === "POST") {
      transport.handleRequest(req, res);
      return;
    }

    if (req.url === "/mcp" && req.method === "GET") {
      transport.handleRequest(req, res);
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(3000, () => {
    console.error("HTTP server listening on http://localhost:3000");
    console.error("MCP endpoint: http://localhost:3000/mcp");
  });

  process.on("SIGINT", async () => {
    server.close();
    await gateway.shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    server.close();
    await gateway.shutdown();
    process.exit(0);
  });
}

main().catch((err) => { console.error("Fatal error:", err); process.exit(1); });
