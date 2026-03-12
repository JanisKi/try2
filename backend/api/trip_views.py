from rest_framework.decorators import api_view
from rest_framework.response import Response

from integrations.amadeus_service import (
    search_airports,
    search_flights
)


@api_view(["POST"])
def generate_trip(request):
    """
    Example request:

    {
      "destination": "Paris",
      "departure": "2026-03-15"
    }
    """

    destination = request.data["destination"]
    departure = request.data["departure"]

    # get airports
    airports = search_airports(destination)

    airport_code = airports["data"][0]["iataCode"]

    flights = search_flights(
        origin="RIX",
        destination=airport_code,
        date=departure
    )

    return Response({
        "airport": airport_code,
        "flights": flights
    })