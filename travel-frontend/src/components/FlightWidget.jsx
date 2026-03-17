// travel-frontend/src/components/FlightWidget.jsx

import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

// ----------------------------------------------------
// Helper: convert ISO duration like "PT2H40M" -> "2h 40m"
// ----------------------------------------------------
function formatDuration(iso) {
  if (!iso) return "";
  const h = iso.match(/(\d+)H/)?.[1];
  const m = iso.match(/(\d+)M/)?.[1];

  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);

  return parts.join(" ") || iso;
}

// ----------------------------------------------------
// Helper: make date/time string more readable
// ----------------------------------------------------
function formatDateTime(dt) {
  if (!dt) return "";
  return dt.replace("T", " ");
}

// ----------------------------------------------------
// Helper: safe numeric price for sorting
// ----------------------------------------------------
function priceNumber(offer) {
  const v = offer?.price?.total;
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

// ----------------------------------------------------
// Helper: stops = segments - 1 (for outbound itinerary)
// ----------------------------------------------------
function stopsForOffer(offer) {
  const segs = offer?.itineraries?.[0]?.segments || [];
  return Math.max(0, segs.length - 1);
}

// ----------------------------------------------------
// Helper: build Google Flights search link
// ----------------------------------------------------
function googleFlightsLink(originText, destText, departDate, returnDate, adults) {
  const q = returnDate
    ? `Flights from ${originText} to ${destText} on ${departDate} returning ${returnDate} for ${adults} adults`
    : `Flights from ${originText} to ${destText} on ${departDate} for ${adults} adults}`;

  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}

// ----------------------------------------------------
// Reusable itinerary block
// ----------------------------------------------------
function ItineraryBlock({ title, itinerary }) {
  if (!itinerary) return null;

  const segments = itinerary.segments || [];

  return (
    <div style={{ marginBottom: 16 }}>
      <div>
        <strong>{title}</strong>
      </div>

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

export default function FlightWidget({ initial }) {
  // ----------------------------------------------------
  // Cached city list for autocomplete dropdown
  // ----------------------------------------------------
  const [cities, setCities] = useState([]);

  // ----------------------------------------------------
  // Editable search fields
  // ----------------------------------------------------
  const [origin, setOrigin] = useState(initial?.origin_iata || initial?.origin_city || "");
  const [destination, setDestination] = useState(
    initial?.destination_iata || initial?.destination_city || ""
  );
  const [departureDate, setDepartureDate] = useState(initial?.departure_date || "");
  const [adults, setAdults] = useState(initial?.adults || 1);

  // ----------------------------------------------------
  // Return flight controls
  // ----------------------------------------------------
  const [returnEnabled, setReturnEnabled] = useState(Boolean(initial?.return_enabled));
  const [returnDate, setReturnDate] = useState(initial?.return_date || "");

  // ----------------------------------------------------
  // Search filters
  // ----------------------------------------------------
  const [maxStops, setMaxStops] = useState(
    initial?.max_stops === 0 ? "0" : "any"
  );
  const [budget, setBudget] = useState(
    initial?.budget != null ? String(initial.budget) : ""
  );

  // ----------------------------------------------------
  // Results / loading / errors
  // ----------------------------------------------------
  const [offers, setOffers] = useState(initial?.offers || []);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // ----------------------------------------------------
  // NEW: selected offer
  // ----------------------------------------------------
  const [selectedOffer, setSelectedOffer] = useState(null);

  // ----------------------------------------------------
  // NEW: generated trip plan returned by backend
  // ----------------------------------------------------
  const [generatedPlan, setGeneratedPlan] = useState(null);

  // ----------------------------------------------------
  // NEW: loading state for plan generation
  // ----------------------------------------------------
  const [planLoading, setPlanLoading] = useState(false);

  // ----------------------------------------------------
  // NEW: start address for route planning
  // ----------------------------------------------------
  const [startAddress, setStartAddress] = useState("Ogre Mednieku iela 23");

  // ----------------------------------------------------
  // Load city list once
  // ----------------------------------------------------
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

  // ----------------------------------------------------
  // Filter + sort offers locally
  // ----------------------------------------------------
  const filteredSortedOffers = useMemo(() => {
    let list = [...offers];

    // Filter by stops
    if (maxStops !== "any") {
      const ms = Number(maxStops);
      list = list.filter((o) => stopsForOffer(o) <= ms);
    }

    // Filter by budget
    if (budget.trim()) {
      const b = Number(budget);
      if (Number.isFinite(b)) {
        list = list.filter((o) => Number(o?.price?.total) <= b);
      }
    }

    // Sort cheapest first
    list.sort((a, b) => priceNumber(a) - priceNumber(b));

    return list;
  }, [offers, maxStops, budget]);

  // ----------------------------------------------------
  // Search manually from widget
  // ----------------------------------------------------
  const search = async () => {
    setErr("");
    setLoading(true);

    // Clear selection + old plan when doing a new search
    setSelectedOffer(null);
    setGeneratedPlan(null);

    try {
      if (returnEnabled && !returnDate) {
        setErr("Please choose a return date.");
        return;
      }

      const body = {
        origin: origin,
        destination: destination,
        departure_date: departureDate,
        adults: Number(adults),
      };

      if (returnEnabled) {
        body.return_date = returnDate;
      }

      const r = await api.post("/travel/flights/search/", body);
      const newOffers = r.data?.data || [];
      setOffers(newOffers);
    } catch (e) {
      const msg = e?.response?.data?.detail;
      setErr(msg || "Flight search failed.");
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // ENTER key triggers search
  // ----------------------------------------------------
  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      search();
    }
  };

  // ----------------------------------------------------
  // NEW: select one offer
  // ----------------------------------------------------
  function handleSelectOffer(offer) {
    setSelectedOffer(offer);
    setGeneratedPlan(null);
  }

  // ----------------------------------------------------
  // NEW: clear selected offer
  // ----------------------------------------------------
  function handleClearSelection() {
    setSelectedOffer(null);
    setGeneratedPlan(null);
  }

  // ----------------------------------------------------
  // NEW: generate plan from selected offer
  // ----------------------------------------------------
  async function handleGeneratePlan() {
    if (!selectedOffer) {
      alert("Please select a flight first.");
      return;
    }

    try {
      setPlanLoading(true);

      const res = await api.post("/chat/generate-trip-plan/", {
        selected_offer: selectedOffer,
        origin,
        destination,
        departure_date: departureDate,
        return_date: returnEnabled ? returnDate : null,
        adults: Number(adults),
        budget: budget ? Number(budget) : null,
        max_stops: maxStops === "any" ? null : Number(maxStops),
        start_address: startAddress,
      });

      setGeneratedPlan(res.data);
    } catch (e) {
      console.error(e);
      alert("Failed to generate trip plan.");
    } finally {
      setPlanLoading(false);
    }
  }

  // ----------------------------------------------------
  // NEW: visible remaining budget
  // ----------------------------------------------------
  const remainingBudget = selectedOffer
    ? Number(budget || 0) - Number(selectedOffer?.price?.total || 0)
    : Number(budget || 0);

  return (
    <div>
      <h2>Flight search widget</h2>

      {/* ------------------------------------------------
          City autocomplete list
          ------------------------------------------------ */}
      <datalist id="city-options">
        {cities.map((c, idx) => (
          <option key={idx} value={c.city || c.iata_code}>
            {c.city} ({c.iata_code})
          </option>
        ))}
      </datalist>

      {/* ------------------------------------------------
          Search controls
          ------------------------------------------------ */}
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
          <select
            value={maxStops}
            onChange={(e) => setMaxStops(e.target.value)}
            style={{ marginLeft: 8 }}
          >
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

        <button onClick={search}>
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {/* ------------------------------------------------
          Ticket link
          ------------------------------------------------ */}
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

      {/* ------------------------------------------------
          Error
          ------------------------------------------------ */}
      {err && <p style={{ color: "#ff8a8a" }}>{err}</p>}

      {/* ------------------------------------------------
          NEW: budget counter
          ------------------------------------------------ */}
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
          Remaining budget:{" "}
          {Number.isFinite(remainingBudget) ? remainingBudget.toFixed(2) : "-"} EUR
        </div>
      )}

      {/* ------------------------------------------------
          NEW: start address field
          ------------------------------------------------ */}
      <div style={{ marginBottom: 16 }}>
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

      {/* ------------------------------------------------
          Results
          ------------------------------------------------ */}
      {filteredSortedOffers.length > 0 && (
        <div>
          <h3>Results (cheapest first)</h3>

          {filteredSortedOffers
            .filter((offer) => {
              // Before selecting: show all offers
              if (!selectedOffer) return true;

              // After selecting: only keep the chosen one visible
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
                  {/* ----------------------------------------
                      NEW: visible button in top-right
                      ---------------------------------------- */}
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

          {/* --------------------------------------------
              NEW: show Generate plan only after selection
              -------------------------------------------- */}
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

      {/* ------------------------------------------------
          Empty state
          ------------------------------------------------ */}
      {!loading && offers.length === 0 && !err && (
        <p>No results yet. Enter details and search.</p>
      )}

      {/* ------------------------------------------------
          NEW: generated plan section
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
              <a href={generatedPlan.route_url} target="_blank" rel="noreferrer">
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