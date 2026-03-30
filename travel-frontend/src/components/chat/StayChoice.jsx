import React from "react";

/**
 * Build a stable key for each flight offer.
 * We avoid using only array index because selection should stay stable.
 */
function getOfferKey(offer, idx) {
  const firstSeg = offer?.itineraries?.[0]?.segments?.[0];
  const lastItinerary = offer?.itineraries?.[offer?.itineraries?.length - 1];
  const lastSeg = lastItinerary?.segments?.[lastItinerary?.segments?.length - 1];

  return [
    idx,
    offer?.price?.total || "0",
    firstSeg?.departure?.at || "no-departure",
    lastSeg?.arrival?.at || "no-arrival",
  ].join("|");
}

/**
 * Small helper to make ISO datetimes easier to read.
 */
function formatDateTime(value) {
  if (!value) return "-";
  return value.replace("T", " ");
}

/**
 * Show outbound / return flight offers and let the user select one.
 */
export default function FlightResults({
  flightWidget,
  selectedOfferKey,
  remainingBudget,
  onSelectOffer,
}) {
  const offers = Array.isArray(flightWidget?.offers) ? flightWidget.offers : [];

  return (
    <div style={{ marginTop: "28px" }}>
      <h2 style={{ marginBottom: "16px" }}>Flight search widget</h2>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px 24px",
          marginBottom: "20px",
          padding: "14px",
          borderRadius: "12px",
          background: "#12151b",
          border: "1px solid #2a2f3a",
        }}
      >
        <div>
          <strong>From:</strong> {flightWidget?.origin_iata || flightWidget?.origin_city || "-"}
        </div>
        <div>
          <strong>To:</strong> {flightWidget?.destination_iata || flightWidget?.destination_city || "-"}
        </div>
        <div>
          <strong>Departure:</strong> {flightWidget?.departure_date || "-"}
        </div>
        <div>
          <strong>Adults:</strong> {flightWidget?.adults || 1}
        </div>
        <div>
          <strong>Budget:</strong> {flightWidget?.budget ?? "-"} EUR
        </div>

        {flightWidget?.return_enabled && (
          <div>
            <strong>Return:</strong> {flightWidget?.return_date || "-"}
          </div>
        )}

        <div>
          <strong>Remaining budget:</strong>{" "}
          {Number.isFinite(remainingBudget) ? remainingBudget.toFixed(2) : "-"} EUR
        </div>
      </div>

      <h3 style={{ marginBottom: "16px" }}>Results (cheapest first)</h3>

      {offers.length === 0 && (
        <div
          style={{
            padding: "16px",
            borderRadius: "12px",
            background: "#12151b",
            border: "1px solid #2a2f3a",
          }}
        >
          No flight offers returned by backend.
        </div>
      )}

      {offers.map((offer, idx) => {
        const offerKey = getOfferKey(offer, idx);
        const isSelected = selectedOfferKey === offerKey;
        const itineraries = Array.isArray(offer?.itineraries) ? offer.itineraries : [];
        const total = offer?.price?.total || "-";

        return (
          <div
            key={offerKey}
            style={{
              position: "relative",
              marginBottom: "16px",
              padding: "18px",
              borderRadius: "14px",
              background: isSelected ? "#182233" : "#12151b",
              border: isSelected ? "1px solid #4c8dff" : "1px solid #2a2f3a",
            }}
          >
            <button
              onClick={() => onSelectOffer(offer, offerKey)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                padding: "10px 16px",
                borderRadius: "8px",
                border: "none",
                background: isSelected ? "#2e8b57" : "#2d6cdf",
                color: "white",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              {isSelected ? "Selected" : "Select"}
            </button>

            <h3 style={{ marginTop: 0, marginBottom: "10px" }}>{total} EUR</h3>

            {itineraries.map((itinerary, itinIdx) => {
              const segments = Array.isArray(itinerary?.segments) ? itinerary.segments : [];
              const stops = Math.max(segments.length - 1, 0);

              return (
                <div key={itinIdx} style={{ marginBottom: "14px" }}>
                  <div style={{ fontWeight: "bold", marginBottom: "6px" }}>
                    {itinIdx === 0 ? "Outbound" : "Return"}
                  </div>

                  <div style={{ marginBottom: "6px" }}>
                    <strong>Duration:</strong> {itinerary?.duration || "-"}
                  </div>

                  <div style={{ marginBottom: "6px" }}>
                    <strong>Stops:</strong> {stops}
                  </div>

                  <div style={{ marginBottom: "6px" }}>
                    <strong>Segments:</strong>
                  </div>

                  <ul style={{ marginTop: 0 }}>
                    {segments.map((seg, segIdx) => (
                      <li key={segIdx} style={{ marginBottom: "6px" }}>
                        {seg?.departure?.iataCode} ({formatDateTime(seg?.departure?.at)}) →{" "}
                        {seg?.arrival?.iataCode} ({formatDateTime(seg?.arrival?.at)}) | Carrier:{" "}
                        {seg?.carrierCode || "-"} | Flight: {seg?.number || "-"}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}