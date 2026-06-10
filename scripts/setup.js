#!/usr/bin/env node
/**
 * M.AI0.1 First-run setup script
 * Run: node scripts/setup.js
 *
 * - Checks Node/pnpm versions
 * - Copies .env.example → .env if missing
 * - Creates data/ directories
 * - Verifies Docker is available
 * - Prints next steps
 */

import { existsSync, copyFileSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function run(cmd) {
  try { return execSync(cmd, { encoding: "utf8" }).trim(); }
  catch { return null; }
}

function check(label, value, required) {
  const ok = value !== null;
  console.log(`  ${ok ? "✓" : "✗"} ${label}: ${value ?? "NOT FOUND"}${required && !ok ? " ← REQUIRED" : ""}`);
  return ok;
}

console.log("\n═══ M.AI0.1 Setup Check ═══\n");

// Versions
const node   = run("node --version");
const pnpm   = run("pnpm --version");
const docker = run("docker --version");
const git    = run("git --version");

check("Node.js", node, true);
check("pnpm",    pnpm, true);
check("Docker",  docker, false);
check("Git",     git, false);

const nodeOk = node && parseInt(node.replace("v", "")) >= 20;
if (!nodeOk) {
  console.error("\n✗ Node.js 20+ required. Install from https://nodejs.org\n");
  process.exit(1);
}

// .env
console.log("\n─── Environment ───");
const envPath = join(ROOT, ".env");
const envExamplePath = join(ROOT, ".env.example");

if (!existsSync(envPath)) {
  copyFileSync(envExamplePath, envPath);
  console.log("  ✓ Created .env from .env.example");
  console.log("  → Edit .env and add your GEMINI_API_KEY at minimum");
} else {
  console.log("  ✓ .env already exists");
}

// Data dirs
console.log("\n─── Data directories ───");
const dataDirs = ["data/memory", "data/backups"];
for (const d of dataDirs) {
  const full = join(ROOT, d);
  mkdirSync(full, { recursive: true });
  console.log(`  ✓ ${d}/`);
}

// Next steps
console.log("\n─── Next steps ───");
console.log("  1. pnpm install (if not done yet)");
console.log("  2. Start the server (pnpm docker:up OR pnpm dev)");
if (docker) {
  console.log("  3. pnpm docker:up");
  console.log("  4. Open http://localhost:3000/mai0.1");
} else {
  console.log("  3. pnpm dev");
  console.log("  4. Open http://localhost:3000/mai0.1");
}
console.log("  5. Click ⚙ in the top-right → enter your free API keys (Gemini at minimum)");
console.log("     Keys stay in your browser. Nothing is stored on the server.");
console.log("\n  To import a project later: pnpm run intake\n");
