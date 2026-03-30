import React from "react";

/**
 * Handles the flow after a flight is selected:
 * 1) choose hotel OR manual destination address
 * 2) show hotel results if hotel search was chosen
 * 3) collect route preferences
 * 4) trigger trip plan generation
 */
export default function StayAndRouteForm({
  step,
  selectedOffer,
  stayMode,
  flightWidget,
  hotelWidget,
  hotelLoading,
  hotelError,
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
  onChooseHotel,
  onUseCustomAddress,
  onSelectHotel,
  onBackToStayChoice,
  onGeneratePlan,
}) {
  if (!selectedOffer) return null;

  const hotelQuestion = selectedHotel
    ? "How will you get from the airport to hotel?"
    : "How will you get from the airport to destination?";

  return (
    <div style={styles.section}>
      <h2 style={{ marginTop: 0 }}>Stay and route details</h2>

      {/* Step 1: user chooses hotel or manual destination */}
      {step === "stay-choice" && (
        <div style={styles.card}>
          <h3 style={{ marginTop: 0 }}>Where are you staying?</h3>
          <p>
            Do you want to choose a hotel for your stay, or add the destination address manually?
          </p>

          <div style={styles.buttonRow}>
            <button onClick={onChooseHotel} style={styles.primaryButton}>
              Choose hotel
            </button>

            <button onClick={onUseCustomAddress} style={styles.secondaryButton}>
              Add destination address
            </button>
          </div>
        </div>
      )}

      {/* Step 2: hotel search results */}
      {step === "hotel-results" && (
        <div style={styles.card}>
          <div style={styles.headerRow}>
            <div>
              <h3 style={{ margin: 0 }}>Hotel results</h3>
              {hotelWidget && (
                <p style={{ marginTop: 8 }}>
                  Stay dates: {hotelWidget.check_in} → {hotelWidget.check_out}
                </p>
              )}
            </div>

            <button onClick={onBackToStayChoice} style={styles.secondaryButton}>
              Back
            </button>
          </div>

          {hotelLoading && <p>Searching hotels...</p>}

          {hotelError && <p style={styles.errorText}>{hotelError}</p>}

          {!hotelLoading && !hotelError && hotelWidget?.hotels?.length === 0 && (
            <p>No hotels found. You can go back and use a custom address instead.</p>
          )}

          <div style={{ display: "grid", gap: 12 }}>
            {(hotelWidget?.hotels || []).map((hotel) => (
              <div key={hotel.hotel_id} style={styles.hotelCard}>
                <div style={styles.headerRow}>
                  <div>
                    <h4 style={{ margin: 0 }}>{hotel.name}</h4>
                    <p style={{ margin: "8px 0 0 0" }}>{hotel.address}</p>
                  </div>

                  <button
                    onClick={() => onSelectHotel(hotel)}
                    style={styles.primaryButton}
                  >
                    Select hotel
                  </button>
                </div>

                <p style={{ marginTop: 10 }}>
                  <strong>Price:</strong> {hotel.price_total} {hotel.currency}
                </p>

                {hotel.room_description && (
                  <p style={{ marginTop: 6 }}>
                    <strong>Room:</strong> {hotel.room_description}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <button onClick={onUseCustomAddress} style={styles.secondaryButton}>
              Use custom address instead
            </button>
          </div>
        </div>
      )}

      {/* Step 3: route details form */}
      {step === "route-details" && (
        <div style={styles.card}>
          <div style={styles.headerRow}>
            <h3 style={{ margin: 0 }}>Trip details</h3>
            <button onClick={onBackToStayChoice} style={styles.secondaryButton}>
              Change stay choice
            </button>
          </div>

          {selectedHotel ? (
            <div style={styles.infoBox}>
              <strong>Selected hotel:</strong>
              <div style={{ marginTop: 8 }}>{selectedHotel.name}</div>
              <div style={{ marginTop: 4 }}>{selectedHotel.address}</div>
            </div>
          ) : (
            <div style={styles.infoBox}>
              <strong>Destination type:</strong> Custom address
            </div>
          )}

          <label style={styles.label}>Starting address</label>
          <input
            value={startAddress}
            onChange={(e) => setStartAddress(e.target.value)}
            placeholder="Enter your home/start address"
            style={styles.input}
          />

          {!selectedHotel && (
            <>
              <label style={styles.label}>Destination address after landing</label>
              <input
                value={arrivalDestinationAddress}
                onChange={(e) => setArrivalDestinationAddress(e.target.value)}
                placeholder="Enter the address where you are going"
                style={styles.input}
              />
            </>
          )}

          <label style={styles.label}>How will you get to the airport?</label>
          <select
            value={toAirportMode}
            onChange={(e) => setToAirportMode(e.target.value)}
            style={styles.select}
          >
            <option value="drive">Drive / car</option>
            <option value="transit">Public transport</option>
          </select>

          <label style={styles.label}>{hotelQuestion}</label>
          <select
            value={fromAirportMode}
            onChange={(e) => setFromAirportMode(e.target.value)}
            style={styles.select}
          >
            <option value="drive">Drive / car</option>
            <option value="transit">Public transport</option>
          </select>

          {flightWidget?.return_enabled && (
            <>
              <label style={styles.label}>How will you get to the return airport?</label>
              <select
                value={returnToAirportMode}
                onChange={(e) => setReturnToAirportMode(e.target.value)}
                style={styles.select}
              >
                <option value="drive">Drive / car</option>
                <option value="transit">Public transport</option>
              </select>

              <label style={styles.label}>How will you get home after returning?</label>
              <select
                value={returnHomeMode}
                onChange={(e) => setReturnHomeMode(e.target.value)}
                style={styles.select}
              >
                <option value="drive">Drive / car</option>
                <option value="transit">Public transport</option>
              </select>
            </>
          )}

          <div style={{ marginTop: 18 }}>
            <button onClick={onGeneratePlan} style={styles.primaryButton}>
              {planLoading ? "Generating trip plan..." : "Generate trip plan"}
            </button>
          </div>
        </div>
      )}

      {/* Small helper message so the user knows why nothing shows yet */}
      {!["stay-choice", "hotel-results", "route-details"].includes(step) && stayMode == null && (
        <div style={styles.card}>
          <p>Select a flight first to continue.</p>
        </div>
      )}
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
  card: {
    padding: 16,
    borderRadius: 12,
    background: "#101010",
    border: "1px solid #444",
    marginTop: 12,
  },
  hotelCard: {
    padding: 14,
    borderRadius: 12,
    background: "#151515",
    border: "1px solid #444",
  },
  infoBox: {
    padding: 12,
    borderRadius: 10,
    background: "#1d2735",
    marginBottom: 16,
  },
  label: {
    display: "block",
    marginTop: 14,
    marginBottom: 8,
    fontWeight: "bold",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #555",
    background: "#222",
    color: "white",
    boxSizing: "border-box",
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #555",
    background: "#222",
    color: "white",
    boxSizing: "border-box",
  },
  buttonRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 12,
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
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
  secondaryButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #555",
    background: "#222",
    color: "white",
    cursor: "pointer",
  },
  errorText: {
    color: "#ff8f8f",
    fontWeight: "bold",
  },
};