/**
 * Gemini provider — Google AI Studio free tier
 * No credit card required. Sign up: https://aistudio.google.com/apikey
 *
 * Free tier (informational only — never enforced):
 *   Gemini 3.5 Flash:      check aistudio.google.com/models for current limits
 *   Gemini 2.5 Pro:        50 req/day, 5 RPM
 *   Gemini 2.5 Flash:      1500 req/day, 15 RPM
 *   Embedding 004:         1500 req/day
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const client = (apiKey) => {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini: no API key. Add yours in the settings panel (⚙).");
  return new GoogleGenerativeAI(key);
};

// ─── Capability matrix ────────────────────────────────
const BASE_CAPS = {
  chat: true, code: true, code_review: true, reasoning: true,
  vision: true, tool_use: true, summarization: true,
  embedding: false, voice_reply_fast: false, long_context: true
};

const MODELS = {
  "gemini-3.5-flash": {
    id: "gemini-3.5-flash",
    capabilities: { ...BASE_CAPS, voice_reply_fast: true, embedding: false },
    context_window: 1_000_000,
    typical_latency_ms: 600,
    cost_per_million_input_usd: 0.0,
    cost_per_million_output_usd: 0.0,
    requires_card: false
  },
  "gemini-2.5-flash": {
    id: "gemini-2.5-flash",
    capabilities: { ...BASE_CAPS, voice_reply_fast: true, embedding: false },
    context_window: 1_000_000,
    typical_latency_ms: 800,
    cost_per_million_input_usd: 0.0,
    cost_per_million_output_usd: 0.0,
    requires_card: false
  },
  "gemini-2.5-flash-lite": {
    id: "gemini-2.5-flash-lite-preview-06-17",
    capabilities: { ...BASE_CAPS, voice_reply_fast: true, code_review: false },
    context_window: 1_000_000,
    typical_latency_ms: 400,
    cost_per_million_input_usd: 0.0,
    cost_per_million_output_usd: 0.0,
    requires_card: false
  },
  "gemini-2.5-pro": {
    id: "gemini-2.5-pro",
    capabilities: { ...BASE_CAPS, voice_reply_fast: false, reasoning: true },
    context_window: 1_000_000,
    typical_latency_ms: 3000,
    cost_per_million_input_usd: 0.0,
    cost_per_million_output_usd: 0.0,
    requires_card: false
  },
  "gemini-embedding-004": {
    id: "text-embedding-004",
    capabilities: {
      chat: false, code: false, code_review: false, reasoning: false,
      vision: false, tool_use: false, summarization: false,
      embedding: true, voice_reply_fast: false, long_context: false
    },
    context_window: 2048,
    typical_latency_ms: 300,
    cost_per_million_input_usd: 0.0,
    cost_per_million_output_usd: 0.0,
    requires_card: false
  }
};

// ─── Chat ─────────────────────────────────────────────
async function chat({ model: modelKey = "gemini-2.5-flash", messages, tools, stream = false, systemPrompt, apiKey, toolExecutor }) {
  const modelDef = MODELS[modelKey] ?? MODELS["gemini-2.5-flash"];
  const genAI = client(apiKey);

  // Build tools config if tool definitions are provided
  const geminiTools = tools?.length ? [{ functionDeclarations: tools }] : undefined;

  const model = genAI.getGenerativeModel({
    model:             modelDef.id,
    systemInstruction: systemPrompt,
    ...(geminiTools && { tools: geminiTools }),
    ...(geminiTools && { toolConfig: { functionCallingConfig: { mode: "AUTO" } } }),
  });

  // Convert messages to Gemini format
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));
  const lastMessage = messages[messages.length - 1];

  const session = model.startChat({ history });

  // ── Streaming (no tool loop) ───────────────────────
  if (stream) {
    const result = await session.sendMessageStream(lastMessage.content);
    return result.stream;
  }

  // ── Non-streaming with agentic tool loop ──────────
  let result   = await session.sendMessage(lastMessage.content);
  let response = result.response;

  // Up to 8 rounds to prevent runaway
  let rounds = 0;
  while (toolExecutor && rounds < 8) {
    const calls = response.functionCalls?.() ?? [];
    if (!calls.length) break;
    rounds++;

    let needsInput = false;
    const toolParts = await Promise.all(
      calls.map(async (fc) => {
        let toolResult;
        try {
          toolResult = await toolExecutor(fc.name, fc.args ?? {});
          // If the tool signals it needs user input, stop the loop after this round
          if (toolResult?.needs_input) needsInput = true;
        } catch (err) {
          toolResult = { error: err.message };
        }
        return { functionResponse: { name: fc.name, response: toolResult } };
      })
    );

    result   = await session.sendMessage(toolParts);
    response = result.response;
    // Break out of the tool loop so Gemini's question reaches the user immediately
    if (needsInput) break;
  }

  return response.text();
}

// ─── Embed ────────────────────────────────────────────
async function embed({ text, apiKey }) {
  const genAI = client(apiKey);
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

// ─── Export per model ─────────────────────────────────
export const gemini35Flash = {
  name: "gemini-3.5-flash",
  local: false,
  requires_card: false,
  ...MODELS["gemini-3.5-flash"],
  chat: (opts) => chat({ ...opts, model: "gemini-3.5-flash" }),
  embed: null
};

export const geminiFlash = {
  name: "gemini-2.5-flash",
  local: false,
  requires_card: false,
  ...MODELS["gemini-2.5-flash"],
  chat: (opts) => chat({ ...opts, model: "gemini-2.5-flash" }),
  embed: null
};

export const geminiFlashLite = {
  name: "gemini-2.5-flash-lite",
  local: false,
  requires_card: false,
  ...MODELS["gemini-2.5-flash-lite"],
  chat: (opts) => chat({ ...opts, model: "gemini-2.5-flash-lite" }),
  embed: null
};

export const geminiPro = {
  name: "gemini-2.5-pro",
  local: false,
  requires_card: false,
  ...MODELS["gemini-2.5-pro"],
  chat: (opts) => chat({ ...opts, model: "gemini-2.5-pro" }),
  embed: null
};

export const geminiEmbedding = {
  name: "gemini-embedding-004",
  local: false,
  requires_card: false,
  ...MODELS["gemini-embedding-004"],
  chat: null,
  embed
};

export default [gemini35Flash, geminiFlash, geminiFlashLite, geminiPro, geminiEmbedding];
