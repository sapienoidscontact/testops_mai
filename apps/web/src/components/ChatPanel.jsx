"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";

export default function ChatPanel({ messages, className }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className={clsx("flex items-end justify-center pb-6 text-sm", className)}
           style={{ color: "rgba(160,140,220,0.45)" }}>
        {/* empty — orb is visible */}
      </div>
    );
  }

  return (
    <div className={clsx("flex flex-col gap-3 py-4 px-1", className)}>
      {messages.map((msg, i) => (
        <div
          key={i}
          className={clsx(
            "max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
            msg.role === "user"
              ? "ml-auto rounded-br-sm bubble-user"
              : msg.error
                ? "mr-auto rounded-bl-sm bubble-error"
                : "mr-auto rounded-bl-sm bubble-assistant"
          )}
        >
          {msg.content}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
