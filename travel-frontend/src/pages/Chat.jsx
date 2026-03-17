// travel-frontend/src/pages/Chat.jsx

import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function Chat() {
  // ----------------------------------------------------
  // Main chat input/output state
  // ----------------------------------------------------
  const [prompt, setPrompt] = useState("");
  const [out, setOut] = useState("");

  // ----------------------------------------------------
  // Flight widget data returned from backend
  // ----------------------------------------------------
  const [flightWidget, setFlightWidget] = useState(null);

  // ----------------------------------------------------
  // Which flight offer the user selected
  // ----------------------------------------------------
  const [selectedOffer, setSelectedOffer] = useState(null);

  // ----------------------------------------------------
  // Generated plan returned from backend
  // ----------------------------------------------------
  const [generatedPlan, setGeneratedPlan] = useState(null);

  // ----------------------------------------------------
  // Loading state for generate-plan button
  // ----------------------------------------------------
  const [planLoading, setPlanLoading] = useState(false);

  // ----------------------------------------------------
  // User start address for route calculation
  // ----------------------------------------------------
  const [startAddress, setStartAddress] = useState("Ogre Mednieku iela 23");

  // ----------------------------------------------------
  // Send chat message to backend
  // ----------------------------------------------------
  const send = async () => {
    if (!prompt.trim()) return;

    const userText = prompt;
    setPrompt("");

    // Reset older plan + selection when user asks a new question
    setGeneratedPlan(null);
    setSelectedOffer(null);

    // Add user message to transcript
    setOut((prev) => prev + `YOU: ${userText}\n`);

    try {
      const r = await api.post("/chat/send/", { prompt: userText });

      // Add assistant answer to transcript
      setOut((prev) => prev + `BOT: ${r.data.answer}\n`);

      // Save returned flight widget data
      setFlightWidget(r.data.flight_widget || null);
    } catch (err) {
      console.error(err);
      setOut((prev) => prev + `BOT: Error: Request failed.\n`);
    }
  };

  // ----------------------------------------------------
  // User selects one flight
  // ----------------------------------------------------
  function handleSelectOffer(offer) {
    setSelectedOffer(offer);

    // Reset old plan if a different flight is selected
    setGeneratedPlan(null);
  }

  // ----------------------------------------------------
  // Clear selected flight so user can pick another one
  // ----------------------------------------------------
  function handleClearSelection() {
    setSelectedOffer(null);
    setGeneratedPlan(null);
  }

  // ----------------------------------------------------
  // Generate plan using selected flight
  // ----------------------------------------------------
  async function handleGeneratePlan() {
    if (!selectedOffer || !flightWidget) {
      alert("Please select a flight first.");
      return;
    }

    try {
      setPlanLoading(true);

      const res = await api.post("/chat/generate-trip-plan/", {
        // Full selected Amadeus offer
        selected_offer: selectedOffer,

        // Extra context for backend
        origin: flightWidget.origin_iata || flightWidget.origin_city,
        destination: flightWidget.destination_iata || flightWidget.destination_city,
        departure_date: flightWidget.departure_date,
        return_date: flightWidget.return_enabled ? flightWidget.return_date : null,
        adults: flightWidget.adults,
        budget: flightWidget.budget,
        max_stops: flightWidget.max_stops,
        start_address: startAddress,
      });

      setGeneratedPlan(res.data);
    } catch (err) {
      console.error(err);
      alert("Failed to generate trip plan.");
    } finally {
      setPlanLoading(false);
    }
  }

  // ----------------------------------------------------
  // Remaining budget shown in UI
  // ----------------------------------------------------
  const remainingBudget = selectedOffer
    ? Number(flightWidget?.budget || 0) - Number(selectedOffer?.price?.total || 0)
    : Number(flightWidget?.budget || 0);

  // ----------------------------------------------------
  // Format ISO datetime string into something shorter
  // ----------------------------------------------------
  function formatDateTime(value) {
    if (!value) return "-";
    return value.replace("T", " ");
  }

  // ----------------------------------------------------
  // Render one flight offer card
  // ----------------------------------------------------
  function renderOffer(offer, idx) {
    const itineraries = offer?.itineraries || [];
    const total = offer?.price?.total || "-";

    return (
      <div
        key={idx}
        style={{
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "16px",
          background: "#111",
          position: "relative",
        }}
      >
        {/* ------------------------------------------------
            Select button in top-right corner
            ------------------------------------------------ */}
        {!selectedOffer ? (
          <button
            onClick={() => handleSelectOffer(offer)}
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
            onClick={handleClearSelection}
            style={{
              position: "absolute",
              top: "16px",
              right: "16px",
              padding: "10px 16px",
              borderRadius: "8px",
              border: "none",
              background: "#666",
              color: "white",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Change selection
          </button>
        )}

        <h3 style={{ marginTop: 0, marginRight: "140px" }}>{total} EUR</h3>

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

  return (
    <div
      style={{
        padding: "24px",
        color: "white",
        background: "#0f0f0f",
        minHeight: "100vh",
      }}
    >
      <div style={{ marginBottom: "16px" }}>
        <Link to="/logout" style={{ color: "#8ab4ff" }}>
          Logout
        </Link>
      </div>

      <h1>CHAT</h1>

      {/* ------------------------------------------------
          Chat input
          ------------------------------------------------ */}
      <div style={{ marginBottom: "16px" }}>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='Try: "I want to go to Amsterdam 20.03.2026 until 25.03.2026 with 5000 euros"'
          style={{ width: "80%", padding: "12px" }}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />
        <button onClick={send} style={{ marginLeft: "8px", padding: "12px 18px" }}>
          Send
        </button>
      </div>

      {/* ------------------------------------------------
          Chat transcript
          ------------------------------------------------ */}
      <pre
        style={{
          whiteSpace: "pre-wrap",
          background: "#111",
          padding: "16px",
          borderRadius: "10px",
          border: "1px solid #222",
        }}
      >
        {out}
      </pre>

      {/* ------------------------------------------------
          Flight widget
          ------------------------------------------------ */}
      {flightWidget && (
        <div
          style={{
            marginTop: "20px",
            border: "1px solid #222",
            borderRadius: "14px",
            padding: "16px",
            background: "#141414",
          }}
        >
          <h2>Flight search widget</h2>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
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

          {/* ------------------------------------------------
              Visible money counter
              ------------------------------------------------ */}
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
            {Number.isFinite(remainingBudget) ? remainingBudget.toFixed(2) : "-"} EUR
          </div>

          {/* ------------------------------------------------
              Start address for route planning
              ------------------------------------------------ */}
          <div style={{ marginBottom: "16px" }}>
            <label>
              <strong>Start address:</strong>
            </label>
            <br />
            <input
              value={startAddress}
              onChange={(e) => setStartAddress(e.target.value)}
              placeholder="Enter your home/start address"
              style={{ width: "420px", maxWidth: "100%", padding: "10px", marginTop: "8px" }}
            />
          </div>

          <h3>Results (cheapest first)</h3>

          {/* ------------------------------------------------
              If no offer selected -> show all offers
              If selected -> show only selected offer
              ------------------------------------------------ */}
          {(flightWidget.offers || [])
            .filter((offer) => {
              if (!selectedOffer) return true;
              return offer === selectedOffer;
            })
            .map((offer, idx) => renderOffer(offer, idx))}

          {/* ------------------------------------------------
              Show Generate plan only after user selects a flight
              ------------------------------------------------ */}
          {selectedOffer && (
            <div style={{ marginTop: "20px" }}>
              <button
                onClick={handleGeneratePlan}
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
                {planLoading ? "Generating plan..." : "Generate plan"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------
          Generated trip plan section
          ------------------------------------------------ */}
      {generatedPlan && (
        <div
          style={{
            marginTop: "24px",
            border: "1px solid #2d2d2d",
            borderRadius: "14px",
            padding: "16px",
            background: "#151515",
          }}
        >
          <h2>Your trip plan</h2>

          <p>
            <strong>Start address:</strong> {generatedPlan.start_address || "-"}
          </p>

          <p>
            <strong>Leave home at:</strong> {generatedPlan.leave_home_at || "-"}
          </p>

          <p>
            <strong>Drive time to airport:</strong>{" "}
            {generatedPlan.drive_minutes != null ? `${generatedPlan.drive_minutes} min` : "-"}
          </p>

          <p>
            <strong>Flight:</strong> {generatedPlan.flight_summary || "-"}
          </p>

          <p>
            <strong>Remaining budget:</strong>{" "}
            {generatedPlan.remaining_budget != null
              ? `${Number(generatedPlan.remaining_budget).toFixed(2)} EUR`
              : "-"}
          </p>

          <p>
            <strong>Route:</strong>{" "}
            {generatedPlan.route_url ? (
              <a
                href={generatedPlan.route_url}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#8ab4ff" }}
              >
                Open route
              </a>
            ) : (
              "-"
            )}
          </p>
        </div>
      )}
    </div>
  );
}