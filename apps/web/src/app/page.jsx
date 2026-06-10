"use client";

import { useState, useRef } from "react";
import { Settings, AlertTriangle, Trash2 } from "lucide-react";
import Orb3D from "../components/Orb3D";
import ChatPanel from "../components/ChatPanel";
import VoiceInput from "../components/VoiceInput";
import VoiceOutput from "../components/VoiceOutput";
import StatusBar from "../components/StatusBar";
import KeysModal from "../components/KeysModal";
import { useProviderKeys } from "../hooks/useProviderKeys";

export default function Home() {
  const [messages, setMessages]       = useState([]);
  const [orbState, setOrbState]       = useState("idle");
  const [provider, setProvider]       = useState(null);
  const [inputText, setInputText]     = useState("");
  const [keysOpen, setKeysOpen]       = useState(false);
  const voiceOutputRef = useRef(null);

  const { keys, setKey, clearAll, getHeaders, hasAnyKey, PROVIDERS } = useProviderKeys();

  const API = process.env.NEXT_PUBLIC_API_URL ?? "";

  async function sendMessage(text) {
    if (!text.trim()) return;

    if (!hasAnyKey) {
      setMessages(m => [...m, {
        role: "assistant",
        content: "No API keys configured. Tap the ⚙ icon to add your free keys — then try again.",
        isPrompt: true
      }]);
      setKeysOpen(true);
      return;
    }

    const userMsg = { role: "user", content: text };
    const newMessages = [...messages.filter(m => !m.isPrompt), userMsg];
    setMessages(newMessages);
    setInputText("");
    setOrbState("thinking");

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getHeaders()
        },
        body: JSON.stringify({ messages: newMessages })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.user_message ?? data.error);

      const assistantMsg = { role: "assistant", content: data.reply };
      setMessages(m => [...m, assistantMsg]);
      setProvider(data.provider);
      setOrbState("speaking");
      voiceOutputRef.current?.speak(data.reply);

    } catch (err) {
      setMessages(m => [...m, { role: "assistant", content: err.message, error: true }]);
      setOrbState("idle");
    }
  }

  function onTranscript(text) { sendMessage(text); }
  function onSpeakDone()      { setOrbState("idle"); }

  const activeKeyCount = Object.keys(keys).length;

  return (
    <>
      {/* ── Fullscreen orb background ─────────────────────────────── */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
        <Orb3D state={orbState} fullscreen />
      </div>

      {/* ── Deep vignette so bottom UI stays readable ─────────────── */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none",
        background: "linear-gradient(to bottom, rgba(2,0,10,0.55) 0%, transparent 30%, transparent 55%, rgba(2,0,10,0.82) 100%)"
      }} />

      {/* ── Floating UI layer ──────────────────────────────────────── */}
      <main
        className="flex flex-col h-screen max-w-2xl mx-auto px-4"
        style={{ position: "relative", zIndex: 2 }}
      >

        {/* Top bar */}
        <div className="flex items-center justify-between pt-4 pb-1">
          {/* Orb state label */}
          <p className="text-sm tracking-widest font-light"
             style={{ color: "rgba(180,160,255,0.7)", letterSpacing: "0.18em" }}>
            {orbState === "idle"      && "M.AI0.1"}
            {orbState === "listening" && "LISTENING"}
            {orbState === "thinking"  && "THINKING"}
            {orbState === "speaking"  && "SPEAKING"}
          </p>

          <div className="flex items-center gap-2">
            {/* Clear chat */}
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); setProvider(null); setOrbState("idle"); }}
                className="flex items-center gap-1.5 text-xs transition-colors px-2.5 py-1.5 rounded-lg"
                style={{
                  color: "rgba(200,120,120,0.75)",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(180,60,60,0.25)",
                  backdropFilter: "blur(8px)"
                }}
                title="Clear conversation"
              >
                <Trash2 size={12} /> Clear
              </button>
            )}

          <button
            onClick={() => setKeysOpen(true)}
            className="flex items-center gap-1.5 text-xs transition-colors px-2.5 py-1.5 rounded-lg"
            style={{
              color: "rgba(160,140,220,0.75)",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(120,80,200,0.25)",
              backdropFilter: "blur(8px)"
            }}
            title="API key settings"
          >
            {activeKeyCount === 0
              ? <><AlertTriangle size={12} style={{ color: "#f59e0b" }} /> Add your API keys</>
              : <><Settings size={12} /> {activeKeyCount} key{activeKeyCount !== 1 ? "s" : ""} set</>
            }
          </button>
          </div>
        </div>

        {/* Spacer — lets the orb show through the centre */}
        <div className="flex-1 min-h-0">
          <ChatPanel messages={messages} className="h-full overflow-y-auto pt-8" />
        </div>

        {/* Input row */}
        <div className="pb-4 pt-2 flex gap-2 items-end">
          <div style={{
            flex: 1,
            background: "rgba(10,4,28,0.55)",
            border: "1px solid rgba(120,80,220,0.30)",
            borderRadius: "1rem",
            backdropFilter: "blur(14px)",
          }}>
            <textarea
              className="w-full bg-transparent px-4 py-3 text-sm resize-none focus:outline-none"
              style={{ color: "rgba(230,220,255,0.92)" }}
              rows={2}
              placeholder={hasAnyKey ? "Type or tap the mic…" : "Add API keys (⚙) to start…"}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(inputText);
                }
              }}
            />
          </div>
          <VoiceInput
            onTranscript={onTranscript}
            onListeningChange={listening => setOrbState(listening ? "listening" : "idle")}
            apiUrl={API}
            requestHeaders={getHeaders()}
          />
        </div>

        <StatusBar provider={provider} />
      </main>

      {/* Keys modal */}
      <KeysModal
        open={keysOpen}
        onClose={() => setKeysOpen(false)}
        keys={keys}
        setKey={setKey}
        clearAll={clearAll}
        PROVIDERS={PROVIDERS}
      />

      {/* Hidden voice output */}
      <VoiceOutput ref={voiceOutputRef} onDone={onSpeakDone} />
    </>
  );
}
