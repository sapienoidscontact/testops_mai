"use client";

export default function StatusBar({ provider }) {
  if (!provider) return null;

  return (
    <div className="pb-3 text-center text-xs tracking-widest"
         style={{ color: "rgba(140,110,210,0.50)", letterSpacing: "0.14em" }}>
      via {provider}
    </div>
  );
}
