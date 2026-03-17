// travel-frontend/src/pages/Chat.jsx

import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function Chat() {
  // -----------------------------
  // Chat text state
  // -----------------------------
  const [prompt, setPrompt] = useState("");
  const [out, setOut] = useState("");

  // -----------------------------
  // Flight widget state
  // -----------------------------
  const [flightWidget, setFlightWidget] = useState(null);

  // Selected offer after user clicks "Select"
  const [selectedOffer, setSelectedOffer] = useState(null);

  // Generated trip plan response from backend
  const [generatedPlan, setGeneratedPlan] = useState(null);

  // Loading state for plan generation
  const [planLoading, setPlanLoading] = useState(false);

  // Optional start address for route calculation
  const [startAddress, setStartAddress] = useState("Ogre Mednieku iela 23");

  // -----------------------------
  // Send chat prompt
  // -----------------------------
  const send = async () => {
    if (!prompt.trim()) return;

    const userText = prompt;
    setPrompt("");
    setGeneratedPlan(null);
    setSelectedOffer(null);

    // Show user message in transcript
    setOut((prev) => prev + `YOU: ${userText}\n`);

    try {
      const r = await api.post("/chat/send/", { prompt: userText });

      // Show assistant message in transcript
      setOut((prev) => prev + `BOT: ${r.data.answer}\n`);

      // If backend returned flight widget data, store it
      setFlightWidget(r.data.flight_widget || null);
    } catch (err) {
      console.error(err);
      setOut((prev) => prev + `BOT: Request failed.\n`);
    }
  };

  // -----------------------------
  // Select one flight offer
  // -----------------------------
  function handleSelectOffer(offer) {
    setSelectedOffer(offer);

    // Reset old plan if user changes selected offer
    setGeneratedPlan(null);
  }

  // -----------------------------
  // Generate a trip plan
  // -----------------------------
  async function handleGeneratePlan() {
    if (!selectedOffer || !flightWidget) {
      alert("Please select a flight first.");
      return;
    }

    try {
      setPlanLoading(true);

      const res = await api.post("/chat/generate-trip-plan/", {
        selected_offer: selectedOffer,

        // Send current widget values too, so backend has context
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

  // -----------------------------
  // Remaining budget display
  // -----------------------------
  const remainingBudget = selectedOffer
    ? Number(flightWidget?.budget || 0) - Number(selectedOffer?.price?.total || 0)
    : Number(flightWidget?.budget || 0);

  // -----------------------------
  // Small helper to render one offer
  // -----------------------------
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
        }}
      >
        <h3 style={{ marginTop: 0 }}>{total} EUR</h3>

        {itineraries.map((itinerary, itinIdx) => (
          <div key={itinIdx} style={{ marginBottom: "12px" }}>
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
                    {seg.departure?.iataCode} ({seg.departure?.at}) →{" "}
                    {seg.arrival?.iataCode} ({seg.arrival?.at}) | Carrier:{" "}
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

        {/* Show Select button before selection, and Change selection after */}
        {!selectedOffer ? (
          <button onClick={() => handleSelectOffer(offer)}>Select</button>
        ) : (
          <button onClick={() => setSelectedOffer(null)}>Change selection</button>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", color: "white", background: "#0f0f0f", minHeight: "100vh" }}>
      <div style={{ marginBottom: "16px" }}>
        <Link to="/logout" style={{ color: "#8ab4ff" }}>
          Logout
        </Link>
      </div>

      <h1>CHAT</h1>

      {/* Prompt input */}
      <div style={{ marginBottom: "16px" }}>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='Try: "I want to go to Paris 15.03.2026 until 25.03.2026 with 5000 euros"'
          style={{ width: "80%", padding: "12px" }}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />
        <button onClick={send} style={{ marginLeft: "8px", padding: "12px 18px" }}>
          Send
        </button>
      </div>

      {/* Text transcript */}
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

      {/* Flight widget */}
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

          {/* Visible money counter */}
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
            Remaining budget: {Number.isFinite(remainingBudget) ? remainingBudget.toFixed(2) : "-"} EUR
          </div>

          {/* Optional start address for route calculation */}
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

          {(flightWidget.offers || [])
            .filter((offer) => {
              // Before selection: show all offers
              if (!selectedOffer) return true;

              // After selection: keep only selected one visible
              return offer === selectedOffer;
            })
            .map((offer, idx) => renderOffer(offer, idx))}

          {/* Generate plan button appears only after selecting one flight */}
          {selectedOffer && (
            <div style={{ marginTop: "20px" }}>
              <button onClick={handleGeneratePlan} disabled={planLoading} style={{ padding: "12px 18px" }}>
                {planLoading ? "Generating plan..." : "Generate plan"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Generated trip plan */}
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