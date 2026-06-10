/**
 * Provider health tracker
 *
 * Tracks per-provider: success rate, latency, failure streak, call count.
 * Marks providers "degraded" after N consecutive failures.
 * Schedules recovery probes every 5 min on degraded providers.
 *
 * NEVER blocks a call. Only reorders router preference.
 * Cost data is stored informational only — never enforced.
 */

import Redis from "ioredis";
import pino from "pino";

const logger = pino({ name: "provider-health" });
const FAILURE_THRESHOLD = 3;
const RECOVERY_INTERVAL_MS = 5 * 60 * 1000; // 5 min

let redis = null;
let _redisLastFailed = 0;
const REDIS_RETRY_MS = 30_000; // don't hammer Redis — retry at most every 30s
const inMemoryFallback = new Map(); // used when Redis is unavailable

function getKey(provider, suffix) {
  return `mai01:health:${provider}:${suffix}`;
}

function getRedis() {
  if (redis) return redis;
  // Cooldown: don't create a new connection if we just failed recently
  if (Date.now() - _redisLastFailed < REDIS_RETRY_MS) return null;
  try {
    redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      maxRetriesPerRequest: 0
    });
    redis.on("error", (err) => {
      if (!_redisLastFailed || Date.now() - _redisLastFailed > REDIS_RETRY_MS) {
        logger.warn({ err: err.message }, "Redis unavailable — health using in-memory");
      }
      _redisLastFailed = Date.now();
      redis = null;
    });
    return redis;
  } catch {
    _redisLastFailed = Date.now();
    return null;
  }
}

// ─── Core operations ──────────────────────────────────

async function recordSuccess(provider, latencyMs) {
  const r = getRedis();
  const today = new Date().toISOString().slice(0, 10);

  const data = {
    lastSuccess: Date.now(),
    lastLatencyMs: latencyMs,
    failureStreak: 0,
    degraded: false
  };

  if (r) {
    const pipe = r.pipeline();
    pipe.hset(getKey(provider, "status"), data);
    pipe.incr(getKey(provider, `calls:${today}`));
    pipe.expire(getKey(provider, `calls:${today}`), 86400 * 7);
    // Track latency in sorted set for percentile calc
    pipe.zadd(getKey(provider, "latency"), Date.now(), latencyMs.toString());
    pipe.zremrangebyrank(getKey(provider, "latency"), 0, -101); // keep last 100
    await pipe.exec();
  } else {
    inMemoryFallback.set(provider, { ...getInMemory(provider), ...data });
  }
}

async function recordFailure(provider, errorMessage) {
  const r = getRedis();
  const current = await get(provider);
  const newStreak = (current?.failureStreak ?? 0) + 1;
  const degraded = newStreak >= FAILURE_THRESHOLD;

  if (degraded && !current?.degraded) {
    logger.warn({ provider, streak: newStreak }, "Provider marked degraded");
    scheduleRecoveryProbe(provider);
  }

  const data = {
    lastFailure: Date.now(),
    lastError: errorMessage?.slice(0, 200),
    failureStreak: newStreak,
    degraded
  };

  if (r) {
    await r.hset(getKey(provider, "status"), data);
  } else {
    inMemoryFallback.set(provider, { ...getInMemory(provider), ...data });
  }
}

async function get(provider) {
  const r = getRedis();
  if (r) {
    const data = await r.hgetall(getKey(provider, "status"));
    if (!data || Object.keys(data).length === 0) return null;
    return {
      ...data,
      failureStreak: parseInt(data.failureStreak ?? 0),
      degraded: data.degraded === "true"
    };
  }
  return getInMemory(provider);
}

async function getAll() {
  const r = getRedis();
  if (!r) return Object.fromEntries(inMemoryFallback);

  // Scan for all health keys
  const keys = await r.keys("mai01:health:*:status");
  const result = {};
  for (const key of keys) {
    const provider = key.split(":")[2];
    result[provider] = await get(provider);
  }
  return result;
}

async function dashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const all = await getAll();
  const r = getRedis();

  const rows = await Promise.all(Object.entries(all).map(async ([provider, status]) => {
    let todayCalls = 0;
    if (r) {
      todayCalls = parseInt(await r.get(getKey(provider, `calls:${today}`)) ?? 0);
    }
    return {
      provider,
      status: status?.degraded ? "🔴 degraded" : "🟢 healthy",
      lastLatencyMs: status?.lastLatencyMs ?? "—",
      failureStreak: status?.failureStreak ?? 0,
      lastError: status?.lastError ?? "—",
      todayCalls
    };
  }));

  return rows;
}

// ─── Recovery probe ───────────────────────────────────

const recoveryTimers = new Map();

function scheduleRecoveryProbe(provider) {
  if (recoveryTimers.has(provider)) return; // already scheduled

  const timer = setInterval(async () => {
    logger.info({ provider }, "Running recovery probe");
    try {
      const { loadProviders } = await import("./router.js");
      const registry = await loadProviders();
      const p = registry.get(provider);
      if (!p?.chat) return;

      await p.chat({ messages: [{ role: "user", content: "ping" }] });

      // Success — restore
      const r = getRedis();
      const data = { degraded: false, failureStreak: 0 };
      if (r) await r.hset(getKey(provider, "status"), data);
      else inMemoryFallback.set(provider, { ...getInMemory(provider), ...data });

      logger.info({ provider }, "Provider recovered — restored to rotation");
      clearInterval(timer);
      recoveryTimers.delete(provider);
    } catch (err) {
      logger.debug({ provider, err: err.message }, "Recovery probe failed, will retry");
    }
  }, RECOVERY_INTERVAL_MS);

  recoveryTimers.set(provider, timer);
}

// ─── In-memory fallback helpers ───────────────────────

function getInMemory(provider) {
  return inMemoryFallback.get(provider) ?? {
    failureStreak: 0,
    degraded: false,
    todayCalls: 0
  };
}

// ─── Reset ────────────────────────────────────────────

/**
 * reset(provider?) — clear degraded status.
 * Pass a provider name to reset one, or omit to reset all.
 * Clears in-memory fallback and Redis (if available).
 */
async function reset(provider) {
  const clearData = { failureStreak: 0, degraded: false, lastError: "" };

  if (provider) {
    // Clear one provider
    if (recoveryTimers.has(provider)) {
      clearInterval(recoveryTimers.get(provider));
      recoveryTimers.delete(provider);
    }
    inMemoryFallback.set(provider, { ...getInMemory(provider), ...clearData });
    try {
      const r = getRedis();
      if (r) await r.hset(getKey(provider, "status"), clearData);
    } catch { /* Redis unavailable — in-memory already cleared */ }
    logger.info({ provider }, "Health reset (manual)");
  } else {
    // Clear all
    for (const [p, timer] of recoveryTimers) {
      clearInterval(timer);
      recoveryTimers.delete(p);
    }
    for (const p of inMemoryFallback.keys()) {
      inMemoryFallback.set(p, { ...getInMemory(p), ...clearData });
    }
    try {
      const r = getRedis();
      if (r) {
        const keys = await r.keys("mai01:health:*:status");
        for (const key of keys) await r.hset(key, clearData);
      }
    } catch { /* Redis unavailable — in-memory already cleared */ }
    logger.info("All provider health reset (manual)");
  }
}

export const health = { recordSuccess, recordFailure, get, getAll, dashboard, reset };
export default health;
