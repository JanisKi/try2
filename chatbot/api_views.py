# chatbot/api_views.py
"""
Updated with mock data fallback when Amadeus API is unavailable.
Set USE_MOCK_DATA=true in environment to always use mock data.
"""

from datetime import datetime, timedelta, timezone
import logging
import requests

logger = logging.getLogger(__name__)

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions

from .models import ChatMessage, TravelIntent
from .services import extract_flight_intent, openrouter_chat
from travel.services.iata import city_to_iata
from travel.services.amadeus import (
    search_hotels_by_city,
    search_hotel_offers_by_hotel_id,
    search_transfer_offers,
    AmadeusProviderError,
    AmadeusClientError,
)
from travel.services.openrouteservice import geocode_address, route_driving
from travel.services.google_routes import compute_transit_route, summarize_transit_route

# Import mock data module
from travel.services.mock_data import (
    is_mock_enabled,
    generate_mock_flights,
    generate_mock_hotels,
    generate_mock_transfers,
    generate_mock_locations,
)

# ---------------------------------------------------------
# CONFIG: buffers
# ---------------------------------------------------------
DEPARTURE_AIRPORT_BUFFER_MINUTES = 90
ARRIVAL_AIRPORT_BUFFER_MINUTES = 60


def _amadeus_error_code(err) -> int | None:
    """Extract the Amadeus error code integer from an AmadeusProviderError body."""
    try:
        body = err.body if isinstance(err.body, dict) else {}
        for e in body.get("errors", []):
            code = int(e.get("code", 0))
            if code:
                return code
    except Exception:
        pass
    return None


def _run_flight_search_with_retry(
    origin_iata: str,
    dest_iata: str,
    dest_label: str,  # human-readable name for location lookup
    departure_date: str,
    adults: int,
    return_date,
):
    """
    Call search_flights, retry once with a concrete airport IATA when the first attempt fails.
    Returns (amadeus_json | None, used_dest_iata, error_answer | None, is_mock).
    error_answer is non-None only when we can confirm it is a genuine provider outage
    rather than a test-env data gap (code 141).
    
    NEW: Falls back to mock data when Amadeus is completely unavailable.
    """
    from travel.services.amadeus import (
        search_flights,
        search_locations,
        pick_first_airport_iata,
        AmadeusProviderError,
        AmadeusClientError,
    )

    # Check if mock mode is forced
    if is_mock_enabled():
        logger.info("Mock mode enabled — using mock flight data")
        mock_data = generate_mock_flights(
            origin=origin_iata,
            destination=dest_iata,
            departure_date=departure_date,
            adults=adults,
            return_date=return_date,
        )
        return mock_data, dest_iata, None, True

    try:
        amadeus_json = search_flights(
            origin=origin_iata,
            destination=dest_iata,
            departure_date=departure_date,
            adults=adults,
            return_date=return_date,
        )
        logger.info("Amadeus flight search OK: %s → %s on %s", origin_iata, dest_iata, departure_date)
        return amadeus_json, dest_iata, None, False

    except (AmadeusProviderError, AmadeusClientError, requests.HTTPError) as first_err:
        first_code = _amadeus_error_code(first_err) if isinstance(first_err, AmadeusProviderError) else None
        logger.warning(
            "Amadeus first attempt failed (%s %s, code %s) for %s → %s on %s — body: %s",
            type(first_err).__name__,
            getattr(first_err, "status_code", "?"),
            first_code,
            origin_iata,
            dest_iata,
            departure_date,
            getattr(first_err, "body", ""),
        )

        # Always attempt a retry with a concrete airport code — Amadeus test env
        # returns 5xx (code 141) for city codes like LON even when LHR works.
        retry_dest_iata = None
        location_api_down = False
        
        try:
            locations = search_locations(dest_label, limit=10)
            retry_dest_iata = pick_first_airport_iata(locations)
            logger.info("Location lookup for '%s' → airport IATA: %s", dest_label, retry_dest_iata)
        except Exception as loc_err:
            location_api_down = True
            logger.warning("Location lookup also failed — Amadeus API may be fully down: %s", loc_err)

        if retry_dest_iata and retry_dest_iata != dest_iata:
            try:
                amadeus_json = search_flights(
                    origin=origin_iata,
                    destination=retry_dest_iata,
                    departure_date=departure_date,
                    adults=adults,
                    return_date=return_date,
                )
                logger.info("Amadeus retry OK: %s → %s", origin_iata, retry_dest_iata)
                return amadeus_json, retry_dest_iata, None, False
            except AmadeusProviderError as retry_err:
                retry_code = _amadeus_error_code(retry_err)
                logger.error(
                    "Amadeus retry also failed (%s, code %s) for %s → %s — body: %s",
                    retry_err.status_code,
                    retry_code,
                    origin_iata,
                    retry_dest_iata,
                    retry_err.body,
                )
                # code 141 = test-env "no data for this route" — treat as no results
                if first_code == 141 and retry_code == 141:
                    return None, retry_dest_iata, None, False
                
                # ---------------------------------------------------------
                # NEW: Fall back to mock data when API is down
                # ---------------------------------------------------------
                if location_api_down or (first_code and first_code >= 500):
                    logger.info("Amadeus API appears down — falling back to mock data")
                    mock_data = generate_mock_flights(
                        origin=origin_iata,
                        destination=retry_dest_iata or dest_iata,
                        departure_date=departure_date,
                        adults=adults,
                        return_date=return_date,
                    )
                    return mock_data, retry_dest_iata or dest_iata, None, True
                    
                return None, retry_dest_iata, _provider_error_msg(first_code or retry_code, location_api_down), False
            except (AmadeusClientError, requests.HTTPError) as retry_err:
                logger.warning("Amadeus retry 4xx for %s → %s: %s", origin_iata, retry_dest_iata, retry_err)
                return None, retry_dest_iata, None, False

        # ---------------------------------------------------------
        # NEW: Fall back to mock data when API is completely down
        # ---------------------------------------------------------
        if location_api_down or (isinstance(first_err, AmadeusProviderError) and first_err.status_code >= 500):
            logger.info("Amadeus API appears completely down — falling back to mock data")
            mock_data = generate_mock_flights(
                origin=origin_iata,
                destination=dest_iata,
                departure_date=departure_date,
                adults=adults,
                return_date=return_date,
            )
            return mock_data, dest_iata, None, True

        # No alternate IATA found (location API is also down, or no airport in results)
        if isinstance(first_err, AmadeusProviderError):
            if first_code == 141:
                return None, dest_iata, None, False  # test-env no data → silent "no results"
            return None, dest_iata, _provider_error_msg(first_code, location_api_down), False
        return None, dest_iata, None, False

    except Exception as exc:
        logger.exception("Unexpected flight search error")
        # ---------------------------------------------------------
        # NEW: Fall back to mock data on any unexpected error
        # ---------------------------------------------------------
        logger.info("Unexpected error — falling back to mock data")
        mock_data = generate_mock_flights(
            origin=origin_iata,
            destination=dest_iata,
            departure_date=departure_date,
            adults=adults,
            return_date=return_date,
        )
        return mock_data, dest_iata, None, True


def _provider_error_msg(error_code: int | None, api_fully_down: bool) -> str:
    """Build a user-facing message that includes diagnostic detail."""
    code_hint = f" (error code {error_code})" if error_code else ""
    if api_fully_down:
        return (
            f"Amadeus search API is currently unreachable{code_hint}. "
            "This may be a credentials issue or a temporary outage — "
            "please check your AMADEUS_API_KEY / AMADEUS_API_SECRET and try again."
        )
    return (
        f"Amadeus search returned a provider error{code_hint}. "
        "Please try again in a moment, or try a different date."
    )


def convert_to_eur(amount: float, currency: str) -> float:
    """
    Convert amount to EUR.
    For now, keep it simple with a small static table.
    Later you can replace this with a real FX API.
    """
    rates_to_eur = {
        "EUR": 1.0,
        "GBP": 1.17,  # example rate
        "USD": 0.92,  # example rate
        "NOK": 0.085,  # example rate
    }
    rate = rates_to_eur.get((currency or "EUR").upper())
    if rate is None:
        # If currency unknown, assume same value to avoid crash
        return amount
    return amount * rate


def format_transfer_result(offer: dict) -> dict:
    """
    Convert Amadeus transfer offer into a smaller frontend-friendly object.
    """
    quotation = offer.get("quotation") or {}
    amount_raw = quotation.get("monetaryAmount") or "0"
    currency = quotation.get("currencyCode") or "EUR"
    
    try:
        amount = float(amount_raw)
    except Exception:
        amount = 0.0

    vehicle = offer.get("vehicle") or {}
    provider = offer.get("serviceProvider") or {}
    end_obj = offer.get("end") or {}
    end_address = end_obj.get("address") or {}

    return {
        "id": offer.get("id"),
        "transfer_type": offer.get("transferType"),
        "provider_name": provider.get("name") or provider.get("code") or "Unknown provider",
        "provider_code": provider.get("code"),
        "vehicle_description": vehicle.get("description") or "Transfer vehicle",
        "vehicle_code": vehicle.get("code"),
        "image_url": vehicle.get("imageURL"),
        "seats": ((vehicle.get("seats") or [{}])[0]).get("count"),
        "bags": ((vehicle.get("baggages") or [{}])[0]).get("count"),
        "price_total": amount,
        "currency": currency,
        "price_total_eur": round(convert_to_eur(amount, currency), 2),
        "is_estimated": bool(quotation.get("isEstimated")),
        "start": offer.get("start") or {},
        "end_name": end_obj.get("name"),
        "end_address_line": end_address.get("line"),
        "end_city_name": end_address.get("cityName"),
    }


def build_transfer_leg_from_selection(transfer: dict, start_address: str, destination_address: str):
    """
    Build a route-like leg object from a selected transfer.
    This keeps frontend rendering consistent with your existing plan structure.
    """
    provider_name = transfer.get("provider_name") or transfer.get("name") or "Transfer provider"
    vehicle_description = transfer.get("vehicle_description") or transfer.get("vehicle") or "Transfer vehicle"
    transfer_type = transfer.get("transfer_type") or "PRIVATE"
    price_total = transfer.get("price_total")
    currency = transfer.get("currency") or "EUR"
    price_total_eur = transfer.get("price_total_eur")

    summary = f"{provider_name} | {vehicle_description} | {transfer_type}"
    if price_total is not None:
        summary += f" | {price_total} {currency}"
    if price_total_eur is not None:
        summary += f" (~{price_total_eur} EUR)"

    return {
        "mode": "transfer",
        "start_address": start_address,
        "destination": destination_address,
        "duration_minutes": None,
        "distance_meters": None,
        "leave_at": None,
        "start_after_buffer_at": None,
        "google_maps_url": None,
        "steps": [],
        "summary": summary,
        "provider_name": provider_name,
        "vehicle_description": vehicle_description,
        "price_total": price_total,
        "currency": currency,
        "price_total_eur": price_total_eur,
    }


def build_preview(amadeus_json: dict, limit: int = 8):
    """
    Return cheapest-first preview list for frontend.
    """
    offers = (amadeus_json or {}).get("data") or []

    def price_num(offer):
        try:
            return float(offer.get("price", {}).get("total", "999999"))
        except Exception:
            return 999999.0

    offers = sorted(offers, key=price_num)[:limit]
    return offers


def get_airport_route_target(iata_code: str):
    """
    Human-readable route target for airport access.
    """
    mapping = {
        "RIX": {
            "label": "Riga Airport",
            "route_address": "Riga International Airport, Latvia",
        },
        "AMS": {
            "label": "Amsterdam Airport Schiphol",
            "route_address": "Amsterdam Airport Schiphol, Netherlands",
        },
        "CDG": {
            "label": "Paris Charles de Gaulle Airport",
            "route_address": "Paris Charles de Gaulle Airport, France",
        },
        "LHR": {
            "label": "London Heathrow Airport",
            "route_address": "London Heathrow Airport, United Kingdom",
        },
        "LGW": {
            "label": "London Gatwick Airport",
            "route_address": "London Gatwick Airport, United Kingdom",
        },
        "STN": {
            "label": "London Stansted Airport",
            "route_address": "London Stansted Airport, United Kingdom",
        },
        "LTN": {
            "label": "London Luton Airport",
            "route_address": "London Luton Airport, United Kingdom",
        },
        "OSL": {
            "label": "Oslo Airport",
            "route_address": "Oslo Airport, Norway",
        },
        # Add more airports as needed
        "FRA": {
            "label": "Frankfurt Airport",
            "route_address": "Frankfurt Airport, Germany",
        },
        "MUC": {
            "label": "Munich Airport",
            "route_address": "Munich Airport, Germany",
        },
        "BCN": {
            "label": "Barcelona Airport",
            "route_address": "Barcelona El Prat Airport, Spain",
        },
        "MAD": {
            "label": "Madrid Airport",
            "route_address": "Madrid Barajas Airport, Spain",
        },
        "FCO": {
            "label": "Rome Fiumicino Airport",
            "route_address": "Rome Fiumicino Airport, Italy",
        },
    }
    return mapping.get(
        iata_code,
        {
            "label": iata_code,
            "route_address": iata_code,
        },
    )


def build_drive_leg(start_address: str, destination_address: str, leave_reference_dt=None, subtract_airport_buffer=False):
    """
    Build a driving leg using ORS.
    """
    start_coords = geocode_address(start_address)
    if not start_coords:
        raise RuntimeError(f"Could not find route start: {start_address}")

    dest_coords = geocode_address(destination_address)
    if not dest_coords:
        raise RuntimeError(f"Could not find route destination: {destination_address}")

    route = route_driving(
        start_coords["lat"],
        start_coords["lon"],
        dest_coords["lat"],
        dest_coords["lon"],
    )
    seconds = int(route["duration"])

    leg = {
        "mode": "drive",
        "start_address": start_address,
        "destination": destination_address,
        "duration_minutes": seconds // 60,
        "distance_meters": int(route["distance"]),
        "leave_at": None,
        "start_after_buffer_at": None,
        "google_maps_url": (
            "https://www.google.com/maps/dir/?api=1"
            f"&origin={start_address.replace(' ', '+')}"
            f"&destination={destination_address.replace(' ', '+')}"
            "&travelmode=driving"
        ),
        "steps": [],
    }

    if leave_reference_dt and subtract_airport_buffer:
        leave_dt = leave_reference_dt - timedelta(minutes=DEPARTURE_AIRPORT_BUFFER_MINUTES) - timedelta(seconds=seconds)
        leg["leave_at"] = leave_dt.strftime("%Y-%m-%d %H:%M")

    if leave_reference_dt and not subtract_airport_buffer:
        start_dt = leave_reference_dt + timedelta(minutes=ARRIVAL_AIRPORT_BUFFER_MINUTES)
        leg["start_after_buffer_at"] = start_dt.strftime("%Y-%m-%d %H:%M")

    return leg


def build_transit_leg(start_address: str, destination_address: str, reference_dt, subtract_airport_buffer=False):
    """
    Build a public transport leg using Google Routes TRANSIT.
    """
    if subtract_airport_buffer:
        # For trip to airport, we still ask Google for routes around the flight time
        transit_dt = reference_dt
    else:
        # After landing, give user extra time before starting transit
        transit_dt = reference_dt + timedelta(minutes=ARRIVAL_AIRPORT_BUFFER_MINUTES)

    transit_json = compute_transit_route(
        origin_address=start_address,
        destination_address=destination_address,
        departure_time_iso=transit_dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
    )
    summary = summarize_transit_route(transit_json)

    duration_text = summary.get("duration", "0s")
    seconds = 0
    if isinstance(duration_text, str) and duration_text.endswith("s"):
        try:
            seconds = int(duration_text[:-1])
        except Exception:
            seconds = 0

    leg = {
        "mode": "transit",
        "start_address": start_address,
        "destination": destination_address,
        "duration_minutes": seconds // 60,
        "distance_meters": summary.get("distance_meters"),
        "leave_at": None,
        "start_after_buffer_at": None,
        "google_maps_url": (
            "https://www.google.com/maps/dir/?api=1"
            f"&origin={start_address.replace(' ', '+')}"
            f"&destination={destination_address.replace(' ', '+')}"
            "&travelmode=transit"
        ),
        "steps": summary.get("steps", []),
    }

    if subtract_airport_buffer:
        leave_dt = reference_dt - timedelta(minutes=DEPARTURE_AIRPORT_BUFFER_MINUTES) - timedelta(seconds=seconds)
        leg["leave_at"] = leave_dt.strftime("%Y-%m-%d %H:%M")
    else:
        start_dt = reference_dt + timedelta(minutes=ARRIVAL_AIRPORT_BUFFER_MINUTES)
        leg["start_after_buffer_at"] = start_dt.strftime("%Y-%m-%d %H:%M")

    return leg


class ChatSendView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        prompt = (request.data.get("prompt") or "").strip()
        if not prompt:
            return Response({"detail": "prompt is required"}, status=400)

        ChatMessage.objects.create(user=request.user, role="user", content=prompt)

        intent = extract_flight_intent(prompt)
        answer = None
        flight_widget = None
        is_mock_data = False

        if intent and intent.get("intent_type") == "flight_search":
            TravelIntent.objects.create(
                user=request.user,
                raw_text=prompt,
                intent_type="flight_search",
                origin=intent.get("origin"),
                destination=intent.get("destination"),
                departure_date=intent.get("departure_date"),
                return_date=intent.get("return_date"),
                adults=intent.get("adults") or 1,
                max_stops=intent.get("max_stops"),
                budget=intent.get("budget"),
            )

            origin_iata = city_to_iata(intent.get("origin"))
            dest_iata = city_to_iata(intent.get("destination"))

            if not origin_iata and intent.get("origin") and len(intent["origin"].strip()) == 3:
                origin_iata = intent["origin"].strip().upper()
            if not dest_iata and intent.get("destination") and len(intent["destination"].strip()) == 3:
                dest_iata = intent["destination"].strip().upper()

            if intent.get("departure_date") and origin_iata and dest_iata:
                try:
                    amadeus_json, dest_iata, error_answer, is_mock_data = _run_flight_search_with_retry(
                        origin_iata=origin_iata,
                        dest_iata=dest_iata,
                        dest_label=intent.get("destination") or dest_iata,
                        departure_date=str(intent["departure_date"]),
                        adults=int(intent.get("adults") or 1),
                        return_date=str(intent["return_date"]) if intent.get("return_date") else None,
                    )
                    if error_answer:
                        answer = error_answer
                except Exception as e:
                    amadeus_json = None
                    answer = f"Flight search failed: {str(e)}"

                if amadeus_json:
                    flight_widget = {
                        "origin_city": intent.get("origin"),
                        "destination_city": intent.get("destination"),
                        "origin_iata": origin_iata,
                        "destination_iata": dest_iata,
                        "departure_date": str(intent["departure_date"]),
                        "return_date": str(intent["return_date"]) if intent.get("return_date") else "",
                        "return_enabled": bool(intent.get("return_date")),
                        "adults": int(intent.get("adults") or 1),
                        "max_stops": intent.get("max_stops"),
                        "budget": intent.get("budget"),
                        "offers": build_preview(amadeus_json, limit=12),
                        "_mock": is_mock_data,  # Flag for frontend
                    }
                    answer = (
                        f"Found flights for {origin_iata} → {dest_iata} on {flight_widget['departure_date']}"
                    )
                    if flight_widget["return_enabled"]:
                        answer += f", returning on {flight_widget['return_date']}"
                    answer += f" for {flight_widget['adults']} adult(s)."
                    
                    # Add mock data notice
                    if is_mock_data:
                        answer += " (Using sample data — Amadeus API is temporarily unavailable)"
                        
                elif answer is None:
                    answer = (
                        "I understood your trip request, but Amadeus could not find flights for that route/date. "
                        "Please try another date or destination airport."
                    )
            else:
                missing = []
                if not intent.get("departure_date"):
                    missing.append("departure date")
                if not origin_iata:
                    missing.append("departure city or airport")
                if not dest_iata:
                    missing.append("destination city or airport")
                answer = (
                    "I understood your trip request, but I still need: "
                    + ", ".join(missing)
                    + "."
                )

        if answer is None:
            try:
                system = {
                    "role": "system",
                    "content": (
                        "You are a travel assistant inside a travel planning app. "
                        "Do NOT tell the user to use Google Flights, Skyscanner, or Kayak. "
                        "If the user asks about travel planning, answer briefly and helpfully."
                    ),
                }
                recent = ChatMessage.objects.filter(user=request.user).order_by("-created_at")[:10]
                messages = [{"role": m.role, "content": m.content} for m in reversed(recent)]
                messages = [system] + messages
                answer = openrouter_chat(messages)
            except Exception as e:
                answer = f"Sorry — chat request failed: {str(e)}"

        ChatMessage.objects.create(user=request.user, role="assistant", content=answer)

        return Response({
            "answer": answer,
            "flight_widget": flight_widget,
        })


class SearchFlightsStructuredView(APIView):
    """
    POST /api/chat/search-flights/
    
    Structured flight search that bypasses NLP — the widget calls this directly
    instead of building a natural-language prompt and round-tripping through /chat/send/.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        origin_in = (request.data.get("origin") or "").strip()
        dest_in = (request.data.get("destination") or "").strip()
        departure_date = (request.data.get("departure_date") or "").strip()
        return_date = (request.data.get("return_date") or "").strip() or None
        adults = max(1, int(request.data.get("adults") or 1))
        budget = request.data.get("budget")
        max_stops = request.data.get("max_stops")

        if not origin_in or not dest_in or not departure_date:
            return Response(
                {"detail": "origin, destination, departure_date are required"},
                status=400,
            )

        # Resolve city names → IATA (3-char inputs are treated as IATA directly)
        origin_iata = city_to_iata(origin_in)
        if not origin_iata and len(origin_in) == 3 and origin_in.isalpha():
            origin_iata = origin_in.upper()

        dest_iata = city_to_iata(dest_in)
        if not dest_iata and len(dest_in) == 3 and dest_in.isalpha():
            dest_iata = dest_in.upper()

        if not origin_iata or not dest_iata:
            return Response(
                {"detail": f"Could not resolve '{origin_in}' or '{dest_in}' to IATA codes."},
                status=400,
            )

        amadeus_json = None
        answer = None
        is_mock_data = False
        
        try:
            amadeus_json, dest_iata, error_answer, is_mock_data = _run_flight_search_with_retry(
                origin_iata=origin_iata,
                dest_iata=dest_iata,
                dest_label=dest_in,
                departure_date=departure_date,
                adults=adults,
                return_date=return_date,
            )
            if error_answer:
                answer = error_answer
        except Exception as e:
            return Response({"detail": f"Flight search failed: {str(e)}"}, status=500)

        if amadeus_json:
            flight_widget = {
                "origin_city": origin_in,
                "destination_city": dest_in,
                "origin_iata": origin_iata,
                "destination_iata": dest_iata,
                "departure_date": departure_date,
                "return_date": return_date or "",
                "return_enabled": bool(return_date),
                "adults": adults,
                "max_stops": max_stops,
                "budget": budget,
                "offers": build_preview(amadeus_json, limit=12),
                "_mock": is_mock_data,
            }
            answer = f"Found flights for {origin_iata} → {dest_iata} on {departure_date}"
            if return_date:
                answer += f", returning on {return_date}"
            answer += f" for {adults} adult(s)."
            
            if is_mock_data:
                answer += " (Using sample data — Amadeus API is temporarily unavailable)"
                
            return Response({"flight_widget": flight_widget, "answer": answer})

        if answer is None:
            answer = (
                "Amadeus could not find flights for that route/date. "
                "Please try a different date or destination."
            )

        return Response({"flight_widget": None, "answer": answer})


class SearchHotelsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        selected_offer = request.data.get("selected_offer")
        destination_city = (request.data.get("destination_city") or "").strip()
        adults = int(request.data.get("adults") or 1)
        budget_remaining = request.data.get("budget_remaining")
        max_results = int(request.data.get("max_results") or 8)

        if not selected_offer or not destination_city:
            return Response(
                {"detail": "selected_offer and destination_city are required"},
                status=400,
            )

        itineraries = selected_offer.get("itineraries") or []
        if not itineraries:
            return Response({"detail": "Selected offer has no itineraries."}, status=400)

        # hotel check-in = final arrival of outbound
        outbound_last_seg = itineraries[0]["segments"][-1]
        check_in = outbound_last_seg["arrival"]["at"][:10]

        # hotel check-out = first departure of return
        if len(itineraries) > 1:
            return_first_seg = itineraries[1]["segments"][0]
            check_out = return_first_seg["departure"]["at"][:10]
        else:
            return Response(
                {
                    "detail": "One-way flight: ask for hotel checkout date or nights first.",
                    "needs_hotel_checkout": True,
                    "check_in": check_in,
                },
                status=400,
            )

        city_code = city_to_iata(destination_city)
        if not city_code:
            return Response(
                {"detail": f"Could not resolve hotel city code for {destination_city}"},
                status=400,
            )

        # ---------------------------------------------------------
        # Try real Amadeus API first, fall back to mock
        # ---------------------------------------------------------
        is_mock_data = False
        results = []
        
        if is_mock_enabled():
            # Force mock mode
            is_mock_data = True
        else:
            try:
                hotel_list = search_hotels_by_city(city_code, radius=20)
                
                for hotel in hotel_list[:15]:
                    hotel_id = hotel.get("hotelId")
                    if not hotel_id:
                        continue

                    try:
                        offer_blocks = search_hotel_offers_by_hotel_id(
                            hotel_id=hotel_id,
                            adults=adults,
                            check_in_date=check_in,
                            check_out_date=check_out,
                        )
                    except requests.HTTPError:
                        continue

                    if not offer_blocks:
                        continue

                    first_block = offer_blocks[0]
                    offer = (first_block.get("offers") or [None])[0]
                    if not offer:
                        continue

                    try:
                        price_total = float((offer.get("price") or {}).get("total") or 0)
                    except Exception:
                        price_total = 0.0

                    currency = (offer.get("price") or {}).get("currency") or "EUR"
                    price_total_eur = convert_to_eur(price_total, currency)

                    address_obj = hotel.get("address") or {}
                    results.append(
                        {
                            "hotel_id": hotel_id,
                            "offer_id": offer.get("id"),
                            "name": hotel.get("name"),
                            "address": ", ".join(
                                p
                                for p in [
                                    hotel.get("name"),
                                    *(address_obj.get("lines") or []),
                                    address_obj.get("cityName"),
                                    address_obj.get("countryCode"),
                                ]
                                if p
                            ),
                            "geo": hotel.get("geoCode") or {},
                            "check_in": offer.get("checkInDate"),
                            "check_out": offer.get("checkOutDate"),
                            "price_total": price_total,
                            "currency": currency,
                            "price_total_eur": round(price_total_eur, 2),
                            "room_description": (
                                ((offer.get("room") or {}).get("description") or {}).get("text")
                                or ""
                            ),
                        }
                    )
            except (AmadeusProviderError, AmadeusClientError, requests.HTTPError) as e:
                logger.warning("Hotel search failed, falling back to mock: %s", e)
                is_mock_data = True
            except Exception as e:
                logger.warning("Unexpected hotel search error, falling back to mock: %s", e)
                is_mock_data = True

        # Use mock data if API failed or mock mode enabled
        if is_mock_data or not results:
            mock_response = generate_mock_hotels(
                city_code=city_code,
                check_in=check_in,
                check_out=check_out,
                adults=adults,
                num_results=max_results,
                budget_remaining=float(budget_remaining) if budget_remaining else None,
            )
            results = mock_response["hotels"]
            is_mock_data = True

        results.sort(key=lambda x: x["price_total_eur"])

        if budget_remaining is not None and not is_mock_data:
            try:
                budget_left = float(budget_remaining)
                filtered = [h for h in results if h["price_total_eur"] <= budget_left]
                if filtered:
                    results = filtered
            except Exception:
                pass

        return Response(
            {
                "check_in": check_in,
                "check_out": check_out,
                "hotels": results[:max_results],
                "_mock": is_mock_data,
                "provider_warning": "Using sample data — Amadeus API is temporarily unavailable." if is_mock_data else None,
            }
        )


class SearchTransfersView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        selected_offer = request.data.get("selected_offer")
        direction = (request.data.get("direction") or "").strip()  # "arrival" | "return"
        destination_address = (request.data.get("destination_address") or "").strip()
        adults = int(request.data.get("adults") or 1)
        budget_remaining = request.data.get("budget_remaining")

        if not selected_offer:
            return Response({"detail": "selected_offer is required"}, status=400)
        if direction not in ["arrival", "return"]:
            return Response({"detail": "direction must be 'arrival' or 'return'."}, status=400)
        if not destination_address:
            return Response({"detail": "destination_address is required."}, status=400)

        itineraries = selected_offer.get("itineraries") or []
        if not itineraries:
            return Response({"detail": "Selected offer has no itineraries."}, status=400)

        try:
            outbound_last_seg = itineraries[0]["segments"][-1]
            arrival_iata = outbound_last_seg["arrival"]["iataCode"]
            arrival_at = outbound_last_seg["arrival"]["at"]

            return_first_seg = None
            if len(itineraries) > 1:
                return_first_seg = itineraries[1]["segments"][0]

            if direction == "arrival":
                airport = get_airport_route_target(arrival_iata)
                pickup_address = airport["route_address"]
                pickup_dt = datetime.fromisoformat(arrival_at) + timedelta(
                    minutes=ARRIVAL_AIRPORT_BUFFER_MINUTES
                )
                dropoff_address = destination_address
                title = "Arrival airport transfer"
            else:
                if not return_first_seg:
                    return Response(
                        {"detail": "No return itinerary available for return transfer."},
                        status=400,
                    )

                return_departure_iata = return_first_seg["departure"]["iataCode"]
                return_departure_at = return_first_seg["departure"]["at"]

                airport = get_airport_route_target(return_departure_iata)
                pickup_address = destination_address
                pickup_dt = datetime.fromisoformat(return_departure_at) - timedelta(
                    minutes=DEPARTURE_AIRPORT_BUFFER_MINUTES
                )
                dropoff_address = airport["route_address"]
                title = "Return airport transfer"
        except Exception as e:
            return Response({"detail": f"Could not parse selected offer: {str(e)}"}, status=400)

        # Try the real Amadeus Transfer Search API first (arrival direction only —
        # Amadeus startLocationCode is an airport IATA code).
        amadeus_transfers = []
        amadeus_error = None
        is_mock_data = False

        if is_mock_enabled():
            is_mock_data = True
        elif direction == "arrival":
            try:
                dest_geo = geocode_address(destination_address)
                if dest_geo:
                    geo_str = f"{dest_geo['lat']},{dest_geo['lon']}"
                    raw_offers = search_transfer_offers(
                        start_location_code=arrival_iata,
                        end_address_line=destination_address,
                        end_geo_code=geo_str,
                        start_date_time=pickup_dt.strftime("%Y-%m-%dT%H:%M:%S"),
                        passengers=adults,
                    )
                    for offer in raw_offers:
                        fmt = format_transfer_result(offer)
                        amadeus_transfers.append({
                            "id": fmt["id"],
                            "name": fmt["provider_name"] or fmt["vehicle_description"] or "Transfer",
                            "vehicle": fmt["vehicle_description"] or fmt["vehicle_code"] or "Vehicle",
                            "passengers": fmt["seats"],
                            "bags": fmt["bags"],
                            "currency": fmt["currency"],
                            "price_total": fmt["price_total"],
                            "price_total_eur": fmt["price_total_eur"],
                            "pickup_address": pickup_address,
                            "dropoff_address": dropoff_address,
                            "pickup_at": pickup_dt.strftime("%Y-%m-%d %H:%M"),
                        })
            except AmadeusProviderError as e:
                amadeus_error = f"Transfer provider temporarily unavailable: {e.status_code}"
                is_mock_data = True
            except (AmadeusClientError, Exception):
                # No results or unsupported route in test env — fall through to mock
                is_mock_data = True

        if amadeus_transfers:
            results = amadeus_transfers
        else:
            # Use mock data
            mock_response = generate_mock_transfers(
                direction=direction,
                pickup_address=pickup_address,
                dropoff_address=dropoff_address,
                pickup_at=pickup_dt.strftime("%Y-%m-%d %H:%M"),
                adults=adults,
                budget_remaining=float(budget_remaining) if budget_remaining else None,
            )
            results = mock_response["transfers"]
            is_mock_data = True

        results.sort(key=lambda x: x["price_total_eur"])

        if budget_remaining is not None:
            try:
                budget_left = float(budget_remaining)
                filtered = [t for t in results if t["price_total_eur"] <= budget_left]
                if filtered:
                    results = filtered
            except Exception:
                pass

        provider_warning = None
        if is_mock_data:
            provider_warning = "Using sample data — Amadeus API is temporarily unavailable."
        elif amadeus_error:
            provider_warning = amadeus_error

        return Response(
            {
                "title": title,
                "direction": direction,
                "pickup_address": pickup_address,
                "dropoff_address": dropoff_address,
                "pickup_at": pickup_dt.strftime("%Y-%m-%d %H:%M"),
                "transfers": results,
                "provider_warning": provider_warning,
                "_mock": is_mock_data,
            }
        )


class GenerateTripPlanView(APIView):
    """
    Build a trip plan around a selected flight.
    Legs:
      1. home -> departure airport
      2. arrival airport -> destination
      3. destination -> return airport
      4. return airport -> home
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        selected_offer = request.data.get("selected_offer")
        if not selected_offer:
            return Response({"detail": "selected_offer is required"}, status=400)

        budget = request.data.get("budget")
        selected_hotel = request.data.get("selected_hotel") or None
        selected_arrival_transfer = request.data.get("selected_arrival_transfer") or None
        selected_return_transfer = request.data.get("selected_return_transfer") or None

        start_address = (request.data.get("start_address") or "").strip()
        to_airport_mode = (request.data.get("to_airport_mode") or "drive").strip()
        arrival_destination_address = (request.data.get("arrival_destination_address") or "").strip()
        from_airport_mode = (request.data.get("from_airport_mode") or "drive").strip()
        return_to_airport_mode = (request.data.get("return_to_airport_mode") or from_airport_mode).strip()
        return_home_mode = (request.data.get("return_home_mode") or to_airport_mode).strip()

        if not start_address:
            return Response(
                {"detail": "Please provide your starting location first.", "needs_start_address": True},
                status=400,
            )

        try:
            itineraries = selected_offer["itineraries"]

            # OUTBOUND itinerary
            outbound_itinerary = itineraries[0]
            outbound_segments = outbound_itinerary["segments"]
            outbound_first_segment = outbound_segments[0]
            outbound_last_segment = outbound_segments[-1]

            departure_iata = outbound_first_segment["departure"]["iataCode"]
            departure_at = outbound_first_segment["departure"]["at"]
            arrival_iata = outbound_last_segment["arrival"]["iataCode"]
            arrival_at = outbound_last_segment["arrival"]["at"]
            carrier = outbound_first_segment.get("carrierCode", "")
            flight_number = outbound_first_segment.get("number", "")

            # RETURN itinerary (optional)
            return_itinerary = itineraries[1] if len(itineraries) > 1 else None
            return_departure_iata = None
            return_departure_at = None
            return_arrival_iata = None
            return_arrival_at = None

            if return_itinerary:
                return_segments = return_itinerary["segments"]
                return_first_segment = return_segments[0]
                return_last_segment = return_segments[-1]
                return_departure_iata = return_first_segment["departure"]["iataCode"]
                return_departure_at = return_first_segment["departure"]["at"]
                return_arrival_iata = return_last_segment["arrival"]["iataCode"]
                return_arrival_at = return_last_segment["arrival"]["at"]

            price_total = float(selected_offer["price"]["total"])
        except Exception as e:
            return Response({"detail": f"Could not parse selected offer: {str(e)}"}, status=400)

        departure_airport = get_airport_route_target(departure_iata)
        arrival_airport = get_airport_route_target(arrival_iata)
        return_departure_airport = get_airport_route_target(return_departure_iata) if return_departure_iata else None
        return_arrival_airport = get_airport_route_target(return_arrival_iata) if return_arrival_iata else None

        # LEG 1: home -> departure airport
        try:
            flight_departure_dt = datetime.fromisoformat(departure_at)
            if to_airport_mode == "drive":
                leg1 = build_drive_leg(
                    start_address=start_address,
                    destination_address=departure_airport["route_address"],
                    leave_reference_dt=flight_departure_dt,
                    subtract_airport_buffer=True,
                )
            elif to_airport_mode == "transit":
                leg1 = build_transit_leg(
                    start_address=start_address,
                    destination_address=departure_airport["route_address"],
                    reference_dt=flight_departure_dt,
                    subtract_airport_buffer=True,
                )
            else:
                return Response({"detail": "Invalid to_airport_mode."}, status=400)
        except Exception as e:
            return Response({"detail": f"Route to departure airport failed: {str(e)}"}, status=400)

        # LEG 2: arrival airport -> destination
        leg2 = None
        if arrival_destination_address:
            try:
                final_arrival_dt = datetime.fromisoformat(arrival_at)
                if from_airport_mode == "drive":
                    leg2 = build_drive_leg(
                        start_address=arrival_airport["route_address"],
                        destination_address=arrival_destination_address,
                        leave_reference_dt=final_arrival_dt,
                        subtract_airport_buffer=False,
                    )
                elif from_airport_mode == "transit":
                    leg2 = build_transit_leg(
                        start_address=arrival_airport["route_address"],
                        destination_address=arrival_destination_address,
                        reference_dt=final_arrival_dt,
                        subtract_airport_buffer=False,
                    )
                elif from_airport_mode == "transfer":
                    if not selected_arrival_transfer:
                        return Response({"detail": "Please select an arrival transfer first."}, status=400)
                    leg2 = build_transfer_leg_from_selection(
                        transfer=selected_arrival_transfer,
                        start_address=arrival_airport["route_address"],
                        destination_address=arrival_destination_address,
                    )
                    leg2["start_after_buffer_at"] = (
                        final_arrival_dt + timedelta(minutes=ARRIVAL_AIRPORT_BUFFER_MINUTES)
                    ).strftime("%Y-%m-%d %H:%M")
                else:
                    return Response({"detail": "Invalid from_airport_mode."}, status=400)
            except Exception as e:
                return Response({"detail": f"Route from arrival airport failed: {str(e)}"}, status=400)

        # LEG 3: destination -> return airport
        leg3 = None
        if return_itinerary and arrival_destination_address:
            try:
                return_departure_dt = datetime.fromisoformat(return_departure_at)
                if return_to_airport_mode == "drive":
                    leg3 = build_drive_leg(
                        start_address=arrival_destination_address,
                        destination_address=return_departure_airport["route_address"],
                        leave_reference_dt=return_departure_dt,
                        subtract_airport_buffer=True,
                    )
                elif return_to_airport_mode == "transit":
                    leg3 = build_transit_leg(
                        start_address=arrival_destination_address,
                        destination_address=return_departure_airport["route_address"],
                        reference_dt=return_departure_dt,
                        subtract_airport_buffer=True,
                    )
                elif return_to_airport_mode == "transfer":
                    if not selected_return_transfer:
                        return Response({"detail": "Please select a return transfer first."}, status=400)
                    leg3 = build_transfer_leg_from_selection(
                        transfer=selected_return_transfer,
                        start_address=arrival_destination_address,
                        destination_address=return_departure_airport["route_address"],
                    )
                    leg3["leave_at"] = (
                        return_departure_dt - timedelta(minutes=DEPARTURE_AIRPORT_BUFFER_MINUTES)
                    ).strftime("%Y-%m-%d %H:%M")
                else:
                    return Response({"detail": "Invalid return_to_airport_mode."}, status=400)
            except Exception as e:
                return Response({"detail": f"Route to return airport failed: {str(e)}"}, status=400)

        # LEG 4: return airport -> home
        leg4 = None
        if return_itinerary:
            try:
                return_final_arrival_dt = datetime.fromisoformat(return_arrival_at)
                if return_home_mode == "drive":
                    leg4 = build_drive_leg(
                        start_address=return_arrival_airport["route_address"],
                        destination_address=start_address,
                        leave_reference_dt=return_final_arrival_dt,
                        subtract_airport_buffer=False,
                    )
                elif return_home_mode == "transit":
                    leg4 = build_transit_leg(
                        start_address=return_arrival_airport["route_address"],
                        destination_address=start_address,
                        reference_dt=return_final_arrival_dt,
                        subtract_airport_buffer=False,
                    )
                else:
                    return Response({"detail": "Invalid return_home_mode."}, status=400)
            except Exception as e:
                return Response({"detail": f"Route from return airport to home failed: {str(e)}"}, status=400)

        remaining_budget = None
        hotel_price_eur = 0.0
        arrival_transfer_price_eur = 0.0
        return_transfer_price_eur = 0.0

        try:
            if selected_hotel:
                hotel_price_eur = float(selected_hotel.get("price_total_eur") or 0)
        except Exception:
            hotel_price_eur = 0.0

        try:
            if selected_arrival_transfer:
                arrival_transfer_price_eur = float(selected_arrival_transfer.get("price_total_eur") or 0)
        except Exception:
            arrival_transfer_price_eur = 0.0

        try:
            if selected_return_transfer:
                return_transfer_price_eur = float(selected_return_transfer.get("price_total_eur") or 0)
        except Exception:
            return_transfer_price_eur = 0.0

        try:
            if budget is not None:
                remaining_budget = (
                    float(budget)
                    - price_total
                    - hotel_price_eur
                    - arrival_transfer_price_eur
                    - return_transfer_price_eur
                )
        except Exception:
            remaining_budget = None

        ChatMessage.objects.create(
            user=request.user,
            role="assistant",
            content=(
                f"Trip plan started. Selected flight {departure_iata} → {arrival_iata} "
                f"({carrier}{flight_number}) for {price_total:.2f} EUR."
            ),
        )

        return Response({
            "ok": True,
            "flight_summary": f"{departure_iata} -> {arrival_iata} | {carrier}{flight_number} | {price_total:.2f} EUR",
            "selected_price": price_total,
            "remaining_budget": remaining_budget,
            "departure_at": departure_at,
            "arrival_at": arrival_at,
            "return_departure_at": return_departure_at,
            "return_arrival_at": return_arrival_at,
            "selected_hotel": selected_hotel,
            "selected_arrival_transfer": selected_arrival_transfer,
            "selected_return_transfer": selected_return_transfer,
            "selected_hotel_price_eur": hotel_price_eur,
            "selected_arrival_transfer_price_eur": arrival_transfer_price_eur,
            "selected_return_transfer_price_eur": return_transfer_price_eur,
            "leg1": leg1,
            "leg2": leg2,
            "leg3": leg3,
            "leg4": leg4,
        })
