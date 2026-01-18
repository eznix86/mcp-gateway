# MCP Gateway

MCP Gateway is a server aggregation tool that connects multiple Model Context Protocol (MCP) servers into a single gateway, exposing all tools from connected servers through unified search, describe, and invoke interfaces.

## The Context Limit Problem

When connecting an client (Claude Code, Opencode, etc.) to multiple MCP servers, each server lists all its tools. With 10+ MCPs each exposing 10-50 tools, you can easily exceed 500+ tool descriptions in the system prompt:

```
10 servers × 20 tools each = 200+ tool descriptions
Each tool: 200-500 chars → 40KB-100KB of description just for tool schemas!
```

This creates two problems:
1. **Context overflow**: Many LLMs hit their context limit before any conversation happens
2. **Cognitive overload**: LLMs struggle to choose the right tool from hundreds of options

## The Gateway Solution

MCP Gateway solves this by providing **tool search** instead of dumping all tool schemas:

```
┌─────────────┐    gateway.search    ┌─────────────────┐    kubernetes::pods_list    ┌──────────────────┐
│  AI Client  │ ───────────────────► │   MCP Gateway   │ ─────────────────────────►  │  Kubernetes MCP  │
│             │                      │                 │                             │                  │
│             │ ◄────────────────────│                 │ ◄─────────────────────────  │                  │
└─────────────┘   pods_list schema   └─────────────────┘         pods output         └──────────────────┘
```

## How It Works

MCP Gateway operates as both an MCP client (connecting to upstream servers) and an MCP server (exposing tools to downstream clients):

```
┌──────────────┐      MCP       ┌─────────────────┐      MCP       ┌──────────────────┐
│  AI Client   │ ◄────────────  │   MCP Gateway   │ ◄────────────  │  Upstream Server │
│ (Claude, etc)│                │  (this gateway) │                │  (playwright,    │
└──────────────┘                └─────────────────┘                │   kubernetes...) │
                                                                   └──────────────────┘
```

1. Gateway starts and reads configuration
2. For each configured upstream server, Gateway connects via stdio (local) or HTTP/WebSocket (remote)
3. Gateway fetches the tool catalog from each server
4. All tools are indexed in a unified catalog with search capabilities
5. AI clients connect to Gateway and use `gateway.search` to find relevant tools
6. Only the tools the client actually needs are invoked

## Installation

### Claude Code

Add to your Claude MCP configuration:

```json
{
  "mcpServers": {
    "gateway": {
      "command": "bunx",
      "args": ["github:eznix86/mcp-gateway"]
    }
  }
}
```

### OpenCode

Add to your OpenCode MCP configuration:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "mcp-gateway": {
      "type": "local",
      "command": ["bunx", "github:eznix86/mcp-gateway"]
    },
  }
}
```

You may append your global AGENTS.md (`~/.config/opencode/AGENTS.md`) with this [template](./templates/AGENTS.md)

## Configuration

MCP Gateway reads configuration from a JSON file. By default, it looks for:

1. Path provided as first command-line argument
2. `MCP_GATEWAY_CONFIG` environment variable
3. `~/.config/mcp-gateway/config.json`

### Configuration Format

```json
{
  "local-server": {
    "type": "local",
    "command": ["bun", "run", "/path/to/server.ts"],
  },
  "remote-server": {
    "type": "remote",
    "url": "https://mcp.example.com",
    "enabled": true
  },
  "websocket-server": {
    "type": "remote",
    "url": "wss://mcp.example.com/ws",
    "enabled": true
  }
}
```

Each entry specifies:
- `type`: `"local"` or `"remote"`
- `command` (local only): Array with command and arguments to spawn the upstream server
- `url` (remote only): Full URL of the remote MCP server
- `transport` (optional, remote only): Override transport detection (`"streamable_http"` or `"websocket"`). Usually auto-detected from URL protocol.
- `enabled`: Set to false to skip connecting to this server

#### Remote Server Configuration

Remote servers are auto-detected based on the URL protocol:
- `http://` or `https://` → Streamable HTTP (recommended)
- `ws://` or `wss://` → WebSocket

```json
{
  "gh-grep": {
    "type": "remote",
    "url": "https://mcp.grep.app"
  },
  "custom-websocket": {
    "type": "remote",
    "url": "wss://my-server.com/mcp"
  }
}
```

## Available Tools

### `gateway.search`

Search for tools across all connected servers.

```typescript
{
  query: "kubernetes pods",
  limit: 10,  // optional, max 50
  filters: {
    server: "kubernetes",  // optional, filter by server name
    sideEffecting: true    // optional, filter by side-effecting tools
  }
}
```

Returns matching tools with relevance scores. Tools matching in name are boosted.

### `gateway.describe`

Get detailed information about a specific tool.

```typescript
{
  id: "kubernetes::pods_list"  // format: serverKey::toolName
}
```

Returns the full tool schema including inputSchema.

### `gateway.invoke`

Execute a tool synchronously and get immediate results.

```typescript
{
  id: "kubernetes::pods_list",
  args: { namespace: "default" },
  timeoutMs: 30000  // optional, default 30 seconds
}
```

### `gateway.invoke_async`

Start an asynchronous tool execution. Returns a job ID for polling.

```typescript
{
  id: "some-server::long-running-tool",
  args: { ... },
  priority: 10,  // optional, higher values run first
  timeoutMs: 60000
}
```

### `gateway.invoke_status`

Check the status of an async job.

```typescript
{
  jobId: "job_123456789_abc123"
}
```

## Tool ID Format

All gateway tools use the format `serverKey::toolName` to identify tools:

```
kubernetes::pods_list
playwright::browser_navigate
github::create_issue
```

The `serverKey` is the key name in your configuration file.

## Architecture

### Components

- **MCPGateway class**: Main orchestrator
- **Upstream connection manager**: Manages connections to MCP servers (stdio for local, HTTP/WebSocket for remote)
- **Tool catalog**: In-memory index of all available tools with metadata
- **Job queue**: Handles async tool invocations with priority ordering and concurrency limits (max 3 concurrent by default)
- **Search engine**: Relevance-based tool search with synonym support (k8s -> kubernetes, gh -> github, etc.)

### Search Scoring

The search algorithm scores matches as follows:
- Each matching token adds its length to the score
- Tools with matches in the name get a +10 bonus
- Results are sorted by descending score

### Contributing

```bash
git clone https://github.com/eznix86/mcp-gateway.git
cd mcp-gateway
bun install
bun run index.ts
```

## License

MIT License. See the [LICENSE](LICENSE).
