/**
 * OpenRouter provider — free tier, no credit card required
 * Sign up: https://openrouter.ai
 *
 * Routes to 100+ models via a single OpenAI-compatible API.
 * Free models (marked :free) have no credit balance required.
 *
 * Free-tier models used here:
 *   meta-llama/llama-3.3-70b-instruct:free          — strong general chat
 *   deepseek/deepseek-r1-distill-llama-70b:free      — strong reasoning fallback
 *   qwen/qwen3-235b-a22b:free                        — large MoE, very capable
 */

import fetch from "node-fetch";

const BASE_URL = "https://openrouter.ai/api/v1";

const client = (apiKey) => {
  const key = apiKey || process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OpenRouter: no API key. Add yours in the settings panel (⚙).");
  return key;
};

const MODELS = {
  "openrouter:llama-3.3-70b": {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    capabilities: {
      chat: true, code: true, code_review: true, reasoning: true,
      vision: false, tool_use: true, summarization: true,
      embedding: false, voice_reply_fast: false, long_context: false
    },
    context_window: 131_072,
    typical_latency_ms: 700,
    cost_per_million_input_usd: 0.0,
    requires_card: false
  },
  "openrouter:deepseek-r1": {
    id: "deepseek/deepseek-r1-distill-llama-70b:free",
    capabilities: {
      chat: true, code: true, code_review: true, reasoning: true,
      vision: false, tool_use: false, summarization: true,
      embedding: false, voice_reply_fast: false, long_context: false
    },
    context_window: 65_536,
    typical_latency_ms: 1800,
    cost_per_million_input_usd: 0.0,
    requires_card: false
  },
  "openrouter:qwen3-235b": {
    id: "qwen/qwen3-235b-a22b:free",
    capabilities: {
      chat: true, code: true, code_review: true, reasoning: true,
      vision: false, tool_use: true, summarization: true,
      embedding: false, voice_reply_fast: false, long_context: false
    },
    context_window: 40_960,
    typical_latency_ms: 1500,
    cost_per_million_input_usd: 0.0,
    requires_card: false
  }
};

// Note: tools are intentionally NOT forwarded to OpenRouter.
// OpenRouter can't execute the Palawan tools — only the orchestrator can.
// Passing them also risks schema validation errors on some upstream models.
async function chat({ model: modelKey, messages, stream = false, systemPrompt, apiKey: keyOverride }) {
  const modelDef = MODELS[modelKey];
  if (!modelDef) throw new Error(`OpenRouter: unknown model ${modelKey}`);

  const apiKey = client(keyOverride);
  const msgs = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  const body = {
    model: modelDef.id,
    messages: msgs,
    stream
  };

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization":  `Bearer ${apiKey}`,
      "Content-Type":   "application/json",
      "HTTP-Referer":   "https://mai0.1.local",
      "X-Title":        "M.AI0.1"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter API error ${res.status}: ${err}`);
  }

  if (stream) return res.body;

  const data = await res.json();
  return data.choices[0]?.message?.content ?? "";
}

const makeProvider = (key) => ({
  name: key,
  local: false,
  requires_card: false,
  ...MODELS[key],
  chat: (opts) => chat({ ...opts, model: key }),
  embed: null
});

export const openrouterLlama70b   = makeProvider("openrouter:llama-3.3-70b");
export const openrouterDeepSeekR1 = makeProvider("openrouter:deepseek-r1");
export const openrouterQwen3      = makeProvider("openrouter:qwen3-235b");

export default [openrouterLlama70b, openrouterDeepSeekR1, openrouterQwen3];
