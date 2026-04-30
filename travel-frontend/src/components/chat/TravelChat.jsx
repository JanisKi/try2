// travel-frontend/src/components/chat/TravelChat.jsx

import { useMemo, useState } from "react";
import { api } from "../../api";

import ChatTranscript from "./ChatTranscript";
import FlightResults from "./FlightResults";
import StayChoice from "./StayChoice";
import HotelResults from "./HotelResults";
import TransferResults from "./TransferResults";
import TripPlanForm from "./TripPlanForm";
import GeneratedPlan from "./GeneratedPlan";
import TripItineraryBuilder from "./TripItineraryBuilder";

/**
 * Build structured params from the flight search form.
 *
 * This goes to:
 *   POST /api/chat/search-flights/
 */
function buildFlightParams(form) {
  return {
    origin: (form.origin || "").trim(),
    destination: (form.destination || "").trim(),
    departure_date: form.departure_date || "",
    return_date: form.return_enabled ? form.return_date || "" : "",
    adults: Number(form.adults || 1),
    budget:
      form.budget !== "" && form.budget !== null && form.budget !== undefined
        ? Number(form.budget) || null
        : null,
    max_stops:
      form.max_stops !== "" && form.max_stops !== null
        ? Number(form.max_stops)
        : null,
  };
}

/**
 * Convert backend flight_widget shape into editable React form state.
 */
function widgetToForm(widget) {
  if (!widget) {
    return {
      origin: "",
      destination: "",
      departure_date: "",
      return_date: "",
      return_enabled: false,
      adults: 1,
      budget: "",
      max_stops: "",
    };
  }

  return {
    origin: widget.origin_city || widget.origin_iata || "",
    destination: widget.destination_city || widget.destination_iata || "",
    departure_date: widget.departure_date || "",
    return_date: widget.return_date || "",
    return_enabled: !!widget.return_enabled,
    adults: widget.adults || 1,
    budget: widget.budget ?? "",
    max_stops:
      widget.max_stops === 0 || widget.max_stops === "0"
        ? 0
        : widget.max_stops ?? "",
  };
}

/**
 * Main travel chat page.
 *
 * Flow:
 * 1. User sends text prompt or edits flight search widget.
 * 2. User selects a flight.
 * 3. User chooses hotel or custom address.
 * 4. User chooses transport/transfer options.
 * 5. User presses Generate trip plan.
 * 6. New TripItineraryBuilder appears with editable day-by-day itinerary.
 */
export default function TravelChat() {
  // -----------------------------
  // Basic chat state
  // -----------------------------
  const [prompt, setPrompt] = useState("");
  const [out, setOut] = useState("");

  // -----------------------------
  // Flight widget + search form
  // -----------------------------
  const [flightWidget, setFlightWidget] = useState(null);
  const [searchForm, setSearchForm] = useState(widgetToForm(null));

  // -----------------------------
  // Selected flight
  // -----------------------------
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [selectedOfferKey, setSelectedOfferKey] = useState("");

  // -----------------------------
  // Flow step
  // -----------------------------
  const [step, setStep] = useState("chat");

  // -----------------------------
  // Hotel / destination state
  // -----------------------------
  const [stayMode, setStayMode] = useState(null);
  const [hotelWidget, setHotelWidget] = useState(null);
  const [hotelLoading, setHotelLoading] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState(null);

  // -----------------------------
  // Transfer state
  // -----------------------------
  const [transferWidget, setTransferWidget] = useState(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferSearchTarget, setTransferSearchTarget] = useState(null);
  const [selectedArrivalTransfer, setSelectedArrivalTransfer] = useState(null);
  const [selectedReturnTransfer, setSelectedReturnTransfer] = useState(null);

  // -----------------------------
  // Route planning form state
  // -----------------------------
  const [startAddress, setStartAddress] = useState("");
  const [arrivalDestinationAddress, setArrivalDestinationAddress] = useState("");

  const [toAirportMode, setToAirportMode] = useState("drive");
  const [fromAirportMode, setFromAirportMode] = useState("transit");
  const [returnToAirportMode, setReturnToAirportMode] = useState("transit");
  const [returnHomeMode, setReturnHomeMode] = useState("drive");

  // -----------------------------
  // Generated route plan
  // -----------------------------
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);

  /**
   * Keep chat transcript updates simple.
   */
  function appendTranscriptLine(prefix, text) {
    setOut((prev) => `${prev}${prefix}: ${text}\n`);
  }

  /**
   * Reset everything downstream of flight search.
   */
  function resetSelectionFlow() {
    setSelectedOffer(null);
    setSelectedOfferKey("");
    setStep("chat");

    setStayMode(null);
    setHotelWidget(null);
    setHotelLoading(false);
    setSelectedHotel(null);

    setTransferWidget(null);
    setTransferLoading(false);
    setTransferSearchTarget(null);
    setSelectedArrivalTransfer(null);
    setSelectedReturnTransfer(null);

    setStartAddress("");
    setArrivalDestinationAddress("");

    setToAirportMode("drive");
    setFromAirportMode("transit");
    setReturnToAirportMode("transit");
    setReturnHomeMode("drive");

    setGeneratedPlan(null);
  }

  /**
   * Clear the whole travel chat.
   */
  function handleClearAll() {
    setPrompt("");
    setOut("");
    setFlightWidget(null);
    setSearchForm(widgetToForm(null));
    resetSelectionFlow();
  }

  /**
   * Apply backend flight widget and sync it into the editable form.
   */
  function applyFlightWidget(widget) {
    setFlightWidget(widget || null);
    setSearchForm(widgetToForm(widget));
  }

  /**
   * Send free-text travel request.
   */
  async function send() {
    const userText = prompt.trim();
    if (!userText) return;

    setPrompt("");
    setFlightWidget(null);
    resetSelectionFlow();
    appendTranscriptLine("YOU", userText);

    try {
      const response = await api.post("/chat/send/", { prompt: userText });
      appendTranscriptLine("BOT", response.data?.answer || "Done.");
      applyFlightWidget(response.data?.flight_widget || null);
    } catch (err) {
      console.error(err);
      appendTranscriptLine("BOT", "Error: request failed.");
    }
  }

  /**
   * Re-run flight search from the editable widget.
   */
  async function handleSearchAgain() {
    if (!searchForm.origin || !searchForm.destination || !searchForm.departure_date) {
      alert("Please fill origin, destination, and departure date.");
      return;
    }

    const params = buildFlightParams(searchForm);

    setFlightWidget(null);
    resetSelectionFlow();

    appendTranscriptLine(
      "SEARCH",
      `${params.origin} → ${params.destination} on ${params.departure_date}` +
        (params.return_date ? ` / return ${params.return_date}` : "") +
        ` · ${params.adults} adult(s)`,
    );

    try {
      const response = await api.post("/chat/search-flights/", params);
      appendTranscriptLine("BOT", response.data?.answer || "Done.");
      applyFlightWidget(response.data?.flight_widget || null);
    } catch (err) {
      console.error(err);
      const detail = err?.response?.data?.detail || "Flight search failed.";
      appendTranscriptLine("BOT", `Error: ${detail}`);
    }
  }

  /**
   * Select one flight offer and move to stay choice.
   */
  function handleSelectOffer(offer, offerKey) {
    setSelectedOffer(offer);
    setSelectedOfferKey(offerKey);

    // Reset everything after flight selection.
    setStayMode(null);
    setHotelWidget(null);
    setSelectedHotel(null);

    setTransferWidget(null);
    setTransferSearchTarget(null);
    setSelectedArrivalTransfer(null);
    setSelectedReturnTransfer(null);

    setArrivalDestinationAddress("");
    setGeneratedPlan(null);

    setStep("stay-choice");
  }

  /**
   * Search hotels after flight selection.
   */
  async function handleChooseHotel() {
    if (!selectedOffer || !flightWidget) {
      alert("Please select a flight first.");
      return;
    }

    try {
      setHotelLoading(true);
      setStep("hotel-select");

      const response = await api.post("/chat/search-hotels/", {
        selected_offer: selectedOffer,
        destination_city: flightWidget?.destination_city || flightWidget?.destination_iata || "",
        adults: flightWidget?.adults || 1,
        budget_remaining: remainingBudget,
      });

      setStayMode("hotel");
      setHotelWidget(response.data || null);
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
   * Skip hotel search and type destination manually.
   */
  function handleUseCustomAddress() {
    setStayMode("address");
    setSelectedHotel(null);
    setHotelWidget(null);

    setTransferWidget(null);
    setTransferSearchTarget(null);
    setSelectedArrivalTransfer(null);
    setSelectedReturnTransfer(null);

    setArrivalDestinationAddress("");
    setGeneratedPlan(null);

    setStep("route-details");
  }

  /**
   * Select hotel and move to route details.
   */
  function handleSelectHotel(hotel) {
    setSelectedHotel(hotel);
    setStayMode("hotel");
    setArrivalDestinationAddress(hotel?.address || hotel?.name || "");

    // Hotel changed, so clear transfer selections.
    setTransferWidget(null);
    setTransferSearchTarget(null);
    setSelectedArrivalTransfer(null);
    setSelectedReturnTransfer(null);

    setGeneratedPlan(null);
    setStep("route-details");
  }

  /**
   * Search transfer for arrival airport -> hotel/address.
   */
  async function handleSearchArrivalTransfer() {
    if (!selectedOffer || !flightWidget) {
      alert("Please select a flight first.");
      return;
    }

    if (!arrivalDestinationAddress.trim()) {
      alert("Please choose a hotel or enter your destination address first.");
      return;
    }

    try {
      setTransferLoading(true);
      setTransferSearchTarget("arrival");
      setStep("transfer-select");

      const response = await api.post("/chat/search-transfers/", {
        selected_offer: selectedOffer,
        direction: "arrival",
        destination_address: arrivalDestinationAddress,
        adults: flightWidget?.adults || 1,
        budget_remaining: remainingBudget,
      });

      setTransferWidget(response.data || null);
    } catch (err) {
      console.error(err);
      const detail =
        err?.response?.data?.detail ||
        "Transfer search failed. You can still use drive or public transport.";
      alert(detail);
      setStep("route-details");
    } finally {
      setTransferLoading(false);
    }
  }

  /**
   * Search transfer for hotel/address -> return airport.
   */
  async function handleSearchReturnTransfer() {
    if (!selectedOffer || !flightWidget) {
      alert("Please select a flight first.");
      return;
    }

    if (!arrivalDestinationAddress.trim()) {
      alert("Please choose a hotel or enter your destination address first.");
      return;
    }

    try {
      setTransferLoading(true);
      setTransferSearchTarget("return");
      setStep("transfer-select");

      const response = await api.post("/chat/search-transfers/", {
        selected_offer: selectedOffer,
        direction: "return",
        destination_address: arrivalDestinationAddress,
        adults: flightWidget?.adults || 1,
        budget_remaining: remainingBudget,
      });

      setTransferWidget(response.data || null);
    } catch (err) {
      console.error(err);
      const detail =
        err?.response?.data?.detail ||
        "Return transfer search failed. You can still use drive or public transport.";
      alert(detail);
      setStep("route-details");
    } finally {
      setTransferLoading(false);
    }
  }

  /**
   * Save chosen transfer and go back to route details.
   */
  function handleSelectTransfer(transfer) {
    if (transferSearchTarget === "arrival") {
      setSelectedArrivalTransfer(transfer);
      setFromAirportMode("transfer");
    } else if (transferSearchTarget === "return") {
      setSelectedReturnTransfer(transfer);
      setReturnToAirportMode("transfer");
    }

    setGeneratedPlan(null);
    setStep("route-details");
  }

  /**
   * Generate route/transport plan.
   *
   * After this succeeds, TripItineraryBuilder appears automatically.
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

    if (fromAirportMode === "transfer" && !selectedArrivalTransfer) {
      alert("Please search and select an arrival transfer first.");
      return;
    }

    if (
      flightWidget?.return_enabled &&
      returnToAirportMode === "transfer" &&
      !selectedReturnTransfer
    ) {
      alert("Please search and select a return transfer first.");
      return;
    }

    try {
      setPlanLoading(true);

      const response = await api.post("/chat/generate-trip-plan/", {
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

        selected_hotel: selectedHotel
          ? {
              name: selectedHotel.name,
              address: selectedHotel.address,
              price_total: selectedHotel.price_total,
              currency: selectedHotel.currency,
              price_total_eur: selectedHotel.price_total_eur,
            }
          : null,

        selected_arrival_transfer: selectedArrivalTransfer
          ? {
              id: selectedArrivalTransfer.id,
              name: selectedArrivalTransfer.name,
              vehicle: selectedArrivalTransfer.vehicle,
              price_total: selectedArrivalTransfer.price_total,
              currency: selectedArrivalTransfer.currency,
              price_total_eur: selectedArrivalTransfer.price_total_eur,
            }
          : null,

        selected_return_transfer: selectedReturnTransfer
          ? {
              id: selectedReturnTransfer.id,
              name: selectedReturnTransfer.name,
              vehicle: selectedReturnTransfer.vehicle,
              price_total: selectedReturnTransfer.price_total,
              currency: selectedReturnTransfer.currency,
              price_total_eur: selectedReturnTransfer.price_total_eur,
            }
          : null,
      });

      setGeneratedPlan(response.data);
    } catch (err) {
      console.error(err);
      const detail = err?.response?.data?.detail || "Failed to generate trip plan.";
      alert(detail);
    } finally {
      setPlanLoading(false);
    }
  }

  /**
   * Remaining budget after chosen flight/hotel/transfers.
   */
  const remainingBudget = useMemo(() => {
    const budget = Number(flightWidget?.budget || 0);
    const selectedPrice = Number(selectedOffer?.price?.total || 0);
    const hotelPrice = Number(selectedHotel?.price_total_eur || 0);
    const arrivalTransferPrice = Number(selectedArrivalTransfer?.price_total_eur || 0);
    const returnTransferPrice = Number(selectedReturnTransfer?.price_total_eur || 0);

    const result =
      budget -
      selectedPrice -
      hotelPrice -
      arrivalTransferPrice -
      returnTransferPrice;

    return Number.isFinite(result) ? result : 0;
  }, [
    flightWidget,
    selectedOffer,
    selectedHotel,
    selectedArrivalTransfer,
    selectedReturnTransfer,
  ]);

  return (
    <main style={styles.page}>
      <section style={styles.chatBar}>
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder='Try: "flight from Riga to Amsterdam tomorrow, 1 adult"'
          style={styles.promptInput}
          onKeyDown={(event) => {
            if (event.key === "Enter") send();
          }}
        />

        <button type="button" onClick={send} style={styles.primaryButton}>
          Send
        </button>

        <button type="button" onClick={handleClearAll} style={styles.secondaryButton}>
          Clear
        </button>
      </section>

      <ChatTranscript text={out} />

      {flightWidget && (
        <FlightResults
          flightWidget={flightWidget}
          searchForm={searchForm}
          setSearchForm={setSearchForm}
          selectedOfferKey={selectedOfferKey}
          remainingBudget={remainingBudget}
          selectedHotel={selectedHotel}
          onSelectOffer={handleSelectOffer}
          onSearchAgain={handleSearchAgain}
        />
      )}

      {selectedOffer && step === "stay-choice" && (
        <StayChoice
          hotelLoading={hotelLoading}
          onChooseHotel={handleChooseHotel}
          onUseCustomAddress={handleUseCustomAddress}
        />
      )}

      {selectedOffer && step === "hotel-select" && (
        <HotelResults
          hotelLoading={hotelLoading}
          hotelWidget={hotelWidget}
          onSelectHotel={handleSelectHotel}
          onUseCustomAddress={handleUseCustomAddress}
        />
      )}

      {selectedOffer && step === "transfer-select" && (
        <TransferResults
          transferLoading={transferLoading}
          transferWidget={transferWidget}
          transferSearchTarget={transferSearchTarget}
          onSelectTransfer={handleSelectTransfer}
          onBackToRouteDetails={() => setStep("route-details")}
        />
      )}

      {selectedOffer && step === "route-details" && (
        <TripPlanForm
          flightWidget={flightWidget}
          selectedHotel={selectedHotel}
          selectedArrivalTransfer={selectedArrivalTransfer}
          selectedReturnTransfer={selectedReturnTransfer}
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
          onSearchArrivalTransfer={handleSearchArrivalTransfer}
          onSearchReturnTransfer={handleSearchReturnTransfer}
        />
      )}

      {/* Old raw route card is still useful, but it is now collapsed below the new UI. */}
      {generatedPlan && (
        <TripItineraryBuilder
          flightWidget={flightWidget}
          selectedOffer={selectedOffer}
          selectedHotel={selectedHotel}
          selectedArrivalTransfer={selectedArrivalTransfer}
          selectedReturnTransfer={selectedReturnTransfer}
          routePlan={generatedPlan}
          arrivalDestinationAddress={arrivalDestinationAddress}
          remainingBudget={remainingBudget}
        />
      )}

      {generatedPlan && (
        <details style={styles.oldPlanDetails}>
          <summary>Show old/generated transport plan</summary>
          <GeneratedPlan plan={generatedPlan} />
        </details>
      )}
    </main>
  );
}

const styles = {
  page: {
    padding: "18px",
    background: "#0b0f17",
    color: "#ffffff",
    minHeight: "100vh",
  },
  chatBar: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "14px",
  },
  promptInput: {
    flex: 1,
    minWidth: "280px",
    padding: "12px",
    borderRadius: "10px",
    border: "1px solid #374151",
    background: "#111827",
    color: "#ffffff",
  },
  primaryButton: {
    padding: "10px 16px",
    borderRadius: "10px",
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: 700,
  },
  secondaryButton: {
    padding: "10px 16px",
    borderRadius: "10px",
    border: "1px solid #374151",
    background: "#111827",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: 700,
  },
  oldPlanDetails: {
    marginTop: "16px",
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid #374151",
    background: "#111827",
  },
};