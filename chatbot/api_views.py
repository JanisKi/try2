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
    Build a cheapest-first preview for the frontend.
    """
    offers = (amadeus_json or {}).get("data") or []

    def price_num(offer):
        try:
            return float(offer.get("price", {}).get("total", "999999"))
        except Exception:
            return 999999.0

    offers = sorted(offers, key=price_num)[:limit]
    return offers


class ChatSendView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        prompt = (request.data.get("prompt") or "").strip()

        if not prompt:
            return Response({"detail": "prompt is required"}, status=400)

        # Save user message
        ChatMessage.objects.create(user=request.user, role="user", content=prompt)

        # Try to parse structured flight/trip intent
        intent = extract_flight_intent(prompt)

        answer = None
        flight_widget = None

        if intent and intent.get("intent_type") == "flight_search":
            # Save parsed trip info to DB
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

            # Resolve city names to IATA codes
            origin_iata = city_to_iata(intent.get("origin"))
            dest_iata = city_to_iata(intent.get("destination"))

            # If user directly typed something like RIX or AMS
            if not origin_iata and intent.get("origin") and len(intent["origin"].strip()) == 3:
                origin_iata = intent["origin"].strip().upper()

            if not dest_iata and intent.get("destination") and len(intent["destination"].strip()) == 3:
                dest_iata = intent["destination"].strip().upper()

            # If we have enough info, try Amadeus search
            if intent.get("departure_date") and origin_iata and dest_iata:
                try:
                    # First try with the normal resolved code
                    amadeus_json = search_flights(
                        origin=origin_iata,
                        destination=dest_iata,
                        departure_date=str(intent["departure_date"]),
                        adults=int(intent.get("adults") or 1),
                        return_date=str(intent["return_date"]) if intent.get("return_date") else None,
                    )

                except requests.HTTPError:
                    # Fallback:
                    # If destination was a CITY code like PAR and Amadeus rejects it,
                    # retry using the first AIRPORT code like CDG or ORY.
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
                        except requests.HTTPError as e:
                            answer = (
                                "I understood your trip request, but Amadeus could not find flights for that route/date. "
                                "Please try another date or destination airport."
                            )
                            amadeus_json = None
                    else:
                        answer = (
                            "I understood your trip request, but Amadeus could not find flights for that route/date. "
                            "Please try another date or destination airport."
                        )
                        amadeus_json = None

                except Exception as e:
                    answer = f"Flight search failed: {str(e)}"
                    amadeus_json = None

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

        # Fallback to general chat
        if answer is None:
            try:
                recent = ChatMessage.objects.filter(user=request.user).order_by("-created_at")[:10]
                messages = [{"role": m.role, "content": m.content} for m in reversed(recent)]
                answer = openrouter_chat(messages)
            except Exception as e:
                answer = f"Sorry — chat request failed: {str(e)}"

        # Save bot reply
        ChatMessage.objects.create(user=request.user, role="assistant", content=answer)

        return Response({
            "answer": answer,
            "flight_widget": flight_widget,
        })


class GenerateTripPlanView(APIView):
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
        start_address = (request.data.get("start_address") or "").strip() or "Ogre Mednieku iela 23"

        # Read selected flight from frontend
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

        # Current MVP: route from home to Riga Airport
        airport_coords = {
            "lat": 56.9236,
            "lon": 23.9711,
        }

        drive_minutes = None
        route_distance_m = None
        leave_home_at = None
        route_url = None

        try:
            start_coords = geocode_address(start_address)

            if start_coords:
                route = route_driving(
                    start_coords["lat"],
                    start_coords["lon"],
                    airport_coords["lat"],
                    airport_coords["lon"],
                )

                drive_seconds = int(route["duration"])
                drive_minutes = drive_seconds // 60
                route_distance_m = int(route["distance"])

                # User must be at airport 90 minutes before departure
                flight_departure_dt = datetime.fromisoformat(departure_at)
                leave_dt = flight_departure_dt - timedelta(minutes=90) - timedelta(seconds=drive_seconds)
                leave_home_at = leave_dt.strftime("%Y-%m-%d %H:%M")

                route_url = (
                    "https://www.google.com/maps/dir/?api=1"
                    f"&origin={start_address.replace(' ', '+')}"
                    "&destination=Riga+Airport"
                    "&travelmode=driving"
                )
        except Exception:
            # Keep endpoint alive even if route service fails
            pass

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
            "destination_airport": arrival_iata,
            "departure_at": departure_at,
            "arrival_at": arrival_at,
            "leave_home_at": leave_home_at,
            "drive_minutes": drive_minutes,
            "route_distance_m": route_distance_m,
            "route_url": route_url,
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