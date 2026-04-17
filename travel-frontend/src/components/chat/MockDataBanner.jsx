// travel-frontend/src/components/chat/MockDataBanner.jsx
/**
 * Visual indicator when mock/sample data is being used.
 * Shows a subtle banner so users know the data isn't live.
 */

import React from "react";

export default function MockDataBanner({ message }) {
  if (!message) return null;

  return (
    <div
      style={{
        padding: "10px 14px",
        marginBottom: "16px",
        borderRadius: "8px",
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
        border: "1px solid #e94560",
        color: "#f1c40f",
        fontSize: "13px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
      }}
    >
      <span style={{ fontSize: "18px" }}>⚠️</span>
      <span>
        <strong>Demo Mode:</strong> {message}
      </span>
    </div>
  );
}
