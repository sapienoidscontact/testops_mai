"use client";

import { useState } from "react";
import { X, ExternalLink, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react";
import clsx from "clsx";

/**
 * KeysModal — BYOK settings panel
 *
 * Each user enters their own API keys here.
 * Keys are saved to localStorage in their browser.
 * Nothing is sent to the server except as request headers on each call.
 */
export default function KeysModal({ open, onClose, keys, setKey, clearAll, PROVIDERS }) {
  const [visible, setVisible] = useState({});
  const [saved, setSaved]     = useState({});

  function handleChange(id, value) {
    setKey(id, value);
    setSaved(s => ({ ...s, [id]: true }));
    setTimeout(() => setSaved(s => ({ ...s, [id]: false })), 1500);
  }

  function toggleVisible(id) {
    setVisible(v => ({ ...v, [id]: !v[id] }));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">API Keys</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Stored in your browser only. Never sent to our server except as headers per call.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Key fields */}
        <div className="px-6 py-4 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          {PROVIDERS.map(p => {
            const val = keys[p.id] ?? "";
            const hasKey = val.length > 0;

            return (
              <div key={p.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    {hasKey
                      ? <CheckCircle size={13} className="text-emerald-500 flex-shrink-0" />
                      : <AlertCircle size={13} className="text-zinc-600 flex-shrink-0" />
                    }
                    <label className="text-sm font-medium text-zinc-300">{p.label}</label>
                  </div>
                  <a
                    href={p.getUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                  >
                    Get free key <ExternalLink size={10} />
                  </a>
                </div>

                <p className="text-xs text-zinc-600 mb-1.5">{p.note}</p>

                <div className="relative">
                  <input
                    type={visible[p.id] ? "text" : "password"}
                    value={val}
                    onChange={e => handleChange(p.id, e.target.value)}
                    placeholder={p.placeholder}
                    className={clsx(
                      "w-full bg-zinc-800 border rounded-lg px-3 py-2 pr-10 text-sm",
                      "focus:outline-none transition-colors font-mono",
                      hasKey
                        ? "border-emerald-800 focus:border-emerald-600 text-zinc-200"
                        : "border-zinc-700 focus:border-indigo-600 text-zinc-400"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => toggleVisible(p.id)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {visible[p.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>

                {saved[p.id] && (
                  <p className="text-xs text-emerald-500 mt-1">Saved to your browser.</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between">
          <button
            onClick={() => { clearAll(); }}
            className="text-xs text-red-500 hover:text-red-400 transition-colors"
          >
            Clear all keys
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600">
              Keys stay in your browser. This server sees zero.
            </span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
