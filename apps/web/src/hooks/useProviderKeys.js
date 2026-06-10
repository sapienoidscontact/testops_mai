"use client";

/**
 * useProviderKeys — BYOK key management
 *
 * Keys live in the user's own browser localStorage.
 * They are NEVER sent to the server except as request headers for that one call.
 * The server reads them from headers and discards them after use.
 * Nothing is written to disk or database on the server.
 */

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "mai01_provider_keys";

const PROVIDERS = [
  {
    id:       "gemini",
    label:    "Google Gemini",
    header:   "x-gemini-key",
    placeholder: "AIzaSy…",
    getUrl:   "https://aistudio.google.com/apikey",
    note:     "Free — Google account only, no card"
  },
  {
    id:       "groq",
    label:    "Groq",
    header:   "x-groq-key",
    placeholder: "gsk_…",
    getUrl:   "https://console.groq.com/keys",
    note:     "Free — GitHub/Google signup, no card. Includes Whisper STT."
  },
  {
    id:       "cerebras",
    label:    "Cerebras",
    header:   "x-cerebras-key",
    placeholder: "csk-…",
    getUrl:   "https://cloud.cerebras.ai",
    note:     "Free — email signup, no card. Ultra-fast inference."
  },
  {
    id:       "sambanova",
    label:    "SambaNova",
    header:   "x-sambanova-key",
    placeholder: "…",
    getUrl:   "https://cloud.sambanova.ai",
    note:     "Free — email signup, no card. Includes DeepSeek-R1."
  },
  {
    id:       "huggingface",
    label:    "Hugging Face",
    header:   "x-huggingface-key",
    placeholder: "hf_…",
    getUrl:   "https://huggingface.co/settings/tokens",
    note:     "Free account. Used for embeddings."
  },
  {
    id:       "openrouter",
    label:    "OpenRouter",
    header:   "x-openrouter-key",
    placeholder: "sk-or-…",
    getUrl:   "https://openrouter.ai/keys",
    note:     "Free — email signup, no card. Routes to Llama, DeepSeek, Qwen3 and 100+ models."
  }
];

function loadKeys() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveKeys(keys) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function useProviderKeys() {
  const [keys, setKeys] = useState({});

  // Load on mount (client-only)
  useEffect(() => {
    setKeys(loadKeys());
  }, []);

  const setKey = useCallback((providerId, value) => {
    setKeys(prev => {
      const next = value.trim() ? { ...prev, [providerId]: value.trim() } : (() => {
        const { [providerId]: _, ...rest } = prev;
        return rest;
      })();
      saveKeys(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setKeys({});
  }, []);

  /**
   * Returns headers object to attach to every API request.
   * Only includes headers for keys that are actually set.
   */
  const getHeaders = useCallback(() => {
    const headers = {};
    for (const p of PROVIDERS) {
      if (keys[p.id]) headers[p.header] = keys[p.id];
    }
    return headers;
  }, [keys]);

  const hasAnyKey = Object.keys(keys).length > 0;

  return { keys, setKey, clearAll, getHeaders, hasAnyKey, PROVIDERS };
}
