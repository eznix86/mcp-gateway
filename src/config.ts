import { readFileSync, existsSync, watch, type FSWatcher } from "fs";
import { homedir } from "os";
import { join } from "path";

import type { GatewayConfig } from "./types.js";

const DEFAULT_CONFIG_PATH = join(homedir(), ".config", "mcp-gateway", "config.json");

export class Config {
  private config: GatewayConfig;
  private configPath: string;
  private watcher?: FSWatcher;

  constructor(path?: string) {
    this.configPath = path || process.env.MCP_GATEWAY_CONFIG || DEFAULT_CONFIG_PATH;
    this.config = this.load();
  }

  get<K extends keyof GatewayConfig>(key: K): GatewayConfig[K] | undefined {
    return this.config[key];
  }

  getAll(): GatewayConfig {
    return { ...this.config };
  }

  set(key: string, value: any): void {
    this.config[key] = value;
  }

  getPath(): string {
    return this.configPath;
  }

  reload(): GatewayConfig {
    this.config = this.load();
    return this.config;
  }

  watch(callback: (config: GatewayConfig) => void): void {
    if (this.watcher) return;
    this.watcher = watch(this.configPath, (event: string) => {
      if (event !== "change") return;
      this.reload();
      callback(this.config);
    });
    console.error(`  Watching config: ${this.configPath}`);
  }

  stopWatching(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }

  private load(): GatewayConfig {
    if (!existsSync(this.configPath)) return {};
    return JSON.parse(readFileSync(this.configPath, "utf-8"));
  }
}

export function getDefaultConfigPath(): string {
  return process.env.MCP_GATEWAY_CONFIG || DEFAULT_CONFIG_PATH;
}
