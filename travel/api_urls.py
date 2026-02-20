# travel/api_urls.py

from django.urls import path  # Django URL routing

# Import API views from this app
from .api_views import (
    LatestIntentView,                # GET latest intent
    SearchFromLatestIntentView,      # POST search using latest intent
    FlightSearchView,                # POST search using manual cities/IATA
    CityListView,                    # City autocmplete list
)

urlpatterns = [
    # Latest parsed intent from chat (used by Flight tab)
    path("intents/latest/", LatestIntentView.as_view(), name="latest_intent"),

    # Search flights based on the latest intent saved from chat
    path("flights/search_from_latest_intent/", SearchFromLatestIntentView.as_view(), name="search_from_latest_intent"),

    # ✅ Manual flight search endpoint (this is what your widget uses)
    path("flights/search/", FlightSearchView.as_view(), name="flight_search"),

    path("cities/", CityListView.as_view(), name="city_list"),
]