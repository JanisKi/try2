// travel-frontend/src/components/FlightWidget.jsx

import { useEffect, useMemo, useState } from "react"; // React hooks
import { api } from "../api"; // Axios wrapper with auto-refresh

// Convert ISO duration like "PT2H40M" -> "2h 40m"
function formatDuration(iso) {
  if (!iso) return "";
  const h = iso.match(/(\d+)H/)?.[1];
  const m = iso.match(/(\d+)M/)?.[1];
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return parts.join(" ") || iso;
}

// Make date/time more readable
function formatDateTime(dt) {
  if (!dt) return "";
  return dt.replace("T", " ");
}

// Safe numeric price for sorting
function priceNumber(offer) {
  const v = offer?.price?.total;
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

// Stops = segments - 1 (for outbound itinerary)
// function stopsForOffer(offer) {
//   const segs = offer?.itineraries?.[0]?.segments || [];
//   return Math.max(0, segs.length - 1);
// }
// Stops for a single itinerary = segments - 1
function stopsForItinerary(itinerary) {
  const segs = itinerary?.segments || [];
  return Math.max(0, segs.length - 1);
}

// Max stops across all itineraries in the offer (outbound + return)
// - One-way offer has 1 itinerary
// - Roundtrip offer has 2 itineraries
function maxStopsForOffer(offer) {
  const itineraries = offer?.itineraries || [];
  if (itineraries.length === 0) return 0;

  // Compute stops per itinerary and return the maximum
  return Math.max(...itineraries.map((it) => stopsForItinerary(it)));
}

// Build a Google Flights link (best “get tickets” MVP link)
function googleFlightsLink(originText, destText, departDate, returnDate, adults) {
  // A human-readable query string; Google Flights handles it well
  const q = returnDate
    ? `Flights from ${originText} to ${destText} on ${departDate} returning ${returnDate} for ${adults} adults`
    : `Flights from ${originText} to ${destText} on ${departDate} for ${adults} adults`;

  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}

// Render itinerary segments (works for outbound and return)
function ItineraryBlock({ title, itinerary }) {
  if (!itinerary) return null; // Nothing to show

  const segments = itinerary.segments || []; // Each leg is a segment

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
              <b>{s.departure?.iataCode}</b> ({formatDateTime(s.departure?.at)}) →{" "}
              <b>{s.arrival?.iataCode}</b> ({formatDateTime(s.arrival?.at)}){" "}
              | Carrier: <b>{s.carrierCode}</b> Flight: <b>{s.number}</b>
            </li>
          ))}
        </ul>
      </div>

      {/* Stops count */}
      <div style={{ marginTop: 4 }}>
        <b>Stops:</b> {Math.max(0, segments.length - 1)}
      </div>
    </div>
  );
}

export default function FlightWidget({ initial }) {
  // Cached cities for dropdown suggestions
  const [cities, setCities] = useState([]);

  // Allow manual editing of FROM/TO (city or IATA)
  const [origin, setOrigin] = useState(initial?.origin_iata || initial?.origin_city || "");
  const [destination, setDestination] = useState(initial?.destination_iata || initial?.destination_city || "");

  // Search parameters
  const [departureDate, setDepartureDate] = useState(initial?.departure_date || "");
  const [adults, setAdults] = useState(initial?.adults || 1);

  // Optional return flight
  // Optional return flight (prefill from chat if provided)
  const [returnEnabled, setReturnEnabled] = useState(Boolean(initial?.return_enabled));
  const [returnDate, setReturnDate] = useState(initial?.return_date || "");

  // Optional: prefill stops filter if chat asked "direct"
  const [maxStops, setMaxStops] = useState(
    initial?.max_stops === 0 ? "0" : "any"
  );

  // Filter settings
  // const [maxStops, setMaxStops] = useState("any"); // any / 0 / 1 / 2
  // Prefill budget if chat provided it
  const [budget, setBudget] = useState(
    initial?.budget !== null && initial?.budget !== undefined ? String(initial.budget) : ""
  );

  // Results
  const [offers, setOffers] = useState(initial?.offers || []);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Load cached cities for dropdown (once on component mount)
  useEffect(() => {
    const loadCities = async () => {
      try {
        const r = await api.get("/travel/cities/");
        setCities(r.data?.cities || []);
      } catch {
        // If it fails, we just proceed without dropdown suggestions
        setCities([]);
      }
    };
    loadCities();
  }, []);

  // Filter + sort results
  const filteredSortedOffers = useMemo(() => {
    let list = [...offers];

    // Filter by stops
    if (maxStops !== "any") {
      const ms = Number(maxStops);

      // ✅ Require BOTH outbound and return to be within max stops
      // by checking the maximum stops among all itineraries
      list = list.filter((o) => maxStopsForOffer(o) <= ms);
    }

    // Filter by budget (if user set it)
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

  // Run search (one-way or return)
  const search = async () => {
    setErr(""); // Clear old errors
    setLoading(true); // Show loading state

    try {
      // If return flight enabled, require return date
      if (returnEnabled && !returnDate) {
        setErr("Please choose a return date.");
        return;
      }

      // Build request body (backend accepts city OR IATA)
      const body = {
        origin: origin,
        destination: destination,
        departure_date: departureDate,
        adults: Number(adults),
      };

      // Include return date if enabled
      if (returnEnabled) {
        body.return_date = returnDate;
      }

      // Call backend manual flight search endpoint
      const r = await api.post("/travel/flights/search/", body);

      // Amadeus offers are in r.data.data
      const newOffers = r.data?.data || [];
      setOffers(newOffers);

    } catch (e) {
      const msg = e?.response?.data?.detail;
      setErr(msg || "Flight search failed.");
    } finally {
      setLoading(false);
    }
  };

  // ENTER triggers search (while focused in inputs)
  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      search();
    }
  };

  return (
    <div style={{ marginTop: 12, padding: 12, border: "1px solid #2f2f2f", borderRadius: 10 }}>
      <div style={{ marginBottom: 10 }}>
        <b>Flight search widget</b>
      </div>

      {/* ✅ City suggestion list (autocomplete dropdown but still editable) */}
      <datalist id="citylist">
        {cities.map((c, idx) => (
          // value inserts city name; label shows IATA in some browsers
          <option key={idx} value={c.city} label={c.iata} />
        ))}
      </datalist>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          From:
          <input
            list="citylist" // ✅ attach dropdown suggestions
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
            list="citylist" // ✅ attach dropdown suggestions
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

        <button onClick={search} disabled={loading} style={{ padding: "8px 14px" }}>
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Ticket link (search link, not purchase link) */}
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
      {err && <div style={{ marginTop: 10 }}>{err}</div>}

      {/* Results */}
      {filteredSortedOffers.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <b>Results (cheapest first)</b>

          {filteredSortedOffers.slice(0, 10).map((offer, idx) => {
            // Amadeus roundtrip offers have 2 itineraries:
            // - itineraries[0] outbound
            // - itineraries[1] return (if roundtrip)
            const outbound = offer.itineraries?.[0];
            const inbound = offer.itineraries?.[1];

            return (
              <div
                key={idx}
                style={{
                  border: "1px solid #2f2f2f",
                  padding: 12,
                  borderRadius: 10,
                  marginTop: 10,
                }}
              >
                {/* Price */}
                <div style={{ fontSize: 18 }}>
                  <b>{offer.price?.total} {offer.price?.currency}</b>
                </div>

                {/* Outbound */}
                <ItineraryBlock title="Outbound" itinerary={outbound} />

                {/* Return (only if exists) */}
                {inbound && <ItineraryBlock title="Return" itinerary={inbound} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}