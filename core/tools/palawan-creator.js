/**
 * Palawan Creator — Tool Definitions + Executor
 *
 * Exposes every Palawan Creator API endpoint as a Gemini function declaration.
 * The orchestrator passes these to Gemini; when Gemini calls one, `execute()`
 * fires the real HTTP request to localhost:8765 and returns the result.
 */

import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname  = dirname(fileURLToPath(import.meta.url));
const BASE_URL   = process.env.PALAWAN_API_URL  ?? "http://localhost:8765";
const PALAWAN_DIR = process.env.PALAWAN_DIR     ?? "P:\\MailynPrime\\palawan-creator";
const PROJECT_ID = "mailyn-prime";

// ─── Process manager ───────────────────────────────────────────────────────────
let _backendProc = null;

async function isRunning() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch { return false; }
}

async function waitReady(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isRunning()) return true;
    await new Promise(r => setTimeout(r, 800));
  }
  return false;
}

export async function startBackend() {
  if (await isRunning()) return { status: "already_running", url: BASE_URL };

  // Kill any stale tracked process
  if (_backendProc) { try { _backendProc.kill(); } catch {} _backendProc = null; }

  // Detect python command
  const python = process.platform === "win32" ? "python" : "python3";

  _backendProc = spawn(
    python,
    ["-m", "uvicorn", "backend.main:app", "--port", "8765", "--host", "127.0.0.1"],
    {
      cwd:      PALAWAN_DIR,
      detached: false,
      stdio:    "pipe",
      shell:    false,
    }
  );

  _backendProc.on("error", (err) => {
    console.error("[palawan-backend] spawn error:", err.message);
    _backendProc = null;
  });

  _backendProc.on("exit", (code) => {
    console.log(`[palawan-backend] exited (code ${code})`);
    _backendProc = null;
  });

  const ready = await waitReady(35_000);
  if (!ready) return { error: "Palawan Creator started but did not respond within 35s. Check that Python + uvicorn are installed in that directory." };
  return { status: "started", url: BASE_URL, pid: _backendProc?.pid };
}

export async function stopBackend() {
  if (!_backendProc) {
    // Try a graceful HTTP shutdown if we didn't start it ourselves
    return { status: "not_tracked", note: "Process was not started by M.AI0.1 — kill it manually if needed." };
  }
  try {
    _backendProc.kill("SIGTERM");
    _backendProc = null;
    return { status: "stopped" };
  } catch (err) {
    return { error: err.message };
  }
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const url = `${BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { return { raw: text, status: res.status }; }
  } catch (err) {
    if (err.name === "TimeoutError") {
      return { error: "Palawan Creator did not respond in 30s. Is it running?" };
    }
    return { error: `Cannot reach Palawan Creator at ${BASE_URL}: ${err.message}` };
  }
}

const get  = (path)       => api("GET",    path, null);
const post = (path, body) => api("POST",   path, body);
const del  = (path)       => api("DELETE", path, null);

// ─── Required-parameter map ────────────────────────────────────────────────────
// Maps tool name → list of { param, label, description } for each required arg.
// When the caller omits a required param, execute() returns needs_input instead
// of proceeding with missing data.  The orchestrator/chat layer should detect
// needs_input:true and relay the prompt to the user before retrying the tool.
const _REQUIRED_PARAMS = {
  generate_image:         [{ param: "pillar",     label: "content pillar", description: "Which pillar? (BALITA_NGAYON, JOB_ALERT, OFW_PAMILYA, LUTONG_PALAWAN, HIWAGA_KALIKASAN, KALIKASAN_PALAWAN, GOV_SCHEMES)" }],
  news_card_extract:      [{ param: "title",      label: "article title",   description: "What is the article title?" },
                           { param: "summary",    label: "article summary", description: "What is the article summary or body text?" }],
  news_card_compose:      [{ param: "pillar",     label: "content pillar", description: "Which pillar?" },
                           { param: "headline",   label: "headline",       description: "What is the headline text?" },
                           { param: "bullets",    label: "bullet points",  description: "What are the bullet points? (2–4 short items, comma-separated is fine)" }],
  news_card_post:         [{ param: "pillar",     label: "content pillar", description: "Which pillar?" },
                           { param: "headline",   label: "headline",       description: "What is the headline?" },
                           { param: "bullets",    label: "bullet points",  description: "What are the bullet points?" }],
  suggest_video_topics:   [{ param: "pillar",     label: "content pillar", description: "Which pillar should the video topics be for?" }],
  generate_video_script:  [{ param: "pillar",     label: "content pillar", description: "Which pillar?" },
                           { param: "topic",      label: "video topic",    description: "What topic or story should the video be about?" }],
  generate_video:         [{ param: "pillar",     label: "content pillar", description: "Which pillar should the video be for? (BALITA_NGAYON, JOB_ALERT, etc.)" }],
  search_stock_clips:     [{ param: "query",      label: "search query",   description: "What should the stock clips show? (e.g. 'Palawan beach', 'Filipino family')" }],
  post_image_to_instagram:[{ param: "image_url",  label: "image URL",      description: "What is the public URL of the image to post?" },
                           { param: "caption",    label: "caption",        description: "What Instagram caption should be used?" }],
  post_reel_to_instagram: [{ param: "video_url",  label: "video URL",      description: "What is the public URL of the video file?" },
                           { param: "caption",    label: "caption",        description: "What Instagram caption should be used?" }],
  generate_tts:           [{ param: "text",       label: "text to speak",  description: "What text should be converted to speech?" }],
  classify_voice_intent:  [{ param: "transcript", label: "voice transcript",description: "What is the voice transcript to classify?" }],
};

function _checkRequired(name, args) {
  const reqs = _REQUIRED_PARAMS[name];
  if (!reqs) return null;
  const missing = reqs.filter(r => args[r.param] === undefined || args[r.param] === null || args[r.param] === "");
  if (!missing.length) return null;
  const first = missing[0];
  return {
    needs_input: true,
    tool: name,
    missing_params: missing.map(r => r.param),
    prompt: first.description,
    hint:   `To use ${name}, I need: ${missing.map(r => r.label).join(", ")}.`,
  };
}


// ─── Tool executor ─────────────────────────────────────────────────────────────

export async function execute(name, args = {}) {
  // Guard: return a user-facing prompt if any required parameter is absent
  const inputNeeded = _checkRequired(name, args);
  if (inputNeeded) return inputNeeded;

  switch (name) {

    // ── Process control ─────────────────────────────────────────────────────
    case "palawan_start":
      return startBackend();

    case "palawan_stop":
      return stopBackend();

    // ── Status ──────────────────────────────────────────────────────────────
    case "palawan_status": {
      const running = await isRunning();
      if (!running) return { status: "offline", hint: "Use palawan_start to start it." };
      return get("/api/health");
    }

    case "dashboard_stats":
      return get("/api/dashboard/stats");

    // ── Automation ──────────────────────────────────────────────────────────
    case "automation_status":
      return get("/api/automation/status");

    case "automation_start":
      return post("/api/automation/start", { interval_min: args.interval_min ?? 90 });

    case "automation_pause":
      return post("/api/automation/pause", {});

    case "automation_resume":
      return post("/api/automation/resume", {});

    case "automation_stop":
      return post("/api/automation/stop", {});

    case "automation_run_now":
      return post("/api/automation/run-now", {
        pillar:     args.pillar     ?? null,
        topic:      args.topic      ?? null,
        account_id: args.account_id ?? 1,
      });

    case "post_history":
      return get(`/api/automation/history?limit=${args.limit ?? 20}`);

    case "missed_posts":
      return get(`/api/automation/missed?window_hours=${args.window_hours ?? 4}`);

    case "breaking_news":
      return get(`/api/automation/breaking-news?limit=${args.limit ?? 20}`);

    case "topic_pool":
      return get("/api/automation/topics/pool");

    case "refresh_topics":
      return post(`/api/automation/topics/refresh${args.pillar ? `?pillar=${args.pillar}` : ""}`, {});

    // ── News ────────────────────────────────────────────────────────────────
    case "news_feed":
      return get("/api/news/feed");

    case "news_pipeline":
      return get("/api/news/pipeline");

    // ── Image ───────────────────────────────────────────────────────────────
    case "generate_image":
      return post("/api/image/generate", {
        pillar: args.pillar,
        prompt: args.prompt ?? null,
        width:  args.width  ?? 1080,
        height: args.height ?? 1920,
      });

    case "news_card_extract":
      return post("/api/image/news-card/extract", {
        title:      args.title,
        summary:    args.summary,
        source:     args.source     ?? "",
        pillar:     args.pillar     ?? null,
        language:   args.language   ?? "tl",
        account_id: args.account_id ?? null,
      });

    case "news_card_compose":
      return post("/api/image/news-card/compose", {
        pillar:    args.pillar,
        headline:  args.headline,
        bullets:   args.bullets,
        bg_prompt: args.bg_prompt ?? null,
      });

    case "news_card_post":
      return post("/api/image/news-card/post", {
        pillar:    args.pillar,
        headline:  args.headline,
        bullets:   args.bullets,
        bg_prompt: args.bg_prompt ?? null,
        caption:   args.caption   ?? "",
      });

    // ── Video ───────────────────────────────────────────────────────────────
    case "suggest_video_topics":
      return post("/api/video/studio/topics", {
        pillar:     args.pillar,
        count:      args.count      ?? 5,
        account_id: args.account_id ?? null,
      });

    case "generate_video_script":
      return post("/api/video/studio/script", {
        pillar:               args.pillar,
        topic:                args.topic,
        language:             args.language             ?? "en",
        tts_voice:            args.tts_voice            ?? "fil-PH-BlessicaNeural",
        account_id:           args.account_id           ?? null,
        target_duration_secs: args.target_duration_secs ?? 90,
      });

    case "generate_video": {
      const result = await post("/api/video/generate", {
        pillar: args.pillar,
        topic:  args.topic ?? null,
      });
      // Attach a human-friendly download note so the response is self-explanatory
      if (result.download_url && !result.error) {
        result._instructions = `Video is ready. Tell the user: "${result.message}" — they can open the download link in a browser or the Palawan Creator app to save the file. Do NOT post to Instagram unless they explicitly ask.`;
      }
      return result;
    }

    case "list_videos":
      return get("/api/video/list");

    case "search_stock_clips":
      return get(`/api/video/search-clips?query=${encodeURIComponent(args.query)}&limit=${args.limit ?? 3}`);

    // ── Social ──────────────────────────────────────────────────────────────
    case "verify_instagram":
      return get("/api/social/verify-token");

    case "post_image_to_instagram":
      return post("/api/social/post-image", {
        image_url: args.image_url,
        caption:   args.caption,
      });

    case "post_reel_to_instagram":
      return post("/api/social/post-reel", {
        video_url: args.video_url,
        caption:   args.caption,
      });

    // ── Voice / TTS ─────────────────────────────────────────────────────────
    case "generate_tts":
      return post("/api/voice/tts", {
        text:  args.text,
        voice: args.voice ?? "fil-PH-BlessicaNeural",
      });

    case "classify_voice_intent":
      return post("/api/voice/classify", { transcript: args.transcript });

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Gemini FunctionDeclarations ───────────────────────────────────────────────

export const definitions = [

  // Process control
  {
    name: "palawan_start",
    description: "Start the Palawan Creator Python backend server. Call this automatically whenever a Palawan tool fails because the backend is offline.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "palawan_stop",
    description: "Stop the Palawan Creator Python backend server that M.AI0.1 started.",
    parameters: { type: "OBJECT", properties: {} },
  },

  // Status / Dashboard
  {
    name: "palawan_status",
    description: "Check if Palawan Creator backend is running and healthy. Returns 'offline' with a start hint if not running.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "dashboard_stats",
    description: "Get Palawan Creator dashboard stats: posts today, posts this week, queue size, missed posts, recent tasks.",
    parameters: { type: "OBJECT", properties: {} },
  },

  // Automation
  {
    name: "automation_status",
    description: "Get the current state of the Palawan Creator scheduler (running, paused, last run time, next scheduled run, interval).",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "automation_start",
    description: "Start the Palawan Creator automation scheduler.",
    parameters: {
      type: "OBJECT",
      properties: {
        interval_min: { type: "NUMBER", description: "Post interval in minutes. Default 90. Minimum 30." },
      },
    },
  },
  {
    name: "automation_pause",
    description: "Pause the Palawan Creator automation scheduler without stopping it.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "automation_resume",
    description: "Resume the Palawan Creator automation scheduler after it was paused.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "automation_stop",
    description: "Stop the Palawan Creator automation scheduler completely.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "automation_run_now",
    description: "Run the FULL automation pipeline including auto-posting to Instagram. Use ONLY when the user explicitly says 'post', 'publish', or 'post to Instagram'. If the user only asks to generate or create a video, use generate_video instead.",
    parameters: {
      type: "OBJECT",
      properties: {
        pillar: {
          type: "STRING",
          description: "Content pillar to use. One of: BALITA_NGAYON, JOB_ALERT, OFW_PAMILYA, LUTONG_PALAWAN, HIWAGA_KALIKASAN, KALIKASAN_PALAWAN, GOV_SCHEMES. Leave empty for auto-selection.",
        },
        topic: {
          type: "STRING",
          description: "Custom topic override. Leave empty to let the system pick from news feed.",
        },
        account_id: { type: "NUMBER", description: "Instagram account ID. Default 1." },
      },
    },
  },
  {
    name: "post_history",
    description: "Get the history of recent Palawan Creator posts (pillar, status, scheduled time, posted time, topic).",
    parameters: {
      type: "OBJECT",
      properties: {
        limit: { type: "NUMBER", description: "Number of records to return. Default 20." },
      },
    },
  },
  {
    name: "missed_posts",
    description: "Check for missed Palawan Creator posts within a time window.",
    parameters: {
      type: "OBJECT",
      properties: {
        window_hours: { type: "NUMBER", description: "Hours to look back. Default 4." },
      },
    },
  },
  {
    name: "breaking_news",
    description: "Get recent breaking news alerts that were auto-detected and processed by Palawan Creator.",
    parameters: {
      type: "OBJECT",
      properties: {
        limit: { type: "NUMBER", description: "Number of records. Default 20." },
      },
    },
  },
  {
    name: "topic_pool",
    description: "Check the Palawan Creator topic pool — how many queued and used topics each pillar has.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "refresh_topics",
    description: "Refresh the Palawan Creator topic pool for one pillar or all pillars.",
    parameters: {
      type: "OBJECT",
      properties: {
        pillar: { type: "STRING", description: "Pillar to refresh. Leave empty to refresh all." },
      },
    },
  },

  // News
  {
    name: "news_feed",
    description: "Fetch the latest articles from all 6 Palawan RSS feeds without scoring.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "news_pipeline",
    description: "Fetch all RSS news articles AND score them for relevance, safety, and engagement. Returns top picks.",
    parameters: { type: "OBJECT", properties: {} },
  },

  // Image / Image Studio
  {
    name: "generate_image",
    description: "Generate an AI background image for a content pillar. Uses Pexels photos or free image generation. Returns the image file.",
    parameters: {
      type: "OBJECT",
      properties: {
        pillar:  { type: "STRING", description: "Content pillar (e.g. BALITA_NGAYON)." },
        prompt:  { type: "STRING", description: "Custom image prompt. Leave empty to use pillar default." },
        width:   { type: "NUMBER", description: "Image width in pixels. Default 1080." },
        height:  { type: "NUMBER", description: "Image height in pixels. Default 1920." },
      },
      required: ["pillar"],
    },
  },
  {
    name: "news_card_extract",
    description: "Use LLM to extract a news headline, bullet points, image prompt, and write a Taglish Instagram caption from an article title and summary.",
    parameters: {
      type: "OBJECT",
      properties: {
        title:    { type: "STRING", description: "Article title." },
        summary:  { type: "STRING", description: "Article summary or body text." },
        source:   { type: "STRING", description: "RSS feed source name." },
        pillar:   { type: "STRING", description: "Content pillar override." },
        language: { type: "STRING", description: "Output language: 'tl' (Tagalog) or 'en'. Default 'tl'." },
      },
      required: ["title", "summary"],
    },
  },
  {
    name: "news_card_compose",
    description: "Compose a 1080×1080 news card image — AI background + headline and bullets overlaid as text. Returns JPEG image.",
    parameters: {
      type: "OBJECT",
      properties: {
        pillar:    { type: "STRING", description: "Content pillar." },
        headline:  { type: "STRING", description: "Main headline text." },
        bullets:   { type: "ARRAY",  description: "Array of bullet point strings (2–4 items).", items: { type: "STRING" } },
        bg_prompt: { type: "STRING", description: "Custom background image prompt." },
      },
      required: ["pillar", "headline", "bullets"],
    },
  },
  {
    name: "news_card_post",
    description: "Compose a news card image AND immediately post it to Instagram. One-shot operation.",
    parameters: {
      type: "OBJECT",
      properties: {
        pillar:    { type: "STRING", description: "Content pillar." },
        headline:  { type: "STRING", description: "Main headline text." },
        bullets:   { type: "ARRAY",  description: "Bullet point strings.", items: { type: "STRING" } },
        bg_prompt: { type: "STRING", description: "Custom background image prompt." },
        caption:   { type: "STRING", description: "Instagram caption. Auto-generated if empty." },
      },
      required: ["pillar", "headline", "bullets"],
    },
  },

  // Video Studio
  {
    name: "suggest_video_topics",
    description: "Get AI-generated topic ideas for a Palawan Creator content pillar.",
    parameters: {
      type: "OBJECT",
      properties: {
        pillar: { type: "STRING", description: "Content pillar to generate topics for." },
        count:  { type: "NUMBER", description: "Number of topics to suggest. Default 5." },
      },
      required: ["pillar"],
    },
  },
  {
    name: "generate_video_script",
    description: "Generate a full video script, scene breakdown, caption, and hashtags for a pillar + topic. Does NOT create the video file yet.",
    parameters: {
      type: "OBJECT",
      properties: {
        pillar:               { type: "STRING", description: "Content pillar." },
        topic:                { type: "STRING", description: "Topic or story to script." },
        language:             { type: "STRING", description: "Script language: 'en' or 'tl'. Default 'en'." },
        tts_voice:            { type: "STRING", description: "TTS voice ID. Default 'fil-PH-BlessicaNeural'." },
        target_duration_secs: { type: "NUMBER", description: "Target video length in seconds. Default 90 (~90-second Reel)." },
      },
      required: ["pillar", "topic"],
    },
  },
  {
    name: "generate_video",
    description: "Generate a video and return a download link. DOES NOT post to Instagram. Use this whenever the user says 'generate video', 'make a video', 'create a video', or similar — unless they explicitly also say 'post it'. LLM script → TTS audio → Pexels clips → FFmpeg 1080×1920 MP4. Takes 2–5 minutes. Returns filename + download URL.",
    parameters: {
      type: "OBJECT",
      properties: {
        pillar: { type: "STRING", description: "Content pillar." },
        topic:  { type: "STRING", description: "Topic. Leave empty for auto-selection from news." },
      },
      required: ["pillar"],
    },
  },
  {
    name: "list_videos",
    description: "List all generated Palawan Creator videos (filename, size, creation time).",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "search_stock_clips",
    description: "Search Pexels for portrait stock video clips by keyword.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Search query (e.g. 'Palawan beach', 'Filipino family')." },
        limit: { type: "NUMBER", description: "Number of clips to return. Default 3." },
      },
      required: ["query"],
    },
  },

  // Social / Instagram
  {
    name: "verify_instagram",
    description: "Check if the Instagram token in Palawan Creator is valid and not expired.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "post_image_to_instagram",
    description: "Post an image to Instagram via Palawan Creator.",
    parameters: {
      type: "OBJECT",
      properties: {
        image_url: { type: "STRING", description: "Public URL of the image to post." },
        caption:   { type: "STRING", description: "Instagram caption text." },
      },
      required: ["image_url", "caption"],
    },
  },
  {
    name: "post_reel_to_instagram",
    description: "Post a video Reel to Instagram via Palawan Creator.",
    parameters: {
      type: "OBJECT",
      properties: {
        video_url: { type: "STRING", description: "Public URL of the video file." },
        caption:   { type: "STRING", description: "Instagram caption text." },
      },
      required: ["video_url", "caption"],
    },
  },

  // Voice / TTS
  {
    name: "generate_tts",
    description: "Generate Filipino TTS audio using edge-tts (fil-PH-BlessicaNeural) from text. Returns base64 audio.",
    parameters: {
      type: "OBJECT",
      properties: {
        text:  { type: "STRING", description: "Text to speak." },
        voice: { type: "STRING", description: "TTS voice ID. Default 'fil-PH-BlessicaNeural'." },
      },
      required: ["text"],
    },
  },
  {
    name: "classify_voice_intent",
    description: "Classify a Filipino/Taglish voice transcript into a Palawan Creator intent (run pipeline, post now, check status, etc).",
    parameters: {
      type: "OBJECT",
      properties: {
        transcript: { type: "STRING", description: "Voice transcript to classify." },
      },
      required: ["transcript"],
    },
  },
];

// Export PROJECT_ID so orchestrator can tag tool calls
export { PROJECT_ID };
