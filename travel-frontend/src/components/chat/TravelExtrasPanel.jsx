// travel-frontend/src/components/chat/TravelExtrasPanel.jsx

import { useMemo, useState } from "react";
import { api } from "../../api";

/**
 * Small helper for showing provider warnings.
 *
 * Example:
 * - Google Places key is missing
 * - Viator API key is missing
 * - backend is returning mock/sample data
 */
function ProviderWarning({ message }) {
  if (!message) return null;

  return (
    <div
      style={{
        marginTop: "8px",
        padding: "8px 10px",
        border: "1px solid #f59e0b",
        background: "rgba(245, 158, 11, 0.12)",
        color: "#fbbf24",
        borderRadius: "8px",
        fontSize: "13px",
      }}
    >
      ⚠️ {message}
    </div>
  );
}

/**
 * Reusable dark-theme-friendly card.
 *
 * I keep this inside the file so you do not need to create extra CSS files yet.
 * Later, you can move these styles to CSS modules or Tailwind classes.
 */
function ResultCard({ title, subtitle, children, link }) {
  return (
    <div
      style={{
        border: "1px solid #2f6fb3",
        background: "#111827",
        color: "#e5e7eb",
        borderRadius: "10px",
        padding: "12px",
        marginTop: "10px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
        <div>
          <h4 style={{ margin: "0 0 4px", color: "#ffffff" }}>{title}</h4>
          {subtitle && (
            <div style={{ color: "#9ca3af", fontSize: "13px" }}>{subtitle}</div>
          )}
        </div>

        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            style={{
              color: "#60a5fa",
              fontSize: "13px",
              whiteSpace: "nowrap",
            }}
          >
            Open
          </a>
        )}
      </div>

      {children && <div style={{ marginTop: "8px", fontSize: "14px" }}>{children}</div>}
    </div>
  );
}

/**
 * Render restaurant / attraction / place cards from the /chat/places/ endpoint.
 *
 * The backend may return real Google Places data or mock fallback data.
 * We handle both shapes safely.
 */
function PlacesList({ title, response }) {
  const places = response?.places || [];

  return (
    <section style={{ marginTop: "18px" }}>
      <h3 style={{ margin: "0 0 8px", color: "#ffffff" }}>{title}</h3>

      <ProviderWarning message={response?.provider_warning} />

      {places.length === 0 && (
        <p style={{ color: "#9ca3af", margin: "8px 0" }}>No results loaded yet.</p>
      )}

      {places.map((place, index) => {
        const name = place.name || place.displayName?.text || `Place ${index + 1}`;

        const rating =
          place.rating !== undefined && place.rating !== null
            ? `⭐ ${place.rating}`
            : null;

        const reviewCount =
          place.user_ratings_total ||
          place.userRatingCount ||
          place.review_count ||
          null;

        const subtitleParts = [
          rating,
          reviewCount ? `${reviewCount} reviews` : null,
          place.address || place.formattedAddress || null,
        ].filter(Boolean);

        return (
          <ResultCard
            key={place.id || place.place_id || `${name}-${index}`}
            title={name}
            subtitle={subtitleParts.join(" · ")}
            link={place.google_maps_url || place.googleMapsUri || place.websiteUri}
          >
            {place.types && Array.isArray(place.types) && (
              <div style={{ color: "#cbd5e1" }}>
                Type: {place.types.slice(0, 4).join(", ")}
              </div>
            )}

            {place.description && (
              <div style={{ color: "#cbd5e1", marginTop: "4px" }}>
                {place.description}
              </div>
            )}

            {place._mock && (
              <div style={{ color: "#fbbf24", marginTop: "6px" }}>
                Sample/mock place data
              </div>
            )}
          </ResultCard>
        );
      })}
    </section>
  );
}

/**
 * Render Viator tour cards from the /chat/tours/ endpoint.
 *
 * Important:
 * If VIATOR_API_KEY is missing in Django, your backend can return mock tours.
 * That is good for development, but we show it clearly to avoid confusion.
 */
function ToursList({ response }) {
  const tours = response?.tours || [];

  return (
    <section style={{ marginTop: "18px" }}>
      <h3 style={{ margin: "0 0 8px", color: "#ffffff" }}>Tours and activities</h3>

      <ProviderWarning message={response?.provider_warning} />

      {tours.length === 0 && (
        <p style={{ color: "#9ca3af", margin: "8px 0" }}>No tours loaded yet.</p>
      )}

      {tours.map((tour, index) => {
        const title = tour.title || tour.name || `Tour ${index + 1}`;

        const price =
          tour.price_from ||
          tour.price ||
          tour.pricing?.summary?.fromPrice ||
          null;

        const currency =
          tour.currency ||
          tour.pricing?.currency ||
          "";

        const rating =
          tour.rating !== undefined && tour.rating !== null
            ? `⭐ ${tour.rating}`
            : null;

        const subtitleParts = [
          rating,
          price ? `From ${price} ${currency}` : null,
          tour.duration || null,
        ].filter(Boolean);

        return (
          <ResultCard
            key={tour.id || tour.product_code || `${title}-${index}`}
            title={title}
            subtitle={subtitleParts.join(" · ")}
            link={tour.booking_url || tour.product_url || tour.webURL}
          >
            {tour.description && (
              <div style={{ color: "#cbd5e1" }}>{tour.description}</div>
            )}

            {tour._mock && (
              <div style={{ color: "#fbbf24", marginTop: "6px" }}>
                Sample/mock tour data
              </div>
            )}
          </ResultCard>
        );
      })}
    </section>
  );
}

/**
 * Render AI-generated day-by-day itinerary.
 *
 * This component is defensive because the exact backend AI response can evolve.
 */
function ItineraryView({ response }) {
  const itinerary = response?.itinerary;

  if (!itinerary) return null;

  const days =
    itinerary.days ||
    itinerary.itinerary ||
    itinerary.daily_plan ||
    [];

  return (
    <section style={{ marginTop: "18px" }}>
      <h3 style={{ margin: "0 0 8px", color: "#ffffff" }}>AI day-by-day itinerary</h3>

      <ProviderWarning message={response?.provider_warning} />

      {Array.isArray(days) && days.length > 0 ? (
        days.map((day, index) => {
          const title = day.title || day.day_title || `Day ${day.day || index + 1}`;
          const items = day.items || day.activities || day.plan || [];

          return (
            <ResultCard
              key={day.day || index}
              title={title}
              subtitle={day.theme || day.summary || null}
            >
              {Array.isArray(items) && items.length > 0 ? (
                <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                  {items.map((item, itemIndex) => (
                    <li key={itemIndex} style={{ marginBottom: "6px" }}>
                      {typeof item === "string"
                        ? item
                        : item.time
                          ? `${item.time}: ${item.title || item.name || item.description || JSON.stringify(item)}`
                          : item.title || item.name || item.description || JSON.stringify(item)}
                    </li>
                  ))}
                </ul>
              ) : (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    color: "#cbd5e1",
                    fontSize: "13px",
                  }}
                >
                  {JSON.stringify(day, null, 2)}
                </pre>
              )}
            </ResultCard>
          );
        })
      ) : (
        <ResultCard title="Generated itinerary">
          <pre
            style={{
              whiteSpace: "pre-wrap",
              color: "#cbd5e1",
              fontSize: "13px",
            }}
          >
            {typeof itinerary === "string"
              ? itinerary
              : JSON.stringify(itinerary, null, 2)}
          </pre>
        </ResultCard>
      )}
    </section>
  );
}

/**
 * Calculate the number of trip days from departure and return dates.
 *
 * If there is no return date, we default to 3 days so the AI planner still works.
 */
function calculateTripDays(departureDate, returnDate) {
  if (!departureDate || !returnDate) return 3;

  const start = new Date(departureDate);
  const end = new Date(returnDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 3;
  }

  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return Math.max(1, Math.min(diffDays, 14));
}

/**
 * Main panel for "things to do".
 *
 * Props come from TravelChat.jsx:
 * - flightWidget gives destination city and trip dates
 * - arrivalDestinationAddress gives hotel/custom address
 * - remainingBudget helps AI plan realistic activities
 */
export default function TravelExtrasPanel({
  flightWidget,
  arrivalDestinationAddress,
  remainingBudget,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [restaurantsResponse, setRestaurantsResponse] = useState(null);
  const [attractionsResponse, setAttractionsResponse] = useState(null);
  const [toursResponse, setToursResponse] = useState(null);
  const [itineraryResponse, setItineraryResponse] = useState(null);

  const [preferences, setPreferences] = useState(
    "local food, main attractions, hidden gems, not too expensive"
  );

  /**
   * Prefer destination_city when backend gives it.
   * Fallback to IATA/city input so the panel still works.
   */
  const destinationCity = useMemo(() => {
    return (
      flightWidget?.destination_city ||
      flightWidget?.destination ||
      flightWidget?.destination_iata ||
      ""
    );
  }, [flightWidget]);

  const tripDays = useMemo(() => {
    return calculateTripDays(flightWidget?.departure_date, flightWidget?.return_date);
  }, [flightWidget]);

  /**
   * Load restaurants, attractions, tours, and AI itinerary.
   *
   * This is intentionally one button for MVP.
   * Later, you can split it into separate buttons if you want:
   * - Load restaurants
   * - Load attractions
   * - Load tours
   * - Generate itinerary
   */
  async function handleLoadExtras() {
    if (!destinationCity) {
      alert("Destination city is missing. Please search/select a flight first.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Load the first three calls in parallel to make the UI faster.
      const [restaurantsRes, attractionsRes, toursRes] = await Promise.all([
        api.post("/chat/places/", {
          city: destinationCity,
          category: "restaurant",
          max_results: 8,
          user_preferences: preferences,
          use_ai_filter: true,
        }),
        api.post("/chat/places/", {
          city: destinationCity,
          category: "attraction",
          max_results: 8,
          user_preferences: preferences,
          use_ai_filter: true,
        }),
        api.post("/chat/tours/", {
          city: destinationCity,
          max_results: 8,
          activity_type: preferences,
        }),
      ]);

      setRestaurantsResponse(restaurantsRes.data);
      setAttractionsResponse(attractionsRes.data);
      setToursResponse(toursRes.data);

      // Generate AI itinerary after provider data exists.
      // Backend will collect provider data again, but this keeps the frontend simple.
      const itineraryRes = await api.post("/chat/itinerary/", {
        city: destinationCity,
        num_days: tripDays,
        check_in_date: flightWidget?.departure_date,
        hotel_address: arrivalDestinationAddress,
        user_preferences: preferences,
        budget_remaining: remainingBudget,
      });

      setItineraryResponse(itineraryRes.data);
    } catch (err) {
      console.error(err);

      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        "Failed to load travel extras.";

      setError(detail);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      style={{
        marginTop: "18px",
        padding: "14px",
        border: "1px solid #374151",
        background: "#0b1220",
        borderRadius: "12px",
      }}
    >
      <h2 style={{ margin: "0 0 8px", color: "#ffffff" }}>
        Things to do in {destinationCity || "your destination"}
      </h2>

      <p style={{ margin: "0 0 12px", color: "#9ca3af" }}>
        Find restaurants, attractions, tours, and create an AI day-by-day plan.
      </p>

      <label
        style={{
          display: "block",
          color: "#e5e7eb",
          fontWeight: 600,
          marginBottom: "6px",
        }}
      >
        Preferences for recommendations
      </label>

      <textarea
        value={preferences}
        onChange={(e) => setPreferences(e.target.value)}
        rows={3}
        placeholder="Example: local food, museums, hidden gems, avoid expensive places"
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "10px",
          borderRadius: "8px",
          border: "1px solid #374151",
          background: "#111827",
          color: "#ffffff",
          resize: "vertical",
        }}
      />

      <div
        style={{
          display: "flex",
          gap: "10px",
          alignItems: "center",
          marginTop: "10px",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={handleLoadExtras}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: "8px",
            border: "1px solid #2563eb",
            background: loading ? "#1f2937" : "#2563eb",
            color: "#ffffff",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {loading ? "Loading things to do..." : "Find things to do"}
        </button>

        <span style={{ color: "#9ca3af", fontSize: "13px" }}>
          Trip length used for itinerary: {tripDays} day(s)
        </span>

        {remainingBudget !== undefined && remainingBudget !== null && (
          <span style={{ color: "#9ca3af", fontSize: "13px" }}>
            Remaining budget: €{Number(remainingBudget || 0).toFixed(2)}
          </span>
        )}
      </div>

      {error && (
        <div
          style={{
            marginTop: "10px",
            padding: "10px",
            border: "1px solid #ef4444",
            background: "rgba(239, 68, 68, 0.12)",
            color: "#fecaca",
            borderRadius: "8px",
          }}
        >
          {error}
        </div>
      )}

      <PlacesList title="Restaurants" response={restaurantsResponse} />
      <PlacesList title="Attractions and places to visit" response={attractionsResponse} />
      <ToursList response={toursResponse} />
      <ItineraryView response={itineraryResponse} />
    </section>
  );
}