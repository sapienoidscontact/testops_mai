"use client";

/**
 * The Orb — visual presence of M.AI0.1
 * States: idle (breathe) | listening (pulse fast) | thinking (spin) | speaking (glow)
 */
export default function Orb({ state = "idle" }) {
  const stateClasses = {
    idle:      "orb-idle bg-indigo-600",
    listening: "orb-listening bg-indigo-400",
    thinking:  "animate-spin bg-indigo-500",
    speaking:  "orb-idle bg-indigo-300"
  };

  return (
    <div
      className={`
        w-16 h-16 rounded-full transition-colors duration-500 cursor-default
        ${stateClasses[state] ?? stateClasses.idle}
      `}
      aria-label={`M.AI0.1 — ${state}`}
    />
  );
}
