import React from "react";

/**
 * Controlled form for the routing part of the trip.
 * Parent page owns the state; this component only renders fields.
 */
export default function TripPlanForm({
  flightWidget,
  selectedHotel,
  startAddress,
  setStartAddress,
  arrivalDestinationAddress,
  setArrivalDestinationAddress,
  toAirportMode,
  setToAirportMode,
  fromAirportMode,
  setFromAirportMode,
  returnToAirportMode,
  setReturnToAirportMode,
  returnHomeMode,
  setReturnHomeMode,
  planLoading,
  onGeneratePlan,
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
      <h2 style={{ marginTop: 0 }}>Trip details</h2>

      {selectedHotel && (
        <div
          style={{
            marginBottom: "18px",
            padding: "12px",
            borderRadius: "10px",
            background: "#182233",
            border: "1px solid #34507d",
          }}
        >
          <div>
            <strong>Selected hotel:</strong> {selectedHotel.name || "-"}
          </div>
          <div>
            <strong>Hotel address:</strong> {selectedHotel.address || "-"}
          </div>
        </div>
      )}

      <div style={{ marginBottom: "14px" }}>
        <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
          Starting address
        </label>
        <input
          value={startAddress}
          onChange={(e) => setStartAddress(e.target.value)}
          placeholder="Enter your home/start address"
          style={{
            width: "100%",
            maxWidth: "650px",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid #3a4250",
            background: "#0f1115",
            color: "white",
          }}
        />
      </div>

      <div style={{ marginBottom: "14px" }}>
        <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
          How will you get to the airport?
        </label>
        <select
          value={toAirportMode}
          onChange={(e) => setToAirportMode(e.target.value)}
          style={{
            padding: "10px",
            borderRadius: "8px",
            border: "1px solid #3a4250",
            background: "#0f1115",
            color: "white",
          }}
        >
          <option value="drive">Drive / car</option>
          <option value="transit">Public transport</option>
        </select>
      </div>

      {!selectedHotel && (
        <div style={{ marginBottom: "14px" }}>
          <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
            Destination address after landing
          </label>
          <input
            value={arrivalDestinationAddress}
            onChange={(e) => setArrivalDestinationAddress(e.target.value)}
            placeholder="Enter the address where you are going"
            style={{
              width: "100%",
              maxWidth: "650px",
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #3a4250",
              background: "#0f1115",
              color: "white",
            }}
          />
        </div>
      )}

      <div style={{ marginBottom: "14px" }}>
        <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
          {selectedHotel
            ? "How will you get from the airport to hotel?"
            : "How will you get from the airport to destination?"}
        </label>
        <select
          value={fromAirportMode}
          onChange={(e) => setFromAirportMode(e.target.value)}
          style={{
            padding: "10px",
            borderRadius: "8px",
            border: "1px solid #3a4250",
            background: "#0f1115",
            color: "white",
          }}
        >
          <option value="drive">Drive / car</option>
          <option value="transit">Public transport</option>
        </select>
      </div>

      {flightWidget?.return_enabled && (
        <>
          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
              How will you get to the return airport?
            </label>
            <select
              value={returnToAirportMode}
              onChange={(e) => setReturnToAirportMode(e.target.value)}
              style={{
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid #3a4250",
                background: "#0f1115",
                color: "white",
              }}
            >
              <option value="drive">Drive / car</option>
              <option value="transit">Public transport</option>
            </select>
          </div>

          <div style={{ marginBottom: "18px" }}>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
              How will you get home after returning?
            </label>
            <select
              value={returnHomeMode}
              onChange={(e) => setReturnHomeMode(e.target.value)}
              style={{
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid #3a4250",
                background: "#0f1115",
                color: "white",
              }}
            >
              <option value="drive">Drive / car</option>
              <option value="transit">Public transport</option>
            </select>
          </div>
        </>
      )}

      <button
        onClick={onGeneratePlan}
        disabled={planLoading}
        style={{
          padding: "12px 18px",
          borderRadius: "8px",
          border: "none",
          background: "#2d6cdf",
          color: "white",
          cursor: planLoading ? "not-allowed" : "pointer",
          fontWeight: "bold",
          opacity: planLoading ? 0.7 : 1,
        }}
      >
        {planLoading ? "Generating plan..." : "Generate trip plan"}
      </button>
    </div>
  );
}