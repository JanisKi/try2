import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

import ChatTranscript from "../components/chat/ChatTranscript";
import FlightResults from "../components/chat/FlightResults";
import StayChoice from "../components/chat/StayChoice";
import HotelResults from "../components/chat/HotelResults";
import TripPlanForm from "../components/chat/TripPlanForm";
import GeneratedPlan from "../components/chat/GeneratedPlan";

/**
 * Main Chat page
 *
 * What this page does:
 * 1. Sends chat text to backend
 * 2. Shows flight results
 * 3. Lets user select one flight
 * 4. Asks where they are staying
 * 5. Lets user choose hotel OR custom destination address
 * 6. Collects route preferences
 * 7. Requests a generated trip plan from backend
 */
export default function Chat() {
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
  // "chat" -> default
  // "stay-choice" -> after flight selected
  // "hotel-select" -> if user chose hotel search
  // "route-details" -> final route form
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
   * Helper to append one new line to transcript.
   */
  function appendTranscriptLine(prefix, text) {
    setOut((prev) => `${prev}${prefix}: ${text}\n`);
  }

  /**
   * Reset flow that depends on flight selection.
   * We keep transcript, but clear UI state.
   */
  function resetSelectionFlow() {
    setSelectedOffer(null);
    setSelectedOfferKey("");
    setStep("chat");

    setStayMode(null);
    setHotelWidget(null);
    setHotelLoading(false);
    setSelectedHotel(null);

    setArrivalDestinationAddress("");
    setGeneratedPlan(null);
  }

  /**
   * Clear everything on screen.
   */
  function handleClearAll() {
    setPrompt("");
    setOut("");
    setFlightWidget(null);
    resetSelectionFlow();
  }

  /**
   * Send prompt to backend chat endpoint.
   * Backend is expected to return:
   * - answer
   * - flight_widget
   */
  async function send() {
    const userText = prompt.trim();
    if (!userText) return;

    setPrompt("");

    // Clear previous result flow for a fresh search
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
   * User selects one specific flight offer.
   * Then we move to stay choice step.
   */
  // function handleSelectOffer(offer, offerKey) {
  //   setSelectedOffer(offer);
  //   setSelectedOfferKey(offerKey);

  //   // Reset downstream state every time user changes flight
  //   setStayMode(null);
  //   setHotelWidget(null);
  //   setSelectedHotel(null);
  //   setArrivalDestinationAddress("");
  //   setGeneratedPlan(null);

  //   setStep("stay-choice");
  // }
  function handleSelectOffer(offer, offerKey) {
    console.log("SELECT CLICKED", offerKey);
    alert("Flight selected");
    setSelectedOffer(offer);
    setSelectedOfferKey(offerKey);

    setStayMode(null);
    setHotelWidget(null);
    setSelectedHotel(null);
    setArrivalDestinationAddress("");
    setGeneratedPlan(null);

    setStep("stay-choice");
  }

  /**
   * User wants hotel search.
   * We call backend immediately and show hotel results.
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

      // Keep the user moving forward even if hotel search fails
      setStep("stay-choice");
    } finally {
      setHotelLoading(false);
    }
  }

  /**
   * User skips hotel search and wants to type destination manually.
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
   * User selects a hotel.
   * We auto-fill destination address from hotel.
   */
  function handleSelectHotel(hotel) {
    setSelectedHotel(hotel);
    setStayMode("hotel");
    setArrivalDestinationAddress(hotel?.address || hotel?.name || "");
    setGeneratedPlan(null);
    setStep("route-details");
  }

  /**
   * Send selected flight + address/mode choices to backend
   * to generate the full trip plan.
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
        // Selected flight
        selected_offer: selectedOffer,

        // Flight context
        origin: flightWidget?.origin_iata || flightWidget?.origin_city,
        destination: flightWidget?.destination_iata || flightWidget?.destination_city,
        departure_date: flightWidget?.departure_date,
        return_date: flightWidget?.return_enabled ? flightWidget?.return_date : null,
        adults: flightWidget?.adults,
        budget: flightWidget?.budget,
        max_stops: flightWidget?.max_stops,

        // Route planning fields
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
   * Budget left after selecting flight.
   * Used for hotel search filtering.
   */
  const remainingBudget = useMemo(() => {
    const budget = Number(flightWidget?.budget || 0);
    const selectedPrice = Number(selectedOffer?.price?.total || 0);
    const result = budget - selectedPrice;
    return Number.isFinite(result) ? result : 0;
  }, [flightWidget, selectedOffer]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f1115",
        color: "white",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
          padding: "24px",
          borderRadius: "18px",
          background: "#111317",
          border: "1px solid #222733",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
            marginBottom: "18px",
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ margin: 0 }}>CHAT</h1>

          <div>
            <Link
              to="/logout"
              style={{
                color: "#9fc2ff",
                textDecoration: "none",
                fontWeight: "bold",
              }}
            >
              Logout
            </Link>
          </div>
        </div>

        {/* Chat input row */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            flexWrap: "wrap",
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

        {/* Flight results */}
        {selectedOffer && step === "stay-choice" && (
          <StayChoice
            hotelLoading={hotelLoading}
            onChooseHotel={handleChooseHotel}
            onUseCustomAddress={handleUseCustomAddress}
          />
        )}

        {flightWidget && (
          <FlightResults
            flightWidget={flightWidget}
            selectedOfferKey={selectedOfferKey}
            remainingBudget={remainingBudget}
            onSelectOffer={handleSelectOffer}
          />
        )}

        {/* Stay choice */}
        {selectedOffer && step === "stay-choice" && (
          <StayChoice
            hotelLoading={hotelLoading}
            onChooseHotel={handleChooseHotel}
            onUseCustomAddress={handleUseCustomAddress}
          />
        )}

        {/* Hotel list */}
        {selectedOffer && step === "hotel-select" && (
          <HotelResults
            hotelLoading={hotelLoading}
            hotelWidget={hotelWidget}
            onSelectHotel={handleSelectHotel}
            onUseCustomAddress={handleUseCustomAddress}
          />
        )}

        {/* Route planning form */}
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

        {/* Final generated plan */}
        {generatedPlan && <GeneratedPlan plan={generatedPlan} />}

        {/* Small debug helper */}
        {selectedOffer && (
          <div style={{ marginTop: "20px", opacity: 0.75, fontSize: "14px" }}>
            Current step: <strong>{step}</strong>
            {stayMode ? (
              <>
                {" "}
                | Stay mode: <strong>{stayMode}</strong>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}