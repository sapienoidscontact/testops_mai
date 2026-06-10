/**
 * STT routing — Speech-to-Text
 *
 * Primary:  Groq Whisper-large-v3-turbo (free, no card, ~500ms)
 * Fallback: browser Web Speech API (handled client-side, zero latency)
 *
 * This module handles server-side STT (audio buffer → text).
 * Browser STT is handled in apps/web/src/components/VoiceInput.jsx.
 */

import { llm } from "../llm/router.js";
import pino from "pino";

const logger = pino({ name: "stt" });

/**
 * Transcribe audio to text.
 *
 * @param {object} opts
 * @param {Buffer}  [opts.audioBuffer]  - Raw audio bytes
 * @param {string}  [opts.audioPath]    - Path to audio file
 * @param {string}  [opts.mimeType]     - MIME type (default: audio/webm)
 * @param {string}  [opts.language]     - ISO 639-1 language code (optional)
 * @returns {Promise<string>}           - Transcript text
 */
export async function transcribe({ audioBuffer, audioPath, mimeType = "audio/webm", language }) {
  const start = Date.now();

  try {
    const { result, provider } = await llm.transcribe({
      audioBuffer,
      audioPath,
      mimeType,
      language
    });

    logger.info({ provider, latency: Date.now() - start }, "STT completed");
    return typeof result === "string" ? result.trim() : result?.text?.trim() ?? "";

  } catch (err) {
    logger.error({ err: err.message }, "STT failed — all providers exhausted");
    throw err;
  }
}

export default { transcribe };
