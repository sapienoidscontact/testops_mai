/**
 * M.AI0.1 Orchestrator
 *
 * BYOK model: API keys come from request headers, not .env.
 * .env keys are optional fallbacks (for running your own private instance).
 * Server never stores user-provided keys — read from header, used for that request, discarded.
 *
 * Key headers: x-gemini-key, x-groq-key, x-cerebras-key, x-sambanova-key, x-huggingface-key
 */

import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import cors from "cors";
import helmet from "helmet";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pino from "pino";
import { createRouter } from "../llm/router.js";
import { health } from "../llm/provider-health.js";
import { memoryStore } from "../memory/index.js";
import { skillExecutor } from "../executor/index.js";
import { prepareSpeech } from "../voice/tts.js";
import { buildProjectContext } from "../knowledge/project-loader.js";
import { loadGithubRepos } from "../knowledge/github-loader.js";
import * as palawanTools from "../tools/palawan-creator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logger = pino({
  name: "orchestrator",
  ...(process.env.NODE_ENV !== "production" && { transport: { target: "pino-pretty" } })
});

const PORT = parseInt(process.env.PORT ?? "3001");
const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

// ─── Runtime brain ────────────────────────────────────
const BASE_SYSTEM_PROMPT = readFileSync(
  join(__dirname, "../runtime/system-prompt.md"),
  "utf8"
);

// Start with local project knowledge; upgrade with GitHub context async
let SYSTEM_PROMPT = BASE_SYSTEM_PROMPT + buildProjectContext();

// Load GitHub repos non-blocking — ready within a few seconds of cold start
loadGithubRepos()
  .then(githubContext => {
    if (githubContext) {
      SYSTEM_PROMPT = BASE_SYSTEM_PROMPT + buildProjectContext() + githubContext;
      logger.info("GitHub repo context loaded into system prompt");
    }
  })
  .catch(err => logger.warn({ err: err.message }, "GitHub context load failed"));

// ─── Middleware ───────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? [process.env.PUBLIC_URL, "https://spaienoids.com"]
    : true,
  credentials: true,
  exposedHeaders: ["x-provider-used"]
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.raw({ type: "audio/*", limit: "25mb" }));

// ─── Extract user keys from headers ──────────────────
function extractUserKeys(req) {
  return {
    gemini:       req.headers["x-gemini-key"]      || null,
    groq:         req.headers["x-groq-key"]         || null,
    cerebras:     req.headers["x-cerebras-key"]     || null,
    sambanova:    req.headers["x-sambanova-key"]    || null,
    huggingface:  req.headers["x-huggingface-key"]  || null,
    openrouter:   req.headers["x-openrouter-key"]   || null,
    cloudflare_account: req.headers["x-cloudflare-account"] || null,
    cloudflare_token:   req.headers["x-cloudflare-token"]   || null
  };
}

// ─── Health ───────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "0.1.3", ts: new Date().toISOString() });
});

// ─── Provider status ──────────────────────────────────
app.get("/api/status", async (_req, res) => {
  const providers = await health.dashboard();
  res.json({ providers, ts: new Date().toISOString() });
});

// ─── Health reset (clears degraded state) ────────────
// POST /api/reset-health          → reset all providers
// POST /api/reset-health/:provider → reset one provider
app.post("/api/reset-health", async (req, res) => {
  await health.reset();
  res.json({ ok: true, message: "All provider health states cleared." });
});
app.post("/api/reset-health/:provider", async (req, res) => {
  const p = decodeURIComponent(req.params.provider);
  await health.reset(p);
  res.json({ ok: true, message: `Health cleared for ${p}.` });
});

// ─── Chat ─────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { messages: rawMessages, task = "chat", stream = false } = req.body;
  if (!rawMessages?.length) return res.status(400).json({ error: "messages[] required" });

  // Strip frontend-only props (error, isPrompt, id, time…) — LLMs only accept role+content
  const messages = rawMessages
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({ role: m.role, content: String(m.content ?? "") }));

  const userKeys = extractUserKeys(req);
  const router   = createRouter(userKeys);

  // Check at least one key is available
  if (!router.hasAnyKey()) {
    return res.status(401).json({
      error: "no_keys",
      user_message: "No API keys provided. Add your free keys in the settings panel (⚙)."
    });
  }

  // Attach relevant memory
  const lastText = messages[messages.length - 1]?.content ?? "";
  const memories = await memoryStore.retrieve(lastText, 3).catch(() => []);
  const systemPrompt = memories.length
    ? `${SYSTEM_PROMPT}\n\n---\n## Recalled context\n${memories.map(m => `- ${m.content}`).join("\n")}`
    : SYSTEM_PROMPT;

  try {
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const { result, provider } = await router.route({
        task,
        payload: { messages, systemPrompt, stream: true }
      });
      res.write(`data: ${JSON.stringify({ provider })}\n\n`);

      for await (const chunk of result) {
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text
          ?? chunk.choices?.[0]?.delta?.content ?? "";
        if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    const { result, provider, latency } = await router.route({
      task,
      payload: {
        messages,
        systemPrompt,
        tools:        palawanTools.definitions,
        toolExecutor: palawanTools.execute,
      }
    });

    res.setHeader("x-provider-used", provider);
    res.json({ reply: result, provider, latency });

  } catch (err) {
    logger.error({ err: err.message }, "Chat error");
    res.status(503).json({
      error: err.message,
      user_message: "All providers are unreachable right now. Want to retry?"
    });
  }
});

// ─── Transcription ────────────────────────────────────
app.post("/api/transcribe", async (req, res) => {
  const userKeys = extractUserKeys(req);
  const router   = createRouter(userKeys);

  if (!userKeys.groq && !process.env.GROQ_API_KEY) {
    return res.status(401).json({
      error: "no_groq_key",
      user_message: "Groq key needed for voice transcription. Add it in settings (⚙)."
    });
  }

  try {
    const audioBuffer = req.body;
    const mimeType    = req.headers["content-type"] ?? "audio/webm";
    const { result }  = await router.route({
      task:    "transcription",
      payload: { audioBuffer, mimeType }
    });
    res.json({ transcript: typeof result === "string" ? result.trim() : result?.text?.trim() ?? "" });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// ─── Skills ───────────────────────────────────────────
app.post("/api/skills/:projectId/:skillId", async (req, res) => {
  const { projectId, skillId } = req.params;
  const { args = {} } = req.body;
  try {
    const result = await skillExecutor.run({ projectId, skillId, args });
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Projects list ────────────────────────────────────
app.get("/api/projects", (_req, res) => {
  try {
    const cfg = JSON.parse(readFileSync(join(__dirname, "../../config/projects.json"), "utf8"));
    res.json(cfg);
  } catch {
    res.json({ projects: [] });
  }
});

// ─── Memory ───────────────────────────────────────────
app.post("/api/memory", async (req, res) => {
  const { content, tags = [] } = req.body;
  if (!content) return res.status(400).json({ error: "content required" });
  const userKeys = extractUserKeys(req);
  const router   = createRouter(userKeys);
  // Pass router to memory store so it can use user's embedding key
  const id = await memoryStore.store(content, { tags, router });
  res.json({ id });
});

// ─── WebSocket (voice + streaming) ───────────────────
wss.on("connection", (ws, req) => {
  logger.info("WS client connected");

  // Extract keys from initial WS headers
  const userKeys = extractUserKeys(req);

  ws.on("message", async (data) => {
    try {
      const msg    = JSON.parse(data.toString());
      const router = createRouter(userKeys);

      if (msg.type === "keys") {
        // Client can send keys as a WS message after connect
        Object.assign(userKeys, msg.keys ?? {});
        ws.send(JSON.stringify({ type: "ack", text: "Keys updated for this session." }));
        return;
      }

      if (msg.type === "audio") {
        if (!userKeys.groq && !process.env.GROQ_API_KEY) {
          ws.send(JSON.stringify({ type: "error", message: "Groq key needed for voice." }));
          return;
        }
        const buf = Buffer.from(msg.data, "base64");
        const { result: transcript } = await router.route({
          task: "transcription",
          payload: { audioBuffer: buf, mimeType: msg.mimeType ?? "audio/webm" }
        });
        ws.send(JSON.stringify({ type: "transcript", text: transcript }));

        const { result, provider } = await router.route({
          task: "voice_reply_fast",
          payload: { messages: [{ role: "user", content: transcript }], systemPrompt: SYSTEM_PROMPT }
        });
        ws.send(JSON.stringify({
          type:     "reply",
          text:     result,
          provider,
          tts:      prepareSpeech({ text: result })
        }));
      }

      if (msg.type === "chat") {
        const { result, provider } = await router.route({
          task: "chat",
          payload: {
            messages:     msg.messages ?? [{ role: "user", content: msg.text }],
            systemPrompt: SYSTEM_PROMPT
          }
        });
        ws.send(JSON.stringify({ type: "reply", text: result, provider }));
      }

    } catch (err) {
      ws.send(JSON.stringify({ type: "error", message: err.message }));
    }
  });

  ws.on("close", () => logger.info("WS client disconnected"));
});

// ─── Start ────────────────────────────────────────────
httpServer.listen(PORT, () => {
  logger.info(`M.AI0.1 listening on :${PORT}`);
  logger.info("BYOK mode: keys come from request headers, not server .env");
});

export default app;
