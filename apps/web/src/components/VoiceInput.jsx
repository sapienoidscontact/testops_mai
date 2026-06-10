"use client";

import { useState, useRef } from "react";
import { Mic, MicOff } from "lucide-react";

/**
 * VoiceInput
 *
 * Strategy:
 *   1. Try browser Web Speech API (Chrome/Edge desktop — zero latency, offline)
 *   2. Fall back to MediaRecorder → POST /api/transcribe (Groq Whisper on server)
 *
 * iOS Safari: MediaRecorder fallback (no Web Speech API support).
 */
export default function VoiceInput({ onTranscript, onListeningChange, apiUrl = "", requestHeaders = {} }) {
  const [listening, setListening]  = useState(false);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const useBrowserSpeech = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  function startListening() {
    setListening(true);
    onListeningChange?.(true);

    if (useBrowserSpeech) {
      startBrowserSpeech();
    } else {
      startMediaRecorder();
    }
  }

  function stopListening() {
    setListening(false);
    onListeningChange?.(false);

    recognitionRef.current?.stop();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }

  function startBrowserSpeech() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";

    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      onTranscript?.(transcript);
    };

    rec.onend = () => {
      setListening(false);
      onListeningChange?.(false);
    };

    rec.onerror = (e) => {
      console.warn("Web Speech error:", e.error);
      setListening(false);
      onListeningChange?.(false);
    };

    recognitionRef.current = rec;
    rec.start();
  }

  async function startMediaRecorder() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/mp4";

      const mr = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const buf = await blob.arrayBuffer();

        try {
          const res = await fetch(`${apiUrl}/api/transcribe`, {
            method: "POST",
            headers: { "Content-Type": mimeType, ...requestHeaders },
            body: buf
          });
          const data = await res.json();
          if (data.transcript) onTranscript?.(data.transcript);
        } catch (err) {
          console.error("Transcription failed:", err);
        }
      };

      mediaRecorderRef.current = mr;
      mr.start(1000); // collect in 1s chunks

    } catch (err) {
      console.error("Microphone access denied:", err);
      setListening(false);
      onListeningChange?.(false);
    }
  }

  return (
    <button
      onClick={listening ? stopListening : startListening}
      style={{
        width: 48, height: 48, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, transition: "all 0.2s",
        backdropFilter: "blur(12px)",
        background: listening
          ? "rgba(180,30,30,0.70)"
          : "rgba(80,40,160,0.45)",
        border: listening
          ? "1px solid rgba(255,80,80,0.45)"
          : "1px solid rgba(140,90,230,0.35)",
        boxShadow: listening
          ? "0 0 18px 4px rgba(220,30,30,0.45)"
          : "0 0 12px 2px rgba(120,60,220,0.30)",
        color: "rgba(230,220,255,0.95)",
      }}
      title={listening ? "Stop recording" : "Start voice input"}
      aria-label={listening ? "Stop recording" : "Start voice input"}
    >
      {listening ? <MicOff size={18} /> : <Mic size={18} />}
    </button>
  );
}
