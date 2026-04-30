# chatbot/urls_extended.py

"""
Optional URL file for extended travel endpoints.

Important:
If you already added these paths directly inside chatbot/api_urls.py,
do not include this file again, or you will create duplicate routes.
"""

from django.urls import path

from .api_views_extended import (
    AIRecommendView,
    GenerateItineraryView,
    SearchCarRentalView,
    SearchPlacesView,
    SearchToursView,
)

urlpatterns = [
    path("places/", SearchPlacesView.as_view(), name="search_places"),
    path("tours/", SearchToursView.as_view(), name="search_tours"),
    path("car-rental/", SearchCarRentalView.as_view(), name="search_car_rental"),
    path("itinerary/", GenerateItineraryView.as_view(), name="generate_itinerary"),
    path("recommend/", AIRecommendView.as_view(), name="ai_recommend"),
]