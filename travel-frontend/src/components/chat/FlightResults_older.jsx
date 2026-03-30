import React from "react";

/**
 * Small helper to format Amadeus datetime strings.
 * Example: 2026-04-02T08:30:00 -> 2026-04-02 08:30:00
 */
function formatDateTime(value) {
  if (!value) return "-";
  return String(value).replace("T", " ");
}

/**
 * Renders the flight search result area:
 * - search summary
 * - all flight cards
 * - current selected flight state
 */
export default function FlightResults({
  flightWidget,
  selectedOffer,
  remainingBudget,
  onSelectOffer,
  onClearSelection,
}) {
  if (!flightWidget) return null;

  const offers = flightWidget.offers || [];

  return (
    <div style={styles.section}>
      <h2 style={styles.title}>Flight search widget</h2>

      <div style={styles.summaryRow}>
        <div>
          <strong>From:</strong> {flightWidget.origin_iata || flightWidget.origin_city || "-"}
        </div>
        <div>
          <strong>To:</strong> {flightWidget.destination_iata || flightWidget.destination_city || "-"}
        </div>
        <div>
          <strong>Departure:</strong> {flightWidget.departure_date || "-"}
        </div>
        <div>
          <strong>Adults:</strong> {flightWidget.adults || 1}
        </div>
        <div>
          <strong>Budget:</strong>{" "}
          {flightWidget.budget != null ? `${flightWidget.budget} EUR` : "-"}
        </div>
        {flightWidget.return_enabled && (
          <div>
            <strong>Return:</strong> {flightWidget.return_date || "-"}
          </div>
        )}
      </div>

      {remainingBudget != null && (
        <p style={styles.remainingBudget}>
          <strong>Remaining budget after selected flight:</strong>{" "}
          {remainingBudget.toFixed(2)} EUR
        </p>
      )}

      {selectedOffer && (
        <div style={styles.selectedBanner}>
          <span>Flight selected. Continue below with hotel or destination details.</span>
          <button onClick={onClearSelection} style={styles.secondaryButton}>
            Clear selection
          </button>
        </div>
      )}

      <h3 style={{ marginTop: 20 }}>Results (cheapest first)</h3>

      {offers.length === 0 && <p>No flight offers returned.</p>}

      {offers.map((offer, idx) => {
        const itineraries = offer?.itineraries || [];
        const isSelected = selectedOffer === offer;
        const total = offer?.price?.total || "-";

        return (
          <div
            key={`${offer?.id || "offer"}-${idx}`}
            style={{
              ...styles.offerCard,
              border: isSelected ? "2px solid #4d8dff" : "1px solid #444",
            }}
          >
            <div style={styles.offerHeader}>
              <h4 style={{ margin: 0 }}>{total} EUR</h4>

              <button
                onClick={() => onSelectOffer(offer)}
                style={isSelected ? styles.selectedButton : styles.primaryButton}
              >
                {isSelected ? "Selected" : selectedOffer ? "Choose this instead" : "Select"}
              </button>
            </div>

            {itineraries.map((itinerary, itinIdx) => (
              <div key={itinIdx} style={{ marginTop: 14 }}>
                <strong>{itinIdx === 0 ? "Outbound" : "Return"}</strong>
                <p style={styles.meta}>
                  Duration: {itinerary.duration || "-"} | Stops:{" "}
                  {Math.max((itinerary.segments || []).length - 1, 0)}
                </p>

                <ul style={styles.segmentList}>
                  {(itinerary.segments || []).map((seg, segIdx) => (
                    <li key={segIdx} style={{ marginBottom: 6 }}>
                      {seg.departure?.iataCode} ({formatDateTime(seg.departure?.at)}) →{" "}
                      {seg.arrival?.iataCode} ({formatDateTime(seg.arrival?.at)}) | Carrier:{" "}
                      {seg.carrierCode} | Flight: {seg.number}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  section: {
    marginTop: 24,
    padding: 20,
    border: "1px solid #333",
    borderRadius: 14,
    background: "#161616",
  },
  title: {
    marginTop: 0,
  },
  summaryRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 16,
  },
  remainingBudget: {
    marginTop: 8,
    marginBottom: 16,
  },
  selectedBanner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    background: "#1d2735",
    marginBottom: 16,
  },
  offerCard: {
    marginTop: 14,
    padding: 16,
    borderRadius: 12,
    position: "relative",
    background: "#101010",
  },
  offerHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  meta: {
    opacity: 0.9,
    marginTop: 6,
    marginBottom: 8,
  },
  segmentList: {
    marginTop: 8,
    paddingLeft: 20,
  },
  primaryButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#2d6cdf",
    color: "white",
    cursor: "pointer",
    fontWeight: "bold",
  },
  selectedButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#2f8f46",
    color: "white",
    cursor: "default",
    fontWeight: "bold",
  },
  secondaryButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #555",
    background: "#222",
    color: "white",
    cursor: "pointer",
  },
};