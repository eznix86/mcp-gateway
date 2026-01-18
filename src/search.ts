import MiniSearch from "minisearch";
import type { ToolCatalogEntry, SearchFilters, SearchResult } from "./types.js";

export class SearchEngine {
  private miniSearch: MiniSearch<ToolCatalogEntry> | null = null;
  private catalog: Map<string, ToolCatalogEntry> = new Map();
  private indexDirty = true;

  constructor() {}

  updateCatalog(tools: ToolCatalogEntry[]) {
    this.catalog.clear();
    for (const tool of tools) {
      this.catalog.set(tool.id, tool);
    }
    this.indexDirty = true;
  }

  addTool(tool: ToolCatalogEntry) {
    this.catalog.set(tool.id, tool);
    this.indexDirty = true;
  }

  removeTool(id: string) {
    this.catalog.delete(id);
    this.indexDirty = true;
  }

  getTools(): ToolCatalogEntry[] {
    return Array.from(this.catalog.values());
  }

  getTool(id: string): ToolCatalogEntry | undefined {
    return this.catalog.get(id);
  }

  private ensureIndex() {
    if (!this.indexDirty && this.miniSearch) return;

    const tools = Array.from(this.catalog.values());

    if (tools.length === 0) {
      this.miniSearch = null;
      this.indexDirty = false;
      return;
    }

    this.miniSearch = new MiniSearch<ToolCatalogEntry>({
      fields: ["name", "title", "description", "server"],
      storeFields: ["id", "server", "name", "title", "description", "inputSchema", "outputSchema"],
      searchOptions: {
        boost: { name: 3, title: 2 },
        fuzzy: 0.2,
        prefix: true,
        combineWith: "OR",
      },
    });

    this.miniSearch.addAll(tools);
    this.indexDirty = false;
  }

  search(query: string, filters: SearchFilters = {}, limit = 50): SearchResult[] {
    this.ensureIndex();

    if (!this.miniSearch || !query.trim()) {
      return [];
    }

    const maxLimit = Math.min(limit, 50);
    const results = this.miniSearch.search(query.toLowerCase()).slice(0, 100);

    const filtered = results
      .filter((result) => {
        if (filters.server && result.server !== filters.server) return false;
        return true;
      })
      .map((result) => ({
        id: result.id,
        server: result.server,
        name: result.name,
        description: result.description,
        score: result.score || 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxLimit);

    return filtered;
  }

  warmup() {
    this.ensureIndex();
  }
}
