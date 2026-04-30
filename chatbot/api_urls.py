# chatbot/api_urls.py

"""
Main API routes for the travel chat flow.

This file is included from:
    travelapp/urls.py -> path("api/chat/", include("chatbot.api_urls"))

That means every path here starts with:
    /api/chat/

Example:
    path("send/", ...) becomes /api/chat/send/
"""

from django.urls import path

# Existing core chat/travel flow views.
from .api_views import (
    ChatSendView,
    GenerateTripPlanView,
    SearchFlightsStructuredView,
    SearchHotelsView,
    SearchTransfersView,
)

# New extended travel service views.
# These are separated in api_views_extended.py so the large existing api_views.py
# does not become even harder to maintain.
from .api_views_extended import (
    AIRecommendView,
    GenerateItineraryView,
    SearchCarRentalView,
    SearchPlacesView,
    SearchToursView,
)

urlpatterns = [
    # ------------------------------------------------------------
    # Core chatbot / trip-building flow
    # ------------------------------------------------------------

    # Free-text chat endpoint.
    # Example: POST /api/chat/send/
    path("send/", ChatSendView.as_view(), name="chat_send"),

    # Structured flight search from the editable flight widget.
    # Example: POST /api/chat/search-flights/
    path(
        "search-flights/",
        SearchFlightsStructuredView.as_view(),
        name="search_flights_structured",
    ),

    # Hotel search after the user selects a flight.
    # Example: POST /api/chat/search-hotels/
    path(
        "search-hotels/",
        SearchHotelsView.as_view(),
        name="search_hotels",
    ),

    # Transfer search after the user selects a hotel or custom address.
    # Example: POST /api/chat/search-transfers/
    path(
        "search-transfers/",
        SearchTransfersView.as_view(),
        name="search_transfers",
    ),

    # Final generated trip plan with selected flight, hotel/address, and routes.
    # Example: POST /api/chat/generate-trip-plan/
    path(
        "generate-trip-plan/",
        GenerateTripPlanView.as_view(),
        name="generate_trip_plan",
    ),

    # ------------------------------------------------------------
    # Extended travel data endpoints
    # ------------------------------------------------------------

    # Google Places search:
    # restaurants, attractions, and things to do.
    # Example: POST /api/chat/places/
    path(
        "places/",
        SearchPlacesView.as_view(),
        name="search_places",
    ),

    # Viator tours / activities search.
    # Uses mock data when VIATOR_API_KEY is missing.
    # Example: POST /api/chat/tours/
    path(
        "tours/",
        SearchToursView.as_view(),
        name="search_tours",
    ),

    # Car rental search.
    # Currently returns mock-style data until a real car provider is connected.
    # Example: POST /api/chat/car-rental/
    path(
        "car-rental/",
        SearchCarRentalView.as_view(),
        name="search_car_rental",
    ),

    # AI-generated day-by-day city itinerary.
    # Example: POST /api/chat/itinerary/
    path(
        "itinerary/",
        GenerateItineraryView.as_view(),
        name="generate_itinerary",
    ),

    # AI recommendation endpoint.
    # This is useful for filtering repetitive results like many similar chain restaurants.
    # Example: POST /api/chat/recommend/
    path(
        "recommend/",
        AIRecommendView.as_view(),
        name="ai_recommend",
    ),
]