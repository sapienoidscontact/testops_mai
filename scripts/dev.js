#!/usr/bin/env node
/**
 * Development launcher — starts API + web app
 * Run: pnpm dev  (from root)
 */

import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

config({ path: join(ROOT, ".env") });

if (!process.env.GEMINI_API_KEY) {
  console.warn("\n⚠  No GEMINI_API_KEY in .env — use the browser settings panel (⚙) to add keys.\n");
}

function startProcess(name, cmd, args, cwd, color) {
  const prefix = `\x1b[${color}m[${name}]\x1b[0m`;
  const proc = spawn(cmd, args, { cwd, shell: true, stdio: "pipe" });
  proc.stdout.on("data", d => d.toString().split("\n").filter(Boolean).forEach(l => console.log(`${prefix} ${l}`)));
  proc.stderr.on("data", d => d.toString().split("\n").filter(Boolean).forEach(l => process.stdout.write(`${prefix} ${l}\n`)));
  proc.on("exit", code => console.log(`${prefix} exited ${code}`));
  return proc;
}

console.log("\n═══ M.AI0.1 Dev ═══\n");

// API server via nodemon (binary is hoisted to root)
const api = startProcess(
  "api ",
  join(ROOT, "node_modules/.bin/nodemon"),
  ["--experimental-vm-modules", "core/orchestrator/index.js"],
  ROOT,
  "35"
);

// Give API 2s to start
await new Promise(r => setTimeout(r, 2000));

// Next.js — run via pnpm script inside apps/web workspace
const web = startProcess(
  "web ",
  "pnpm",
  ["exec", "next", "dev", "-p", "3000"],
  join(ROOT, "apps/web"),
  "36"
);

process.on("SIGINT",  () => { api.kill(); web.kill(); process.exit(0); });
process.on("SIGTERM", () => { api.kill(); web.kill(); process.exit(0); });

console.log("  API  → http://localhost:3001/health");
console.log("  Web  → http://localhost:3000/mai0.1\n");
