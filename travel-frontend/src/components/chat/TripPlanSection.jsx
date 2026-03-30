// travel-frontend/src/components/chat/TripPlanSection.jsx
// ------------------------------------------------------------
// This component handles:
// 1) route questions
// 2) trip-plan form submission
// 3) rendering the generated trip plan using leg1/leg2/leg3/leg4
// ------------------------------------------------------------

function formatDistance(distanceMeters) {
  if (distanceMeters == null) return "-";
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(1)} km`;
  return `${distanceMeters} m`;
}

function renderTransitStep(step, idx) {
  if (typeof step === "string") {
    return <li key={idx}>{step}</li>;
  }

  if (!step || typeof step !== "object") {
    return <li key={idx}>Step {idx + 1}</li>;
  }

  const text =
    step.instruction ||
    step.instructions ||
    step.description ||
    step.text ||
    step.navigationInstruction?.instructions ||
    step.travelMode ||
    JSON.stringify(step);

  return <li key={idx}>{text}</li>;
}

function LegCard({ title, leg }) {
  if (!leg) return null;

  return (
    <div
      style={{
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "16px",
        background: "#111",
        marginBottom: "14px",
      }}
    >
      <h3 style={{ marginTop: 0 }}>{title}</h3>

      <p>
        <strong>Mode:</strong> {leg.mode || "-"}
      </p>

      <p>
        <strong>From:</strong> {leg.start_address || "-"}
      </p>

      <p>
        <strong>To:</strong> {leg.destination || "-"}
      </p>

      <p>
        <strong>Duration:</strong>{" "}
        {leg.duration_minutes != null ? `${leg.duration_minutes} min` : "-"}
      </p>

      <p>
        <strong>Distance:</strong> {formatDistance(leg.distance_meters)}
      </p>

      {leg.leave_at ? (
        <p>
          <strong>Leave at:</strong> {leg.leave_at}
        </p>
      ) : null}

      {leg.start_after_buffer_at ? (
        <p>
          <strong>Start after buffer:</strong> {leg.start_after_buffer_at}
        </p>
      ) : null}

      {leg.google_maps_url ? (
        <p>
          <a
            href={leg.google_maps_url}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#7cb3ff" }}
          >
            Open in Google Maps
          </a>
        </p>
      ) : null}

      {Array.isArray(leg.steps) && leg.steps.length > 0 ? (
        <>
          <strong>Steps:</strong>
          <ul style={{ marginTop: "8px" }}>
            {leg.steps.map((step, idx) => renderTransitStep(step, idx))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export default function TripPlanSection({
  stayMode,
  selectedHotel,
  arrivalDestinationAddress,
  setArrivalDestinationAddress,
  startAddress,
  setStartAddress,
  toAirportMode,
  setToAirportMode,
  fromAirportMode,
  setFromAirportMode,
  returnToAirportMode,
  setReturnToAirportMode,
  returnHomeMode,
  setReturnHomeMode,
  returnEnabled,
  onGeneratePlan,
  planLoading,
  generatedPlan,
}) {
  const destinationLabel =
    stayMode === "hotel"
      ? "How will you get from the airport to hotel?"
      : "How will you get from the airport to destination?";

  return (
    <div
      style={{
        marginTop: "24px",
        border: "1px solid #2d2d2d",
        borderRadius: "14px",
        padding: "16px",
        background: "#151515",
      }}
    >
      <h2 style={{ marginTop: 0 }}>Trip details</h2>

      {/* Start address */}
      <div style={{ marginBottom: "16px" }}>
        <label>
          <strong>Starting address</strong>
        </label>
        <br />
        <input
          value={startAddress}
          onChange={(e) => setStartAddress(e.target.value)}
          placeholder="Enter your home/start address"
          style={{
            width: "520px",
            maxWidth: "100%",
            padding: "10px",
            marginTop: "8px",
            borderRadius: "8px",
            border: "1px solid #333",
            background: "#0f0f0f",
            color: "white",
          }}
        />
      </div>

      {/* Home -> departure airport mode */}
      <div style={{ marginBottom: "16px" }}>
        <label>
          <strong>How will you get to the airport?</strong>
        </label>
        <br />
        <select
          value={toAirportMode}
          onChange={(e) => setToAirportMode(e.target.value)}
          style={{
            width: "260px",
            maxWidth: "100%",
            padding: "10px",
            marginTop: "8px",
            borderRadius: "8px",
            border: "1px solid #333",
            background: "#0f0f0f",
            color: "white",
          }}
        >
          <option value="drive">Drive / car</option>
          <option value="transit">Public transport</option>
        </select>
      </div>

      {/* If hotel is selected, show summary.
          If custom address is used, let user type destination. */}
      {stayMode === "hotel" && selectedHotel ? (
        <div
          style={{
            marginBottom: "16px",
            padding: "14px",
            borderRadius: "10px",
            border: "1px solid #333",
            background: "#101010",
          }}
        >
          <strong>Selected hotel:</strong>
          <p style={{ marginBottom: "6px" }}>{selectedHotel.name}</p>
          <p style={{ margin: 0, color: "#cfcfcf" }}>
            {selectedHotel.address || arrivalDestinationAddress || "-"}
          </p>
        </div>
      ) : (
        <div style={{ marginBottom: "16px" }}>
          <label>
            <strong>Destination address after landing</strong>
          </label>
          <br />
          <input
            value={arrivalDestinationAddress}
            onChange={(e) => setArrivalDestinationAddress(e.target.value)}
            placeholder="Enter the address where you are going"
            style={{
              width: "620px",
              maxWidth: "100%",
              padding: "10px",
              marginTop: "8px",
              borderRadius: "8px",
              border: "1px solid #333",
              background: "#0f0f0f",
              color: "white",
            }}
          />
        </div>
      )}

      {/* Arrival airport -> hotel/destination mode */}
      <div style={{ marginBottom: "16px" }}>
        <label>
          <strong>{destinationLabel}</strong>
        </label>
        <br />
        <select
          value={fromAirportMode}
          onChange={(e) => setFromAirportMode(e.target.value)}
          style={{
            width: "260px",
            maxWidth: "100%",
            padding: "10px",
            marginTop: "8px",
            borderRadius: "8px",
            border: "1px solid #333",
            background: "#0f0f0f",
            color: "white",
          }}
        >
          <option value="drive">Drive / car</option>
          <option value="transit">Public transport</option>
        </select>
      </div>

      {/* Return-trip fields only for return flights */}
      {returnEnabled && (
        <>
          <div style={{ marginBottom: "16px" }}>
            <label>
              <strong>How will you get to the return airport?</strong>
            </label>
            <br />
            <select
              value={returnToAirportMode}
              onChange={(e) => setReturnToAirportMode(e.target.value)}
              style={{
                width: "260px",
                maxWidth: "100%",
                padding: "10px",
                marginTop: "8px",
                borderRadius: "8px",
                border: "1px solid #333",
                background: "#0f0f0f",
                color: "white",
              }}
            >
              <option value="drive">Drive / car</option>
              <option value="transit">Public transport</option>
            </select>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label>
              <strong>How will you get home after returning?</strong>
            </label>
            <br />
            <select
              value={returnHomeMode}
              onChange={(e) => setReturnHomeMode(e.target.value)}
              style={{
                width: "260px",
                maxWidth: "100%",
                padding: "10px",
                marginTop: "8px",
                borderRadius: "8px",
                border: "1px solid #333",
                background: "#0f0f0f",
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
          background: "#1f8f4e",
          color: "white",
          cursor: "pointer",
          fontWeight: "bold",
        }}
      >
        {planLoading ? "Generating plan..." : "Generate trip plan"}
      </button>

      {/* Generated result */}
      {generatedPlan && (
        <div style={{ marginTop: "24px" }}>
          <h2>Your trip plan</h2>

          <p>
            <strong>Flight:</strong> {generatedPlan.flight_summary || "-"}
          </p>

          <p>
            <strong>Flight price:</strong>{" "}
            {generatedPlan.selected_price != null
              ? `${Number(generatedPlan.selected_price).toFixed(2)} EUR`
              : "-"}
          </p>

          <p>
            <strong>Remaining budget:</strong>{" "}
            {generatedPlan.remaining_budget != null
              ? `${Number(generatedPlan.remaining_budget).toFixed(2)} EUR`
              : "-"}
          </p>

          <p>
            <strong>Outbound departure:</strong> {generatedPlan.departure_at || "-"}
          </p>

          <p>
            <strong>Outbound arrival:</strong> {generatedPlan.arrival_at || "-"}
          </p>

          {generatedPlan.return_departure_at ? (
            <p>
              <strong>Return departure:</strong> {generatedPlan.return_departure_at}
            </p>
          ) : null}

          {generatedPlan.return_arrival_at ? (
            <p>
              <strong>Return arrival:</strong> {generatedPlan.return_arrival_at}
            </p>
          ) : null}

          <div style={{ marginTop: "16px" }}>
            <LegCard title="1. Home → departure airport" leg={generatedPlan.leg1} />
            <LegCard
              title={
                stayMode === "hotel"
                  ? "2. Arrival airport → hotel"
                  : "2. Arrival airport → destination"
              }
              leg={generatedPlan.leg2}
            />
            <LegCard title="3. Destination → return airport" leg={generatedPlan.leg3} />
            <LegCard title="4. Return airport → home" leg={generatedPlan.leg4} />
          </div>
        </div>
      )}
    </div>
  );
}