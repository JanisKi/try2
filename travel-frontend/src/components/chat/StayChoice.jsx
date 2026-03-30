import React from "react";

/**
 * After the user selects a flight, ask where they will stay.
 * They can either:
 * 1) search hotels automatically
 * 2) skip hotel search and type destination address manually
 */
export default function StayChoice({
  hotelLoading,
  onChooseHotel,
  onUseCustomAddress,
}) {
  return (
    <div
      style={{
        marginTop: "28px",
        padding: "18px",
        borderRadius: "14px",
        background: "#12151b",
        border: "1px solid #2a2f3a",
      }}
    >
      <h2 style={{ marginTop: 0 }}>Where are you staying?</h2>

      <p style={{ opacity: 0.9, marginBottom: "16px" }}>
        Choose a hotel for your stay, or continue with your own destination address.
      </p>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <button
          onClick={onChooseHotel}
          disabled={hotelLoading}
          style={{
            padding: "12px 18px",
            borderRadius: "8px",
            border: "none",
            background: "#2d6cdf",
            color: "white",
            cursor: hotelLoading ? "not-allowed" : "pointer",
            fontWeight: "bold",
            opacity: hotelLoading ? 0.7 : 1,
          }}
        >
          {hotelLoading ? "Searching hotels..." : "Choose hotel"}
        </button>

        <button
          onClick={onUseCustomAddress}
          style={{
            padding: "12px 18px",
            borderRadius: "8px",
            border: "1px solid #3a4250",
            background: "#1b212c",
            color: "white",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Add destination address
        </button>
      </div>
    </div>
  );
}