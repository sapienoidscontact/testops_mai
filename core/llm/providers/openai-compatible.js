/**
 * Generic OpenAI-compatible provider
 *
 * Drop-in for ANY provider exposing an OpenAI-compatible chat completions API.
 * Used for: future providers, self-hosted endpoints, etc.
 *
 * Usage — add to routing.json:
 *   "my-provider:model-name": { endpoint_url, api_key_env, model_id }
 *
 * Then instantiate: createOpenAICompatibleProvider({ name, endpointUrl, apiKeyEnv, modelId, capabilities })
 */

import fetch from "node-fetch";

export function createOpenAICompatibleProvider({
  name,
  endpointUrl,
  apiKeyEnv,
  modelId,
  capabilities = {},
  contextWindow = 8192,
  typicalLatencyMs = 1000,
  requiresCard = false
}) {
  const DEFAULT_CAPS = {
    chat: true, code: true, code_review: false, reasoning: false,
    vision: false, tool_use: false, summarization: true,
    embedding: false, voice_reply_fast: false, long_context: false
  };

  // Note: tools intentionally NOT forwarded — only Gemini handles tool execution.
  async function chat({ messages, stream = false, systemPrompt }) {
    const apiKey = apiKeyEnv ? process.env[apiKeyEnv] : null;
    const msgs = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages;

    const body = {
      model: modelId,
      messages: msgs,
      stream
    };

    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const res = await fetch(`${endpointUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${name} API error ${res.status}: ${err}`);
    }

    if (stream) return res.body;

    const data = await res.json();
    return data.choices[0]?.message?.content ?? "";
  }

  return {
    name,
    local: !apiKeyEnv || endpointUrl.includes("localhost") || endpointUrl.includes("127.0.0.1"),
    requires_card: requiresCard,
    capabilities: { ...DEFAULT_CAPS, ...capabilities },
    context_window: contextWindow,
    typical_latency_ms: typicalLatencyMs,
    cost_per_million_input_usd: 0.0,
    cost_per_million_output_usd: 0.0,
    chat,
    embed: null
  };
}

export default createOpenAICompatibleProvider;
