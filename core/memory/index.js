/**
 * M.AI0.1 Memory — 3-tier system
 *
 * Tier 1: Active session (in-process Map, clears on restart)
 * Tier 2: Project knowledge (loaded from config/ and projects/ at boot)
 * Tier 3: Long-term (persisted to data/memory/ as JSON, retrieved by embedding similarity)
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { llm } from "../llm/router.js";
import pino from "pino";
import { v4 as uuidv4 } from "uuid";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logger = pino({ name: "memory" });

const MEMORY_DIR = join(__dirname, "../../data/memory");
const MAX_TIER3_TOKENS = parseInt(process.env.MEMORY_TIER3_MAX_TOKENS ?? "8000");

// ─── Tier 1: Session ──────────────────────────────────
const sessionMemory = new Map();

// ─── Tier 3: Long-term persistence ───────────────────
function ensureMemoryDir() {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
}

async function store(content, { key, tags = [] } = {}) {
  ensureMemoryDir();
  const id = key ?? uuidv4();
  const entry = {
    id,
    content,
    tags,
    createdAt: new Date().toISOString(),
    embedding: null
  };

  // Generate embedding for retrieval
  try {
    const { result } = await llm.embed({ text: content });
    entry.embedding = result;
  } catch {
    logger.warn({ id }, "Could not generate embedding — memory stored without vector");
  }

  const filePath = join(MEMORY_DIR, `${id}.json`);
  writeFileSync(filePath, JSON.stringify(entry, null, 2));
  logger.debug({ id, tags }, "Memory stored");
  return id;
}

async function retrieve(query, topK = 3) {
  ensureMemoryDir();
  const files = readdirSync(MEMORY_DIR).filter(f => f.endsWith(".json"));
  if (files.length === 0) return [];

  let queryEmbedding = null;
  try {
    const { result } = await llm.embed({ text: query });
    queryEmbedding = result;
  } catch {
    // Fall back to keyword search
    return keywordSearch(query, files, topK);
  }

  const scored = files.map(f => {
    try {
      const entry = JSON.parse(readFileSync(join(MEMORY_DIR, f), "utf8"));
      if (!entry.embedding) return { entry, score: 0 };
      const score = cosineSimilarity(queryEmbedding, entry.embedding);
      return { entry, score };
    } catch {
      return null;
    }
  }).filter(Boolean);

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => s.entry);
}

function keywordSearch(query, files, topK) {
  const words = query.toLowerCase().split(/\s+/);
  return files
    .map(f => {
      try {
        const entry = JSON.parse(readFileSync(join(MEMORY_DIR, f), "utf8"));
        const hits = words.filter(w => entry.content.toLowerCase().includes(w)).length;
        return { entry, hits };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, topK)
    .map(s => s.entry);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return normA && normB ? dot / (normA * normB) : 0;
}

async function forget(id) {
  const { unlinkSync } = await import("fs");
  const filePath = join(MEMORY_DIR, `${id}.json`);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
    logger.debug({ id }, "Memory deleted");
    return true;
  }
  return false;
}

function listAll() {
  ensureMemoryDir();
  return readdirSync(MEMORY_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      try {
        const entry = JSON.parse(readFileSync(join(MEMORY_DIR, f), "utf8"));
        return { id: entry.id, content: entry.content.slice(0, 80), tags: entry.tags, createdAt: entry.createdAt };
      } catch { return null; }
    })
    .filter(Boolean);
}

export const memoryStore = { store, retrieve, forget, listAll, session: sessionMemory };
export default memoryStore;
