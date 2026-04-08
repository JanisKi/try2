import React from "react";

export default function TripPlanForm({
  flightWidget,
  selectedHotel,
  selectedArrivalTransfer,
  selectedReturnTransfer,
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
  onSearchArrivalTransfer,
  onSearchReturnTransfer,
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
          <div>
            <strong>Hotel price:</strong> {selectedHotel.price_total ?? "-"}{" "}
            {selectedHotel.currency || ""}
            {selectedHotel.price_total_eur != null && (
              <> (~{selectedHotel.price_total_eur} EUR)</>
            )}
          </div>
        </div>
      )}

      {selectedArrivalTransfer && (
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
            <strong>Arrival transfer:</strong> {selectedArrivalTransfer.name || "-"}
          </div>
          <div>
            <strong>Vehicle:</strong> {selectedArrivalTransfer.vehicle || "-"}
          </div>
          <div>
            <strong>Price:</strong> {selectedArrivalTransfer.price_total ?? "-"}{" "}
            {selectedArrivalTransfer.currency || ""}
            {selectedArrivalTransfer.price_total_eur != null && (
              <> (~{selectedArrivalTransfer.price_total_eur} EUR)</>
            )}
          </div>
        </div>
      )}

      {selectedReturnTransfer && (
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
            <strong>Return transfer:</strong> {selectedReturnTransfer.name || "-"}
          </div>
          <div>
            <strong>Vehicle:</strong> {selectedReturnTransfer.vehicle || "-"}
          </div>
          <div>
            <strong>Price:</strong> {selectedReturnTransfer.price_total ?? "-"}{" "}
            {selectedReturnTransfer.currency || ""}
            {selectedReturnTransfer.price_total_eur != null && (
              <> (~{selectedReturnTransfer.price_total_eur} EUR)</>
            )}
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
          style={inputStyleWide}
        />
      </div>

      <div style={{ marginBottom: "14px" }}>
        <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
          How will you get to the airport?
        </label>
        <select
          value={toAirportMode}
          onChange={(e) => setToAirportMode(e.target.value)}
          style={selectStyle}
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
            style={inputStyleWide}
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
          style={selectStyle}
        >
          <option value="drive">Drive / car</option>
          <option value="transit">Public transport</option>
          <option value="transfer">Airport transfer</option>
        </select>
      </div>

      {fromAirportMode === "transfer" && (
        <div style={{ marginBottom: "18px" }}>
          <button onClick={onSearchArrivalTransfer} style={buttonStyle}>
            {selectedArrivalTransfer ? "Change arrival transfer" : "Search arrival transfer"}
          </button>
        </div>
      )}

      {flightWidget?.return_enabled && (
        <>
          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
              How will you get to the return airport?
            </label>
            <select
              value={returnToAirportMode}
              onChange={(e) => setReturnToAirportMode(e.target.value)}
              style={selectStyle}
            >
              <option value="drive">Drive / car</option>
              <option value="transit">Public transport</option>
              <option value="transfer">Airport transfer</option>
            </select>
          </div>

          {returnToAirportMode === "transfer" && (
            <div style={{ marginBottom: "18px" }}>
              <button onClick={onSearchReturnTransfer} style={buttonStyle}>
                {selectedReturnTransfer ? "Change return transfer" : "Search return transfer"}
              </button>
            </div>
          )}

          <div style={{ marginBottom: "18px" }}>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
              How will you get home after returning?
            </label>
            <select
              value={returnHomeMode}
              onChange={(e) => setReturnHomeMode(e.target.value)}
              style={selectStyle}
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
          ...buttonStyle,
          opacity: planLoading ? 0.7 : 1,
          cursor: planLoading ? "not-allowed" : "pointer",
        }}
      >
        {planLoading ? "Generating plan..." : "Generate trip plan"}
      </button>
    </div>
  );
}

const inputStyleWide = {
  width: "100%",
  maxWidth: "650px",
  padding: "12px",
  borderRadius: "8px",
  border: "1px solid #3a4250",
  background: "#0f1115",
  color: "white",
};

const selectStyle = {
  padding: "10px",
  borderRadius: "8px",
  border: "1px solid #3a4250",
  background: "#0f1115",
  color: "white",
};

const buttonStyle = {
  padding: "12px 18px",
  borderRadius: "8px",
  border: "none",
  background: "#2d6cdf",
  color: "white",
  fontWeight: "bold",
};