## MCP Gateway Usage

When connected to MCP Gateway (mcp-gateway), follow this workflow to avoid context limits:

### Step 1: Search for Tools First

**NEVER** list all tools. Instead, search for what you need:

```json
{
  "query": "kubernetes pods list",
  "limit": 5
}
```

Search tips:
- Use specific keywords: "pods list" not "kubernetes"
- Add context: "github issue create" not just "github"
- Filter by server: `{ "server": "kubernetes" }` if you know the source

### Step 2: Describe the Tool Schema

Before invoking, get the full input schema:

```json
{
  "id": "kubernetes::pods_list"
}
```

This returns the complete tool definition including required parameters.

### Step 3: Invoke the Tool

```json
{
  "id": "kubernetes::pods_list",
  "args": { "namespace": "default" },
  "timeoutMs": 30000
}
```

### Common Workflow Patterns

**Pattern: Find and execute**
```json
// 1. Search
{ "query": "browser navigate", "limit": 5 }

// 2. Describe
{ "id": "<result-id>" }

// 3. Invoke
{ "id": "<result-id>", "args": { "url": "https://..." } }
```

**Pattern: Multiple related tools**
```json
// Search for related functionality
{ "query": "kubernetes pods", "limit": 10 }

// Describe top matches
{ "id": "kubernetes::pods_list" }
{ "id": "kubernetes::pods_get" }

// Invoke the right one
{ "id": "kubernetes::pods_list", "args": {} }
```

**Pattern: Async for long-running operations**
```json
{ "id": "some-server::long-task", "args": { ... }, "priority": 10 }
// Check status later
{ "jobId": "job_123456789_abc123" }
```

### Tool ID Format

All gateway tools use `serverKey::toolName` format:
- `kubernetes::pods_list`
- `playwright::browser_navigate`
- `github::create_issue`

The `serverKey` comes from the gateway configuration file, not the original server name.

### Important Notes

- Gateway can expose lots of tools, but you only need 1-3 for any task
- Always search first - never dump the full tool list
- Use `limit` parameter to control search results (max 50)
- Filter by `server` when you know which service provides the functionality
