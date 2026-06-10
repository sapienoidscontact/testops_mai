/**
 * Hugging Face Inference API — free tier, no credit card required
 * Sign up: https://huggingface.co/settings/tokens
 *
 * Used primarily for: embeddings (BAAI/bge-small-en-v1.5)
 * Can also serve as general-purpose LLM fallback via serverless inference.
 */

import fetch from "node-fetch";

const BASE_URL = "https://api-inference.huggingface.co/models";

const client = (apiKey) => {
  const key = apiKey || process.env.HUGGINGFACE_API_KEY;
  if (!key) throw new Error("HuggingFace: no API key. Add yours in the settings panel (⚙).");
  return key;
};

// ─── Embeddings ───────────────────────────────────────
async function embed({ text, model = "BAAI/bge-small-en-v1.5", apiKey: keyOverride }) {
  const apiKey = client(keyOverride);
  const res = await fetch(`${BASE_URL}/${model}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ inputs: text })
  });

  if (!res.ok) {
    // Model may be loading; HF returns 503 when cold-starting
    if (res.status === 503) throw new Error("HuggingFace: model loading, retry in 20s");
    const err = await res.text();
    throw new Error(`HuggingFace API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  // HF returns array of arrays for batch or flat array for single
  return Array.isArray(data[0]) ? data[0] : data;
}

// ─── Chat (text-generation models) ───────────────────
async function chat({ model = "meta-llama/Llama-3.1-8B-Instruct", messages, systemPrompt, apiKey: keyOverride }) {
  const apiKey = client(keyOverride);
  const msgs = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  const res = await fetch(`${BASE_URL}/${model}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model, messages: msgs, max_tokens: 1024 })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HuggingFace chat error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export const huggingfaceEmbedding = {
  name: "huggingface:BAAI/bge-small-en-v1.5",
  local: false,
  requires_card: false,
  capabilities: {
    chat: false, code: false, code_review: false, reasoning: false,
    vision: false, tool_use: false, summarization: false,
    embedding: true, voice_reply_fast: false, long_context: false
  },
  context_window: 512,
  typical_latency_ms: 800,
  cost_per_million_input_usd: 0.0,
  chat: null,
  embed: (opts) => embed({ ...opts, model: "BAAI/bge-small-en-v1.5" })
};

export const huggingfaceLlama = {
  name: "huggingface:llama-3.1-8b",
  local: false,
  requires_card: false,
  capabilities: {
    chat: true, code: true, code_review: false, reasoning: false,
    vision: false, tool_use: false, summarization: true,
    embedding: false, voice_reply_fast: false, long_context: false
  },
  context_window: 128_000,
  typical_latency_ms: 2000,
  cost_per_million_input_usd: 0.0,
  chat: (opts) => chat({ ...opts, model: "meta-llama/Llama-3.1-8B-Instruct" }),
  embed: null
};

export default [huggingfaceEmbedding, huggingfaceLlama];
