/**
 * M.AI0.1 — Capability-aware multi-provider LLM router (BYOK edition)
 *
 * createRouter(userKeys) returns a router instance bound to that request's keys.
 * Keys from the user request override .env values for that call only.
 * Nothing is persisted. Server stores zero key material.
 *
 * Algorithm (per call):
 *   1. Determine task type
 *   2. Look up order[] in routing.json
 *   3. For each provider: has key? healthy? has capability? fits context?
 *   4. On failure: mark failure, try next
 *   5. All fail → structured error (never financial language)
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { health } from "./provider-health.js";
import pino from "pino";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logger = pino({ name: "llm-router" });

// ─── Routing config ───────────────────────────────────
let _routingConfig;
export function getRoutingConfig() {
  if (_routingConfig) return _routingConfig;
  _routingConfig = JSON.parse(
    readFileSync(join(__dirname, "../../config/routing.json"), "utf8")
  );
  return _routingConfig;
}

// ─── Provider registry (auto-loaded from providers/) ─
let _registry = null;

export async function loadProviders() {
  if (_registry) return _registry;
  _registry = new Map();

  const dir = join(__dirname, "providers");
  const files = readdirSync(dir).filter(f => f.endsWith(".js"));

  for (const file of files) {
    try {
      const mod = await import(`./providers/${file}`);
      const providers = Array.isArray(mod.default) ? mod.default : [mod.default];
      for (const p of providers) {
        if (p?.name) {
          _registry.set(p.name, p);
          logger.debug({ provider: p.name }, "registered");
        }
      }
    } catch (err) {
      logger.warn({ file, err: err.message }, "provider load failed");
    }
  }

  logger.info({ count: _registry.size }, "providers loaded");
  return _registry;
}

// ─── Key resolver: request key → env fallback → null ─
// Maps ENV_VAR_NAME → userKeys field name
const ENV_TO_FIELD = {
  GEMINI_API_KEY:      "gemini",
  GROQ_API_KEY:        "groq",
  CEREBRAS_API_KEY:    "cerebras",
  SAMBANOVA_API_KEY:   "sambanova",
  HUGGINGFACE_API_KEY: "huggingface",
  OPENROUTER_API_KEY:  "openrouter",
};

function resolveKey(userKeys, envVar) {
  const field = ENV_TO_FIELD[envVar] ?? envVar.toLowerCase().replace("_api_key", "");
  return userKeys?.[field] || process.env[envVar] || null;
}

// Per-provider key env var names
const PROVIDER_KEY_ENVS = {
  "gemini-3.5-flash":         "GEMINI_API_KEY",
  "gemini-2.5-flash":         "GEMINI_API_KEY",
  "gemini-2.5-flash-lite":    "GEMINI_API_KEY",
  "gemini-2.5-pro":           "GEMINI_API_KEY",
  "gemini-embedding-004":     "GEMINI_API_KEY",
  "groq:llama-3.3-70b-versatile": "GROQ_API_KEY",
  "groq:llama-3.1-8b-instant":    "GROQ_API_KEY",
  "groq:qwen-2.5-coder-32b":      "GROQ_API_KEY",
  "groq:whisper-large-v3-turbo":  "GROQ_API_KEY",
  "cerebras:llama3.1-8b":         "CEREBRAS_API_KEY",
  "cerebras:llama3.3-70b":        "CEREBRAS_API_KEY",
  "sambanova:Meta-Llama-3.3-70B-Instruct": "SAMBANOVA_API_KEY",
  "sambanova:DeepSeek-R1":         "SAMBANOVA_API_KEY",
  "huggingface:BAAI/bge-small-en-v1.5": "HUGGINGFACE_API_KEY",
  "huggingface:llama-3.1-8b":      "HUGGINGFACE_API_KEY",
  "openrouter:llama-3.3-70b":  "OPENROUTER_API_KEY",
  "openrouter:deepseek-r1":    "OPENROUTER_API_KEY",
  "openrouter:qwen3-235b":     "OPENROUTER_API_KEY",
};

// ─── Router factory ───────────────────────────────────
/**
 * createRouter(userKeys) — returns a router bound to one request's keys.
 * Call once per request; discard after.
 *
 * @param {object} userKeys - Keys from request headers: { gemini, groq, cerebras, ... }
 */
export function createRouter(userKeys = {}) {

  function hasAnyKey() {
    for (const envVar of new Set(Object.values(PROVIDER_KEY_ENVS))) {
      if (resolveKey(userKeys, envVar)) return true;
    }
    return false;
  }

  async function route({ task, payload, inputTokenEstimate = 0 }) {
    const registry = await loadProviders();
    const config   = getRoutingConfig();

    const taskConfig = config.tasks[task];
    if (!taskConfig) throw new Error(`Unknown task: "${task}"`);

    const errors = [];

    for (const providerKey of taskConfig.order) {
      const provider = registry.get(providerKey);

      // Not registered (provider file missing or errored)
      if (!provider) {
        errors.push({ provider: providerKey, reason: "not_registered" });
        continue;
      }

      // Key check — does this request have the needed API key?
      const envVar  = PROVIDER_KEY_ENVS[providerKey];
      const apiKey  = envVar ? resolveKey(userKeys, envVar) : null;

      if (envVar && !apiKey) {
        logger.debug({ providerKey }, "skipped — no key for this request");
        errors.push({ provider: providerKey, reason: "no_key" });
        continue;
      }

      // Health check (never blocks, only skips degraded)
      const healthStatus = await health.get(providerKey).catch(() => null);
      if (healthStatus?.degraded) {
        errors.push({ provider: providerKey, reason: "degraded" });
        continue;
      }

      // Capability check
      const requiredCap = TASK_CAP_MAP[task];
      if (requiredCap && !provider.capabilities?.[requiredCap]) {
        errors.push({ provider: providerKey, reason: `no_cap:${requiredCap}` });
        continue;
      }

      // Context window check
      if (provider.context_window && inputTokenEstimate > provider.context_window * 0.9) {
        errors.push({ provider: providerKey, reason: "context_too_large" });
        continue;
      }

      // ── Attempt ────────────────────────────────────
      const start = Date.now();
      try {
        let result;
        const payloadWithKey = { ...payload, apiKey };

        if (task === "transcription") {
          result = await provider.transcribe(payloadWithKey);
        } else if (task === "embedding") {
          result = await provider.embed(payloadWithKey);
        } else if (task === "tts") {
          result = await provider.synthesize(payloadWithKey);
        } else {
          result = await provider.chat(payloadWithKey);
        }

        const latency = Date.now() - start;
        await health.recordSuccess(providerKey, latency).catch(() => {});

        logger.info({ task, provider: providerKey, latency }, "✓");
        return { result, provider: providerKey, latency };

      } catch (err) {
        await health.recordFailure(providerKey, err.message).catch(() => {});
        logger.warn({ task, providerKey, err: err.message }, "✗ trying next");
        errors.push({ provider: providerKey, reason: err.message.slice(0, 80) });
      }
    }

    throw new RouterExhaustedError(task, errors);
  }

  // Convenience wrappers
  const llm = {
    chat:       (p, t = "chat")  => route({ task: t,              payload: p }),
    code:       (p)              => route({ task: "code",         payload: p }),
    codeReview: (p)              => route({ task: "code_review",  payload: p }),
    reason:     (p)              => route({ task: "reasoning",    payload: p }),
    summarize:  (p)              => route({ task: "summarization",payload: p }),
    embed:      (p)              => route({ task: "embedding",    payload: p }),
    transcribe: (p)              => route({ task: "transcription",payload: p }),
    voiceFast:  (p)              => route({ task: "voice_reply_fast", payload: p }),
    vision:     (p)              => route({ task: "vision",       payload: p })
  };

  return { route, llm, hasAnyKey };
}

// ─── Helpers ──────────────────────────────────────────
const TASK_CAP_MAP = {
  chat:             "chat",
  code:             "code",
  code_review:      "code_review",
  reasoning:        "reasoning",
  voice_reply_fast: "voice_reply_fast",
  vision:           "vision",
  embedding:        "embedding",
  summarization:    "summarization",
  transcription:    "transcription",
  tts:              null
};

export class RouterExhaustedError extends Error {
  constructor(task, errors) {
    const summary = errors.map(e => `${e.provider}:${e.reason}`).join("; ");
    super(`All providers for [${task}] unreachable. ${summary}`);
    this.name = "RouterExhaustedError";
    this.task = task;
    this.providerErrors = errors;
  }
}

// ─── Legacy singleton (for scripts that import llm directly) ─
export const llm = {
  chat:       (p) => createRouter({}).route({ task: "chat",         payload: p }),
  embed:      (p) => createRouter({}).route({ task: "embedding",    payload: p }),
  transcribe: (p) => createRouter({}).route({ task: "transcription",payload: p })
};
