// travel-frontend/src/panels/FlightPanel.jsx
//
// Full FlightPanel with:
// ✅ Editable FROM/TO fields (city name or IATA)
// ✅ Dropdown suggestions (autocomplete) from /api/travel/cities/
// ✅ Departure date, return toggle + return date
// ✅ Adults count
// ✅ Stops filter + Budget filter
// ✅ Press Enter to search (in any input)
// ✅ Shows outbound + return itinerary segments with times + carrier + flight number
// ✅ “Get tickets” link to Google Flights (search link)
//
// NOTE:
// - This panel uses the MANUAL endpoint: POST /api/travel/flights/search/
// - It does NOT depend on “latest intent”, but it can prefill from it.

import { useEffect, useMemo, useState } from "react"; // React hooks
import { api } from "../api"; // Axios wrapper (with auto-refresh)

// Helper: format ISO datetime (simple MVP)
function fmt(dt) {
  if (!dt) return "";
  return dt.replace("T", " ");
}

// Helper: convert ISO duration like PT2H40M to "2h 40m"
function formatDuration(iso) {
  if (!iso) return "";
  const h = iso.match(/(\d+)H/)?.[1];
  const m = iso.match(/(\d+)M/)?.[1];
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return parts.join(" ") || iso;
}

// Helper: safe numeric price for sorting
function priceNumber(offer) {
  const v = offer?.price?.total;
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

// Helper: stops for itinerary (segments - 1)
function stopsForItinerary(itinerary) {
  const segs = itinerary?.segments || [];
  return Math.max(0, segs.length - 1);
}

// Helper: Google Flights link (search link, not purchase link)
function googleFlightsLink(originText, destText, departDate, returnDate, adults) {
  const q = returnDate
    ? `Flights from ${originText} to ${destText} on ${departDate} returning ${returnDate} for ${adults} adults`
    : `Flights from ${originText} to ${destText} on ${departDate} for ${adults} adults`;

  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}

// Renders one itinerary (outbound or return)
function ItineraryBlock({ title, itinerary }) {
  if (!itinerary) return null;

  const segments = itinerary.segments || [];

  return (
    <div style={{ marginTop: 10 }}>
      <b>{title}</b>

      {/* Duration */}
      {itinerary.duration && (
        <div style={{ marginTop: 4 }}>
          <b>Duration:</b> {formatDuration(itinerary.duration)}
        </div>
      )}

      {/* Segments */}
      <div style={{ marginTop: 6 }}>
        <b>Segments:</b>
        <ul style={{ marginTop: 6 }}>
          {segments.map((s, i) => (
            <li key={i}>
              <b>{s.departure?.iataCode}</b> ({fmt(s.departure?.at)}) →{" "}
              <b>{s.arrival?.iataCode}</b> ({fmt(s.arrival?.at)}) {" | "}
              Carrier: <b>{s.carrierCode}</b> Flight: <b>{s.number}</b>
            </li>
          ))}
        </ul>
      </div>

      {/* Stops */}
      <div style={{ marginTop: 4 }}>
        <b>Stops:</b> {Math.max(0, segments.length - 1)}
      </div>
    </div>
  );
}

export default function FlightPanel({ latestIntent }) {
  // Autocomplete city list (cached CityIata rows)
  const [cities, setCities] = useState([]);

  // Manual FROM/TO (prefill from latest intent if available)
  const [origin, setOrigin] = useState(latestIntent?.origin || "Riga");
  const [destination, setDestination] = useState(latestIntent?.destination || "Amsterdam");

  // Dates + passengers
  const [departureDate, setDepartureDate] = useState("2026-03-15");
  const [adults, setAdults] = useState(1);

  // Return flight options
  const [returnEnabled, setReturnEnabled] = useState(false);
  const [returnDate, setReturnDate] = useState("");

  // Filters
  const [maxStops, setMaxStops] = useState("any"); // any / 0 / 1 / 2
  const [budget, setBudget] = useState(""); // EUR

  // Results + status
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // If latestIntent changes (e.g. after chat), refresh the input defaults
  useEffect(() => {
    if (latestIntent?.origin) setOrigin(latestIntent.origin);
    if (latestIntent?.destination) setDestination(latestIntent.destination);
  }, [latestIntent]);

  // Load city list for autocomplete once
  useEffect(() => {
    const loadCities = async () => {
      try {
        const r = await api.get("/travel/cities/");
        setCities(r.data?.cities || []);
      } catch {
        setCities([]); // If endpoint fails, just disable suggestions
      }
    };
    loadCities();
  }, []);

  // Search flights using manual endpoint
  const search = async () => {
    setErr("");
    setLoading(true);

    try {
      // Validate return flight date if enabled
      if (returnEnabled && !returnDate) {
        setErr("Please select a return date.");
        return;
      }

      // Build request body for backend
      const body = {
        origin: origin, // city or IATA
        destination: destination, // city or IATA
        departure_date: departureDate,
        adults: Number(adults),
      };

      // Add return date if needed
      if (returnEnabled) {
        body.return_date = returnDate;
      }

      // Call backend manual flight search endpoint
      const r = await api.post("/travel/flights/search/", body);

      // Offers list comes back in r.data.data
      setOffers(r.data?.data || []);
    } catch (e) {
      // Show backend error detail if present
      const msg = e?.response?.data?.detail;
      setErr(msg || "Flight search failed.");
    } finally {
      setLoading(false);
    }
  };

  // Enter triggers search in any input
  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      search();
    }
  };

  // Apply filters + sorting locally in UI
  const filteredSortedOffers = useMemo(() => {
    let list = [...offers];

    // Filter by max stops (based on outbound itinerary)
    if (maxStops !== "any") {
      const ms = Number(maxStops);
      list = list.filter((o) => {
        const outbound = o.itineraries?.[0];
        return stopsForItinerary(outbound) <= ms;
      });
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

  return (
    <div>
      <h2>FLIGHT</h2>

      {/* Show latest detected intent (informational only) */}
      <div style={{ marginBottom: 12 }}>
        <b>Detected from chat:</b>{" "}
        {latestIntent ? `${latestIntent.origin} → ${latestIntent.destination}` : "None yet"}
      </div>

      {/* Autocomplete dropdown (editable) */}
      <datalist id="citylist">
        {cities.map((c, idx) => (
          <option key={idx} value={c.city} label={c.iata} />
        ))}
      </datalist>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          From:
          <input
            list="citylist"
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
            list="citylist"
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

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={returnEnabled}
            onChange={(e) => setReturnEnabled(e.target.checked)}
          />
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

        <button onClick={search} disabled={loading} style={{ padding: "8px 16px" }}>
          {loading ? "Searching..." : "Search flights"}
        </button>
      </div>

      {/* Tickets link */}
      {origin && destination && departureDate && (
        <div style={{ marginTop: 12 }}>
          <b>Get tickets:</b>{" "}
          <a
            href={googleFlightsLink(origin, destination, departureDate, returnEnabled ? returnDate : null, adults)}
            target="_blank"
            rel="noreferrer"
          >
            Open in Google Flights
          </a>
        </div>
      )}

      {/* Error */}
      {err && <p style={{ marginTop: 12 }}>{err}</p>}

      {/* Results */}
      {filteredSortedOffers.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3>Results (showing first 10)</h3>

          {filteredSortedOffers.slice(0, 10).map((offer, idx) => {
            const outbound = offer.itineraries?.[0];
            const inbound = offer.itineraries?.[1]; // exists only for roundtrip

            return (
              <div
                key={idx}
                style={{
                  border: "1px solid #2f2f2f",
                  padding: 12,
                  marginBottom: 10,
                  borderRadius: 10,
                }}
              >
                {/* Price */}
                <div style={{ fontSize: 18 }}>
                  <b>Price:</b> {offer.price?.total} {offer.price?.currency}
                </div>

                {/* Airline(s) */}
                {offer.validatingAirlineCodes && (
                  <div style={{ marginTop: 6 }}>
                    <b>Validating airline(s):</b> {offer.validatingAirlineCodes.join(", ")}
                  </div>
                )}

                {/* Outbound */}
                <ItineraryBlock title="Outbound" itinerary={outbound} />

                {/* Return (if present) */}
                {inbound && <ItineraryBlock title="Return" itinerary={inbound} />}
              </div>
            );
          })}
        </div>
      )}

      {/* If there are no offers but we did a search */}
      {!loading && offers.length === 0 && !err && (
        <div style={{ marginTop: 16, opacity: 0.8 }}>
          No results yet. Enter details and search.
        </div>
      )}
    </div>
  );
}