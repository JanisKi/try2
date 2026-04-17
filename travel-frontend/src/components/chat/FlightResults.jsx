// travel-frontend/src/components/chat/FlightResults.jsx
import React, { useState } from "react";
import MockDataBanner from "./MockDataBanner";

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

function formatDateTime(value) {
  if (!value) return "-";
  return value.replace("T", " ");
}

export default function FlightResults({
  flightWidget,
  searchForm,
  setSearchForm,
  selectedOfferKey,
  remainingBudget,
  selectedHotel,
  onSelectOffer,
  onSearchAgain,
}) {
  const offers = Array.isArray(flightWidget?.offers) ? flightWidget.offers : [];
  const [showAllFlights, setShowAllFlights] = useState(false);

  const selectedOffer =
    offers.find((offer, idx) => getOfferKey(offer, idx) === selectedOfferKey) ||
    null;

  const shouldShowOffers = !selectedOffer || showAllFlights;
  
  // Check if using mock data
  const isMockData = flightWidget?._mock === true;

  return (
    <div style={{ marginTop: "28px" }}>
      <h2 style={{ marginBottom: "16px" }}>Flight search widget</h2>

      {/* Mock data banner */}
      {isMockData && (
        <MockDataBanner 
          message="Amadeus API is temporarily unavailable. Showing sample flight data for demonstration purposes. Prices and schedules are not real." 
        />
      )}

      {/* Search controls stay visible */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px 16px",
          marginBottom: "20px",
          padding: "14px",
          borderRadius: "12px",
          background: "#12151b",
          border: "1px solid #2a2f3a",
          alignItems: "end",
        }}
      >
        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: "bold" }}>
            From
          </label>
          <input
            value={searchForm.origin}
            onChange={(e) =>
              setSearchForm((prev) => ({ ...prev, origin: e.target.value }))
            }
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: "bold" }}>
            To
          </label>
          <input
            value={searchForm.destination}
            onChange={(e) =>
              setSearchForm((prev) => ({ ...prev, destination: e.target.value }))
            }
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: "bold" }}>
            Departure
          </label>
          <input
            type="date"
            value={searchForm.departure_date}
            onChange={(e) =>
              setSearchForm((prev) => ({ ...prev, departure_date: e.target.value }))
            }
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: "bold" }}>
            Adults
          </label>
          <input
            type="number"
            min="1"
            value={searchForm.adults}
            onChange={(e) =>
              setSearchForm((prev) => ({ ...prev, adults: e.target.value }))
            }
            style={{ ...inputStyle, width: 90 }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: "bold" }}>
            Stops
          </label>
          <select
            value={searchForm.max_stops === 0 ? "0" : ""}
            onChange={(e) =>
              setSearchForm((prev) => ({
                ...prev,
                max_stops: e.target.value === "0" ? 0 : "",
              }))
            }
            style={inputStyle}
          >
            <option value="">Any</option>
            <option value="0">Direct only</option>
          </select>
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: "bold" }}>
            Budget (EUR)
          </label>
          <input
            type="number"
            min="0"
            value={searchForm.budget}
            onChange={(e) =>
              setSearchForm((prev) => ({ ...prev, budget: e.target.value }))
            }
            style={{ ...inputStyle, width: 120 }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: "bold" }}>
            Return flight
          </label>
          <input
            type="checkbox"
            checked={!!searchForm.return_enabled}
            onChange={(e) =>
              setSearchForm((prev) => ({
                ...prev,
                return_enabled: e.target.checked,
                return_date: e.target.checked ? prev.return_date : "",
              }))
            }
          />
        </div>

        {searchForm.return_enabled && (
          <div>
            <label style={{ display: "block", marginBottom: 6, fontWeight: "bold" }}>
              Return
            </label>
            <input
              type="date"
              value={searchForm.return_date}
              onChange={(e) =>
                setSearchForm((prev) => ({ ...prev, return_date: e.target.value }))
              }
              style={inputStyle}
            />
          </div>
        )}

        <div>
          <button onClick={onSearchAgain} style={buttonStyle}>
            Search
          </button>
        </div>
      </div>

      {/* Summary panel */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "18px",
          marginBottom: "14px",
          padding: "14px",
          borderRadius: "12px",
          background: "#12151b",
          border: "1px solid #2a2f3a",
          alignItems: "center",
        }}
      >
        <div>
          <strong>Current route:</strong>{" "}
          {flightWidget?.origin_iata || flightWidget?.origin_city || "-"} →{" "}
          {flightWidget?.destination_iata || flightWidget?.destination_city || "-"}
        </div>

        <div>
          <strong>Remaining budget:</strong>{" "}
          {Number.isFinite(remainingBudget) ? remainingBudget.toFixed(2) : "-"} EUR
        </div>

        {selectedHotel && (
          <div>
            <strong>Selected hotel:</strong> {selectedHotel.name}
          </div>
        )}

        {selectedOffer && (
          <div style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
            <button
              onClick={() => setShowAllFlights((prev) => !prev)}
              style={{
                ...secondaryButtonStyle,
              }}
            >
              {showAllFlights ? "Hide other flights" : "Change flight"}
            </button>
          </div>
        )}
      </div>

      {/* Selected flight only */}
      {selectedOffer && !showAllFlights && (
        <div
          style={{
            marginBottom: "16px",
            padding: "18px",
            borderRadius: "14px",
            background: "#182233",
            border: "1px solid #4c8dff",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: "10px" }}>
            Selected flight — {selectedOffer?.price?.total || "-"} EUR
            {isMockData && (
              <span style={{ fontSize: "12px", color: "#f1c40f", marginLeft: "10px" }}>
                (Sample data)
              </span>
            )}
          </h3>

          {selectedOffer.itineraries?.map((itinerary, itinIdx) => {
            const segments = Array.isArray(itinerary?.segments)
              ? itinerary.segments
              : [];
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
      )}

      {/* All flight offers only when needed */}
      {shouldShowOffers && (
        <>
          <h3 style={{ marginBottom: "16px" }}>
            {selectedOffer ? "Choose another flight" : "Results (cheapest first)"}
          </h3>

          {offers.length === 0 && (
            <div style={emptyBoxStyle}>No flight offers returned by backend.</div>
          )}

          {offers.map((offer, idx) => {
            const offerKey = getOfferKey(offer, idx);
            const isSelected = selectedOfferKey === offerKey;
            const itineraries = Array.isArray(offer?.itineraries)
              ? offer.itineraries
              : [];
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
                  type="button"
                  onClick={() => {
                    onSelectOffer(offer, offerKey);
                    setShowAllFlights(false);
                  }}
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
                  const segments = Array.isArray(itinerary?.segments)
                    ? itinerary.segments
                    : [];
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
                            {seg?.arrival?.iataCode} ({formatDateTime(seg?.arrival?.at)}) |
                            Carrier: {seg?.carrierCode || "-"} | Flight: {seg?.number || "-"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

const inputStyle = {
  padding: "10px",
  borderRadius: "8px",
  border: "1px solid #3a4250",
  background: "#0f1115",
  color: "white",
};

const buttonStyle = {
  padding: "10px 16px",
  borderRadius: "8px",
  border: "none",
  background: "#2d6cdf",
  color: "white",
  cursor: "pointer",
  fontWeight: "bold",
};

const secondaryButtonStyle = {
  padding: "10px 16px",
  borderRadius: "8px",
  border: "1px solid #3a4250",
  background: "#1b212c",
  color: "white",
  cursor: "pointer",
  fontWeight: "bold",
};

const emptyBoxStyle = {
  padding: "16px",
  borderRadius: "12px",
  background: "#12151b",
  border: "1px solid #2a2f3a",
};
