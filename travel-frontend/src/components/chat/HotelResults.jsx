import React from "react";

/**
 * Show hotel search results returned by backend.
 * User can select one hotel and continue to route planning.
 */
export default function HotelResults({
  hotelLoading,
  hotelWidget,
  onSelectHotel,
  onUseCustomAddress,
}) {
  const hotels = Array.isArray(hotelWidget?.hotels) ? hotelWidget.hotels : [];

  return (
    <div style={{ marginTop: "28px" }}>
      <h2 style={{ marginBottom: "12px" }}>Hotels for your stay</h2>

      {hotelLoading && (
        <div
          style={{
            padding: "16px",
            borderRadius: "12px",
            background: "#12151b",
            border: "1px solid #2a2f3a",
          }}
        >
          Searching hotels...
        </div>
      )}

      {!hotelLoading && (
        <>
          <div
            style={{
              marginBottom: "16px",
              padding: "14px",
              borderRadius: "12px",
              background: "#12151b",
              border: "1px solid #2a2f3a",
            }}
          >
            <div>
              <strong>Check-in:</strong> {hotelWidget?.check_in || "-"}
            </div>
            <div>
              <strong>Check-out:</strong> {hotelWidget?.check_out || "-"}
            </div>
          </div>

          {hotels.length === 0 && (
            <div
              style={{
                padding: "16px",
                borderRadius: "12px",
                background: "#12151b",
                border: "1px solid #2a2f3a",
              }}
            >
              No hotel results were returned. You can still continue with a custom destination
              address.
            </div>
          )}

          {hotels.map((hotel) => (
            <div
              key={`${hotel.hotel_id}-${hotel.offer_id || "offer"}`}
              style={{
                marginBottom: "16px",
                padding: "18px",
                borderRadius: "14px",
                background: "#12151b",
                border: "1px solid #2a2f3a",
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: "8px" }}>{hotel.name || "Unnamed hotel"}</h3>

              <div style={{ marginBottom: "8px" }}>
                <strong>Address:</strong> {hotel.address || "-"}
              </div>

              <div style={{ marginBottom: "8px" }}>
                <strong>Total price:</strong> {hotel.price_total ?? "-"} {hotel.currency || ""}
              </div>

              <div style={{ marginBottom: "12px" }}>
                <strong>Room:</strong> {hotel.room_description || "No room description"}
              </div>

              <button
                onClick={() => onSelectHotel(hotel)}
                style={{
                  padding: "10px 16px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#2d6cdf",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                Select hotel
              </button>
            </div>
          ))}

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
            Use custom destination address instead
          </button>
        </>
      )}
    </div>
  );
}