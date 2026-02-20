from rest_framework.views import APIView  # DRF base view
from rest_framework.response import Response  # JSON response
from rest_framework import permissions  # Auth rules
from chatbot.models import TravelIntent
from .services.amadeus import search_flights  # Amadeus call
from .services.iata import city_to_iata  # City -> IATA mapping
from .models import CityIata  # City -> IATA DB table



def resolve_to_iata(value: str) -> str | None:
    """
    Convert input into an IATA code.
    Allows:
      - city name like "Riga" -> "RIX" (via CityIata DB)
      - IATA code like "RIX" -> "RIX"
    """
    s = (value or "").strip()
    if not s:
        return None

    # If user typed IATA already (3 letters), accept it
    if len(s) == 3 and s.isalpha():
        return s.upper()

    # Otherwise try to resolve from DB mapping
    return city_to_iata(s)

def get_latest_resolvable_intent(user):
    """
    Return the newest flight_search intent where we can resolve both cities to IATA.
    """
    intents = (
        TravelIntent.objects
        .filter(user=user, intent_type="flight_search")
        .order_by("-id")
    )

    for intent in intents:
        # Try to resolve both cities to IATA codes
        if city_to_iata(intent.origin, auto_fetch=False) and city_to_iata(intent.destination, auto_fetch=False):
            return intent

    return None


class CityListView(APIView):
    """
    GET /api/travel/cities/
    Returns cached city -> IATA mappings for autocomplete dropdown.
    """
    permission_classes = [permissions.IsAuthenticated]  # Keep it consistent with your app

    def get(self, request):
        # Get all cities sorted by name
        rows = CityIata.objects.order_by("city").values("city", "iata")
        return Response({"cities": list(rows)})

class LatestIntentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # Use "-id" as a reliable "newest record" ordering
        # intent = (
        #     TravelIntent.objects
        #     .filter(user=request.user, intent_type="flight_search")  # only flight intents
        #     .order_by("-id")
        #     .first()
        # )

        # If no intent exists, return null
        intent = get_latest_resolvable_intent(request.user)
        if not intent:
            return Response({"detail": "No recent intent with resolvable cities (add CityIata mappings)."}, status=400)


        # Return a small JSON object to the frontend
        return Response({
            "intent": {
                "intent_type": intent.intent_type,
                "origin": intent.origin,
                "destination": intent.destination,
                "created_at": intent.created_at,
            }
        })


class SearchFromLatestIntentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        # Get the newest flight_search intent by id
        # intent = (
        #     TravelIntent.objects
        #     .filter(user=request.user, intent_type="flight_search")
        #     .order_by("-id")
        #     .first()
        # )

        # if not intent:
        #     return Response({"detail": "No recent flight_search intent found"}, status=400)
        intent = get_latest_resolvable_intent(request.user)
        if not intent:
            return Response({"detail": "No recent intent with resolvable cities (add CityIata mappings)."}, status=400)

        departure_date = (request.data.get("departure_date") or "").strip()
        adults = int(request.data.get("adults") or 1)

        if not departure_date:
            return Response({"detail": "departure_date required"}, status=400)

        origin_iata = city_to_iata(intent.origin) or intent.origin.upper()
        dest_iata = city_to_iata(intent.destination) or intent.destination.upper()

        # Read return date from request (optional)
        return_date = (request.data.get("return_date") or "").strip()  # <-- NEW

        # If user did not request return, treat as one-way
        if return_date == "":
            return_date = None  # <-- NEW

        # Call Amadeus with optional return_date
        data = search_flights(
            origin_iata,
            dest_iata,
            departure_date,
            adults=adults,
            return_date=return_date,  # <-- NEW
        )
        return Response({
            "intent": {
                "origin_city": intent.origin,
                "destination_city": intent.destination,
                "origin_iata": origin_iata,
                "destination_iata": dest_iata,
            },
            "amadeus": data
        })

class FlightSearchView(APIView):
    """
    POST /api/travel/flights/search/
    Body:
      {
        "origin": "Riga" OR "RIX",
        "destination": "London" OR "LON",
        "departure_date": "2026-03-15",
        "adults": 2,
        "return_date": "2026-03-20"   (optional)
      }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        # Read fields from JSON body
        origin_in = request.data.get("origin")
        dest_in = request.data.get("destination")
        departure_date = (request.data.get("departure_date") or "").strip()
        return_date = (request.data.get("return_date") or "").strip()
        adults = int(request.data.get("adults") or 1)

        # If user requested return but didn't provide date, error clearly
        if return_date and len(return_date) > 0:
            # If user did not request return, treat as one-way
            if return_date == "":
                return_date = None
                # Very basic date order check (string works for YYYY-MM-DD)
            elif return_date < departure_date:
                return Response({"detail": "return_date must be after departure_date"}, status=400)
        # Validate required fields
        if not origin_in or not dest_in or not departure_date:
            return Response({"detail": "origin, destination, departure_date are required"}, status=400)

        # Resolve to IATA codes
        origin_iata = resolve_to_iata(origin_in)
        dest_iata = resolve_to_iata(dest_in)

        if not origin_iata or not dest_iata:
            return Response({"detail": "Could not resolve origin/destination to IATA (add mapping or use IATA codes)."}, status=400)

        # If user did not request return, treat as one-way
        if return_date == "":
            return_date = None

        # Call Amadeus (return_date None means one-way)
        amadeus_json = search_flights(
            origin=origin_iata,
            destination=dest_iata,
            departure_date=departure_date,
            adults=adults,
            return_date=return_date,
        )

        # Return Amadeus JSON directly (contains "data")
        return Response(amadeus_json)
