// travel-frontend/src/components/chat/StayChooserSection.jsx
// ------------------------------------------------------------
// This component handles the "where are you staying?" step.
// The user can either:
// 1) search/select a hotel
// 2) skip hotels and enter a custom destination address later
// ------------------------------------------------------------

function formatHotelPrice(hotel) {
  if (hotel?.price_total == null || hotel?.currency == null) return "-";
  return `${hotel.price_total} ${hotel.currency}`;
}

export default function StayChooserSection({
  selectedOffer,
  stayMode,
  hotelLoading,
  hotelWidget,
  selectedHotel,
  onChooseHotel,
  onUseCustomAddress,
  onSelectHotel,
}) {
  if (!selectedOffer) return null;

  const hotels = hotelWidget?.hotels || [];

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
      <h2 style={{ marginTop: 0 }}>Where are you staying?</h2>

      <p style={{ color: "#cfcfcf" }}>
        Choose a hotel for your stay, or skip hotels and enter a destination address manually.
      </p>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
        <button
          onClick={onChooseHotel}
          disabled={hotelLoading}
          style={{
            padding: "12px 18px",
            borderRadius: "8px",
            border: "none",
            background: "#2d6cdf",
            color: "white",
            cursor: "pointer",
            fontWeight: "bold",
            opacity: hotelLoading ? 0.75 : 1,
          }}
        >
          {hotelLoading ? "Searching hotels..." : "Choose hotel"}
        </button>

        <button
          onClick={onUseCustomAddress}
          style={{
            padding: "12px 18px",
            borderRadius: "8px",
            border: "none",
            background: "#444",
            color: "white",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Add destination address
        </button>
      </div>

      {stayMode === "hotel" && (
        <div style={{ marginTop: "8px" }}>
          <h3 style={{ marginBottom: "8px" }}>Hotel results</h3>

          {hotelWidget?.check_in && hotelWidget?.check_out && (
            <p style={{ color: "#cfcfcf", marginTop: 0 }}>
              Stay dates: {hotelWidget.check_in} → {hotelWidget.check_out}
            </p>
          )}

          {hotels.length === 0 && !hotelLoading && (
            <div
              style={{
                padding: "14px",
                borderRadius: "10px",
                border: "1px solid #333",
                background: "#101010",
              }}
            >
              <p style={{ marginTop: 0 }}>
                No hotels were found for this trip. You can still continue by entering a custom destination address.
              </p>

              <button
                onClick={onUseCustomAddress}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#444",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                Use custom destination address
              </button>
            </div>
          )}

          {hotels.map((hotel) => {
            const isSelected = selectedHotel?.hotel_id === hotel.hotel_id;

            return (
              <div
                key={hotel.hotel_id}
                style={{
                  border: isSelected ? "1px solid #2d6cdf" : "1px solid #333",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "12px",
                  background: "#111",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <div>
                    <strong style={{ fontSize: "18px" }}>{hotel.name}</strong>
                    <p style={{ marginBottom: "6px", color: "#cfcfcf" }}>
                      {hotel.address || "-"}
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>Price:</strong> {formatHotelPrice(hotel)}
                    </p>

                    {hotel.room_description ? (
                      <p style={{ marginTop: "8px", color: "#cfcfcf" }}>
                        {hotel.room_description}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <button
                      onClick={() => onSelectHotel(hotel)}
                      style={{
                        padding: "10px 16px",
                        borderRadius: "8px",
                        border: "none",
                        background: isSelected ? "#1f8f4e" : "#2d6cdf",
                        color: "white",
                        cursor: "pointer",
                        fontWeight: "bold",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isSelected ? "Selected" : "Select hotel"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}