# chatbot/api_views_extended.py
"""
Extended API views for:
- Google Places (restaurants, attractions, things to do)
- Viator tours
- Car rentals
- AI-powered itinerary planning

Add these to your urls.py:
    path('places/', SearchPlacesView.as_view()),
    path('tours/', SearchToursView.as_view()),
    path('car-rental/', SearchCarRentalView.as_view()),
    path('itinerary/', GenerateItineraryView.as_view()),
    path('recommend/', AIRecommendView.as_view()),
"""

import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions

logger = logging.getLogger(__name__)


class SearchPlacesView(APIView):
    """
    Search for restaurants, attractions, or things to do.
    
    POST /api/chat/places/
    {
        "city": "London",
        "category": "restaurant",  // restaurant, attraction, activity
        "type": "Italian",  // optional: cuisine or attraction type
        "latitude": 51.5074,  // optional: for location bias
        "longitude": -0.1278,
        "max_results": 10,
        "user_preferences": "vegetarian friendly"  // optional: for AI filtering
    }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        city = (request.data.get("city") or "").strip()
        category = (request.data.get("category") or "restaurant").strip()
        place_type = (request.data.get("type") or "").strip()
        latitude = request.data.get("latitude")
        longitude = request.data.get("longitude")
        max_results = int(request.data.get("max_results") or 10)
        user_preferences = request.data.get("user_preferences")
        use_ai_filter = request.data.get("use_ai_filter", True)

        if not city:
            return Response({"detail": "city is required"}, status=400)

        try:
            from travel.services.google_places import (
                search_restaurants,
                search_attractions,
                search_things_to_do,
                generate_mock_places,
            )
            from travel.services.ai_planner import filter_and_rank_places
        except ImportError as e:
            logger.error("Failed to import services: %s", e)
            return Response({"detail": "Service not available"}, status=500)

        try:
            # Search based on category
            if category == "restaurant":
                places = search_restaurants(
                    city_name=city,
                    latitude=latitude,
                    longitude=longitude,
                    cuisine=place_type if place_type else None,
                    max_results=max_results + 5,  # Get extra for AI filtering
                )
            elif category == "attraction":
                places = search_attractions(
                    city_name=city,
                    latitude=latitude,
                    longitude=longitude,
                    attraction_type=place_type if place_type else None,
                    max_results=max_results + 5,
                )
            else:  # activity
                places = search_things_to_do(
                    city_name=city,
                    latitude=latitude,
                    longitude=longitude,
                    activity_type=place_type if place_type else None,
                    max_results=max_results + 5,
                )
            
            is_mock = False

        except Exception as e:
            logger.warning("Google Places search failed, using mock: %s", e)
            places = generate_mock_places(city, category, max_results)
            is_mock = True

        # Apply AI filtering if enabled and we have enough results
        if use_ai_filter and len(places) > max_results and not is_mock:
            try:
                places = filter_and_rank_places(
                    places=places,
                    category=category,
                    city_name=city,
                    max_results=max_results,
                    user_preferences=user_preferences,
                )
            except Exception as e:
                logger.warning("AI filtering failed: %s", e)
                places = places[:max_results]
        else:
            places = places[:max_results]

        return Response({
            "city": city,
            "category": category,
            "places": places,
            "_mock": is_mock,
        })


class SearchToursView(APIView):
    """
    Search for tours and activities via Viator.
    
    POST /api/chat/tours/
    {
        "city": "London",
        "activity_type": "walking tour",  // optional
        "max_results": 10
    }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        city = (request.data.get("city") or "").strip()
        activity_type = (request.data.get("activity_type") or "").strip()
        max_results = int(request.data.get("max_results") or 10)

        if not city:
            return Response({"detail": "city is required"}, status=400)

        try:
            from travel.services.viator import search_tours, is_viator_configured
        except ImportError as e:
            logger.error("Failed to import Viator service: %s", e)
            return Response({"detail": "Service not available"}, status=500)

        is_mock = not is_viator_configured()
        
        try:
            tours = search_tours(
                city_name=city,
                activity_type=activity_type if activity_type else None,
                max_results=max_results,
            )
        except Exception as e:
            logger.warning("Viator search failed: %s", e)
            from travel.services.viator import generate_mock_tours
            tours = generate_mock_tours(city, max_results)
            is_mock = True

        return Response({
            "city": city,
            "tours": tours,
            "_mock": is_mock,
            "provider_warning": "Using sample data — Viator API not configured. Apply at https://partnerresources.viator.com/" if is_mock else None,
        })


class SearchCarRentalView(APIView):
    """
    Search for car rental offers.
    
    POST /api/chat/car-rental/
    {
        "pickup_location": "LHR",  // IATA airport code
        "pickup_date": "2026-05-01",
        "dropoff_date": "2026-05-05",
        "budget_remaining": 500  // optional
    }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        pickup_location = (request.data.get("pickup_location") or "").strip().upper()
        pickup_date = (request.data.get("pickup_date") or "").strip()
        dropoff_date = (request.data.get("dropoff_date") or "").strip()
        budget_remaining = request.data.get("budget_remaining")

        if not pickup_location or not pickup_date or not dropoff_date:
            return Response(
                {"detail": "pickup_location, pickup_date, and dropoff_date are required"},
                status=400
            )

        try:
            from travel.services.car_rental import search_car_offers
        except ImportError as e:
            logger.error("Failed to import car rental service: %s", e)
            return Response({"detail": "Service not available"}, status=500)

        try:
            offers = search_car_offers(
                pickup_location=pickup_location,
                pickup_date=pickup_date,
                dropoff_date=dropoff_date,
            )
        except Exception as e:
            logger.warning("Car rental search failed: %s", e)
            from travel.services.car_rental import generate_mock_car_offers
            offers = generate_mock_car_offers(pickup_location, pickup_date, dropoff_date)

        # Filter by budget if provided
        if budget_remaining is not None:
            try:
                budget = float(budget_remaining)
                offers = [o for o in offers if o.get("pricing", {}).get("total", 0) <= budget]
            except Exception:
                pass

        return Response({
            "pickup_location": pickup_location,
            "pickup_date": pickup_date,
            "dropoff_date": dropoff_date,
            "offers": offers,
            "_mock": True,  # Currently always mock until real API is added
            "provider_warning": "Using sample car rental data for demonstration.",
        })


class GenerateItineraryView(APIView):
    """
    Generate a day-by-day itinerary using AI.
    
    POST /api/chat/itinerary/
    {
        "city": "London",
        "num_days": 3,
        "check_in_date": "2026-05-01",
        "hotel_address": "123 Main St, London",  // optional
        "user_preferences": "history, local food, avoid crowds",  // optional
        "budget_remaining": 500  // optional
    }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        city = (request.data.get("city") or "").strip()
        num_days = int(request.data.get("num_days") or 3)
        check_in_date = (request.data.get("check_in_date") or "").strip()
        hotel_address = request.data.get("hotel_address")
        user_preferences = request.data.get("user_preferences")
        budget_remaining = request.data.get("budget_remaining")

        if not city or not check_in_date:
            return Response(
                {"detail": "city and check_in_date are required"},
                status=400
            )

        try:
            from travel.services.google_places import (
                search_restaurants,
                search_attractions,
                generate_mock_places,
            )
            from travel.services.viator import search_tours, generate_mock_tours
            from travel.services.ai_planner import generate_full_trip_itinerary
        except ImportError as e:
            logger.error("Failed to import services: %s", e)
            return Response({"detail": "Service not available"}, status=500)

        # Gather data for itinerary planning
        try:
            restaurants = search_restaurants(city, max_results=15)
        except Exception:
            restaurants = generate_mock_places(city, "restaurant", 15)

        try:
            attractions = search_attractions(city, max_results=15)
        except Exception:
            attractions = generate_mock_places(city, "attraction", 15)

        try:
            tours = search_tours(city, max_results=10)
        except Exception:
            tours = generate_mock_tours(city, 10)

        # Generate itinerary
        try:
            itinerary = generate_full_trip_itinerary(
                city_name=city,
                num_days=num_days,
                check_in_date=check_in_date,
                attractions=attractions,
                restaurants=restaurants,
                tours=tours,
                hotel_address=hotel_address,
                user_preferences=user_preferences,
                budget_remaining=float(budget_remaining) if budget_remaining else None,
            )
        except Exception as e:
            logger.error("Itinerary generation failed: %s", e)
            return Response({"detail": f"Failed to generate itinerary: {str(e)}"}, status=500)

        return Response({
            "itinerary": itinerary,
            "available_attractions": attractions[:5],
            "available_restaurants": restaurants[:5],
            "available_tours": tours[:5],
        })


class AIRecommendView(APIView):
    """
    Get AI-powered recommendations based on user preferences.
    
    POST /api/chat/recommend/
    {
        "city": "London",
        "preferences": "I love history, local food, and hidden gems. Not interested in touristy stuff.",
        "category": "all"  // all, restaurants, attractions, tours
    }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        city = (request.data.get("city") or "").strip()
        preferences = (request.data.get("preferences") or "").strip()
        category = (request.data.get("category") or "all").strip()

        if not city:
            return Response({"detail": "city is required"}, status=400)

        try:
            from travel.services.google_places import (
                search_restaurants,
                search_attractions,
                search_things_to_do,
                generate_mock_places,
            )
            from travel.services.viator import search_tours, generate_mock_tours
            from travel.services.ai_planner import (
                filter_and_rank_places,
                suggest_activities_for_preferences,
            )
        except ImportError as e:
            logger.error("Failed to import services: %s", e)
            return Response({"detail": "Service not available"}, status=500)

        results = {}

        # Get and filter data based on category
        if category in ["all", "restaurants"]:
            try:
                restaurants = search_restaurants(city, max_results=15)
            except Exception:
                restaurants = generate_mock_places(city, "restaurant", 15)
            
            if preferences:
                try:
                    restaurants = filter_and_rank_places(
                        restaurants, "restaurant", city, 5, preferences
                    )
                except Exception:
                    restaurants = restaurants[:5]
            results["restaurants"] = restaurants[:5]

        if category in ["all", "attractions"]:
            try:
                attractions = search_attractions(city, max_results=15)
            except Exception:
                attractions = generate_mock_places(city, "attraction", 15)
            
            if preferences:
                try:
                    attractions = filter_and_rank_places(
                        attractions, "attraction", city, 5, preferences
                    )
                except Exception:
                    attractions = attractions[:5]
            results["attractions"] = attractions[:5]

        if category in ["all", "tours"]:
            try:
                tours = search_tours(city, max_results=15)
            except Exception:
                tours = generate_mock_tours(city, 15)
            
            if preferences:
                try:
                    tours = suggest_activities_for_preferences(city, preferences, tours)
                except Exception:
                    tours = tours[:5]
            results["tours"] = tours[:5]

        return Response({
            "city": city,
            "preferences": preferences,
            "recommendations": results,
        })