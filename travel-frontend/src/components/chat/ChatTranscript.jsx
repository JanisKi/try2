import React from "react";

/**
 * Simple transcript box for chat history.
 * We keep it very dumb on purpose:
 * it just shows already formatted text from the parent page.
 */
export default function ChatTranscript({ text }) {
  return (
    <div
      style={{
        whiteSpace: "pre-wrap",
        background: "#12151b",
        border: "1px solid #2a2f3a",
        borderRadius: "12px",
        padding: "16px",
        marginTop: "16px",
        minHeight: "100px",
        lineHeight: 1.6,
      }}
    >
      {text || "No messages yet."}
    </div>
  );
}