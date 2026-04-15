# chatbot/api_urls.py

from django.urls import path

from .api_views import (
    ChatSendView,
    GenerateTripPlanView,
    SearchHotelsView,
    SearchTransfersView,
    SearchFlightsStructuredView,
)

urlpatterns = [
    # Free-text chat + NLP flight search
    path("send/", ChatSendView.as_view(), name="chat_send"),

    # Structured flight search (widget re-search without NLP round-trip)
    path("search-flights/", SearchFlightsStructuredView.as_view(), name="search_flights_structured"),

    path("search-hotels/", SearchHotelsView.as_view()),

    path("search-transfers/", SearchTransfersView.as_view()),

    # Called after user selects a flight and fills trip-plan form
    path("generate-trip-plan/", GenerateTripPlanView.as_view(), name="generate_trip_plan"),
]