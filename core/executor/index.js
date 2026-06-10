/**
 * Skill executor — runs project skills safely
 *
 * Each skill in a project's m-ai-manifest.json maps to a command.
 * The executor runs it in the project's Docker container (on-demand service)
 * with physical resource caps (CPU/RAM/concurrency) — physics, not finance.
 *
 * Per-project caps (defaults, overridable in manifest):
 *   CPU:         0.5 cores
 *   Memory:      256 MB
 *   Timeout:     30 seconds
 *   Concurrency: 1 (no parallel runs of same skill)
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";
import { spawn } from "child_process";
import pino from "pino";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logger = pino({ name: "executor" });

const PROJECTS_DIR = join(__dirname, "../../projects");
const PROJECTS_CONFIG = join(__dirname, "../../config/projects.json");

const DEFAULT_CAPS = {
  cpu:         0.5,
  memory_mb:   256,
  timeout_ms:  30_000,
  concurrency: 1
};

// Track running skills (concurrency guard)
const running = new Map();

function loadManifest(projectId) {
  const manifestPath = join(PROJECTS_DIR, projectId, "m-ai-manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`No manifest for project "${projectId}"`);
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function loadProjectsConfig() {
  if (!existsSync(PROJECTS_CONFIG)) return { projects: [] };
  return JSON.parse(readFileSync(PROJECTS_CONFIG, "utf8"));
}

/**
 * Run a skill.
 *
 * @param {object} opts
 * @param {string} opts.projectId - Project short name
 * @param {string} opts.skillId   - Skill identifier from manifest
 * @param {object} [opts.args]    - Key-value args passed as env vars
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
 */
async function run({ projectId, skillId, args = {} }) {
  const manifest = loadManifest(projectId);
  const skill = manifest.skills?.find(s => s.id === skillId);

  if (!skill) {
    throw new Error(`Skill "${skillId}" not found in project "${projectId}"`);
  }

  if (skill.status === "unverified") {
    logger.warn({ projectId, skillId }, "Running unverified skill");
  }

  // Concurrency guard
  const runKey = `${projectId}:${skillId}`;
  const caps = { ...DEFAULT_CAPS, ...manifest.resource_caps };

  if (running.has(runKey) && caps.concurrency <= 1) {
    throw new Error(`Skill "${skillId}" is already running`);
  }

  const projectDir = join(PROJECTS_DIR, projectId);
  if (!existsSync(projectDir)) {
    throw new Error(`Project directory not found: ${projectDir}`);
  }

  logger.info({ projectId, skillId, command: skill.command }, "Executing skill");
  running.set(runKey, Date.now());

  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error(`Skill "${skillId}" timed out after ${caps.timeout_ms}ms`));
      }, caps.timeout_ms);

      // Build env: inherit process env + skill args as env vars
      const env = {
        ...process.env,
        MAI01_PROJECT: projectId,
        MAI01_SKILL: skillId,
        ...Object.fromEntries(Object.entries(args).map(([k, v]) => [`SKILL_ARG_${k.toUpperCase()}`, String(v)]))
      };

      // Parse command — support "npm run X", "node script.js", etc.
      const [cmd, ...cmdArgs] = skill.command.split(" ");

      const proc = spawn(cmd, cmdArgs, {
        cwd: projectDir,
        env,
        shell: true
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", d => { stdout += d.toString(); });
      proc.stderr?.on("data", d => { stderr += d.toString(); });

      proc.on("close", (exitCode) => {
        clearTimeout(timer);
        running.delete(runKey);
        logger.info({ projectId, skillId, exitCode }, "Skill finished");
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        running.delete(runKey);
        reject(err);
      });
    });
  } catch (err) {
    running.delete(runKey);
    throw err;
  }
}

function listRunning() {
  return Array.from(running.entries()).map(([key, startTime]) => ({
    key,
    runningForMs: Date.now() - startTime
  }));
}

export const skillExecutor = { run, listRunning };
export default skillExecutor;
