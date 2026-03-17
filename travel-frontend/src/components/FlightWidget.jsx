// travel-frontend/src/components/FlightWidget.jsx

import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

function formatDuration(iso) {
  if (!iso) return "";
  const h = iso.match(/(\d+)H/)?.[1];
  const m = iso.match(/(\d+)M/)?.[1];
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return parts.join(" ") || iso;
}

function formatDateTime(dt) {
  if (!dt) return "";
  return dt.replace("T", " ");
}

function priceNumber(offer) {
  const v = offer?.price?.total;
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

function stopsForItinerary(itinerary) {
  const segs = itinerary?.segments || [];
  return Math.max(0, segs.length - 1);
}

function maxStopsForOffer(offer) {
  const itineraries = offer?.itineraries || [];
  if (itineraries.length === 0) return 0;
  return Math.max(...itineraries.map((it) => stopsForItinerary(it)));
}

function googleFlightsLink(originText, destText, departDate, returnDate, adults) {
  const q = returnDate
    ? `Flights from ${originText} to ${destText} on ${departDate} returning ${returnDate} for ${adults} adults`
    : `Flights from ${originText} to ${destText} on ${departDate} for ${adults} adults`;

  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}

function ItineraryBlock({ title, itinerary }) {
  if (!itinerary) return null;

  const segments = itinerary.segments || [];

  return (
    <div style={{ marginBottom: 16 }}>
      <div><strong>{title}</strong></div>

      {itinerary.duration && (
        <div style={{ marginTop: 6 }}>
          Duration: {formatDuration(itinerary.duration)}
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <strong>Segments:</strong>
        <ul>
          {segments.map((s, i) => (
            <li key={i}>
              {s.departure?.iataCode} ({formatDateTime(s.departure?.at)}) →{" "}
              {s.arrival?.iataCode} ({formatDateTime(s.arrival?.at)}) | Carrier:{" "}
              {s.carrierCode} Flight: {s.number}
            </li>
          ))}
        </ul>
      </div>

      <div>Stops: {Math.max(0, segments.length - 1)}</div>
    </div>
  );
}

function TransitSteps({ steps }) {
  if (!steps || steps.length === 0) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <strong>Transit steps:</strong>
      <ul>
        {steps.map((s, idx) => (
          <li key={idx}>
            {s.travel_mode || "STEP"}
            {s.transit?.line_name ? ` | ${s.transit.line_name}` : ""}
            {s.transit?.departure_stop ? ` | from ${s.transit.departure_stop}` : ""}
            {s.transit?.arrival_stop ? ` | to ${s.transit.arrival_stop}` : ""}
            {s.transit?.headsign ? ` | ${s.transit.headsign}` : ""}
            {s.instruction ? ` | ${s.instruction}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function FlightWidget({ initial }) {
  const [cities, setCities] = useState([]);

  const [origin, setOrigin] = useState(initial?.origin_iata || initial?.origin_city || "");
  const [destination, setDestination] = useState(
    initial?.destination_iata || initial?.destination_city || ""
  );
  const [departureDate, setDepartureDate] = useState(initial?.departure_date || "");
  const [adults, setAdults] = useState(initial?.adults || 1);

  const [returnEnabled, setReturnEnabled] = useState(Boolean(initial?.return_enabled));
  const [returnDate, setReturnDate] = useState(initial?.return_date || "");

  const [maxStops, setMaxStops] = useState(initial?.max_stops === 0 ? "0" : "any");
  const [budget, setBudget] = useState(
    initial?.budget !== null && initial?.budget !== undefined ? String(initial.budget) : ""
  );

  const [offers, setOffers] = useState(initial?.offers || []);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [selectedOffer, setSelectedOffer] = useState(null);
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);

  const [startAddress, setStartAddress] = useState("");
  const [toAirportMode, setToAirportMode] = useState("drive");

  const [arrivalDestinationAddress, setArrivalDestinationAddress] = useState("");
  const [fromAirportMode, setFromAirportMode] = useState("drive");

  useEffect(() => {
    const loadCities = async () => {
      try {
        const r = await api.get("/travel/cities/");
        setCities(r.data?.cities || []);
      } catch {
        setCities([]);
      }
    };
    loadCities();
  }, []);

  const filteredSortedOffers = useMemo(() => {
    let list = [...offers];

    if (maxStops !== "any") {
      const ms = Number(maxStops);
      list = list.filter((o) => maxStopsForOffer(o) <= ms);
    }

    if (budget.trim()) {
      const b = Number(budget);
      if (Number.isFinite(b)) {
        list = list.filter((o) => Number(o?.price?.total) <= b);
      }
    }

    list.sort((a, b) => priceNumber(a) - priceNumber(b));
    return list;
  }, [offers, maxStops, budget]);

  const search = async () => {
    setErr("");
    setLoading(true);
    setSelectedOffer(null);
    setGeneratedPlan(null);

    try {
      if (returnEnabled && !returnDate) {
        setErr("Please choose a return date.");
        return;
      }

      const body = {
        origin,
        destination,
        departure_date: departureDate,
        adults: Number(adults),
      };

      if (returnEnabled) {
        body.return_date = returnDate;
      }

      const r = await api.post("/travel/flights/search/", body);
      setOffers(r.data?.data || []);
    } catch (e) {
      const msg = e?.response?.data?.detail;
      setErr(msg || "Flight search failed.");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      search();
    }
  };

  function handleSelectOffer(offer) {
    setSelectedOffer(offer);
    setGeneratedPlan(null);
    setErr("");
  }

  function handleClearSelection() {
    setSelectedOffer(null);
    setGeneratedPlan(null);
    setErr("");
  }

  async function handleGeneratePlan() {
    if (!selectedOffer) {
      setErr("Please select a flight first.");
      return;
    }

    if (!startAddress.trim()) {
      setErr("What is your starting location? Please enter your address first.");
      return;
    }

    try {
      setPlanLoading(true);
      setErr("");

      const res = await api.post("/chat/generate-trip-plan/", {
        selected_offer: selectedOffer,
        origin,
        destination,
        departure_date: departureDate,
        return_date: returnEnabled ? returnDate : null,
        adults: Number(adults),
        budget: budget ? Number(budget) : null,
        max_stops: maxStops === "any" ? null : Number(maxStops),

        start_address: startAddress.trim(),
        to_airport_mode: toAirportMode,

        arrival_destination_address: arrivalDestinationAddress.trim(),
        from_airport_mode: fromAirportMode,
      });

      setGeneratedPlan(res.data);
    } catch (e) {
      const msg = e?.response?.data?.detail;
      setErr(msg || "Failed to generate trip plan.");
    } finally {
      setPlanLoading(false);
    }
  }

  const remainingBudget = selectedOffer
    ? Number(budget || 0) - Number(selectedOffer?.price?.total || 0)
    : Number(budget || 0);

  return (
    <div>
      <h2>Flight search widget</h2>

      <datalist id="city-options">
        {cities.map((c, idx) => (
          <option key={idx} value={c.city || c.iata_code}>
            {c.city} ({c.iata_code})
          </option>
        ))}
      </datalist>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          From:
          <input
            list="city-options"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Riga or RIX"
            style={{ marginLeft: 8, width: 160 }}
          />
        </label>

        <label>
          To:
          <input
            list="city-options"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Amsterdam or AMS"
            style={{ marginLeft: 8, width: 160 }}
          />
        </label>

        <label>
          Departure:
          <input
            type="date"
            value={departureDate}
            onChange={(e) => setDepartureDate(e.target.value)}
            onKeyDown={onKeyDown}
            style={{ marginLeft: 8 }}
          />
        </label>

        <label>
          Adults:
          <input
            type="number"
            min="1"
            max="9"
            value={adults}
            onChange={(e) => setAdults(e.target.value)}
            onKeyDown={onKeyDown}
            style={{ marginLeft: 8, width: 70 }}
          />
        </label>

        <label>
          Stops:
          <select value={maxStops} onChange={(e) => setMaxStops(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="any">Any</option>
            <option value="0">Direct only</option>
            <option value="1">Max 1</option>
            <option value="2">Max 2</option>
          </select>
        </label>

        <label>
          Budget (EUR):
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="500"
            style={{ marginLeft: 8, width: 90 }}
          />
        </label>

        <label>
          <input
            type="checkbox"
            checked={returnEnabled}
            onChange={(e) => setReturnEnabled(e.target.checked)}
          />{" "}
          Return flight
        </label>

        {returnEnabled && (
          <label>
            Return:
            <input
              type="date"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              onKeyDown={onKeyDown}
              style={{ marginLeft: 8 }}
            />
          </label>
        )}

        <button onClick={search}>{loading ? "Searching..." : "Search"}</button>
      </div>

      {origin && destination && departureDate && (
        <p>
          <strong>Get tickets:</strong>{" "}
          <a
            href={googleFlightsLink(origin, destination, departureDate, returnEnabled ? returnDate : "", adults)}
            target="_blank"
            rel="noreferrer"
          >
            Open in Google Flights
          </a>
        </p>
      )}

      {err && <p style={{ color: "#ff8a8a" }}>{err}</p>}

      {budget && (
        <div
          style={{
            marginTop: 12,
            marginBottom: 16,
            padding: "10px 12px",
            background: "#1b1b1b",
            borderRadius: "10px",
            border: "1px solid #333",
            fontWeight: "bold",
          }}
        >
          Remaining budget: {Number.isFinite(remainingBudget) ? remainingBudget.toFixed(2) : "-"} EUR
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label>
          <strong>Start address:</strong>
        </label>
        <br />
        <input
          value={startAddress}
          onChange={(e) => setStartAddress(e.target.value)}
          placeholder="Enter your starting location"
          style={{ width: "420px", maxWidth: "100%", padding: "10px", marginTop: "8px" }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>
          <strong>How will you get to the airport?</strong>
        </label>
        <br />
        <select value={toAirportMode} onChange={(e) => setToAirportMode(e.target.value)} style={{ marginTop: 8 }}>
          <option value="drive">Drive</option>
          <option value="transit">Public transport</option>
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>
          <strong>Destination address after landing:</strong>
        </label>
        <br />
        <input
          value={arrivalDestinationAddress}
          onChange={(e) => setArrivalDestinationAddress(e.target.value)}
          placeholder="Example: London Westminster Palace Gardens, Artillery Row"
          style={{ width: "520px", maxWidth: "100%", padding: "10px", marginTop: "8px" }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>
          <strong>How will you get there from the airport?</strong>
        </label>
        <br />
        <select value={fromAirportMode} onChange={(e) => setFromAirportMode(e.target.value)} style={{ marginTop: 8 }}>
          <option value="drive">Drive / car</option>
          <option value="transit">Public transport</option>
        </select>
      </div>

      {filteredSortedOffers.length > 0 && (
        <div>
          <h3>Results (cheapest first)</h3>

          {filteredSortedOffers
            .filter((offer) => {
              if (!selectedOffer) return true;
              return offer === selectedOffer;
            })
            .slice(0, 10)
            .map((offer, idx) => {
              const outbound = offer.itineraries?.[0];
              const inbound = offer.itineraries?.[1];

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

                  <h3 style={{ marginTop: 0, marginRight: "160px" }}>
                    {offer.price?.total} {offer.price?.currency}
                  </h3>

                  <ItineraryBlock title="Outbound" itinerary={outbound} />
                  {inbound && <ItineraryBlock title="Return" itinerary={inbound} />}
                </div>
              );
            })}

          {selectedOffer && (
            <div style={{ marginTop: 20 }}>
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

      {!loading && offers.length === 0 && !err && (
        <p>No results yet. Enter details and search.</p>
      )}

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

          <p><strong>Flight:</strong> {generatedPlan.flight_summary || "-"}</p>
          <p>
            <strong>Remaining budget:</strong>{" "}
            {generatedPlan.remaining_budget != null
              ? `${Number(generatedPlan.remaining_budget).toFixed(2)} EUR`
              : "-"}
          </p>

          {generatedPlan.leg1 && (
            <div style={{ marginTop: 20 }}>
              <h3>Before flight: go to departure airport</h3>
              <p><strong>Mode:</strong> {generatedPlan.leg1.mode}</p>
              <p><strong>From:</strong> {generatedPlan.leg1.start_address}</p>
              <p><strong>To:</strong> {generatedPlan.leg1.destination}</p>
              <p><strong>Leave home at:</strong> {generatedPlan.leg1.leave_home_at || "-"}</p>
              <p><strong>Duration:</strong> {generatedPlan.leg1.duration_minutes != null ? `${generatedPlan.leg1.duration_minutes} min` : "-"}</p>
              <p>
                <strong>Route:</strong>{" "}
                {generatedPlan.leg1.google_maps_url ? (
                  <a href={generatedPlan.leg1.google_maps_url} target="_blank" rel="noreferrer">
                    Open in Google Maps
                  </a>
                ) : "-"}
              </p>

              <TransitSteps steps={generatedPlan.leg1.steps} />
            </div>
          )}

          {generatedPlan.leg2 && (
            <div style={{ marginTop: 20 }}>
              <h3>After landing: go to destination</h3>
              <p><strong>Mode:</strong> {generatedPlan.leg2.mode}</p>
              <p><strong>From:</strong> {generatedPlan.leg2.start_address}</p>
              <p><strong>To:</strong> {generatedPlan.leg2.destination}</p>
              <p><strong>Duration:</strong> {generatedPlan.leg2.duration_minutes != null ? `${generatedPlan.leg2.duration_minutes} min` : "-"}</p>
              <p>
                <strong>Route:</strong>{" "}
                {generatedPlan.leg2.google_maps_url ? (
                  <a href={generatedPlan.leg2.google_maps_url} target="_blank" rel="noreferrer">
                    Open in Google Maps
                  </a>
                ) : "-"}
              </p>

              <TransitSteps steps={generatedPlan.leg2.steps} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}