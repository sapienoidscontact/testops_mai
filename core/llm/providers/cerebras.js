/**
 * Cerebras provider — free tier, no credit card required
 * Sign up: https://cloud.cerebras.ai
 *
 * Ultra-fast inference via Cerebras Wafer-Scale Engine.
 * OpenAI-compatible API.
 *
 * Free tier models: llama3.1-8b, llama3.3-70b
 */

import fetch from "node-fetch";

const BASE_URL = "https://api.cerebras.ai/v1";

const client = (apiKey) => {
  const key = apiKey || process.env.CEREBRAS_API_KEY;
  if (!key) throw new Error("Cerebras: no API key. Add yours in the settings panel (⚙).");
  return key;
};

const MODELS = {
  "cerebras:llama3.1-8b": {
    id: "llama3.1-8b",
    capabilities: {
      chat: true, code: true, code_review: false, reasoning: false,
      vision: false, tool_use: true, summarization: true,
      embedding: false, voice_reply_fast: true, long_context: false
    },
    context_window: 128_000,
    typical_latency_ms: 150,
    cost_per_million_input_usd: 0.0,
    requires_card: false
  },
  "cerebras:llama3.3-70b": {
    id: "llama3.3-70b",
    capabilities: {
      chat: true, code: true, code_review: true, reasoning: true,
      vision: false, tool_use: true, summarization: true,
      embedding: false, voice_reply_fast: false, long_context: false
    },
    context_window: 128_000,
    typical_latency_ms: 400,
    cost_per_million_input_usd: 0.0,
    requires_card: false
  }
};

// Note: tools are intentionally NOT forwarded to Cerebras.
// Cerebras's validator rejects the Palawan tool parameter schemas,
// and Cerebras can't execute tools anyway — only the orchestrator can.
async function chat({ model: modelKey, messages, stream = false, systemPrompt, apiKey: keyOverride }) {
  const modelDef = MODELS[modelKey];
  if (!modelDef) throw new Error(`Cerebras: unknown model ${modelKey}`);

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
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cerebras API error ${res.status}: ${err}`);
  }

  if (stream) return res.body; // caller handles streaming

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

export const cerebrasLlama8b  = makeProvider("cerebras:llama3.1-8b");
export const cerebrasLlama70b = makeProvider("cerebras:llama3.3-70b");

export default [cerebrasLlama8b, cerebrasLlama70b];
