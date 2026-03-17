# chatbot/api_views.py

from datetime import datetime, timedelta
import requests

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions

from .models import ChatMessage, TravelIntent
from .services import extract_flight_intent, openrouter_chat

from travel.services.iata import city_to_iata
from travel.services.amadeus import (
    search_flights,
    search_locations,
    pick_first_airport_iata,
)
from travel.services.openrouteservice import geocode_address, route_driving


def build_preview(amadeus_json: dict, limit: int = 8):
    """
    Return a cheapest-first preview list for the frontend.
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
    Return a human-readable route destination for the departure airport.

    We use addresses/names instead of raw coordinates because raw airport
    coordinates often are not on a drivable road segment.
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
    }

    return mapping.get(
        iata_code,
        {
            "label": iata_code,
            "route_address": iata_code,
        },
    )


class ChatSendView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        prompt = (request.data.get("prompt") or "").strip()

        if not prompt:
            return Response({"detail": "prompt is required"}, status=400)

        # Save user message
        ChatMessage.objects.create(user=request.user, role="user", content=prompt)

        intent = extract_flight_intent(prompt)

        answer = None
        flight_widget = None

        if intent and intent.get("intent_type") == "flight_search":
            # Save parsed intent
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

            # Resolve city names to code
            origin_iata = city_to_iata(intent.get("origin"))
            dest_iata = city_to_iata(intent.get("destination"))

            # Allow direct typed IATA codes
            if not origin_iata and intent.get("origin") and len(intent["origin"].strip()) == 3:
                origin_iata = intent["origin"].strip().upper()

            if not dest_iata and intent.get("destination") and len(intent["destination"].strip()) == 3:
                dest_iata = intent["destination"].strip().upper()

            if intent.get("departure_date") and origin_iata and dest_iata:
                amadeus_json = None

                # First attempt: use resolved code directly
                try:
                    amadeus_json = search_flights(
                        origin=origin_iata,
                        destination=dest_iata,
                        departure_date=str(intent["departure_date"]),
                        adults=int(intent.get("adults") or 1),
                        return_date=str(intent["return_date"]) if intent.get("return_date") else None,
                    )
                except requests.HTTPError:
                    # Retry with a concrete AIRPORT code if destination is a city code
                    retry_dest_iata = None

                    try:
                        locations = search_locations(intent.get("destination"), limit=10)
                        retry_dest_iata = pick_first_airport_iata(locations)
                    except Exception:
                        retry_dest_iata = None

                    if retry_dest_iata and retry_dest_iata != dest_iata:
                        try:
                            amadeus_json = search_flights(
                                origin=origin_iata,
                                destination=retry_dest_iata,
                                departure_date=str(intent["departure_date"]),
                                adults=int(intent.get("adults") or 1),
                                return_date=str(intent["return_date"]) if intent.get("return_date") else None,
                            )
                            dest_iata = retry_dest_iata
                        except requests.HTTPError:
                            amadeus_json = None

                except Exception as e:
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
                    }

                    answer = (
                        f"Found flights for {origin_iata} → {dest_iata} on {flight_widget['departure_date']}"
                    )

                    if flight_widget["return_enabled"]:
                        answer += f", returning on {flight_widget['return_date']}"

                    answer += f" for {flight_widget['adults']} adult(s)."
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


class GenerateTripPlanView(APIView):
    """
    Generate a trip plan after the user selects a flight.

    Behavior:
    - requires selected flight
    - requires start address
    - geocodes BOTH:
        start address
        airport destination address
    - calculates drive duration and leave-home time
    - returns Google Maps + Waze links
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        selected_offer = request.data.get("selected_offer")

        if not selected_offer:
            return Response({"detail": "selected_offer is required"}, status=400)

        origin = request.data.get("origin")
        destination = request.data.get("destination")
        departure_date = request.data.get("departure_date")
        return_date = request.data.get("return_date")
        adults = request.data.get("adults")
        budget = request.data.get("budget")

        # Do NOT hardcode a fallback address
        start_address = (request.data.get("start_address") or "").strip()

        if not start_address:
            return Response(
                {
                    "detail": "Please provide your starting location first.",
                    "needs_start_address": True,
                },
                status=400,
            )

        # Parse selected outbound flight segment
        try:
            itinerary = selected_offer["itineraries"][0]
            segment = itinerary["segments"][0]

            departure_iata = segment["departure"]["iataCode"]
            departure_at = segment["departure"]["at"]

            arrival_iata = segment["arrival"]["iataCode"]
            arrival_at = segment["arrival"]["at"]

            carrier = segment.get("carrierCode", "")
            flight_number = segment.get("number", "")
            price_total = float(selected_offer["price"]["total"])
        except Exception as e:
            return Response({"detail": f"Could not parse selected offer: {str(e)}"}, status=400)

        # Get a routable airport target
        airport_target = get_airport_route_target(departure_iata)

        drive_minutes = None
        route_distance_m = None
        leave_home_at = None
        route_google_maps_url = None
        route_waze_url = None

        try:
            # Geocode user's start address
            start_coords = geocode_address(start_address)
            if not start_coords:
                return Response(
                    {
                        "detail": "Could not find that starting location. Please enter a more specific address.",
                        "needs_start_address": True,
                    },
                    status=400,
                )

            # Geocode route destination for the airport
            airport_coords = geocode_address(airport_target["route_address"])
            if not airport_coords:
                return Response(
                    {
                        "detail": f"Could not resolve route destination for airport {departure_iata}.",
                    },
                    status=400,
                )

            # Route from home to airport
            route = route_driving(
                start_coords["lat"],
                start_coords["lon"],
                airport_coords["lat"],
                airport_coords["lon"],
            )

            drive_seconds = int(route["duration"])
            drive_minutes = drive_seconds // 60
            route_distance_m = int(route["distance"])

            # Need to be at airport 90 minutes before departure
            flight_departure_dt = datetime.fromisoformat(departure_at)
            leave_dt = flight_departure_dt - timedelta(minutes=90) - timedelta(seconds=drive_seconds)
            leave_home_at = leave_dt.strftime("%Y-%m-%d %H:%M")

            # Build route links
            route_google_maps_url = (
                "https://www.google.com/maps/dir/?api=1"
                f"&origin={start_address.replace(' ', '+')}"
                f"&destination={airport_target['route_address'].replace(' ', '+')}"
                "&travelmode=driving"
            )

            route_waze_url = (
                "https://www.waze.com/ul"
                f"?ll={airport_coords['lat']},{airport_coords['lon']}"
                "&navigate=yes"
            )

        except Exception as e:
            return Response(
                {
                    "detail": f"Route calculation failed: {str(e)}",
                },
                status=400,
            )

        remaining_budget = None
        try:
            if budget is not None:
                remaining_budget = float(budget) - price_total
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
            "start_address": start_address,
            "airport": departure_iata,
            "airport_label": airport_target["label"],
            "airport_route_address": airport_target["route_address"],
            "destination_airport": arrival_iata,
            "departure_at": departure_at,
            "arrival_at": arrival_at,
            "leave_home_at": leave_home_at,
            "drive_minutes": drive_minutes,
            "route_distance_m": route_distance_m,
            "route_google_maps_url": route_google_maps_url,
            "route_waze_url": route_waze_url,
            "flight_summary": f"{departure_iata} -> {arrival_iata} | {carrier}{flight_number} | {price_total:.2f} EUR",
            "selected_price": price_total,
            "remaining_budget": remaining_budget,
            "origin": origin,
            "destination": destination,
            "departure_date": departure_date,
            "return_date": return_date,
            "adults": adults,
            "budget": budget,
        })