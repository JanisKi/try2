// travel-frontend/src/components/chat/TripItineraryBuilder.jsx

import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";

/**
 * Editable trip itinerary builder.
 *
 * This component appears after the user presses "Generate trip plan".
 *
 * It combines:
 * - selected flight details
 * - hotel / stay details
 * - airport transport / route plan
 * - restaurants from Google Places
 * - attractions from Google Places
 * - tours from Viator later, or mock data for now
 * - estimated activity/food prices
 * - editable day-by-day plan
 * - printable PDF export
 *
 * Important UX behavior:
 * - If the outbound flight lands late, Day 1 becomes a travel-only day.
 * - Sightseeing starts the next day.
 * - Airport buffers are included:
 *   - 90 minutes before departure at the airport
 *   - 45 minutes after landing before leaving destination airport
 *   - 30 minutes after return landing before leaving home airport
 */

/**
 * Format money safely.
 */
function formatMoney(value, currency = "EUR") {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return `0.00 ${currency}`;
  }

  return `${number.toFixed(2)} ${currency}`;
}

/**
 * Convert unknown values to safe numbers.
 */
function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Escape text before inserting it into printable HTML.
 */
function escapeHtml(value) {
  const text = String(value ?? "");

  return text.replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entities[char] || char;
  });
}

/**
 * Convert date/time value into a Date object.
 */
function parseDateTime(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * Add minutes to a date safely.
 */
function addMinutes(dateValue, minutes) {
  const date = parseDateTime(dateValue);
  if (!date) return null;

  const nextDate = new Date(date);
  nextDate.setMinutes(nextDate.getMinutes() + minutes);

  return nextDate;
}

/**
 * Subtract minutes from a date safely.
 */
function subtractMinutes(dateValue, minutes) {
  const date = parseDateTime(dateValue);
  if (!date) return null;

  const nextDate = new Date(date);
  nextDate.setMinutes(nextDate.getMinutes() - minutes);

  return nextDate;
}

/**
 * Add days to a date safely.
 */
function addDays(dateValue, days) {
  const date = parseDateTime(dateValue);
  if (!date) return null;

  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
}

/**
 * Format date for display.
 */
function formatDateOnly(value) {
  const date = parseDateTime(value);
  if (!date) return "";

  return date.toLocaleDateString();
}

/**
 * Format date and time for display.
 */
function formatDateTime(value) {
  const date = parseDateTime(value);
  if (!date) return "";

  return date.toLocaleString();
}

/**
 * Format only time.
 */
function formatTime(value) {
  const date = parseDateTime(value);
  if (!date) return "";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Read hour from a date/time.
 */
function getHour(value) {
  const date = parseDateTime(value);
  if (!date) return null;

  return date.getHours();
}

/**
 * Calculate trip length from departure and return dates.
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
 * Convert route duration into minutes.
 *
 * Supports examples like:
 * - 1800
 * - "1800s"
 * - "30 min"
 * - "1 hour 20 min"
 * - "PT1H20M"
 */
function parseDurationMinutes(durationValue) {
  if (!durationValue) return 0;

  if (typeof durationValue === "number") {
    // Google often uses seconds for duration.
    return durationValue > 300 ? Math.round(durationValue / 60) : durationValue;
  }

  const value = String(durationValue).toLowerCase().trim();

  if (!value) return 0;

  if (/^\d+s$/.test(value)) {
    return Math.round(Number(value.replace("s", "")) / 60);
  }

  if (/^\d+$/.test(value)) {
    const number = Number(value);
    return number > 300 ? Math.round(number / 60) : number;
  }

  const isoMatch = value.match(/pt(?:(\d+)h)?(?:(\d+)m)?/i);
  if (isoMatch) {
    const hours = Number(isoMatch[1] || 0);
    const minutes = Number(isoMatch[2] || 0);
    return hours * 60 + minutes;
  }

  let total = 0;

  const hourMatch = value.match(/(\d+)\s*(hour|hours|hr|hrs|h)/);
  if (hourMatch) {
    total += Number(hourMatch[1]) * 60;
  }

  const minuteMatch = value.match(/(\d+)\s*(minute|minutes|min|mins|m)/);
  if (minuteMatch) {
    total += Number(minuteMatch[1]);
  }

  return total;
}

/**
 * Pick one random item from an array.
 */
function pickRandom(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Get a display name from Google Places / Viator / mock / AI item.
 */
function getItemName(item) {
  return (
    item?.name ||
    item?.title ||
    item?.displayName?.text ||
    item?.description ||
    "Untitled item"
  );
}

/**
 * Build Google Maps directions link.
 */
function buildGoogleMapsDirectionsUrl(origin, destination) {
  if (!origin || !destination) return "";

  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    origin,
  )}&destination=${encodeURIComponent(destination)}`;
}

/**
 * Build a Google Maps search link for a place/activity.
 *
 * This is the fallback when Google Places / Viator / AI data does not provide
 * a direct link. It still lets the user open the place, see photos, reviews,
 * ticket links, opening hours, etc.
 */
function buildGoogleMapsSearchUrl(query, city) {
  const cleanQuery = [query, city].filter(Boolean).join(" ");

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    cleanQuery,
  )}`;
}

/**
 * Normalize text for fuzzy matching.
 *
 * Used to connect AI-generated itinerary items back to real Google Places /
 * Viator provider results.
 */
function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Get useful external link for a place/activity.
 *
 * Priority:
 * 1. Google Places link
 * 2. Google website link
 * 3. Viator booking link
 * 4. Google Maps search fallback
 */
function getItemLink(item, destinationCity = "") {
  return (
    item?.google_maps_url ||
    item?.googleMapsUri ||
    item?.websiteUri ||
    item?.booking_url ||
    item?.product_url ||
    item?.webURL ||
    buildGoogleMapsSearchUrl(getItemName(item), destinationCity)
  );
}

/**
 * Find a provider item that looks like the same place/activity as an AI item.
 *
 * Example:
 * AI returns: "London Eye"
 * Google Places pool contains: "lastminute.com London Eye"
 */
function findBestProviderMatch(activity, pools) {
  const activityName = normalizeText(getItemName(activity));
  const activityType = normalizeText(activity?.type);

  if (!activityName) return null;

  let candidates = [];

  if (activityType.includes("restaurant")) {
    candidates = pools.restaurants || [];
  } else if (activityType.includes("tour")) {
    candidates = pools.tours || [];
  } else if (activityType.includes("attraction") || activityType.includes("activity")) {
    candidates = pools.attractions || [];
  } else {
    candidates = [
      ...(pools.attractions || []),
      ...(pools.restaurants || []),
      ...(pools.tours || []),
    ];
  }

  return (
    candidates.find((candidate) => {
      const candidateName = normalizeText(getItemName(candidate));

      return (
        candidateName === activityName ||
        candidateName.includes(activityName) ||
        activityName.includes(candidateName)
      );
    }) || null
  );
}

/**
 * Merge AI item with provider result when possible.
 *
 * AI gives nice descriptions and timing.
 * Provider result gives real links, ratings, addresses, reviews, and source.
 */
function enrichActivityWithProviderData(activity, pools) {
  const providerMatch = findBestProviderMatch(activity, pools);

  if (!providerMatch) {
    return activity;
  }

  return {
    ...providerMatch,

    // Keep AI timing/type/description because it is usually better for itinerary UX.
    time: activity.time || providerMatch.time,
    type: activity.type || providerMatch.type,
    name: activity.name || activity.title || getItemName(providerMatch),
    title: activity.title || activity.name || getItemName(providerMatch),
    description:
      activity.description ||
      activity.short_description ||
      providerMatch.description ||
      providerMatch.short_description,

    // Mark that this item was enriched from provider data.
    _matched_provider: true,
  };
}

/**
 * Get source label for the UI/PDF.
 */
function getItemSourceLabel(item) {
  if (item?._matched_provider) return "Matched provider result";
  if (item?.source === "google_places") return "Google Places";
  if (item?.source === "viator") return "Viator";
  if (item?.source === "viator_mock") return "Sample Viator data";
  if (item?._mock) return "Sample/mock data";

  return "Google Maps search";
}

/**
 * Convert Google price level into rough EUR estimate.
 *
 * Google Places usually does not provide exact ticket/meal prices.
 * This keeps the budget useful for MVP planning.
 */
function estimateFromPriceLevel(priceLevel, type) {
  const normalized = String(priceLevel ?? "").toUpperCase();

  if (type === "restaurant") {
    if (normalized.includes("FREE") || priceLevel === 0) return 0;
    if (normalized.includes("INEXPENSIVE") || priceLevel === 1) return 15;
    if (normalized.includes("MODERATE") || priceLevel === 2) return 30;
    if (normalized.includes("EXPENSIVE") || priceLevel === 3) return 55;
    if (normalized.includes("VERY_EXPENSIVE") || priceLevel === 4) return 90;

    return 30;
  }

  if (type === "attraction") {
    if (normalized.includes("FREE") || priceLevel === 0) return 0;
    if (normalized.includes("INEXPENSIVE") || priceLevel === 1) return 10;
    if (normalized.includes("MODERATE") || priceLevel === 2) return 25;
    if (normalized.includes("EXPENSIVE") || priceLevel === 3) return 45;
    if (normalized.includes("VERY_EXPENSIVE") || priceLevel === 4) return 70;

    return 20;
  }

  return 0;
}

/**
 * Detect attractions that are likely free.
 */
function looksFreeAttraction(item) {
  const name = getItemName(item).toLowerCase();
  const types = Array.isArray(item?.types)
    ? item.types.join(" ").toLowerCase()
    : "";

  return (
    name.includes("park") ||
    name.includes("square") ||
    name.includes("market") ||
    name.includes("bridge") ||
    name.includes("street") ||
    types.includes("park")
  );
}

/**
 * Estimate item price in EUR.
 */
function estimateItemPriceEur(item, type, adults = 1) {
  const adultCount = Math.max(1, Number(adults || 1));
  const normalizedType = String(type || "").toLowerCase();

  const explicitPrice =
    item?.price_total_eur ??
    item?.estimated_price_eur ??
    item?.price_from_eur ??
    item?.price_from ??
    item?.price ??
    item?.pricing?.total ??
    item?.pricing?.summary?.fromPrice;

  if (explicitPrice !== undefined && explicitPrice !== null && explicitPrice !== "") {
    return Math.max(
      0,
      toNumber(explicitPrice) * (normalizedType === "tour" ? adultCount : 1),
    );
  }

  if (normalizedType === "tour") {
    return 45 * adultCount;
  }

  const priceLevel = item?.priceLevel ?? item?.price_level;

  if (normalizedType === "restaurant") {
    return estimateFromPriceLevel(priceLevel, "restaurant") * adultCount;
  }

  if (normalizedType === "attraction" || normalizedType === "activity") {
    if (looksFreeAttraction(item)) return 0;
    return estimateFromPriceLevel(priceLevel, "attraction") * adultCount;
  }

  return 0;
}

/**
 * Create one normalized editable itinerary item.
 */
function makeItem({ time, type, item, fallbackName, adults, destinationCity }) {
  const normalizedType = String(type || "activity").toLowerCase();
  const estimatedPriceEur = estimateItemPriceEur(item, normalizedType, adults);
  const itemName = getItemName(item) || fallbackName;

  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time,
    type: normalizedType,
    name: itemName,
    description:
      item?.description ||
      item?.short_description ||
      item?.formattedAddress ||
      item?.address ||
      item?.tips ||
      "",
    rating: item?.rating || null,
    review_count:
      item?.review_count ||
      item?.user_ratings_total ||
      item?.userRatingCount ||
      null,
    address: item?.address || item?.formattedAddress || "",
    link: getItemLink(item || { name: itemName }, destinationCity),
    estimated_price_eur: estimatedPriceEur,
    price_note:
      item?.price_from || item?.price || item?.pricing
        ? "Provider price"
        : estimatedPriceEur > 0
          ? "Estimated"
          : "Likely free / unknown",
    source_label: getItemSourceLabel(item),
    raw: item || {},
  };
}

/**
 * Create a non-editable travel/logistics item for the day plan.
 *
 * These are not restaurants/attractions. They are useful timeline items:
 * - leave home
 * - airport route
 * - flight
 * - baggage buffer
 * - hotel route
 */
function makeTravelItem({
  time,
  type,
  name,
  description,
  link = "",
  estimatedPriceEur = 0,
}) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time,
    type,
    name,
    description,
    rating: null,
    review_count: null,
    address: "",
    link,
    estimated_price_eur: estimatedPriceEur,
    price_note: estimatedPriceEur > 0 ? "Estimated" : "Included / not estimated",
    source_label: "Trip logistics",
    raw: {},
  };
}

/**
 * Build random editable days from available pools.
 */
function buildRandomDays(dayCount, pools, adults = 1, destinationCity = "") {
  const safeDayCount = Math.max(1, Math.min(Number(dayCount || 3), 14));

  return Array.from({ length: safeDayCount }, (_, index) => {
    const dayNumber = index + 1;

    const morningAttraction = pickRandom(pools.attractions);
    const lunchRestaurant = pickRandom(pools.restaurants);
    const afternoonChoice =
      Math.random() > 0.5 ? pickRandom(pools.tours) : pickRandom(pools.attractions);
    const dinnerRestaurant = pickRandom(pools.restaurants);

    return {
      id: `day-${dayNumber}-${Date.now()}`,
      dayNumber,
      date: "",
      title:
        dayNumber === 1
          ? "Arrival and first impressions"
          : dayNumber === safeDayCount
            ? "Final day highlights"
            : "Explore the city",
      items: [
        makeItem({
          time: dayNumber === 1 ? "14:00" : "09:30",
          type: "attraction",
          item: morningAttraction,
          fallbackName: "Explore a nearby attraction",
          adults,
          destinationCity,
        }),
        makeItem({
          time: "12:30",
          type: "restaurant",
          item: lunchRestaurant,
          fallbackName: "Lunch stop",
          adults,
          destinationCity,
        }),
        makeItem({
          time: "15:00",
          type: afternoonChoice?.product_code ? "tour" : "attraction",
          item: afternoonChoice,
          fallbackName: "Afternoon activity",
          adults,
          destinationCity,
        }),
        makeItem({
          time: "19:00",
          type: "restaurant",
          item: dinnerRestaurant,
          fallbackName: "Dinner spot",
          adults,
          destinationCity,
        }),
      ],
    };
  });
}

/**
 * Convert backend AI itinerary into editable frontend days.
 *
 * Important:
 * The AI often returns clean names/descriptions, but no links.
 * So we enrich each AI activity by matching it back to Google Places / Viator pools.
 */
function normalizeAiItinerary(
  aiResponse,
  fallbackDays,
  pools,
  adults = 1,
  destinationCity = "",
) {
  const itinerary = aiResponse?.itinerary || aiResponse;
  const aiDays = Array.isArray(itinerary?.days) ? itinerary.days : [];

  if (aiDays.length > 0) {
    return aiDays.map((day, index) => {
      const activities = Array.isArray(day.activities)
        ? day.activities
        : Array.isArray(day.items)
          ? day.items
          : [];

      return {
        id: `day-${index + 1}`,
        dayNumber: day.day_number || day.day || index + 1,
        date: day.date || "",
        title: day.theme || day.title || `Day ${index + 1}`,
        items: activities.map((activity) => {
          const enrichedActivity = enrichActivityWithProviderData(activity, pools);

          return makeItem({
            time: activity.time || enrichedActivity.time || "",
            type: activity.type || enrichedActivity.type || "activity",
            item: enrichedActivity,
            fallbackName: activity.name || activity.title || "Activity",
            adults,
            destinationCity,
          });
        }),
      };
    });
  }

  return buildRandomDays(fallbackDays, pools, adults, destinationCity);
}

/**
 * Choose the correct replacement pool for an itinerary item.
 */
function getPoolByType(type, pools) {
  const normalizedType = String(type || "").toLowerCase();

  if (normalizedType === "restaurant") return pools.restaurants;
  if (normalizedType === "tour") return pools.tours;
  if (normalizedType === "attraction") return pools.attractions;

  return [...pools.attractions, ...pools.tours, ...pools.restaurants];
}

/**
 * Extract flight segment details from Amadeus-like selected offer.
 */
function extractFlightSegments(selectedOffer) {
  const itineraries = selectedOffer?.itineraries || [];

  return itineraries.flatMap((itinerary, itineraryIndex) => {
    const direction = itineraryIndex === 0 ? "Outbound" : "Return";
    const segments = itinerary?.segments || [];

    return segments.map((segment, segmentIndex) => ({
      id: `${itineraryIndex}-${segmentIndex}`,
      direction,
      carrierCode: segment?.carrierCode || "",
      number: segment?.number || "",
      departureAirport: segment?.departure?.iataCode || "",
      departureTime: segment?.departure?.at || "",
      arrivalAirport: segment?.arrival?.iataCode || "",
      arrivalTime: segment?.arrival?.at || "",
      duration: segment?.duration || itinerary?.duration || "",
    }));
  });
}

/**
 * Get outbound flight segments.
 */
function getOutboundSegments(selectedOffer) {
  return selectedOffer?.itineraries?.[0]?.segments || [];
}

/**
 * Get return flight segments.
 */
function getReturnSegments(selectedOffer) {
  return selectedOffer?.itineraries?.[1]?.segments || [];
}

/**
 * First outbound segment.
 */
function getFirstOutboundSegment(selectedOffer) {
  const segments = getOutboundSegments(selectedOffer);
  return segments[0] || null;
}

/**
 * Last outbound segment.
 *
 * This matters if the flight has connections.
 */
function getLastOutboundSegment(selectedOffer) {
  const segments = getOutboundSegments(selectedOffer);
  return segments[segments.length - 1] || null;
}

/**
 * First return segment.
 */
function getFirstReturnSegment(selectedOffer) {
  const segments = getReturnSegments(selectedOffer);
  return segments[0] || null;
}

/**
 * Last return segment.
 */
function getLastReturnSegment(selectedOffer) {
  const segments = getReturnSegments(selectedOffer);
  return segments[segments.length - 1] || null;
}

/**
 * Estimate "leave home by" time.
 *
 * MVP logic:
 * first flight departure time minus 3 hours.
 * The more detailed Day 1 timeline uses route duration + 90-minute airport buffer.
 */
function estimateLeaveHomeTime(selectedOffer) {
  const firstOutbound = getFirstOutboundSegment(selectedOffer);
  const firstDeparture = firstOutbound?.departure?.at;

  if (!firstDeparture) return "";

  const departure = new Date(firstDeparture);

  if (Number.isNaN(departure.getTime())) return "";

  departure.setHours(departure.getHours() - 3);

  return departure.toLocaleString();
}

/**
 * Check whether a route-like object is an internal step.
 *
 * We do NOT want to show labels like:
 * - leg2.steps[0]
 * - leg3.steps[0]
 */
function isInternalStepPath(path) {
  return path.includes(".steps") || path.includes("steps[");
}

/**
 * Extract clean transport legs from backend route plan.
 *
 * This avoids internal Google step data and keeps only clean route legs.
 */
function extractRouteLegs(routePlan, startAddress, destinationAddress) {
  const found = [];

  function addLeg(value, path = "") {
    if (!value || typeof value !== "object") return;
    if (isInternalStepPath(path)) return;

    const origin =
      value.origin ||
      value.from ||
      value.start ||
      value.start_address ||
      value.departure_address ||
      value.from_address ||
      "";

    const destination =
      value.destination ||
      value.to ||
      value.end ||
      value.end_address ||
      value.arrival_address ||
      value.to_address ||
      "";

    const link = value.google_maps_url || value.maps_url || value.map_url || "";

    // Avoid internal step objects that only have duration/distance.
    const hasUsefulRoute = (origin && destination) || link;

    if (!hasUsefulRoute) return;

    const label =
      value.label ||
      value.title ||
      value.name ||
      value.mode ||
      value.transport_mode ||
      value.type ||
      "Transport leg";

    found.push({
      label,
      origin: String(origin || ""),
      destination: String(destination || ""),
      mode: value.mode || value.transport_mode || value.type || "",
      duration: value.duration_text || value.duration || "",
      distance: value.distance_text || value.distance || "",
      link: link || buildGoogleMapsDirectionsUrl(origin, destination),
    });
  }

  const possibleLegArrays = [
    routePlan?.legs,
    routePlan?.route_legs,
    routePlan?.routes,
    routePlan?.transport_legs,
    routePlan?.plan?.legs,
    routePlan?.trip_plan?.legs,
  ];

  possibleLegArrays.forEach((maybeArray) => {
    if (Array.isArray(maybeArray)) {
      maybeArray.forEach((item, index) => addLeg(item, `legs[${index}]`));
    }
  });

  if (found.length === 0 && routePlan && typeof routePlan === "object") {
    Object.entries(routePlan).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item, index) => addLeg(item, `${key}[${index}]`));
      } else if (value && typeof value === "object") {
        addLeg(value, key);
      }
    });
  }

  if (found.length === 0 && startAddress && destinationAddress) {
    found.push({
      label: "Start address to destination",
      origin: startAddress,
      destination: destinationAddress,
      mode: "",
      duration: "",
      distance: "",
      link: buildGoogleMapsDirectionsUrl(startAddress, destinationAddress),
    });
  }

  const seen = new Set();

  return found.filter((leg) => {
    if (!leg.origin && !leg.destination && !leg.link) return false;

    const key = `${leg.label}-${leg.origin}-${leg.destination}-${leg.duration}-${leg.distance}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

/**
 * Get the route legs we need for timeline calculations.
 *
 * Current expected order from generated route plan:
 * 0. Home/start address -> departure airport
 * 1. Arrival airport -> hotel/destination
 * 2. Hotel/destination -> return airport
 * 3. Return airport -> home/start address
 */
function getRouteLegSlots(transportLegs) {
  return {
    homeToDepartureAirport: transportLegs[0] || null,
    arrivalAirportToHotel: transportLegs[1] || null,
    hotelToReturnAirport: transportLegs[2] || null,
    returnAirportToHome: transportLegs[3] || null,
  };
}

/**
 * Estimate one public transport leg.
 *
 * Only returns a price when this route looks like transit/public transport.
 */
function estimateSingleTransitLegCost(leg, adults = 1) {
  if (!leg) return 0;

  const mode = String(leg.mode || leg.label || "").toLowerCase();

  if (!mode.includes("transit") && !mode.includes("public")) {
    return 0;
  }

  return Math.max(1, Number(adults || 1)) * 8;
}

/**
 * Build the travel-only items for Day 1.
 *
 * Rules:
 * - User should be at the airport 90 minutes before the flight.
 * - If route duration is known, leave home by:
 *   flight departure - route duration - 90 minutes.
 * - After landing, add 45 minutes for baggage/passport/airport exit.
 * - Then add route from arrival airport to hotel.
 */
function buildArrivalTravelItems({ selectedOffer, transportLegs, adults }) {
  const firstOutbound = getFirstOutboundSegment(selectedOffer);
  const lastOutbound = getLastOutboundSegment(selectedOffer);

  if (!firstOutbound || !lastOutbound) return [];

  const routeSlots = getRouteLegSlots(transportLegs);

  const homeToAirport = routeSlots.homeToDepartureAirport;
  const airportToHotel = routeSlots.arrivalAirportToHotel;

  const homeToAirportMinutes =
    parseDurationMinutes(homeToAirport?.duration) ||
    parseDurationMinutes(homeToAirport?.duration_text) ||
    60;

  const airportToHotelMinutes =
    parseDurationMinutes(airportToHotel?.duration) ||
    parseDurationMinutes(airportToHotel?.duration_text) ||
    60;

  const departureTime = firstOutbound?.departure?.at;
  const landingTime = lastOutbound?.arrival?.at;

  const airportArrivalTime = subtractMinutes(departureTime, 90);
  const leaveHomeTime = subtractMinutes(departureTime, homeToAirportMinutes + 90);

  const readyToLeaveAirportTime = addMinutes(landingTime, 45);
  const estimatedHotelArrivalTime = addMinutes(
    readyToLeaveAirportTime,
    airportToHotelMinutes,
  );

  return [
    makeTravelItem({
      time: formatTime(leaveHomeTime),
      type: "transport",
      name: "Leave home / starting address",
      description: `Leave for the airport. Estimated travel time to airport: ${homeToAirportMinutes} minutes. You should arrive at the airport 90 minutes before departure.`,
      link: homeToAirport?.link || "",
    }),

    makeTravelItem({
      time: formatTime(airportArrivalTime),
      type: "airport",
      name: "Arrive at departure airport",
      description: `Arrive at ${
        firstOutbound?.departure?.iataCode || "departure airport"
      } around 90 minutes before your flight.`,
    }),

    makeTravelItem({
      time: formatTime(departureTime),
      type: "flight",
      name: `Outbound flight ${firstOutbound?.departure?.iataCode || ""} → ${
        lastOutbound?.arrival?.iataCode || ""
      }`,
      description: `Carrier: ${firstOutbound?.carrierCode || ""} | Flight: ${
        firstOutbound?.number || ""
      }. Scheduled arrival: ${formatDateTime(landingTime)}.`,
    }),

    makeTravelItem({
      time: formatTime(landingTime),
      type: "arrival",
      name: "Land at destination airport",
      description:
        "Landing time. Add about 45 minutes for passport control, baggage collection, and exiting the airport.",
    }),

    makeTravelItem({
      time: formatTime(readyToLeaveAirportTime),
      type: "buffer",
      name: "Ready to leave airport",
      description: "Estimated time after baggage/passport/airport exit buffer.",
    }),

    makeTravelItem({
      time: formatTime(readyToLeaveAirportTime),
      type: "transport",
      name: "Travel from airport to hotel / destination",
      description: `Estimated route time to hotel/destination: ${airportToHotelMinutes} minutes. Estimated arrival: ${formatTime(
        estimatedHotelArrivalTime,
      )}.`,
      link: airportToHotel?.link || "",
      estimatedPriceEur: estimateSingleTransitLegCost(airportToHotel, adults),
    }),

    makeTravelItem({
      time: formatTime(estimatedHotelArrivalTime),
      type: "hotel",
      name: "Arrive at hotel / destination",
      description: "Check in, rest, and prepare for the next day.",
    }),
  ];
}

/**
 * Build return-day travel items.
 *
 * Rule:
 * - Be at airport 90 minutes before return flight.
 * - Leave hotel by:
 *   return flight departure - hotel-to-airport route duration - 90 minutes.
 */
function buildReturnTravelItems({ selectedOffer, transportLegs, adults }) {
  const firstReturn = getFirstReturnSegment(selectedOffer);
  const lastReturn = getLastReturnSegment(selectedOffer);

  if (!firstReturn || !lastReturn) return [];

  const routeSlots = getRouteLegSlots(transportLegs);

  const hotelToAirport = routeSlots.hotelToReturnAirport;
  const returnAirportToHome = routeSlots.returnAirportToHome;

  const hotelToAirportMinutes =
    parseDurationMinutes(hotelToAirport?.duration) ||
    parseDurationMinutes(hotelToAirport?.duration_text) ||
    60;

  const returnAirportToHomeMinutes =
    parseDurationMinutes(returnAirportToHome?.duration) ||
    parseDurationMinutes(returnAirportToHome?.duration_text) ||
    60;

  const returnDepartureTime = firstReturn?.departure?.at;
  const returnArrivalTime = lastReturn?.arrival?.at;

  const returnAirportArrivalTime = subtractMinutes(returnDepartureTime, 90);
  const leaveHotelTime = subtractMinutes(
    returnDepartureTime,
    hotelToAirportMinutes + 90,
  );

  const readyToLeaveReturnAirportTime = addMinutes(returnArrivalTime, 30);
  const estimatedHomeArrivalTime = addMinutes(
    readyToLeaveReturnAirportTime,
    returnAirportToHomeMinutes,
  );

  return [
    makeTravelItem({
      time: formatTime(leaveHotelTime),
      type: "transport",
      name: "Leave hotel / destination for airport",
      description: `Leave early enough to reach the airport 90 minutes before your return flight. Estimated route time: ${hotelToAirportMinutes} minutes.`,
      link: hotelToAirport?.link || "",
      estimatedPriceEur: estimateSingleTransitLegCost(hotelToAirport, adults),
    }),

    makeTravelItem({
      time: formatTime(returnAirportArrivalTime),
      type: "airport",
      name: "Arrive at return airport",
      description: `Arrive at ${
        firstReturn?.departure?.iataCode || "airport"
      } around 90 minutes before departure.`,
    }),

    makeTravelItem({
      time: formatTime(returnDepartureTime),
      type: "flight",
      name: `Return flight ${firstReturn?.departure?.iataCode || ""} → ${
        lastReturn?.arrival?.iataCode || ""
      }`,
      description: `Carrier: ${firstReturn?.carrierCode || ""} | Flight: ${
        firstReturn?.number || ""
      }. Scheduled arrival: ${formatDateTime(returnArrivalTime)}.`,
    }),

    makeTravelItem({
      time: formatTime(returnArrivalTime),
      type: "arrival",
      name: "Land at home airport",
      description: "Landing time. Add around 30 minutes for airport exit.",
    }),

    makeTravelItem({
      time: formatTime(readyToLeaveReturnAirportTime),
      type: "transport",
      name: "Travel from airport to home / starting address",
      description: `Estimated route time: ${returnAirportToHomeMinutes} minutes. Estimated arrival: ${formatTime(
        estimatedHomeArrivalTime,
      )}.`,
      link: returnAirportToHome?.link || "",
    }),
  ];
}

/**
 * Build the real visible day plan.
 *
 * Rules:
 * - If the user lands after 21:00, Day 1 is travel-only.
 * - Sightseeing starts the next day.
 * - Arrival transport is included inside Day 1.
 * - Return transport/flight is included on the final day.
 */
function applyTravelTimelineToDays({
  aiDays,
  selectedOffer,
  transportLegs,
  adults,
}) {
  const firstOutbound = getFirstOutboundSegment(selectedOffer);
  const lastOutbound = getLastOutboundSegment(selectedOffer);
  const firstReturn = getFirstReturnSegment(selectedOffer);

  if (!firstOutbound || !lastOutbound) {
    return aiDays;
  }

  const landingTime = lastOutbound?.arrival?.at;
  const landingHour = getHour(landingTime);

  const isLateArrival = landingHour !== null && landingHour >= 21;

  const arrivalTravelItems = buildArrivalTravelItems({
    selectedOffer,
    transportLegs,
    adults,
  });

  const returnTravelItems = buildReturnTravelItems({
    selectedOffer,
    transportLegs,
    adults,
  });

  const arrivalDateLabel = formatDateOnly(landingTime);
  const returnDateLabel = firstReturn?.departure?.at
    ? formatDateOnly(firstReturn.departure.at)
    : "";

  /**
   * Late arrival:
   * Day 1 = travel only.
   * Sightseeing starts next day.
   *
   * To keep trip length realistic, we drop the last generated sightseeing day.
   * Example:
   * 5-day trip with late arrival:
   * - Day 1 travel only
   * - Days 2-5 sightseeing/return
   */
  if (isLateArrival) {
    const travelOnlyDay = {
      id: `arrival-day-${Date.now()}`,
      dayNumber: 1,
      date: arrivalDateLabel,
      title: "Arrival day — travel to hotel",
      items: [
        ...arrivalTravelItems,
        makeTravelItem({
          time: "",
          type: "note",
          name: "No sightseeing planned",
          description:
            "You arrive late, so this day is kept free. You can still add something manually if you want.",
        }),
      ],
    };

    const sightseeingDaysToKeep = Math.max(0, aiDays.length - 1);

    const shiftedAiDays = aiDays.slice(0, sightseeingDaysToKeep).map((day, index) => ({
      ...day,
      id: `shifted-${day.id || index}`,
      dayNumber: index + 2,
      date: day.date || formatDateOnly(addDays(landingTime, index + 1)),
      title: day.title || `Day ${index + 2}`,
    }));

    const allDays = [travelOnlyDay, ...shiftedAiDays];

    if (returnTravelItems.length > 0 && allDays.length > 0) {
      const finalIndex = allDays.length - 1;

      allDays[finalIndex] = {
        ...allDays[finalIndex],
        date: allDays[finalIndex].date || returnDateLabel,
        items: [...allDays[finalIndex].items, ...returnTravelItems],
      };
    }

    return allDays;
  }

  /**
   * Normal arrival:
   * Add arrival travel timeline to Day 1, then keep AI activities.
   */
  const normalDays = aiDays.map((day, index) => {
    const date = day.date || formatDateOnly(addDays(landingTime, index));

    if (index !== 0) {
      return {
        ...day,
        date,
      };
    }

    return {
      ...day,
      date,
      title: day.title || "Arrival and first day",
      items: [...arrivalTravelItems, ...day.items],
    };
  });

  if (returnTravelItems.length > 0 && normalDays.length > 0) {
    const finalIndex = normalDays.length - 1;

    normalDays[finalIndex] = {
      ...normalDays[finalIndex],
      date: normalDays[finalIndex].date || returnDateLabel,
      items: [...normalDays[finalIndex].items, ...returnTravelItems],
    };
  }

  return normalDays;
}

/**
 * Calculate total estimated itinerary activity/food cost.
 */
function calculateItineraryEstimate(days) {
  return days.reduce((dayTotal, day) => {
    const itemTotal = day.items.reduce(
      (sum, item) => sum + toNumber(item.estimated_price_eur),
      0,
    );

    return dayTotal + itemTotal;
  }, 0);
}

/**
 * Get known fixed trip costs:
 * - flight
 * - hotel
 * - selected transfers only when they cost more than 0
 */
function getKnownTripCosts({
  selectedOffer,
  selectedHotel,
  selectedArrivalTransfer,
  selectedReturnTransfer,
}) {
  const flightCost = toNumber(selectedOffer?.price?.total);

  const hotelCost = toNumber(
    selectedHotel?.price_total_eur ?? selectedHotel?.price_total,
  );

  const arrivalTransferCost = toNumber(selectedArrivalTransfer?.price_total_eur);
  const returnTransferCost = toNumber(selectedReturnTransfer?.price_total_eur);

  const paidTransferCost =
    (arrivalTransferCost > 0 ? arrivalTransferCost : 0) +
    (returnTransferCost > 0 ? returnTransferCost : 0);

  return {
    flightCost,
    hotelCost,
    arrivalTransferCost,
    returnTransferCost,
    paidTransferCost,
    knownTotal: flightCost + hotelCost + paidTransferCost,
  };
}

/**
 * Estimate public transport cost.
 *
 * Google Routes transit responses do not always provide fare data.
 * For MVP we estimate airport/city public transport at €8 per adult per transit leg.
 */
function estimatePublicTransportCost(transportLegs, adults = 1) {
  const adultCount = Math.max(1, Number(adults || 1));

  const transitLegCount = transportLegs.filter((leg) => {
    const mode = String(leg.mode || leg.label || "").toLowerCase();
    return mode.includes("transit") || mode.includes("public");
  }).length;

  return transitLegCount * 8 * adultCount;
}

/**
 * VS Code-style collapsible section.
 */
function CollapsibleSection({ title, subtitle, defaultOpen = false, children }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section style={styles.collapsible}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        style={styles.collapsibleButton}
        aria-expanded={isOpen}
      >
        <span
          style={{
            ...styles.collapsibleArrow,
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          ▶
        </span>

        <span style={styles.collapsibleTitleWrap}>
          <span style={styles.collapsibleTitle}>{title}</span>

          {subtitle && <span style={styles.collapsibleSubtitle}>{subtitle}</span>}
        </span>
      </button>

      <div
        style={{
          ...styles.collapsibleBodyOuter,
          gridTemplateRows: isOpen ? "1fr" : "0fr",
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div style={styles.collapsibleBodyInner}>
          <div style={styles.collapsibleContent}>{children}</div>
        </div>
      </div>
    </section>
  );
}

/**
 * Build printable HTML for browser PDF export.
 */
function buildPrintableHtml({
  destinationCity,
  days,
  summary,
  flightSegments,
  transportLegs,
}) {
  const flightHtml = flightSegments.length
    ? flightSegments
        .map(
          (segment) => `
            <tr>
              <td>${escapeHtml(segment.direction)}</td>
              <td>${escapeHtml(segment.carrierCode)} ${escapeHtml(segment.number)}</td>
              <td>${escapeHtml(segment.departureAirport)}<br>${escapeHtml(segment.departureTime)}</td>
              <td>${escapeHtml(segment.arrivalAirport)}<br>${escapeHtml(segment.arrivalTime)}</td>
              <td>${escapeHtml(segment.duration)}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="5">No flight segment details available.</td></tr>`;

  const transportHtml = transportLegs.length
    ? transportLegs
        .map(
          (leg) => `
            <li>
              <strong>${escapeHtml(leg.label)}</strong>
              ${leg.mode ? `<span class="type">${escapeHtml(leg.mode)}</span>` : ""}
              <p>${escapeHtml(leg.origin || "-")} → ${escapeHtml(leg.destination || "-")}</p>
              <p class="muted">
                ${leg.duration ? `Duration: ${escapeHtml(leg.duration)} ` : ""}
                ${leg.distance ? `Distance: ${escapeHtml(leg.distance)}` : ""}
              </p>
              ${
                leg.link
                  ? `<a href="${escapeHtml(leg.link)}" target="_blank">Open route in Google Maps</a>`
                  : ""
              }
            </li>
          `,
        )
        .join("")
    : `<li>No transport route details available.</li>`;

  const dayHtml = days
    .map((day) => {
      const itemHtml = day.items
        .map((item) => {
          const itemLink =
            item.link || buildGoogleMapsSearchUrl(item.name, destinationCity);

          return `
            <li>
              <strong>${escapeHtml(item.time || "")} ${escapeHtml(item.name || "")}</strong>
              <span class="type">${escapeHtml(item.type || "")}</span>
              <span class="price">${formatMoney(item.estimated_price_eur)}</span>
              ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
              ${item.address ? `<p class="muted">${escapeHtml(item.address)}</p>` : ""}
              ${
                item.rating || item.review_count
                  ? `<p class="muted">${item.rating ? `⭐ ${escapeHtml(item.rating)}` : ""}${
                      item.review_count
                        ? ` · ${escapeHtml(item.review_count)} reviews`
                        : ""
                    }</p>`
                  : ""
              }
              <p class="muted">Source: ${escapeHtml(item.source_label || "Google Maps search")}</p>
              <a href="${escapeHtml(itemLink)}" target="_blank">
                Open in Google Maps / booking page
              </a>
            </li>
          `;
        })
        .join("");

      return `
        <section class="day">
          <h2>Day ${escapeHtml(day.dayNumber)}: ${escapeHtml(day.title || "")}</h2>
          ${day.date ? `<p class="muted">${escapeHtml(day.date)}</p>` : ""}
          <ul>${itemHtml}</ul>
        </section>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(destinationCity)} trip plan</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #111827;
            margin: 32px;
            line-height: 1.45;
          }

          h1 {
            margin-bottom: 4px;
          }

          a {
            color: #1d4ed8;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
          }

          th, td {
            border: 1px solid #d1d5db;
            padding: 8px;
            text-align: left;
            vertical-align: top;
          }

          th {
            background: #f3f4f6;
          }

          .summary {
            padding: 12px;
            border: 1px solid #d1d5db;
            border-radius: 10px;
            margin: 16px 0 24px;
            background: #f9fafb;
          }

          .section {
            page-break-inside: avoid;
            margin-top: 24px;
          }

          .day {
            page-break-inside: avoid;
            border-top: 2px solid #2563eb;
            padding-top: 12px;
            margin-top: 24px;
          }

          li {
            margin-bottom: 14px;
          }

          .type {
            display: inline-block;
            margin-left: 8px;
            padding: 2px 6px;
            border-radius: 999px;
            background: #dbeafe;
            color: #1e40af;
            font-size: 12px;
          }

          .price {
            display: inline-block;
            margin-left: 8px;
            color: #047857;
            font-weight: bold;
          }

          .muted {
            color: #6b7280;
            margin: 4px 0;
          }

          .budget {
            font-size: 16px;
          }
        </style>
      </head>

      <body>
        <h1>${escapeHtml(destinationCity)} Trip Plan</h1>

        <div class="summary">
          <p><strong>Trip length:</strong> ${escapeHtml(summary.tripDays)} day(s)</p>
          <p><strong>Stay address:</strong> ${escapeHtml(summary.arrivalDestinationAddress || "-")}</p>
          <p><strong>Leave home by:</strong> ${escapeHtml(summary.leaveHomeTime || "Check route and airport timing")}</p>

          <p class="budget"><strong>Flight cost:</strong> ${formatMoney(summary.flightCost)}</p>
          <p class="budget"><strong>Hotel cost:</strong> ${formatMoney(summary.hotelCost)}</p>

          ${
            summary.paidTransferCost > 0
              ? `<p class="budget"><strong>Selected transfer cost:</strong> ${formatMoney(summary.paidTransferCost)}</p>`
              : ""
          }

          ${
            summary.estimatedPublicTransportCost > 0
              ? `<p class="budget"><strong>Public transport estimate:</strong> ${formatMoney(summary.estimatedPublicTransportCost)}</p>`
              : ""
          }

          <p class="budget"><strong>Estimated activities + food:</strong> ${formatMoney(summary.estimatedActivitiesCost)}</p>
          <p class="budget"><strong>Estimated total trip cost:</strong> ${formatMoney(summary.estimatedTotalTripCost)}</p>
          <p class="budget"><strong>Estimated remaining budget:</strong> ${formatMoney(summary.remainingBudgetAfterActivities)}</p>
        </div>

        <section class="section">
          <h2>Flight details</h2>
          <table>
            <thead>
              <tr>
                <th>Direction</th>
                <th>Flight</th>
                <th>Departure</th>
                <th>Arrival</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>${flightHtml}</tbody>
          </table>
        </section>

        <section class="section">
          <h2>Transport / route plan</h2>
          <ul>${transportHtml}</ul>
        </section>

        <section class="section">
          <h2>Day-by-day itinerary</h2>
          ${dayHtml}
        </section>
      </body>
    </html>
  `;
}

/**
 * Main component.
 */
export default function TripItineraryBuilder({
  flightWidget,
  selectedOffer,
  selectedHotel,
  selectedArrivalTransfer,
  selectedReturnTransfer,
  routePlan,
  arrivalDestinationAddress,
  startAddress,
  remainingBudget,
}) {
  const [loading, setLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState("");

  const [preferences, setPreferences] = useState(
    "local food, main attractions, hidden gems, realistic timing, not too expensive",
  );

  const [restaurants, setRestaurants] = useState([]);
  const [attractions, setAttractions] = useState([]);
  const [tours, setTours] = useState([]);
  const [providerWarnings, setProviderWarnings] = useState([]);
  const [days, setDays] = useState([]);

  const adults = Number(flightWidget?.adults || 1);

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

  const pools = useMemo(
    () => ({
      restaurants,
      attractions,
      tours,
    }),
    [restaurants, attractions, tours],
  );

  const flightSegments = useMemo(() => {
    return extractFlightSegments(selectedOffer);
  }, [selectedOffer]);

  const leaveHomeTime = useMemo(() => {
    return estimateLeaveHomeTime(selectedOffer);
  }, [selectedOffer]);

  const transportLegs = useMemo(() => {
    return extractRouteLegs(routePlan, startAddress, arrivalDestinationAddress);
  }, [routePlan, startAddress, arrivalDestinationAddress]);

  const knownCosts = useMemo(() => {
    return getKnownTripCosts({
      selectedOffer,
      selectedHotel,
      selectedArrivalTransfer,
      selectedReturnTransfer,
    });
  }, [
    selectedOffer,
    selectedHotel,
    selectedArrivalTransfer,
    selectedReturnTransfer,
  ]);

  const estimatedPublicTransportCost = useMemo(() => {
    if (knownCosts.paidTransferCost > 0) return 0;

    return estimatePublicTransportCost(transportLegs, adults);
  }, [transportLegs, adults, knownCosts.paidTransferCost]);

  const estimatedActivitiesCost = useMemo(() => {
    return calculateItineraryEstimate(days);
  }, [days]);

  const estimatedTotalTripCost = useMemo(() => {
    return (
      knownCosts.knownTotal +
      estimatedPublicTransportCost +
      estimatedActivitiesCost
    );
  }, [knownCosts, estimatedPublicTransportCost, estimatedActivitiesCost]);

  const estimatedRemainingAfterActivities = useMemo(() => {
    return (
      toNumber(remainingBudget) -
      estimatedPublicTransportCost -
      estimatedActivitiesCost
    );
  }, [remainingBudget, estimatedPublicTransportCost, estimatedActivitiesCost]);

  /**
   * Load restaurants, attractions, tours, and AI itinerary.
   */
  async function loadItineraryData({ randomizeOnly = false } = {}) {
    if (!destinationCity) {
      setError("Destination city is missing. Please select/search a flight first.");
      return;
    }

    setLoading(true);
    setError("");
    setProviderWarnings([]);

    try {
      let currentRestaurants = restaurants;
      let currentAttractions = attractions;
      let currentTours = tours;

      if (!randomizeOnly || restaurants.length === 0 || attractions.length === 0) {
        const [restaurantRes, attractionRes, tourRes] = await Promise.all([
          api.post("/chat/places/", {
            city: destinationCity,
            category: "restaurant",
            max_results: 12,
            user_preferences: preferences,
            use_ai_filter: true,
          }),
          api.post("/chat/places/", {
            city: destinationCity,
            category: "attraction",
            max_results: 12,
            user_preferences: preferences,
            use_ai_filter: true,
          }),
          api.post("/chat/tours/", {
            city: destinationCity,
            max_results: 8,
            activity_type: preferences,
          }),
        ]);

        currentRestaurants = restaurantRes.data?.places || [];
        currentAttractions = attractionRes.data?.places || [];
        currentTours = tourRes.data?.tours || [];

        setRestaurants(currentRestaurants);
        setAttractions(currentAttractions);
        setTours(currentTours);

        setProviderWarnings(
          [
            restaurantRes.data?.provider_warning,
            attractionRes.data?.provider_warning,
            tourRes.data?.provider_warning,
          ].filter(Boolean),
        );
      }

      const currentPools = {
        restaurants: currentRestaurants,
        attractions: currentAttractions,
        tours: currentTours,
      };

      if (randomizeOnly) {
        const randomDays = buildRandomDays(
          tripDays,
          currentPools,
          adults,
          destinationCity,
        );

        const timelineDays = applyTravelTimelineToDays({
          aiDays: randomDays,
          selectedOffer,
          transportLegs,
          adults,
        });

        setDays(timelineDays);
        setHasLoadedOnce(true);
        return;
      }

      const itineraryRes = await api.post("/chat/itinerary/", {
        city: destinationCity,
        num_days: tripDays,
        check_in_date: flightWidget?.departure_date,
        hotel_address: arrivalDestinationAddress,
        user_preferences: preferences,
        budget_remaining: remainingBudget,
      });

      if (itineraryRes.data?.provider_warning) {
        setProviderWarnings((prev) => [...prev, itineraryRes.data.provider_warning]);
      }

      const aiDays = normalizeAiItinerary(
        itineraryRes.data,
        tripDays,
        currentPools,
        adults,
        destinationCity,
      );

      const timelineDays = applyTravelTimelineToDays({
        aiDays,
        selectedOffer,
        transportLegs,
        adults,
      });

      setDays(timelineDays);
      setHasLoadedOnce(true);
    } catch (err) {
      console.error(err);

      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        "Failed to build itinerary.";

      setError(detail);

      if (restaurants.length || attractions.length || tours.length) {
        const fallbackDays = buildRandomDays(
          tripDays,
          pools,
          adults,
          destinationCity,
        );

        const timelineDays = applyTravelTimelineToDays({
          aiDays: fallbackDays,
          selectedOffer,
          transportLegs,
          adults,
        });

        setDays(timelineDays);
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Automatically build itinerary once after transport plan is generated.
   */
  useEffect(() => {
    if (routePlan && !hasLoadedOnce && !loading) {
      loadItineraryData();
    }

    // Intentionally avoid adding loadItineraryData to dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePlan, hasLoadedOnce, loading]);

  /**
   * Replace one item with another from the same pool.
   */
  function replaceItem(dayId, itemId) {
    setDays((prevDays) =>
      prevDays.map((day) => {
        if (day.id !== dayId) return day;

        return {
          ...day,
          items: day.items.map((item) => {
            if (item.id !== itemId) return item;

            const pool = getPoolByType(item.type, pools);
            const replacement = pickRandom(pool);

            if (!replacement) return item;

            return makeItem({
              time: item.time,
              type: item.type,
              item: replacement,
              fallbackName: item.name,
              adults,
              destinationCity,
            });
          }),
        };
      }),
    );
  }

  /**
   * Remove one item.
   */
  function removeItem(dayId, itemId) {
    setDays((prevDays) =>
      prevDays.map((day) =>
        day.id === dayId
          ? {
              ...day,
              items: day.items.filter((item) => item.id !== itemId),
            }
          : day,
      ),
    );
  }

  /**
   * Add custom item with optional price and link.
   */
  function addCustomItem(dayId) {
    const name = window.prompt("What would you like to add?");
    if (!name) return;

    const time = window.prompt("Time? Example: 16:30", "16:30") || "";
    const estimatedPrice =
      window.prompt("Estimated price in EUR? Example: 25", "0") || "0";
    const link = window.prompt("Optional link for tickets/map:", "") || "";

    setDays((prevDays) =>
      prevDays.map((day) =>
        day.id === dayId
          ? {
              ...day,
              items: [
                ...day.items,
                {
                  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                  time,
                  type: "custom",
                  name,
                  description: "Custom item added by you.",
                  rating: null,
                  review_count: null,
                  address: "",
                  link: link || buildGoogleMapsSearchUrl(name, destinationCity),
                  estimated_price_eur: toNumber(estimatedPrice),
                  price_note: "Manual estimate",
                  source_label: link ? "Manual link" : "Google Maps search",
                  raw: {},
                },
              ],
            }
          : day,
      ),
    );
  }

  /**
   * Randomize one sightseeing day.
   *
   * Travel/logistics-only days are protected so the user does not accidentally
   * replace the airport/hotel travel timeline.
   */
  function randomizeDay(dayId) {
    setDays((prevDays) =>
      prevDays.map((day) => {
        if (day.id !== dayId) return day;

        const hasOnlyTravelItems = day.items.every((item) =>
          [
            "transport",
            "airport",
            "flight",
            "arrival",
            "buffer",
            "hotel",
            "note",
          ].includes(item.type),
        );

        if (hasOnlyTravelItems) {
          alert(
            "This is a travel/logistics day. Use Add custom if you want to add something.",
          );
          return day;
        }

        const randomDay = buildRandomDays(1, pools, adults, destinationCity)[0];

        return {
          ...day,
          title: randomDay.title,
          items: randomDay.items,
        };
      }),
    );
  }

  /**
   * Edit estimated item price.
   */
  function editItemPrice(dayId, itemId) {
    const currentItem = days
      .find((day) => day.id === dayId)
      ?.items.find((item) => item.id === itemId);

    const nextPrice = window.prompt(
      "Estimated price in EUR:",
      String(currentItem?.estimated_price_eur ?? 0),
    );

    if (nextPrice === null) return;

    setDays((prevDays) =>
      prevDays.map((day) =>
        day.id === dayId
          ? {
              ...day,
              items: day.items.map((item) =>
                item.id === itemId
                  ? {
                      ...item,
                      estimated_price_eur: toNumber(nextPrice),
                      price_note: "Manual estimate",
                    }
                  : item,
              ),
            }
          : day,
      ),
    );
  }

  /**
   * Open printable PDF page.
   */
  function downloadPdf() {
    const html = buildPrintableHtml({
      destinationCity,
      days,
      flightSegments,
      transportLegs,
      summary: {
        tripDays,
        arrivalDestinationAddress,
        leaveHomeTime,
        flightCost: knownCosts.flightCost,
        hotelCost: knownCosts.hotelCost,
        paidTransferCost: knownCosts.paidTransferCost,
        estimatedPublicTransportCost,
        estimatedActivitiesCost,
        estimatedTotalTripCost,
        remainingBudgetAfterActivities: estimatedRemainingAfterActivities,
      },
    });

    const printWindow = window.open("", "_blank", "width=1000,height=800");

    if (!printWindow) {
      alert("Popup was blocked. Please allow popups to download/print the PDF.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 300);
  }

  return (
    <section style={styles.shell}>
      <div style={styles.headerRow}>
        <div>
          <p style={styles.eyebrow}>Editable itinerary</p>
          <h2 style={styles.title}>Your trip to {destinationCity || "your destination"}</h2>
          <p style={styles.subtitle}>
            Build a day-by-day plan with flights, transport, restaurants,
            attractions, links, estimated costs, and PDF export.
          </p>
        </div>

        <div style={styles.headerActions}>
          <button
            type="button"
            onClick={() => loadItineraryData()}
            disabled={loading}
            style={styles.primaryButton}
          >
            {loading ? "Building..." : "Rebuild with AI"}
          </button>

          <button
            type="button"
            onClick={() => loadItineraryData({ randomizeOnly: true })}
            disabled={loading}
            style={styles.secondaryButton}
          >
            Randomize all
          </button>

          <button
            type="button"
            onClick={downloadPdf}
            disabled={days.length === 0}
            style={styles.secondaryButton}
          >
            Download / print PDF
          </button>
        </div>
      </div>

      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Flight cost</span>
          <strong>{formatMoney(knownCosts.flightCost)}</strong>
        </div>

        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Hotel cost</span>
          <strong>{formatMoney(knownCosts.hotelCost)}</strong>
        </div>

        {knownCosts.paidTransferCost > 0 && (
          <div style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Selected transfers</span>
            <strong>{formatMoney(knownCosts.paidTransferCost)}</strong>
          </div>
        )}

        {knownCosts.paidTransferCost === 0 && estimatedPublicTransportCost > 0 && (
          <div style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Public transport estimate</span>
            <strong>{formatMoney(estimatedPublicTransportCost)}</strong>
          </div>
        )}

        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Activities + food estimate</span>
          <strong>{formatMoney(estimatedActivitiesCost)}</strong>
        </div>

        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Estimated total trip cost</span>
          <strong>{formatMoney(estimatedTotalTripCost)}</strong>
        </div>

        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Estimated remaining</span>
          <strong
            style={{
              color: estimatedRemainingAfterActivities < 0 ? "#fca5a5" : "#86efac",
            }}
          >
            {formatMoney(estimatedRemainingAfterActivities)}
          </strong>
        </div>

        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Leave home by</span>
          <strong>{leaveHomeTime || "Check route timing"}</strong>
        </div>

        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Stay</span>
          <strong>{selectedHotel?.name || arrivalDestinationAddress || "-"}</strong>
        </div>
      </div>

      <CollapsibleSection
        title="Flight details"
        subtitle={`${flightSegments.length} segment(s)`}
        defaultOpen={false}
      >
        {flightSegments.length === 0 ? (
          <p style={styles.muted}>No flight segment details available.</p>
        ) : (
          <div style={styles.flightGrid}>
            {flightSegments.map((segment) => (
              <div key={segment.id} style={styles.flightCard}>
                <strong>{segment.direction}</strong>
                <p style={styles.muted}>
                  {segment.carrierCode} {segment.number}
                </p>
                <p>
                  {segment.departureAirport} → {segment.arrivalAirport}
                </p>
                <p style={styles.muted}>
                  {segment.departureTime} → {segment.arrivalTime}
                </p>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Transport / route plan"
        subtitle={`${transportLegs.length} route leg(s)`}
        defaultOpen={false}
      >
        {transportLegs.length === 0 ? (
          <p style={styles.muted}>No route legs found in generated plan.</p>
        ) : (
          transportLegs.map((leg, index) => (
            <div key={`${leg.label}-${index}`} style={styles.routeCard}>
              <strong>{leg.label}</strong>
              <p style={styles.muted}>
                {leg.origin || "-"} → {leg.destination || "-"}
              </p>
              <p style={styles.muted}>
                {leg.mode ? `Mode: ${leg.mode} · ` : ""}
                {leg.duration ? `Duration: ${leg.duration} · ` : ""}
                {leg.distance ? `Distance: ${leg.distance}` : ""}
              </p>

              {leg.link && (
                <a
                  href={leg.link}
                  target="_blank"
                  rel="noreferrer"
                  style={styles.externalLink}
                >
                  Open route in Google Maps
                </a>
              )}
            </div>
          ))
        )}
      </CollapsibleSection>

      <label style={styles.label}>Recommendation preferences</label>
      <textarea
        value={preferences}
        onChange={(event) => setPreferences(event.target.value)}
        rows={3}
        style={styles.textarea}
        placeholder="Example: local food, history, hidden gems, avoid expensive places"
      />

      {providerWarnings.map((warning, index) => (
        <div key={`${warning}-${index}`} style={styles.warning}>
          ⚠️ {warning}
        </div>
      ))}

      {error && <div style={styles.error}>❌ {error}</div>}

      {loading && <div style={styles.loadingBox}>Building your editable itinerary...</div>}

      {!loading && days.length === 0 && (
        <div style={styles.emptyBox}>
          Press <strong>Rebuild with AI</strong> or <strong>Randomize all</strong> to
          create your day-by-day plan.
        </div>
      )}

      <div style={styles.daysGrid}>
        {days.map((day) => (
          <article key={day.id} style={styles.dayCard}>
            <div style={styles.dayHeader}>
              <div>
                <p style={styles.dayNumber}>Day {day.dayNumber}</p>
                <h3 style={styles.dayTitle}>{day.title}</h3>
                {day.date && <p style={styles.dayDate}>{day.date}</p>}
              </div>

              <div style={styles.dayActions}>
                <button
                  type="button"
                  onClick={() => randomizeDay(day.id)}
                  style={styles.smallButton}
                >
                  Randomize day
                </button>

                <button
                  type="button"
                  onClick={() => addCustomItem(day.id)}
                  style={styles.smallButton}
                >
                  Add custom
                </button>
              </div>
            </div>

            <div style={styles.timeline}>
              {day.items.map((item) => (
                <div key={item.id} style={styles.itemCard}>
                  <div style={styles.timeBadge}>{item.time || "Any time"}</div>

                  <div style={styles.itemContent}>
                    <div style={styles.itemTopRow}>
                      <div>
                        <span style={styles.typeBadge}>{item.type}</span>
                        <h4 style={styles.itemName}>{item.name}</h4>
                      </div>

                      <div style={styles.itemActions}>
                        <button
                          type="button"
                          onClick={() => replaceItem(day.id, item.id)}
                          style={styles.linkButton}
                        >
                          Replace
                        </button>

                        <button
                          type="button"
                          onClick={() => editItemPrice(day.id, item.id)}
                          style={styles.linkButton}
                        >
                          Edit price
                        </button>

                        <button
                          type="button"
                          onClick={() => removeItem(day.id, item.id)}
                          style={styles.dangerButton}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {item.description && (
                      <p style={styles.itemDescription}>{item.description}</p>
                    )}

                    {item.address && <p style={styles.muted}>{item.address}</p>}

                    {(item.rating || item.review_count) && (
                      <p style={styles.muted}>
                        {item.rating ? `⭐ ${item.rating}` : ""}
                        {item.review_count ? ` · ${item.review_count} reviews` : ""}
                      </p>
                    )}

                    <p style={styles.priceLine}>
                      Estimated price: {formatMoney(item.estimated_price_eur)}{" "}
                      <span style={styles.muted}>({item.price_note})</span>
                    </p>

                    <div style={styles.linkRow}>
                      <span style={styles.sourceText}>
                        Source: {item.source_label || "Google Maps search"}
                      </span>

                      <a
                        href={
                          item.link ||
                          buildGoogleMapsSearchUrl(item.name, destinationCity)
                        }
                        target="_blank"
                        rel="noreferrer"
                        style={styles.externalLink}
                      >
                        Open in Google Maps / booking page
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

const styles = {
  shell: {
    marginTop: "20px",
    padding: "18px",
    borderRadius: "16px",
    border: "1px solid #2563eb",
    background: "linear-gradient(180deg, #0b1220 0%, #0f172a 100%)",
    color: "#e5e7eb",
  },

  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },

  eyebrow: {
    margin: 0,
    color: "#93c5fd",
    fontSize: "13px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },

  title: {
    margin: "4px 0",
    color: "#ffffff",
    fontSize: "26px",
  },

  subtitle: {
    margin: 0,
    color: "#9ca3af",
    maxWidth: "860px",
  },

  headerActions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },

  primaryButton: {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },

  secondaryButton: {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid #374151",
    background: "#111827",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },

  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: "10px",
    marginTop: "16px",
  },

  summaryCard: {
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid #1f2937",
    background: "#111827",
  },

  summaryLabel: {
    display: "block",
    color: "#9ca3af",
    fontSize: "12px",
    marginBottom: "4px",
  },

  collapsible: {
    marginTop: "14px",
    borderRadius: "12px",
    border: "1px solid #334155",
    background: "#0f172a",
    overflow: "hidden",
  },

  collapsibleButton: {
    width: "100%",
    padding: "13px 14px",
    border: "none",
    background: "#111827",
    color: "#ffffff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    textAlign: "left",
  },

  collapsibleArrow: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "18px",
    height: "18px",
    color: "#93c5fd",
    fontSize: "12px",
    transition: "transform 180ms ease",
    flexShrink: 0,
  },

  collapsibleTitleWrap: {
    display: "flex",
    alignItems: "baseline",
    gap: "10px",
    minWidth: 0,
  },

  collapsibleTitle: {
    fontWeight: 800,
    color: "#ffffff",
  },

  collapsibleSubtitle: {
    color: "#9ca3af",
    fontSize: "13px",
    fontWeight: 500,
  },

  collapsibleBodyOuter: {
    display: "grid",
    transition: "grid-template-rows 220ms ease, opacity 180ms ease",
  },

  collapsibleBodyInner: {
    overflow: "hidden",
  },

  collapsibleContent: {
    padding: "14px",
    borderTop: "1px solid #1f2937",
  },

  flightGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "10px",
  },

  flightCard: {
    padding: "12px",
    borderRadius: "10px",
    border: "1px solid #1f2937",
    background: "#111827",
  },

  routeCard: {
    padding: "10px",
    borderRadius: "10px",
    border: "1px solid #1f2937",
    background: "#111827",
    marginBottom: "8px",
  },

  label: {
    display: "block",
    marginTop: "16px",
    marginBottom: "6px",
    fontWeight: 700,
    color: "#f9fafb",
  },

  textarea: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px",
    borderRadius: "10px",
    border: "1px solid #374151",
    background: "#111827",
    color: "#ffffff",
    resize: "vertical",
  },

  warning: {
    marginTop: "10px",
    padding: "10px",
    borderRadius: "10px",
    border: "1px solid #f59e0b",
    background: "rgba(245, 158, 11, 0.12)",
    color: "#fbbf24",
  },

  error: {
    marginTop: "10px",
    padding: "10px",
    borderRadius: "10px",
    border: "1px solid #ef4444",
    background: "rgba(239, 68, 68, 0.12)",
    color: "#fecaca",
  },

  loadingBox: {
    marginTop: "14px",
    padding: "16px",
    borderRadius: "12px",
    background: "#111827",
    border: "1px solid #374151",
  },

  emptyBox: {
    marginTop: "14px",
    padding: "16px",
    borderRadius: "12px",
    background: "#111827",
    border: "1px solid #374151",
    color: "#cbd5e1",
  },

  daysGrid: {
    display: "grid",
    gap: "14px",
    marginTop: "18px",
  },

  dayCard: {
    borderRadius: "16px",
    border: "1px solid #2563eb",
    background: "#0f172a",
    overflow: "hidden",
  },

  dayHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
    padding: "14px",
    borderBottom: "1px solid #1f2937",
    background: "#111827",
  },

  dayNumber: {
    margin: 0,
    color: "#93c5fd",
    fontWeight: 700,
  },

  dayTitle: {
    margin: "4px 0",
    color: "#ffffff",
  },

  dayDate: {
    margin: 0,
    color: "#9ca3af",
  },

  dayActions: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    flexWrap: "wrap",
  },

  smallButton: {
    padding: "8px 10px",
    borderRadius: "8px",
    border: "1px solid #374151",
    background: "#0b1220",
    color: "#ffffff",
    cursor: "pointer",
  },

  timeline: {
    padding: "14px",
    display: "grid",
    gap: "12px",
  },

  itemCard: {
    display: "grid",
    gridTemplateColumns: "90px 1fr",
    gap: "12px",
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid #1f2937",
    background: "#111827",
  },

  timeBadge: {
    color: "#bfdbfe",
    fontWeight: 700,
  },

  itemContent: {
    minWidth: 0,
  },

  itemTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "flex-start",
  },

  typeBadge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "999px",
    background: "rgba(37, 99, 235, 0.18)",
    color: "#93c5fd",
    fontSize: "12px",
    textTransform: "capitalize",
  },

  itemName: {
    margin: "6px 0",
    color: "#ffffff",
  },

  itemActions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },

  linkButton: {
    padding: "6px 8px",
    borderRadius: "8px",
    border: "1px solid #2563eb",
    background: "transparent",
    color: "#93c5fd",
    cursor: "pointer",
  },

  dangerButton: {
    padding: "6px 8px",
    borderRadius: "8px",
    border: "1px solid #7f1d1d",
    background: "transparent",
    color: "#fca5a5",
    cursor: "pointer",
  },

  itemDescription: {
    margin: "6px 0",
    color: "#cbd5e1",
  },

  muted: {
    margin: "4px 0",
    color: "#9ca3af",
    fontSize: "13px",
  },

  priceLine: {
    margin: "6px 0",
    color: "#86efac",
    fontWeight: 700,
  },

  linkRow: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: "8px",
  },

  sourceText: {
    color: "#9ca3af",
    fontSize: "13px",
  },

  externalLink: {
    display: "inline-block",
    marginTop: "4px",
    color: "#60a5fa",
  },
};