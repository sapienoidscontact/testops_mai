#!/usr/bin/env node
/**
 * Provider health check
 * Run: node scripts/health-check.js
 * Shows current status of all configured providers.
 */

import { health } from "../core/llm/provider-health.js";
import { loadProviders } from "../core/llm/router.js";

const registry = await loadProviders();
const dashboard = await health.dashboard();

console.log("\n═══ M.AI0.1 Provider Status ═══\n");
console.log(
  "  Provider".padEnd(40) +
  "Status".padEnd(16) +
  "Latency".padEnd(12) +
  "Today"
);
console.log("  " + "─".repeat(70));

for (const row of dashboard) {
  console.log(
    `  ${row.provider}`.padEnd(40) +
    row.status.padEnd(16) +
    `${row.lastLatencyMs}ms`.padEnd(12) +
    row.todayCalls
  );
}

if (dashboard.length === 0) {
  // Show configured providers from registry
  for (const [name, provider] of registry) {
    const hasKey = !provider.requires_card || Object.keys(provider.capabilities ?? {}).length > 0;
    console.log(
      `  ${name}`.padEnd(40) +
      "⚪ no data yet".padEnd(16) +
      "—".padEnd(12) +
      "0"
    );
  }
}

console.log();
