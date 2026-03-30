// travel-frontend/src/components/chat/FlightResultsSection.jsx
// ------------------------------------------------------------
// This component is responsible only for:
// 1) showing the flight search summary
// 2) showing the remaining budget
// 3) rendering all flight offers
// 4) letting the user select or change a flight
// ------------------------------------------------------------

function formatDateTime(value) {
  if (!value) return "-";
  return value.replace("T", " ");
}

function FlightOfferCard({ offer, idx, isSelected, onSelect, onClearSelection }) {
  const itineraries = offer?.itineraries || [];
  const total = offer?.price?.total || "-";

  return (
    <div
      key={idx}
      style={{
        border: isSelected ? "1px solid #2d6cdf" : "1px solid #333",
        borderRadius: "12px",
        padding: "16px",
        marginBottom: "16px",
        background: "#111",
        position: "relative",
        boxShadow: isSelected ? "0 0 0 1px rgba(45,108,223,0.25)" : "none",
      }}
    >
      {!isSelected ? (
        <button
          onClick={() => onSelect(offer)}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            padding: "10px 16px",
            borderRadius: "8px",
            border: "none",
            background: "#2d6cdf",
            color: "white",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Select
        </button>
      ) : (
        <button
          onClick={onClearSelection}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            padding: "10px 16px",
            borderRadius: "8px",
            border: "none",
            background: "#444",
            color: "white",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Change selection
        </button>
      )}

      <h3 style={{ marginTop: 0, marginRight: "150px" }}>{total} EUR</h3>

      {itineraries.map((itinerary, itinIdx) => (
        <div key={itinIdx} style={{ marginBottom: "18px" }}>
          <div>
            <strong>{itinIdx === 0 ? "Outbound" : "Return"}</strong>
          </div>

          <div style={{ marginTop: "6px" }}>
            Duration: {itinerary.duration || "-"}
          </div>

          <div style={{ marginTop: "8px" }}>
            <strong>Segments:</strong>
            <ul>
              {(itinerary.segments || []).map((seg, segIdx) => (
                <li key={segIdx}>
                  {seg.departure?.iataCode} ({formatDateTime(seg.departure?.at)}) →{" "}
                  {seg.arrival?.iataCode} ({formatDateTime(seg.arrival?.at)}) | Carrier:{" "}
                  {seg.carrierCode} Flight: {seg.number}
                </li>
              ))}
            </ul>
          </div>

          <div>
            Stops: {Math.max((itinerary.segments || []).length - 1, 0)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FlightResultsSection({
  flightWidget,
  selectedOffer,
  remainingBudget,
  onSelectOffer,
  onClearSelection,
}) {
  if (!flightWidget) return null;

  const visibleOffers = (flightWidget.offers || []).filter((offer) => {
    if (!selectedOffer) return true;
    return offer === selectedOffer;
  });

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
      <h2 style={{ marginTop: 0 }}>Flight search widget</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div>
          <strong>From:</strong> {flightWidget.origin_iata}
        </div>

        <div>
          <strong>To:</strong> {flightWidget.destination_city}
        </div>

        <div>
          <strong>Departure:</strong> {flightWidget.departure_date}
        </div>

        <div>
          <strong>Adults:</strong> {flightWidget.adults}
        </div>

        <div>
          <strong>Budget:</strong> {flightWidget.budget ?? "-"} EUR
        </div>

        {flightWidget.return_enabled && (
          <div>
            <strong>Return:</strong> {flightWidget.return_date}
          </div>
        )}
      </div>

      <div
        style={{
          marginBottom: "16px",
          padding: "10px 12px",
          background: "#1b1b1b",
          borderRadius: "10px",
          border: "1px solid #333",
          fontWeight: "bold",
        }}
      >
        Remaining budget:{" "}
        {remainingBudget != null && Number.isFinite(remainingBudget)
          ? remainingBudget.toFixed(2)
          : "-"}{" "}
        EUR
      </div>

      <h3>Results (cheapest first)</h3>

      {visibleOffers.length === 0 ? (
        <p>No flights found.</p>
      ) : (
        visibleOffers.map((offer, idx) => (
          <FlightOfferCard
            key={idx}
            offer={offer}
            idx={idx}
            isSelected={selectedOffer === offer}
            onSelect={onSelectOffer}
            onClearSelection={onClearSelection}
          />
        ))
      )}
    </div>
  );
}