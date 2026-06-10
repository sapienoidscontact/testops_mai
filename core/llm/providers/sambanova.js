/**
 * SambaNova provider — free tier, no credit card required
 * Sign up: https://cloud.sambanova.ai
 *
 * OpenAI-compatible API. Fast inference on SambaNova RDU hardware.
 * Free tier: Meta-Llama-3.3-70B-Instruct, DeepSeek-R1, others.
 */

import fetch from "node-fetch";

const BASE_URL = "https://api.sambanova.ai/v1";

const client = (apiKey) => {
  const key = apiKey || process.env.SAMBANOVA_API_KEY;
  if (!key) throw new Error("SambaNova: no API key. Add yours in the settings panel (⚙).");
  return key;
};

const MODELS = {
  "sambanova:Meta-Llama-3.3-70B-Instruct": {
    id: "Meta-Llama-3.3-70B-Instruct",
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
  "sambanova:DeepSeek-R1": {
    id: "DeepSeek-R1",
    capabilities: {
      chat: true, code: true, code_review: true, reasoning: true,
      vision: false, tool_use: false, summarization: true,
      embedding: false, voice_reply_fast: false, long_context: false
    },
    context_window: 32_768,
    typical_latency_ms: 2000,
    cost_per_million_input_usd: 0.0,
    requires_card: false
  }
};

// Note: tools are intentionally NOT forwarded to SambaNova.
// SambaNova can't execute the Palawan tools — only the orchestrator can.
async function chat({ model: modelKey, messages, stream = false, systemPrompt, apiKey: keyOverride }) {
  const modelDef = MODELS[modelKey];
  if (!modelDef) throw new Error(`SambaNova: unknown model ${modelKey}`);

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
    throw new Error(`SambaNova API error ${res.status}: ${err}`);
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

export const sanbanovaLlama70b   = makeProvider("sambanova:Meta-Llama-3.3-70B-Instruct");
export const sambanovaDeepSeekR1 = makeProvider("sambanova:DeepSeek-R1");

export default [sanbanovaLlama70b, sambanovaDeepSeekR1];
