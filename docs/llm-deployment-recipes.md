# LLM Deployment Recipes — All Free, No Credit Card

## Active providers (cloud, free tier, no card required)

### Google Gemini via AI Studio
- **Sign up:** https://aistudio.google.com/apikey — Google account only
- **Models:** Gemini 2.5 Flash (1M context), Flash Lite (fast/cheap), Pro (best reasoning), Embedding 004
- **Free limits (informational):** 1500 req/day Flash, 50 req/day Pro, 15 RPM
- **Get key:** AI Studio → API Keys → Create API key
- **Add to .env:** `GEMINI_API_KEY=your_key_here`

### Groq
- **Sign up:** https://console.groq.com — GitHub or Google OAuth, no card
- **Models:** Llama 3.3 70B, Llama 3.1 8B (instant), Qwen 2.5 Coder 32B, **Whisper large-v3-turbo** (STT)
- **Free limits:** daily token budgets per model (generous for personal use)
- **Why use it:** fastest free inference available; Whisper STT is included
- **Add to .env:** `GROQ_API_KEY=your_key_here`

### Cerebras
- **Sign up:** https://cloud.cerebras.ai — email signup, no card
- **Models:** Llama 3.1 8B, Llama 3.3 70B
- **Why use it:** ultra-fast inference on Wafer-Scale Engine; good for voice_reply_fast task
- **Add to .env:** `CEREBRAS_API_KEY=your_key_here`

### SambaNova
- **Sign up:** https://cloud.sambanova.ai — email signup, no card
- **Models:** Meta-Llama-3.3-70B-Instruct, DeepSeek-R1, Llama 3.1 405B
- **Why use it:** DeepSeek-R1 free (reasoning/code review without paying DeepSeek directly)
- **Add to .env:** `SAMBANOVA_API_KEY=your_key_here`

### Hugging Face Inference API
- **Sign up:** https://huggingface.co/settings/tokens — free account
- **Use:** primarily for embeddings (BAAI/bge-small-en-v1.5), fallback LLM
- **Add to .env:** `HUGGINGFACE_API_KEY=your_key_here`

---

## Voice stack (free, no card)

### STT — Groq Whisper (primary)
- Part of Groq free tier — same key
- Model: `whisper-large-v3-turbo` (~500ms for 30s audio)
- Used for: uploaded audio files, mobile recording (non-Chrome browsers)

### STT — Browser Web Speech API (fallback)
- Built into Chrome, Edge, Safari 17+
- Zero latency, works offline, no server call
- Used for: desktop Chrome/Edge voice input

### TTS — Browser Speech Synthesis
- Built into every modern browser
- Works offline, no API key, no cost ever
- Voice quality depends on OS installed voices (Google voices on Android are excellent)

---

## Adding a new provider (no code changes needed)

1. Create `core/llm/providers/<name>.js` (copy openai-compatible.js as template)
2. Export provider object with `name`, `capabilities`, `chat()`, `embed()` (if applicable)
3. Add provider name to relevant task `order` arrays in `config/routing.json`
4. Add API key to `.env` and `.env.example`
5. Restart orchestrator

The router auto-discovers all files in `core/llm/providers/`.

---

## Future hardware expansion (when you get a GPU server)

When you have a machine with a GPU (or even just a beefy ARM server):

1. Install Ollama on it: `curl -fsSL https://ollama.ai/install.sh | sh`
2. Pull models: `ollama pull qwen2.5:7b`, `ollama pull llama3.2:3b`
3. Add to routing.json:
   ```json
   "chat": { "order": ["ollama:qwen2.5:7b", "gemini-2.5-flash", ...] }
   ```
4. Create `core/llm/providers/ollama.js` (template in docs)
5. Set `prefer_local_when_available: true` in routing.json preferences

The rest of the system is unchanged. Local models slot in without touching router code.
