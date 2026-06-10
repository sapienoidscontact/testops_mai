/**
 * TTS routing — Text-to-Speech
 *
 * Primary (and only): browser Speech Synthesis API
 * Implemented client-side in apps/web/src/components/VoiceOutput.jsx.
 *
 * This server module is a pass-through: it returns the text to speak
 * along with voice hints. The client calls browser speechSynthesis.speak().
 *
 * No server-side audio synthesis needed. Zero cost, zero latency, offline-capable.
 */

/**
 * Prepare a TTS response.
 * Returns structured payload for the client to speak.
 *
 * @param {object} opts
 * @param {string} opts.text         - Text to speak
 * @param {string} [opts.voice]      - Voice preference hint (e.g., "en-US", "en-IN")
 * @param {number} [opts.rate]       - Speech rate 0.5–2.0 (default 1.0)
 * @param {number} [opts.pitch]      - Pitch 0.0–2.0 (default 1.0)
 * @returns {{ provider: string, text: string, voice: string, rate: number, pitch: number }}
 */
export function prepareSpeech({ text, voice = "en-US", rate = 1.0, pitch = 1.0 }) {
  return {
    provider: "browser:speech-synthesis",
    text,
    voice,
    rate,
    pitch
  };
}

export default { prepareSpeech };
