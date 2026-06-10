/**
 * Groq provider — free tier, no credit card required
 * Sign up: https://console.groq.com
 *
 * Also provides Whisper-large-v3-turbo for STT (free, fast).
 *
 * Models available on free tier (informational):
 *   llama-3.3-70b-versatile, llama-3.1-8b-instant,
 *   qwen-2.5-coder-32b, gemma2-9b-it,
 *   whisper-large-v3-turbo (STT)
 */

import Groq from "groq-sdk";
import { createReadStream } from "fs";

const client = (apiKey) => {
  const key = apiKey || process.env.GROQ_API_KEY;
  if (!key) throw new Error("Groq: no API key. Add yours in the settings panel (⚙).");
  return new Groq({ apiKey: key });
};

const MODELS = {
  "groq:llama-3.3-70b-versatile": {
    id: "llama-3.3-70b-versatile",
    capabilities: {
      chat: true, code: true, code_review: true, reasoning: true,
      vision: false, tool_use: true, summarization: true,
      embedding: false, voice_reply_fast: false, long_context: false
    },
    context_window: 128_000,
    typical_latency_ms: 600,
    cost_per_million_input_usd: 0.0,
    requires_card: false
  },
  "groq:llama-3.1-8b-instant": {
    id: "llama-3.1-8b-instant",
    capabilities: {
      chat: true, code: true, code_review: false, reasoning: false,
      vision: false, tool_use: true, summarization: true,
      embedding: false, voice_reply_fast: true, long_context: false
    },
    context_window: 128_000,
    typical_latency_ms: 200,
    cost_per_million_input_usd: 0.0,
    requires_card: false
  },
  "groq:qwen-2.5-coder-32b": {
    id: "qwen-2.5-coder-32b-instruct",
    capabilities: {
      chat: true, code: true, code_review: true, reasoning: true,
      vision: false, tool_use: true, summarization: false,
      embedding: false, voice_reply_fast: false, long_context: false
    },
    context_window: 128_000,
    typical_latency_ms: 800,
    cost_per_million_input_usd: 0.0,
    requires_card: false
  },
  "groq:whisper-large-v3-turbo": {
    id: "whisper-large-v3-turbo",
    capabilities: {
      chat: false, code: false, code_review: false, reasoning: false,
      vision: false, tool_use: false, summarization: false,
      embedding: false, voice_reply_fast: false, long_context: false,
      transcription: true
    },
    typical_latency_ms: 500,
    cost_per_million_input_usd: 0.0,
    requires_card: false
  }
};

// ─── Chat ─────────────────────────────────────────────
// Note: tools are intentionally NOT forwarded to Groq.
// Groq's strict JSON Schema validator rejects the Palawan tool parameter schemas,
// and Groq can't execute tools anyway — only the orchestrator can.
async function chat({ model: modelKey, messages, stream = false, systemPrompt, apiKey }) {
  const modelDef = MODELS[modelKey];
  if (!modelDef) throw new Error(`Groq: unknown model ${modelKey}`);

  const groq = client(apiKey);
  const msgs = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  if (stream) {
    return groq.chat.completions.create({
      model: modelDef.id,
      messages: msgs,
      stream: true
    });
  } else {
    const res = await groq.chat.completions.create({
      model: modelDef.id,
      messages: msgs
    });
    return res.choices[0]?.message?.content ?? "";
  }
}

// ─── Transcription (Whisper) ──────────────────────────
async function transcribe({ audioPath, audioBuffer, mimeType = "audio/webm", apiKey }) {
  const groq = client(apiKey);

  let file;
  if (audioPath) {
    file = createReadStream(audioPath);
  } else if (audioBuffer) {
    // Create a File-like object from buffer
    const blob = new Blob([audioBuffer], { type: mimeType });
    file = new File([blob], "audio.webm", { type: mimeType });
  } else {
    throw new Error("Groq transcribe: provide audioPath or audioBuffer");
  }

  const transcription = await groq.audio.transcriptions.create({
    file,
    model: "whisper-large-v3-turbo",
    response_format: "text"
  });

  return transcription;
}

// ─── Exports ──────────────────────────────────────────
const makeProvider = (key) => ({
  name: key,
  local: false,
  requires_card: false,
  ...MODELS[key],
  chat: (opts) => chat({ ...opts, model: key }),
  embed: null,
  transcribe: key === "groq:whisper-large-v3-turbo" ? transcribe : null
});

export const groqLlama70b    = makeProvider("groq:llama-3.3-70b-versatile");
export const groqLlama8b     = makeProvider("groq:llama-3.1-8b-instant");
export const groqQwenCoder   = makeProvider("groq:qwen-2.5-coder-32b");
export const groqWhisper     = { ...makeProvider("groq:whisper-large-v3-turbo"), chat: null, transcribe };

export default [groqLlama70b, groqLlama8b, groqQwenCoder, groqWhisper];
