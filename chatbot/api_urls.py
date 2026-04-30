# chatbot/api_urls.py

"""
Main API routes for the travel chat flow.

This file is included from:
    travelapp/urls.py -> path("api/chat/", include("chatbot.api_urls"))

That means every path here starts with:
    /api/chat/

Examples:
    /api/chat/send/
    /api/chat/search-flights/
    /api/chat/places/
"""

from django.urls import path

# Core chat/trip views.
from .api_views import (
    ChatSendView,
    GenerateTripPlanView,
    SearchFlightsStructuredView,
    SearchHotelsView,
    SearchTransfersView,
)

# Extended travel data views.
# These power restaurants, attractions, tours, car rental, and AI itinerary.
from .api_views_extended import (
    AIRecommendView,
    GenerateItineraryView,
    SearchCarRentalView,
    SearchPlacesView,
    SearchToursView,
)

urlpatterns = [
    # ------------------------------------------------------------
    # Core chatbot / travel planning flow
    # ------------------------------------------------------------

    # Free-text chat endpoint.
    path("send/", ChatSendView.as_view(), name="chat_send"),

    # Editable flight search widget endpoint.
    path(
        "search-flights/",
        SearchFlightsStructuredView.as_view(),
        name="search_flights_structured",
    ),

    # Hotel search after a flight has been selected.
    path("search-hotels/", SearchHotelsView.as_view(), name="search_hotels"),

    # Airport transfer search.
    path(
        "search-transfers/",
        SearchTransfersView.as_view(),
        name="search_transfers",
    ),

    # Route/transport plan generation.
    path(
        "generate-trip-plan/",
        GenerateTripPlanView.as_view(),
        name="generate_trip_plan",
    ),

    # ------------------------------------------------------------
    # Extended itinerary builder endpoints
    # ------------------------------------------------------------

    # Google Places restaurants / attractions / things to do.
    path("places/", SearchPlacesView.as_view(), name="search_places"),

    # Viator tours, with mock fallback while Viator is not configured.
    path("tours/", SearchToursView.as_view(), name="search_tours"),

    # Car rental offers. Currently mock/demo until a real provider is connected.
    path(
        "car-rental/",
        SearchCarRentalView.as_view(),
        name="search_car_rental",
    ),

    # AI day-by-day itinerary.
    path(
        "itinerary/",
        GenerateItineraryView.as_view(),
        name="generate_itinerary",
    ),

    # AI recommendation/refinement endpoint.
    path("recommend/", AIRecommendView.as_view(), name="ai_recommend"),
]