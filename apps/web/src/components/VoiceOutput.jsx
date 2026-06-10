"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";

/**
 * VoiceOutput — browser Speech Synthesis
 * Zero cost, zero latency, works offline, no API key.
 *
 * Exposed via ref: voiceOutputRef.current.speak(text)
 */
/** Strip markdown so TTS reads clean natural sentences */
function cleanForSpeech(text) {
  return text
    .replace(/```[\s\S]*?```/g, "")          // remove code blocks entirely
    .replace(/`[^`]*`/g, "")                 // remove inline code
    .replace(/#{1,6}\s*/g, "")               // headings → plain text
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")     // ***bold italic***
    .replace(/\*\*(.+?)\*\*/g, "$1")         // **bold**
    .replace(/\*(.+?)\*/g, "$1")             // *italic*
    .replace(/__(.+?)__/g, "$1")             // __bold__
    .replace(/_(.+?)_/g, "$1")               // _italic_
    .replace(/~~(.+?)~~/g, "$1")             // ~~strikethrough~~
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) → text
    .replace(/^>\s+/gm, "")                  // > blockquotes
    .replace(/^[-*+]\s+/gm, "")             // bullet points
    .replace(/^\d+\.\s+/gm, "")             // numbered lists
    .replace(/\|[^\n]+\|/g, "")             // table rows
    .replace(/[-]{3,}/g, "")                // horizontal rules
    .replace(/\n{2,}/g, ". ")               // blank lines → brief pause
    .replace(/\n/g, " ")                    // single newlines → space
    .replace(/\s{2,}/g, " ")               // collapse extra spaces
    .trim();
}

const VoiceOutput = forwardRef(function VoiceOutput({ onDone }, ref) {
  const utteranceRef = useRef(null);

  useImperativeHandle(ref, () => ({
    speak(text) {
      if (!("speechSynthesis" in window)) {
        onDone?.();
        return;
      }

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(cleanForSpeech(text));
      utterance.rate  = 1.05;
      utterance.pitch = 1.0;
      utterance.lang  = "en-US";

      // Voice selection — prefer Microsoft Zira, fall back gracefully
      const pickVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        return (
          voices.find(v => v.name === "Microsoft Zira Desktop - English (United States)") ||
          voices.find(v => v.name.includes("Zira")) ||
          voices.find(v => v.name.includes("Microsoft") && v.name.includes("Female")) ||
          voices.find(v => v.lang === "en-US" && v.name.includes("Microsoft")) ||
          null
        );
      };

      // Voices may not be loaded yet on first call — wait if needed
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const v = pickVoice();
        if (v) utterance.voice = v;
      } else {
        window.speechSynthesis.onvoiceschanged = () => {
          const v = pickVoice();
          if (v) utterance.voice = v;
          window.speechSynthesis.onvoiceschanged = null;
        };
      }

      utterance.onend   = () => onDone?.();
      utterance.onerror = () => onDone?.();

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },

    stop() {
      window.speechSynthesis?.cancel();
      onDone?.();
    }
  }));

  return null; // no UI
});

export default VoiceOutput;
