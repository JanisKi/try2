# chatbot/api_views_extended.py

"""
Extended API views for extra travel-planning data.

This file adds endpoints for:
- Google Places restaurants / attractions / things to do
- Viator tours and activities
- Car rental offers
- AI-powered day-by-day itinerary generation
- AI-powered recommendation filtering

Important:
These views are intentionally defensive. If a provider API is missing or fails,
the app should return a useful error or mock fallback instead of crashing.
"""

import logging
from typing import Any

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


def _safe_int(value: Any, default: int = 10, minimum: int = 1, maximum: int = 50) -> int:
    """
    Safely convert request values to int.

    This prevents the API from crashing if the frontend sends:
    - an empty string
    - null
    - a non-number value
    """
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default

    return max(minimum, min(parsed, maximum))


def _safe_float(value: Any, default: float | None = None) -> float | None:
    """
    Safely convert request values to float.

    Used for latitude, longitude, and budget values.
    """
    if value in ("", None):
        return default

    try:
        return float(value)
    except (TypeError, ValueError):
        return default


class SearchPlacesView(APIView):
    """
    Search for restaurants, attractions, or things to do.

    POST /api/chat/places/

    Example body:
    {
        "city": "London",
        "category": "restaurant",
        "type": "Italian",
        "latitude": 51.5074,
        "longitude": -0.1278,
        "max_results": 10,
        "user_preferences": "vegetarian friendly",
        "use_ai_filter": true
    }
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        city = (request.data.get("city") or "").strip()
        category = (request.data.get("category") or "restaurant").strip().lower()
        place_type = (request.data.get("type") or "").strip()

        latitude = _safe_float(request.data.get("latitude"))
        longitude = _safe_float(request.data.get("longitude"))

        max_results = _safe_int(
            request.data.get("max_results"),
            default=10,
            minimum=1,
            maximum=20,
        )

        user_preferences = request.data.get("user_preferences")

        # Frontend may send true/false as real booleans or strings.
        use_ai_filter = request.data.get("use_ai_filter", True)
        if isinstance(use_ai_filter, str):
            use_ai_filter = use_ai_filter.lower() not in ("false", "0", "no")

        if not city:
            return Response(
                {"detail": "city is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if category not in ("restaurant", "attraction", "activity"):
            return Response(
                {
                    "detail": (
                        "Invalid category. Use one of: "
                        "restaurant, attraction, activity."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from travel.services.google_places import (
                generate_mock_places,
                search_attractions,
                search_restaurants,
                search_things_to_do,
            )
        except ImportError as exc:
            logger.exception("Google Places service import failed: %s", exc)
            return Response(
                {"detail": "Google Places service is not available."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Ask the provider for a few extra results.
        # This gives the AI filter more choices and helps reduce duplicate/boring results.
        provider_result_count = min(max_results + 5, 20)
        is_mock = False

        try:
            if category == "restaurant":
                places = search_restaurants(
                    city_name=city,
                    latitude=latitude,
                    longitude=longitude,
                    cuisine=place_type or None,
                    max_results=provider_result_count,
                )
            elif category == "attraction":
                places = search_attractions(
                    city_name=city,
                    latitude=latitude,
                    longitude=longitude,
                    attraction_type=place_type or None,
                    max_results=provider_result_count,
                )
            else:
                places = search_things_to_do(
                    city_name=city,
                    latitude=latitude,
                    longitude=longitude,
                    activity_type=place_type or None,
                    max_results=provider_result_count,
                )
        except Exception as exc:
            # Mock fallback lets your frontend continue working while
            # GOOGLE_MAPS_API_KEY is missing or Google Places fails.
            logger.warning("Google Places search failed, using mock data: %s", exc)
            places = generate_mock_places(city, category, max_results)
            is_mock = True

        # Use OpenRouter AI filtering only when:
        # - enabled
        # - we have more results than needed
        # - we are using real provider data
        if use_ai_filter and not is_mock and len(places) > max_results:
            try:
                from travel.services.ai_planner import filter_and_rank_places

                places = filter_and_rank_places(
                    places=places,
                    category=category,
                    city_name=city,
                    max_results=max_results,
                    user_preferences=user_preferences,
                )
            except Exception as exc:
                # AI filtering should never break the whole search.
                logger.warning("AI place filtering failed, using unfiltered results: %s", exc)
                places = places[:max_results]
        else:
            places = places[:max_results]

        return Response(
            {
                "city": city,
                "category": category,
                "places": places,
                "_mock": is_mock,
                "provider_warning": (
                    "Using sample place data because Google Places is not configured "
                    "or the request failed."
                    if is_mock
                    else None
                ),
            }
        )


class SearchToursView(APIView):
    """
    Search tours and activities using Viator.

    POST /api/chat/tours/

    Example body:
    {
        "city": "London",
        "activity_type": "walking tour",
        "max_results": 10
    }
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        city = (request.data.get("city") or "").strip()
        activity_type = (request.data.get("activity_type") or "").strip()

        max_results = _safe_int(
            request.data.get("max_results"),
            default=10,
            minimum=1,
            maximum=20,
        )

        if not city:
            return Response(
                {"detail": "city is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from travel.services.viator import (
                generate_mock_tours,
                is_viator_configured,
                search_tours,
            )
        except ImportError as exc:
            logger.exception("Viator service import failed: %s", exc)
            return Response(
                {"detail": "Viator service is not available."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        is_mock = not is_viator_configured()

        try:
            tours = search_tours(
                city_name=city,
                activity_type=activity_type or None,
                max_results=max_results,
            )
        except Exception as exc:
            # This is useful while waiting for real Viator API approval.
            logger.warning("Viator search failed, using mock data: %s", exc)
            tours = generate_mock_tours(city, max_results)
            is_mock = True

        return Response(
            {
                "city": city,
                "activity_type": activity_type,
                "tours": tours,
                "_mock": is_mock,
                "provider_warning": (
                    "Using sample tour data because Viator API is not configured. "
                    "Apply at https://partnerresources.viator.com/"
                    if is_mock
                    else None
                ),
            }
        )


class SearchCarRentalView(APIView):
    """
    Search car rental offers.

    POST /api/chat/car-rental/

    Example body:
    {
        "pickup_location": "LHR",
        "pickup_date": "2026-05-01",
        "dropoff_date": "2026-05-05",
        "budget_remaining": 500
    }

    Current note:
    The service currently returns mock-style offers. This keeps the UI usable
    until a real car rental provider is connected.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        pickup_location = (request.data.get("pickup_location") or "").strip().upper()
        pickup_date = (request.data.get("pickup_date") or "").strip()
        dropoff_date = (request.data.get("dropoff_date") or "").strip()
        budget_remaining = _safe_float(request.data.get("budget_remaining"))

        if not pickup_location or not pickup_date or not dropoff_date:
            return Response(
                {
                    "detail": (
                        "pickup_location, pickup_date, and dropoff_date are required"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from travel.services.car_rental import (
                generate_mock_car_offers,
                search_car_offers,
            )
        except ImportError as exc:
            logger.exception("Car rental service import failed: %s", exc)
            return Response(
                {"detail": "Car rental service is not available."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        is_mock = False

        try:
            offers = search_car_offers(
                pickup_location=pickup_location,
                pickup_date=pickup_date,
                dropoff_date=dropoff_date,
            )

            # Your current service marks generated offers with _mock=True.
            is_mock = all(offer.get("_mock") for offer in offers) if offers else True
        except Exception as exc:
            logger.warning("Car rental search failed, using mock data: %s", exc)
            offers = generate_mock_car_offers(
                pickup_location=pickup_location,
                pickup_date=pickup_date,
                dropoff_date=dropoff_date,
            )
            is_mock = True

        # Optional budget filter.
        # This keeps the result useful if the user has a remaining trip budget.
        if budget_remaining is not None:
            offers = [
                offer
                for offer in offers
                if float(offer.get("pricing", {}).get("total", 0)) <= budget_remaining
            ]

        return Response(
            {
                "pickup_location": pickup_location,
                "pickup_date": pickup_date,
                "dropoff_date": dropoff_date,
                "offers": offers,
                "_mock": is_mock,
                "provider_warning": (
                    "Using sample car rental data for demonstration."
                    if is_mock
                    else None
                ),
            }
        )


class GenerateItineraryView(APIView):
    """
    Generate a day-by-day itinerary using places, tours, and OpenRouter AI.

    POST /api/chat/itinerary/

    Example body:
    {
        "city": "London",
        "num_days": 3,
        "check_in_date": "2026-05-01",
        "hotel_address": "123 Main St, London",
        "user_preferences": "history, local food, avoid crowds",
        "budget_remaining": 500
    }
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        city = (request.data.get("city") or "").strip()
        check_in_date = (request.data.get("check_in_date") or "").strip()

        num_days = _safe_int(
            request.data.get("num_days"),
            default=3,
            minimum=1,
            maximum=14,
        )

        hotel_address = request.data.get("hotel_address")
        user_preferences = request.data.get("user_preferences")
        budget_remaining = _safe_float(request.data.get("budget_remaining"))

        if not city or not check_in_date:
            return Response(
                {"detail": "city and check_in_date are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from travel.services.google_places import (
                generate_mock_places,
                search_attractions,
                search_restaurants,
            )
            from travel.services.viator import generate_mock_tours, search_tours
            from travel.services.ai_planner import generate_full_trip_itinerary
        except ImportError as exc:
            logger.exception("Itinerary service import failed: %s", exc)
            return Response(
                {"detail": "Itinerary services are not available."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        used_mock_data = False

        # Gather restaurants for the itinerary.
        try:
            restaurants = search_restaurants(city, max_results=15)
        except Exception as exc:
            logger.warning("Restaurant search failed, using mock data: %s", exc)
            restaurants = generate_mock_places(city, "restaurant", 15)
            used_mock_data = True

        # Gather attractions for the itinerary.
        try:
            attractions = search_attractions(city, max_results=15)
        except Exception as exc:
            logger.warning("Attraction search failed, using mock data: %s", exc)
            attractions = generate_mock_places(city, "attraction", 15)
            used_mock_data = True

        # Gather tours for the itinerary.
        try:
            tours = search_tours(city, max_results=10)
            if any(tour.get("_mock") for tour in tours):
                used_mock_data = True
        except Exception as exc:
            logger.warning("Tour search failed, using mock data: %s", exc)
            tours = generate_mock_tours(city, 10)
            used_mock_data = True

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
                budget_remaining=budget_remaining,
            )
        except Exception as exc:
            logger.exception("AI itinerary generation failed: %s", exc)
            return Response(
                {
                    "detail": (
                        "Failed to generate itinerary. "
                        "Check OPENROUTER_API_KEY and model configuration."
                    )
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "itinerary": itinerary,
                "available_attractions": attractions[:5],
                "available_restaurants": restaurants[:5],
                "available_tours": tours[:5],
                "_mock": used_mock_data,
                "provider_warning": (
                    "Some itinerary data is sample data because one or more provider "
                    "APIs are not configured or failed."
                    if used_mock_data
                    else None
                ),
            }
        )


class AIRecommendView(APIView):
    """
    Get AI-powered recommendations based on user preferences.

    This is useful for solving problems like:
    - too many repeated chain restaurants
    - too many generic tourist attractions
    - not enough hidden/local options

    POST /api/chat/recommend/

    Example body:
    {
        "city": "London",
        "preferences": "I love history, local food, and hidden gems.",
        "category": "all"
    }
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        city = (request.data.get("city") or "").strip()
        preferences = (request.data.get("preferences") or "").strip()
        category = (request.data.get("category") or "all").strip().lower()

        if not city:
            return Response(
                {"detail": "city is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if category not in ("all", "restaurants", "attractions", "tours"):
            return Response(
                {
                    "detail": (
                        "Invalid category. Use one of: "
                        "all, restaurants, attractions, tours."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from travel.services.google_places import (
                generate_mock_places,
                search_attractions,
                search_restaurants,
            )
            from travel.services.viator import generate_mock_tours, search_tours
            from travel.services.ai_planner import (
                filter_and_rank_places,
                suggest_activities_for_preferences,
            )
        except ImportError as exc:
            logger.exception("AI recommendation service import failed: %s", exc)
            return Response(
                {"detail": "Recommendation services are not available."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        results = {}
        used_mock_data = False

        if category in ("all", "restaurants"):
            try:
                restaurants = search_restaurants(city, max_results=15)
            except Exception as exc:
                logger.warning("Restaurant search failed, using mock data: %s", exc)
                restaurants = generate_mock_places(city, "restaurant", 15)
                used_mock_data = True

            if preferences:
                try:
                    restaurants = filter_and_rank_places(
                        places=restaurants,
                        category="restaurant",
                        city_name=city,
                        max_results=5,
                        user_preferences=preferences,
                    )
                except Exception as exc:
                    logger.warning("AI restaurant filtering failed: %s", exc)
                    restaurants = restaurants[:5]
            else:
                restaurants = restaurants[:5]

            results["restaurants"] = restaurants

        if category in ("all", "attractions"):
            try:
                attractions = search_attractions(city, max_results=15)
            except Exception as exc:
                logger.warning("Attraction search failed, using mock data: %s", exc)
                attractions = generate_mock_places(city, "attraction", 15)
                used_mock_data = True

            if preferences:
                try:
                    attractions = filter_and_rank_places(
                        places=attractions,
                        category="attraction",
                        city_name=city,
                        max_results=5,
                        user_preferences=preferences,
                    )
                except Exception as exc:
                    logger.warning("AI attraction filtering failed: %s", exc)
                    attractions = attractions[:5]
            else:
                attractions = attractions[:5]

            results["attractions"] = attractions

        if category in ("all", "tours"):
            try:
                tours = search_tours(city, max_results=15)
                if any(tour.get("_mock") for tour in tours):
                    used_mock_data = True
            except Exception as exc:
                logger.warning("Tour search failed, using mock data: %s", exc)
                tours = generate_mock_tours(city, 15)
                used_mock_data = True

            if preferences:
                try:
                    tours = suggest_activities_for_preferences(
                        city_name=city,
                        preferences=preferences,
                        activities=tours,
                    )
                except Exception as exc:
                    logger.warning("AI tour filtering failed: %s", exc)
                    tours = tours[:5]
            else:
                tours = tours[:5]

            results["tours"] = tours

        return Response(
            {
                "city": city,
                "preferences": preferences,
                "category": category,
                "recommendations": results,
                "_mock": used_mock_data,
                "provider_warning": (
                    "Some recommendation data is sample data because one or more "
                    "provider APIs are not configured or failed."
                    if used_mock_data
                    else None
                ),
            }
        )