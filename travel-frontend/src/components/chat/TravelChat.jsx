import { useMemo, useState } from "react";
import { api } from "../../api";

import ChatTranscript from "./ChatTranscript";
import FlightResults from "./FlightResults";
import StayChoice from "./StayChoice";
import HotelResults from "./HotelResults";
import TransferResults from "./TransferResults";
import TripPlanForm from "./TripPlanForm";
import GeneratedPlan from "./GeneratedPlan";
import TravelExtrasPanel from "./TravelExtrasPanel";

/**
 * Build structured params from the search form for the /chat/search-flights/ endpoint.
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
 * Convert backend flight_widget shape into editable form state.
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
  // Steps used:
  // - "chat"
  // - "stay-choice"
  // - "hotel-select"
  // - "transfer-select"
  // - "route-details"
  // -----------------------------
  const [step, setStep] = useState("chat");

  // -----------------------------
  // Stay / hotel state
  // -----------------------------
  const [stayMode, setStayMode] = useState(null); // "hotel" | "address" | null
  const [hotelWidget, setHotelWidget] = useState(null);
  const [hotelLoading, setHotelLoading] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState(null);

  // -----------------------------
  // Transfer search state
  // transferSearchTarget:
  // - "arrival": arrival airport -> hotel/address
  // - "return": hotel/address -> return airport
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
  // Generated plan
  // -----------------------------
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);

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

  function handleClearAll() {
    setPrompt("");
    setOut("");
    setFlightWidget(null);
    setSearchForm(widgetToForm(null));
    resetSelectionFlow();
  }

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
      const r = await api.post("/chat/send/", { prompt: userText });
      appendTranscriptLine("BOT", r.data?.answer || "Done.");
      applyFlightWidget(r.data?.flight_widget || null);
    } catch (err) {
      console.error(err);
      appendTranscriptLine("BOT", "Error: request failed.");
    }
  }

  /**
   * Re-run flight search from widget controls using the structured endpoint
   * (no NLP round-trip — fields are passed directly).
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
      const r = await api.post("/chat/search-flights/", params);
      appendTranscriptLine("BOT", r.data?.answer || "Done.");
      applyFlightWidget(r.data?.flight_widget || null);
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

    // reset downstream state
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
   * Select hotel and move to route-details.
   */
  function handleSelectHotel(hotel) {
    setSelectedHotel(hotel);
    setStayMode("hotel");
    setArrivalDestinationAddress(hotel?.address || hotel?.name || "");

    // hotel changed => clear transfer selections
    setTransferWidget(null);
    setTransferSearchTarget(null);
    setSelectedArrivalTransfer(null);
    setSelectedReturnTransfer(null);

    setGeneratedPlan(null);
    setStep("route-details");
  }

  /**
   * Search transfer for arrival airport -> hotel/address.
   * Backend can derive airport + timing from selected_offer.
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

      const res = await api.post("/chat/search-transfers/", {
        selected_offer: selectedOffer,
        direction: "arrival",
        destination_address: arrivalDestinationAddress,
        adults: flightWidget?.adults || 1,
        budget_remaining: remainingBudget,
      });

      setTransferWidget(res.data || null);
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

      const res = await api.post("/chat/search-transfers/", {
        selected_offer: selectedOffer,
        direction: "return",
        destination_address: arrivalDestinationAddress,
        adults: flightWidget?.adults || 1,
        budget_remaining: remainingBudget,
      });

      setTransferWidget(res.data || null);
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
   * Save chosen transfer and go back to route-details.
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

    // If user selected transfer mode but did not actually pick one, block submit.
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

        selected_hotel: selectedHotel
          ? {
              name: selectedHotel.name,
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
   * Remaining budget after chosen flight/hotel/transfers.
   */
  const remainingBudget = useMemo(() => {
    const budget = Number(flightWidget?.budget || 0);
    const selectedPrice = Number(selectedOffer?.price?.total || 0);
    const hotelPrice = Number(selectedHotel?.price_total_eur || 0);
    const arrivalTransferPrice = Number(selectedArrivalTransfer?.price_total_eur || 0);
    const returnTransferPrice = Number(selectedReturnTransfer?.price_total_eur || 0);

    const result =
      budget - selectedPrice - hotelPrice - arrivalTransferPrice - returnTransferPrice;

    return Number.isFinite(result) ? result : 0;
  }, [
    flightWidget,
    selectedOffer,
    selectedHotel,
    selectedArrivalTransfer,
    selectedReturnTransfer,
  ]);

  return (
    <div>
      {/* Free-text prompt row */}
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

      {/* Flight search widget + offers */}
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

      {/* Choose stay mode */}
      {selectedOffer && step === "stay-choice" && (
        <StayChoice
          hotelLoading={hotelLoading}
          onChooseHotel={handleChooseHotel}
          onUseCustomAddress={handleUseCustomAddress}
        />
      )}

      {/* Hotel search results */}
      {selectedOffer && step === "hotel-select" && (
        <HotelResults
          hotelLoading={hotelLoading}
          hotelWidget={hotelWidget}
          onSelectHotel={handleSelectHotel}
          onUseCustomAddress={handleUseCustomAddress}
        />
      )}

      {/* Transfer search results */}
      {selectedOffer && step === "transfer-select" && (
        <TransferResults
          transferLoading={transferLoading}
          transferWidget={transferWidget}
          transferSearchTarget={transferSearchTarget}
          onSelectTransfer={handleSelectTransfer}
          onBackToRouteDetails={() => setStep("route-details")}
        />
      )}

      {/* Route details and mode selection */}
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

      {/* Things to do / restaurants / tours / AI itinerary */}
      {selectedOffer && step === "route-details" && arrivalDestinationAddress && (
        <TravelExtrasPanel
          flightWidget={flightWidget}
          arrivalDestinationAddress={arrivalDestinationAddress}
          remainingBudget={remainingBudget}
        />
      )}

      {/* Final generated trip plan */}
      {generatedPlan && <GeneratedPlan plan={generatedPlan} />}
    </div>
  );
}