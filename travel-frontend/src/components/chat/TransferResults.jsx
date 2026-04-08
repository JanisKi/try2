import React from "react";

export default function TransferResults({
  transferLoading,
  transferWidget,
  transferSearchTarget,
  onSelectTransfer,
  onBackToRouteDetails,
}) {
  const transfers = Array.isArray(transferWidget?.transfers)
    ? transferWidget.transfers
    : [];

  return (
    <div style={{ marginTop: "28px" }}>
      <h2 style={{ marginBottom: "12px" }}>
        {transferSearchTarget === "return"
          ? "Return airport transfers"
          : "Arrival airport transfers"}
      </h2>

      {transferLoading && (
        <div
          style={{
            padding: "16px",
            borderRadius: "12px",
            background: "#12151b",
            border: "1px solid #2a2f3a",
          }}
        >
          Searching transfers...
        </div>
      )}

      {!transferLoading && (
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
              <strong>Pickup:</strong> {transferWidget?.pickup_address || "-"}
            </div>
            <div>
              <strong>Dropoff:</strong> {transferWidget?.dropoff_address || "-"}
            </div>
            <div>
              <strong>Pickup time:</strong> {transferWidget?.pickup_at || "-"}
            </div>
          </div>

          {transfers.length === 0 && (
            <div
              style={{
                padding: "16px",
                borderRadius: "12px",
                background: "#12151b",
                border: "1px solid #2a2f3a",
                marginBottom: "16px",
              }}
            >
              No transfer results found.
            </div>
          )}

          {transfers.map((transfer) => (
            <div
              key={transfer.id}
              style={{
                marginBottom: "16px",
                padding: "18px",
                borderRadius: "14px",
                background: "#12151b",
                border: "1px solid #2a2f3a",
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: "8px" }}>
                {transfer.name || "Transfer option"}
              </h3>

              <div style={{ marginBottom: "8px" }}>
                <strong>Vehicle:</strong> {transfer.vehicle || "-"}
              </div>

              <div style={{ marginBottom: "8px" }}>
                <strong>Passengers:</strong> {transfer.passengers ?? "-"}
              </div>

              <div style={{ marginBottom: "8px" }}>
                <strong>Bags:</strong> {transfer.bags ?? "-"}
              </div>

              <div style={{ marginBottom: "8px" }}>
                <strong>Total price:</strong> {transfer.price_total ?? "-"}{" "}
                {transfer.currency || ""}
              </div>

              <div style={{ marginBottom: "12px" }}>
                <strong>Approx. EUR:</strong> {transfer.price_total_eur ?? "-"} EUR
              </div>

              <button
                onClick={() => onSelectTransfer(transfer)}
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
                Select transfer
              </button>
            </div>
          ))}

          <button
            onClick={onBackToRouteDetails}
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
            Back
          </button>
        </>
      )}
    </div>
  );
}