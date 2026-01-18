#!/usr/bin/env node

import { MCPGateway } from "./gateway.js";

const gateway = new MCPGateway(process.argv[2]);
gateway.startWithStdio().catch((err) => { console.error("Fatal error:", err); process.exit(1); });

process.on("SIGINT", () => gateway.shutdown().then(() => process.exit(0)));
process.on("SIGTERM", () => gateway.shutdown().then(() => process.exit(0)));
