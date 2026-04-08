import React from "react";

/**
 * Show transfer offers for:
 * - arrival airport -> destination
 * - destination -> return airport
 */
export default function TransferResults({
  arrivalTransferWidget,
  returnTransferWidget,
  selectedArrivalTransfer,
  selectedReturnTransfer,
  onSelectArrivalTransfer,
  onSelectReturnTransfer,
  onContinue,
  transferLoading,
}) {
  const arrivalOffers = Array.isArray(arrivalTransferWidget?.offers)
    ? arrivalTransferWidget.offers
    : [];

  const returnOffers = Array.isArray(returnTransferWidget?.offers)
    ? returnTransferWidget.offers
    : [];

  function renderOfferCard(offer, selected, onSelect) {
    return (
      <div
        key={offer.id}
        style={{
          marginBottom: "16px",
          padding: "18px",
          borderRadius: "14px",
          background: selected ? "#182233" : "#12151b",
          border: selected ? "1px solid #4c8dff" : "1px solid #2a2f3a",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: "10px" }}>
          {offer.price_total} {offer.currency}
        </h3>

        <div style={{ marginBottom: "6px" }}>
          <strong>Approx. EUR:</strong> {offer.price_total_eur} EUR
        </div>

        <div style={{ marginBottom: "6px" }}>
          <strong>Type:</strong> {offer.transfer_type || "-"}
        </div>

        <div style={{ marginBottom: "6px" }}>
          <strong>Provider:</strong> {offer.provider_name || "-"}
        </div>

        <div style={{ marginBottom: "6px" }}>
          <strong>Vehicle:</strong> {offer.vehicle_description || "-"}
        </div>

        <div style={{ marginBottom: "6px" }}>
          <strong>Seats:</strong> {offer.seats ?? "-"} | <strong>Bags:</strong> {offer.bags ?? "-"}
        </div>

        {offer.is_estimated ? (
          <div style={{ marginBottom: "10px", opacity: 0.85 }}>
            Estimated price
          </div>
        ) : null}

        <button
          onClick={() => onSelect(offer)}
          style={{
            padding: "10px 16px",
            borderRadius: "8px",
            border: "none",
            background: selected ? "#2e8b57" : "#2d6cdf",
            color: "white",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          {selected ? "Selected" : "Select transfer"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "28px" }}>
      <h2 style={{ marginBottom: "16px" }}>Transfer options</h2>

      {transferLoading && (
        <div
          style={{
            padding: "16px",
            borderRadius: "12px",
            background: "#12151b",
            border: "1px solid #2a2f3a",
            marginBottom: "16px",
          }}
        >
          Searching transfers...
        </div>
      )}

      {arrivalTransferWidget && (
        <div style={{ marginBottom: "28px" }}>
          <h3>Arrival airport → destination</h3>
          {arrivalOffers.length === 0 ? (
            <div
              style={{
                padding: "16px",
                borderRadius: "12px",
                background: "#12151b",
                border: "1px solid #2a2f3a",
              }}
            >
              No arrival transfer offers found.
            </div>
          ) : (
            arrivalOffers.map((offer) =>
              renderOfferCard(
                offer,
                selectedArrivalTransfer?.id === offer.id,
                onSelectArrivalTransfer
              )
            )
          )}
        </div>
      )}

      {returnTransferWidget && (
        <div style={{ marginBottom: "28px" }}>
          <h3>Destination → return airport</h3>
          {returnOffers.length === 0 ? (
            <div
              style={{
                padding: "16px",
                borderRadius: "12px",
                background: "#12151b",
                border: "1px solid #2a2f3a",
              }}
            >
              No return transfer offers found.
            </div>
          ) : (
            returnOffers.map((offer) =>
              renderOfferCard(
                offer,
                selectedReturnTransfer?.id === offer.id,
                onSelectReturnTransfer
              )
            )
          )}
        </div>
      )}

      <button
        onClick={onContinue}
        style={{
          padding: "12px 18px",
          borderRadius: "8px",
          border: "none",
          background: "#2d6cdf",
          color: "white",
          cursor: "pointer",
          fontWeight: "bold",
        }}
      >
        Continue
      </button>
    </div>
  );
}