/**
 * Project Knowledge Loader
 * Reads project manifests from data/projects/ and builds
 * context strings to inject into the system prompt.
 */

import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = join(__dirname, "../../data/projects");

let _cache = null;

/** Load all project manifests. Cached after first load. */
export function loadProjects() {
  if (_cache) return _cache;
  _cache = [];
  try {
    const files = readdirSync(PROJECTS_DIR).filter(f => f.endsWith(".json"));
    for (const file of files) {
      try {
        const raw = readFileSync(join(PROJECTS_DIR, file), "utf8");
        _cache.push(JSON.parse(raw));
      } catch (e) {
        console.warn(`[project-loader] skipped ${file}: ${e.message}`);
      }
    }
  } catch (e) {
    // data/projects doesn't exist yet — fine
  }
  return _cache;
}

/** Find a project by name, alias, or id (case-insensitive). */
export function findProject(query) {
  const q = query.toLowerCase();
  return loadProjects().find(p =>
    p.id === q ||
    p.name.toLowerCase().includes(q) ||
    (p.alias || []).some(a => a.toLowerCase().includes(q))
  ) || null;
}

/**
 * Build a concise system-prompt block for all registered projects.
 * Kept short to minimise token usage per request.
 */
export function buildProjectContext() {
  const projects = loadProjects();
  if (projects.length === 0) return "";

  const blocks = projects.map(p => {
    const pillars = (p.content_pillars || [])
      .map(c => `${c.id} (${c.persona})`)
      .join(", ");

    const stack = p.tech_stack
      ? Object.values(p.tech_stack).join(" | ")
      : "";

    return [
      `PROJECT: ${p.name} [${p.id}]`,
      `Path: ${p.path}`,
      `Purpose: ${p.purpose || p.description}`,
      stack   ? `Stack: ${stack}` : null,
      pillars ? `Content pillars: ${pillars}` : null,
      p.safety_stack ? `Safety: ${p.safety_stack}` : null,
      p.notes ? `Notes: ${p.notes}` : null,
      p.dev_commands?.start_all ? `Dev start: ${p.dev_commands.start_all}` : null,
    ].filter(Boolean).join("\n");
  });

  return `\n\n--- REGISTERED PROJECTS ---\n${blocks.join("\n\n---\n")}\n--- END PROJECTS ---`;
}

/** Invalidate cache (call after adding/removing a project file). */
export function invalidateCache() { _cache = null; }
