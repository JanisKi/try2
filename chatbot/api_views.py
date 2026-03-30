# chatbot/api_views.py

from datetime import datetime, timedelta, timezone
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
from travel.services.google_routes import compute_transit_route, summarize_transit_route


# ---------------------------------------------------------
# CONFIG: buffers
# ---------------------------------------------------------
DEPARTURE_AIRPORT_BUFFER_MINUTES = 90
ARRIVAL_AIRPORT_BUFFER_MINUTES = 60


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
                amadeus_json = None

                try:
                    amadeus_json = search_flights(
                        origin=origin_iata,
                        destination=dest_iata,
                        departure_date=str(intent["departure_date"]),
                        adults=int(intent.get("adults") or 1),
                        return_date=str(intent["return_date"]) if intent.get("return_date") else None,
                    )
                except requests.HTTPError:
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

            # -----------------------------
            # OUTBOUND itinerary
            # -----------------------------
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

            # -----------------------------
            # RETURN itinerary (optional)
            # -----------------------------
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

        # -----------------------------
        # LEG 1: home -> departure airport
        # -----------------------------
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

        # -----------------------------
        # LEG 2: arrival airport -> destination
        # -----------------------------
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
                else:
                    return Response({"detail": "Invalid from_airport_mode."}, status=400)
            except Exception as e:
                return Response({"detail": f"Route from arrival airport failed: {str(e)}"}, status=400)

        # -----------------------------
        # LEG 3: destination -> return airport
        # -----------------------------
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
                else:
                    return Response({"detail": "Invalid return_to_airport_mode."}, status=400)
            except Exception as e:
                return Response({"detail": f"Route to return airport failed: {str(e)}"}, status=400)

        # -----------------------------
        # LEG 4: return airport -> home
        # -----------------------------
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
            "flight_summary": f"{departure_iata} -> {arrival_iata} | {carrier}{flight_number} | {price_total:.2f} EUR",
            "selected_price": price_total,
            "remaining_budget": remaining_budget,
            "departure_at": departure_at,
            "arrival_at": arrival_at,
            "return_departure_at": return_departure_at,
            "return_arrival_at": return_arrival_at,
            "leg1": leg1,
            "leg2": leg2,
            "leg3": leg3,
            "leg4": leg4,
        })

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

        hotel_list = search_hotels_by_city(city_code, radius=20)
        results = []

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

            address_obj = hotel.get("address") or {}
            results.append(
                {
                    "hotel_id": hotel_id,
                    "offer_id": offer.get("id"),
                    "name": hotel.get("name"),
                    "address": ", ".join(
                        p for p in [
                            hotel.get("name"),
                            address_obj.get("cityName"),
                            address_obj.get("countryCode"),
                        ] if p
                    ),
                    "geo": hotel.get("geoCode") or {},
                    "check_in": offer.get("checkInDate"),
                    "check_out": offer.get("checkOutDate"),
                    "price_total": price_total,
                    "currency": (offer.get("price") or {}).get("currency"),
                    "room_description": (
                        ((offer.get("room") or {}).get("description") or {}).get("text")
                        or ""
                    ),
                }
            )

        results.sort(key=lambda x: x["price_total"])

        if budget_remaining is not None:
            try:
                budget_left = float(budget_remaining)
                filtered = [h for h in results if h["price_total"] <= budget_left]
                if filtered:
                    results = filtered
            except Exception:
                pass

        return Response(
            {
                "check_in": check_in,
                "check_out": check_out,
                "hotels": results[:max_results],
            }
        )
