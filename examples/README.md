# Example Configurations

Copy `config.json` to `~/.config/mcp-gateway/config.json` and customize.

## Example Servers

| Server | Type | Description |
|--------|------|-------------|
| filesystem | remote | File system operations via HTTP |
| github | remote | GitHub API operations |

## Usage

```bash
# Copy to your config location
cp config.json ~/.config/mcp-gateway/config.json

# Edit as needed
nano ~/.config/mcp-gateway/config.json

# Run gateway
bun run index.ts
```

## Local Server Example

```json
{
  "my-server": {
    "type": "local",
    "command": ["bun", "run", "/path/to/your/server.ts"]
  }
}
```
