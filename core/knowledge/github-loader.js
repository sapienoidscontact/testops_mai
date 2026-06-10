/**
 * GitHub repository loader
 * Fetches all repos for GITHUB_USERNAME at cold start and injects
 * them into the system prompt so M.AI can answer detailed questions
 * about any project without any manual registration.
 *
 * Env vars:
 *   GITHUB_USERNAME — GitHub username or org  (required to activate)
 *   GITHUB_TOKEN    — Personal access token   (optional; enables private
 *                     repos and raises rate limit from 60 → 5000 req/hr)
 *
 * Cost: $0 — GitHub REST API is free. Node.js 22 native fetch, no deps.
 */

import pino from "pino";

const logger = pino({ name: "github-loader" });

const MAX_README_CHARS = 2000; // per repo — enough for full intro
const MAX_REPOS        = 50;   // hard cap so prompt doesn't explode

let _cache    = null;
let _cacheTs  = 0;
const CACHE_TTL = 60 * 60 * 1000; // re-fetch once per hour on long-running instances

// ─── Helpers ──────────────────────────────────────────

function authHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function ghFetch(url, token) {
  const res = await fetch(url, {
    headers: {
      Accept:     "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "MAI-assistant/0.1",
      ...authHeader(token),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} — ${url}`);
  return res.json();
}

async function fetchReadme(owner, repo, token) {
  try {
    const data = await ghFetch(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      token
    );
    const text = Buffer.from(data.content, "base64").toString("utf8");
    const trimmed = text.slice(0, MAX_README_CHARS);
    return trimmed.length < text.length ? trimmed + "\n…(truncated)" : trimmed;
  } catch {
    return null; // repo has no README — fine
  }
}

// Fetch in batches to avoid hammering rate limit
async function batchFetch(items, fn, batchSize = 8) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = await Promise.all(items.slice(i, i + batchSize).map(fn));
    results.push(...batch);
  }
  return results;
}

// ─── Main export ──────────────────────────────────────

/**
 * Returns a formatted context string for all repos.
 * Result is cached for 1 hour so repeated calls within a session
 * don't hit the API again.
 */
export async function loadGithubRepos() {
  const username = process.env.GITHUB_USERNAME;
  if (!username) return "";

  if (_cache && Date.now() - _cacheTs < CACHE_TTL) return _cache;

  const token = process.env.GITHUB_TOKEN ?? null;

  try {
    logger.info({ username }, "Fetching GitHub repos");

    const repos = await ghFetch(
      `https://api.github.com/users/${username}/repos?sort=updated&per_page=${MAX_REPOS}&type=all`,
      token
    );

    if (!Array.isArray(repos) || repos.length === 0) {
      logger.warn({ username }, "No repos found");
      return "";
    }

    // Fetch READMEs in parallel batches
    const readmes = await batchFetch(
      repos,
      (r) => fetchReadme(username, r.name, token)
    );

    const blocks = repos.map((repo, i) => {
      const readme = readmes[i];
      return [
        `REPO: ${repo.full_name}`,
        `URL: ${repo.html_url}`,
        repo.description        ? `Description: ${repo.description}`         : null,
        repo.language           ? `Primary language: ${repo.language}`        : null,
        repo.topics?.length     ? `Topics: ${repo.topics.join(", ")}`        : null,
        `Stars: ${repo.stargazers_count}  Forks: ${repo.forks_count}`,
        `Last updated: ${repo.updated_at?.slice(0, 10)}`,
        repo.private            ? "Visibility: private"                       : "Visibility: public",
        readme ? `\nREADME (excerpt):\n${readme}` : "(no README)",
      ].filter(Boolean).join("\n");
    });

    _cache = [
      `\n\n--- GITHUB REPOS FOR @${username} (${repos.length} repos) ---`,
      blocks.join("\n\n---\n"),
      `--- END GITHUB REPOS ---`,
    ].join("\n");

    _cacheTs = Date.now();
    logger.info({ count: repos.length }, "GitHub context ready");
    return _cache;

  } catch (err) {
    logger.warn({ err: err.message }, "GitHub loader failed — continuing without");
    return "";
  }
}

/** Force cache refresh (call after adding a new repo if you don't want to wait). */
export function invalidateGithubCache() {
  _cache   = null;
  _cacheTs = 0;
}
