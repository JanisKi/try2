import { useMemo, useState } from "react";
import { api } from "../../api";

import ChatTranscript from "./ChatTranscript";
import FlightResults from "./FlightResults";
import StayChoice from "./StayChoice";
import HotelResults from "./HotelResults";
import TripPlanForm from "./TripPlanForm";
import GeneratedPlan from "./GeneratedPlan";

/**
 * Reusable travel chat UI.
 *
 * This component contains:
 * - chat input
 * - transcript
 * - flight results
 * - hotel selection flow
 * - trip routing form
 * - generated trip plan
 *
 * We can render this both:
 * - on the standalone /chat page
 * - inside Dashboard chat tab
 */
export default function TravelChat() {
  // -----------------------------
  // Basic chat state
  // -----------------------------
  const [prompt, setPrompt] = useState("");
  const [out, setOut] = useState("");

  // -----------------------------
  // Flight data from backend
  // -----------------------------
  const [flightWidget, setFlightWidget] = useState(null);

  // -----------------------------
  // Selected flight
  // -----------------------------
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [selectedOfferKey, setSelectedOfferKey] = useState("");

  // -----------------------------
  // UI flow step
  // -----------------------------
  const [step, setStep] = useState("chat");

  // -----------------------------
  // Hotel state
  // -----------------------------
  const [stayMode, setStayMode] = useState(null); // "hotel" | "address" | null
  const [hotelWidget, setHotelWidget] = useState(null);
  const [hotelLoading, setHotelLoading] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState(null);

  // -----------------------------
  // Trip route form state
  // -----------------------------
  const [startAddress, setStartAddress] = useState("");
  const [arrivalDestinationAddress, setArrivalDestinationAddress] = useState("");

  const [toAirportMode, setToAirportMode] = useState("drive");
  const [fromAirportMode, setFromAirportMode] = useState("transit");
  const [returnToAirportMode, setReturnToAirportMode] = useState("transit");
  const [returnHomeMode, setReturnHomeMode] = useState("drive");

  // -----------------------------
  // Final generated plan
  // -----------------------------
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);

  /**
   * Add a new line to the transcript area.
   */
  function appendTranscriptLine(prefix, text) {
    setOut((prev) => `${prev}${prefix}: ${text}\n`);
  }

  /**
   * Reset everything that depends on flight selection.
   */
  function resetSelectionFlow() {
    setSelectedOffer(null);
    setSelectedOfferKey("");
    setStep("chat");

    setStayMode(null);
    setHotelWidget(null);
    setHotelLoading(false);
    setSelectedHotel(null);

    setStartAddress("");
    setArrivalDestinationAddress("");

    setToAirportMode("drive");
    setFromAirportMode("transit");
    setReturnToAirportMode("transit");
    setReturnHomeMode("drive");

    setGeneratedPlan(null);
  }

  /**
   * Clear whole chat state.
   */
  function handleClearAll() {
    setPrompt("");
    setOut("");
    setFlightWidget(null);
    resetSelectionFlow();
  }

  /**
   * Send text prompt to backend.
   */
  async function send() {
    const userText = prompt.trim();
    if (!userText) return;

    setPrompt("");

    setFlightWidget(null);
    resetSelectionFlow();

    appendTranscriptLine("YOU", userText);

    try {
      const r = await api.post("/chat/send/", { prompt: userText });

      appendTranscriptLine("BOT", r.data?.answer || "Done.");
      setFlightWidget(r.data?.flight_widget || null);
    } catch (err) {
      console.error(err);
      appendTranscriptLine("BOT", "Error: request failed.");
    }
  }

  /**
   * After selecting a flight:
   * move to hotel/address choice step.
   */
  function handleSelectOffer(offer, offerKey) {
    setSelectedOffer(offer);
    setSelectedOfferKey(offerKey);

    // reset downstream state
    setStayMode(null);
    setHotelWidget(null);
    setSelectedHotel(null);
    setArrivalDestinationAddress("");
    setGeneratedPlan(null);

    setStep("stay-choice");
  }

  /**
   * User chooses hotel search.
   */
  async function handleChooseHotel() {
    if (!selectedOffer || !flightWidget) {
      alert("Please select a flight first.");
      return;
    }

    try {
      setHotelLoading(true);
      setStep("hotel-select");

      const res = await api.post("/chat/search-hotels/", {
        selected_offer: selectedOffer,
        destination_city:
          flightWidget?.destination_city || flightWidget?.destination_iata || "",
        adults: flightWidget?.adults || 1,
        budget_remaining: remainingBudget,
      });

      setStayMode("hotel");
      setHotelWidget(res.data || null);
    } catch (err) {
      console.error(err);
      const detail =
        err?.response?.data?.detail ||
        "Hotel search failed. You can still use a custom destination address.";
      alert(detail);

      setStep("stay-choice");
    } finally {
      setHotelLoading(false);
    }
  }

  /**
   * User skips hotel search and wants to type address manually.
   */
  function handleUseCustomAddress() {
    setStayMode("address");
    setSelectedHotel(null);
    setHotelWidget(null);
    setArrivalDestinationAddress("");
    setGeneratedPlan(null);
    setStep("route-details");
  }

  /**
   * User picked a hotel.
   * Auto-fill destination address from hotel.
   */
  function handleSelectHotel(hotel) {
    setSelectedHotel(hotel);
    setStayMode("hotel");
    setArrivalDestinationAddress(hotel?.address || hotel?.name || "");
    setGeneratedPlan(null);
    setStep("route-details");
  }

  /**
   * Generate final trip plan.
   */
  async function handleGeneratePlan() {
    if (!selectedOffer || !flightWidget) {
      alert("Please select a flight first.");
      return;
    }

    if (!startAddress.trim()) {
      alert("Please enter your starting address.");
      return;
    }

    if (!arrivalDestinationAddress.trim()) {
      alert("Please choose a hotel or enter your destination address.");
      return;
    }

    try {
      setPlanLoading(true);

      const res = await api.post("/chat/generate-trip-plan/", {
        selected_offer: selectedOffer,

        origin: flightWidget?.origin_iata || flightWidget?.origin_city,
        destination: flightWidget?.destination_iata || flightWidget?.destination_city,
        departure_date: flightWidget?.departure_date,
        return_date: flightWidget?.return_enabled ? flightWidget?.return_date : null,
        adults: flightWidget?.adults,
        budget: flightWidget?.budget,
        max_stops: flightWidget?.max_stops,

        start_address: startAddress,
        arrival_destination_address: arrivalDestinationAddress,
        to_airport_mode: toAirportMode,
        from_airport_mode: fromAirportMode,
        return_to_airport_mode: returnToAirportMode,
        return_home_mode: returnHomeMode,
      });

      setGeneratedPlan(res.data);
    } catch (err) {
      console.error(err);
      const detail =
        err?.response?.data?.detail || "Failed to generate trip plan.";
      alert(detail);
    } finally {
      setPlanLoading(false);
    }
  }

  /**
   * Remaining budget after selected flight.
   * Used for hotel filtering.
   */
  const remainingBudget = useMemo(() => {
    const budget = Number(flightWidget?.budget || 0);
    const selectedPrice = Number(selectedOffer?.price?.total || 0);
    const result = budget - selectedPrice;
    return Number.isFinite(result) ? result : 0;
  }, [flightWidget, selectedOffer]);

  return (
    <div>
      {/* Input row */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "16px",
        }}
      >
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='Try: "flight from Riga to Amsterdam tomorrow, 1 adult"'
          style={{
            flex: 1,
            minWidth: "280px",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid #3a4250",
            background: "#f5f5f5",
            color: "#111",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />

        <button
          onClick={send}
          style={{
            padding: "12px 18px",
            borderRadius: "8px",
            border: "none",
            background: "#f5f5f5",
            color: "#111",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Send
        </button>

        <button
          onClick={handleClearAll}
          style={{
            padding: "12px 18px",
            borderRadius: "8px",
            border: "none",
            background: "#f5f5f5",
            color: "#111",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Clear
        </button>
      </div>

      {/* Transcript */}
      <ChatTranscript text={out} />

      {/* Show flight list only until a flight is selected */}
      {flightWidget && !selectedOffer && (
        <FlightResults
          flightWidget={flightWidget}
          selectedOfferKey={selectedOfferKey}
          remainingBudget={remainingBudget}
          onSelectOffer={handleSelectOffer}
        />
      )}

      {/* Once selected, show a small selected-flight summary instead */}
      {selectedOffer && (
        <div
          style={{
            marginTop: "24px",
            padding: "16px",
            borderRadius: "12px",
            background: "#12151b",
            border: "1px solid #2a2f3a",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Selected flight</h3>
          <div>
            <strong>Price:</strong> {selectedOffer?.price?.total || "-"} EUR
          </div>
          <div>
            <strong>Remaining budget:</strong>{" "}
            {Number.isFinite(remainingBudget) ? remainingBudget.toFixed(2) : "-"} EUR
          </div>

          <button
            onClick={() => {
              setSelectedOffer(null);
              setSelectedOfferKey("");
              setStayMode(null);
              setHotelWidget(null);
              setSelectedHotel(null);
              setArrivalDestinationAddress("");
              setGeneratedPlan(null);
              setStep("chat");
            }}
            style={{
              marginTop: "12px",
              padding: "10px 16px",
              borderRadius: "8px",
              border: "1px solid #3a4250",
              background: "#1b212c",
              color: "white",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Change selection
          </button>
        </div>
      )}

      {/* Stay choice */}
      {selectedOffer && step === "stay-choice" && (
        <StayChoice
          hotelLoading={hotelLoading}
          onChooseHotel={handleChooseHotel}
          onUseCustomAddress={handleUseCustomAddress}
        />
      )}

      {/* Hotel results */}
      {selectedOffer && step === "hotel-select" && (
        <HotelResults
          hotelLoading={hotelLoading}
          hotelWidget={hotelWidget}
          onSelectHotel={handleSelectHotel}
          onUseCustomAddress={handleUseCustomAddress}
        />
      )}

      {/* Route details form */}
      {selectedOffer && step === "route-details" && (
        <TripPlanForm
          flightWidget={flightWidget}
          selectedHotel={selectedHotel}
          startAddress={startAddress}
          setStartAddress={setStartAddress}
          arrivalDestinationAddress={arrivalDestinationAddress}
          setArrivalDestinationAddress={setArrivalDestinationAddress}
          toAirportMode={toAirportMode}
          setToAirportMode={setToAirportMode}
          fromAirportMode={fromAirportMode}
          setFromAirportMode={setFromAirportMode}
          returnToAirportMode={returnToAirportMode}
          setReturnToAirportMode={setReturnToAirportMode}
          returnHomeMode={returnHomeMode}
          setReturnHomeMode={setReturnHomeMode}
          planLoading={planLoading}
          onGeneratePlan={handleGeneratePlan}
        />
      )}

      {/* Final plan */}
      {generatedPlan && <GeneratedPlan plan={generatedPlan} />}
    </div>
  );
}