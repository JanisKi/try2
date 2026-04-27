# chatbot/urls_extended.py
"""
URL patterns for extended travel services.

Add these to your main chatbot/urls.py by importing and including:

    from .api_views_extended import (
        SearchPlacesView,
        SearchToursView,
        SearchCarRentalView,
        GenerateItineraryView,
        AIRecommendView,
    )
    
    urlpatterns += [
        path('places/', SearchPlacesView.as_view(), name='search_places'),
        path('tours/', SearchToursView.as_view(), name='search_tours'),
        path('car-rental/', SearchCarRentalView.as_view(), name='search_car_rental'),
        path('itinerary/', GenerateItineraryView.as_view(), name='generate_itinerary'),
        path('recommend/', AIRecommendView.as_view(), name='ai_recommend'),
    ]

Or import this file:
    from . import urls_extended
    urlpatterns += urls_extended.urlpatterns
"""

from django.urls import path
from .api_views_extended import (
    SearchPlacesView,
    SearchToursView,
    SearchCarRentalView,
    GenerateItineraryView,
    AIRecommendView,
)

urlpatterns = [
    path('places/', SearchPlacesView.as_view(), name='search_places'),
    path('tours/', SearchToursView.as_view(), name='search_tours'),
    path('car-rental/', SearchCarRentalView.as_view(), name='search_car_rental'),
    path('itinerary/', GenerateItineraryView.as_view(), name='generate_itinerary'),
    path('recommend/', AIRecommendView.as_view(), name='ai_recommend'),
]