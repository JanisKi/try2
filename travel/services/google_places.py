# travel/services/google_places.py
"""
Google Places API integration for:
- Restaurants
- Attractions & Points of Interest
- Things to Do

Uses GOOGLE_MAPS_API_KEY (same one you use for Routes).
"""

import os
import requests
from typing import Optional
import logging
import random

logger = logging.getLogger(__name__)

GOOGLE_PLACES_BASE_URL = "https://places.googleapis.com/v1/places"


def get_api_key() -> str:
    """Get Google Maps API key from environment."""
    key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not key:
        raise RuntimeError("GOOGLE_MAPS_API_KEY is missing")
    return key


def search_places_text(
    query: str,
    location_bias_lat: Optional[float] = None,
    location_bias_lng: Optional[float] = None,
    max_results: int = 10,
    language: str = "en",
) -> list[dict]:
    """
    Search for places using free-form text query.
    """
    url = f"{GOOGLE_PLACES_BASE_URL}:searchText"
    
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": get_api_key(),
        "X-Goog-FieldMask": (
            "places.id,places.displayName,places.formattedAddress,"
            "places.rating,places.userRatingCount,places.priceLevel,"
            "places.types,places.primaryType,places.photos,"
            "places.regularOpeningHours,places.websiteUri,"
            "places.editorialSummary,places.googleMapsUri,places.location"
        ),
    }
    
    payload = {
        "textQuery": query,
        "maxResultCount": min(max_results, 20),
        "languageCode": language,
    }
    
    if location_bias_lat is not None and location_bias_lng is not None:
        payload["locationBias"] = {
            "circle": {
                "center": {"latitude": location_bias_lat, "longitude": location_bias_lng},
                "radius": 10000,
            }
        }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        return response.json().get("places", [])
    except Exception as e:
        logger.error("Google Places text search failed: %s", e)
        raise


def get_place_photo_url(photo_name: str, max_width: int = 400) -> str:
    """Generate a URL to fetch a place photo."""
    return f"https://places.googleapis.com/v1/{photo_name}/media?maxWidthPx={max_width}&key={get_api_key()}"


def _normalize_place(place: dict, category: str) -> dict:
    """Normalize Google Places response to a consistent structure."""
    display_name = place.get("displayName", {})
    location = place.get("location", {})
    editorial = place.get("editorialSummary", {})
    
    photos = place.get("photos", [])
    photo_url = None
    if photos:
        photo_name = photos[0].get("name")
        if photo_name:
            photo_url = get_place_photo_url(photo_name)
    
    opening_hours = place.get("regularOpeningHours", {})
    weekday_descriptions = opening_hours.get("weekdayDescriptions", [])
    
    price_level_map = {
        "PRICE_LEVEL_FREE": 0,
        "PRICE_LEVEL_INEXPENSIVE": 1,
        "PRICE_LEVEL_MODERATE": 2,
        "PRICE_LEVEL_EXPENSIVE": 3,
        "PRICE_LEVEL_VERY_EXPENSIVE": 4,
    }
    price_level = price_level_map.get(place.get("priceLevel"), None)
    
    return {
        "id": place.get("id"),
        "name": display_name.get("text", "Unknown"),
        "address": place.get("formattedAddress", ""),
        "latitude": location.get("latitude"),
        "longitude": location.get("longitude"),
        "rating": place.get("rating"),
        "review_count": place.get("userRatingCount"),
        "price_level": price_level,
        "price_display": "€" * price_level if price_level else None,
        "types": place.get("types", []),
        "primary_type": place.get("primaryType"),
        "category": category,
        "photo_url": photo_url,
        "website": place.get("websiteUri"),
        "google_maps_url": place.get("googleMapsUri"),
        "description": editorial.get("text"),
        "opening_hours": weekday_descriptions,
    }


def search_restaurants(city_name: str, latitude: Optional[float] = None, longitude: Optional[float] = None, 
                       cuisine: Optional[str] = None, max_results: int = 10) -> list[dict]:
    """Search for restaurants in a city."""
    query = f"best {cuisine} restaurants in {city_name}" if cuisine else f"best restaurants in {city_name}"
    places = search_places_text(query=query, location_bias_lat=latitude, location_bias_lng=longitude, max_results=max_results)
    return [_normalize_place(p, "restaurant") for p in places]


def search_attractions(city_name: str, latitude: Optional[float] = None, longitude: Optional[float] = None,
                       attraction_type: Optional[str] = None, max_results: int = 10) -> list[dict]:
    """Search for tourist attractions in a city."""
    query = f"best {attraction_type} in {city_name}" if attraction_type else f"top tourist attractions in {city_name}"
    places = search_places_text(query=query, location_bias_lat=latitude, location_bias_lng=longitude, max_results=max_results)
    return [_normalize_place(p, "attraction") for p in places]


def search_things_to_do(city_name: str, latitude: Optional[float] = None, longitude: Optional[float] = None,
                        activity_type: Optional[str] = None, max_results: int = 10) -> list[dict]:
    """Search for things to do / activities in a city."""
    query = f"best {activity_type} in {city_name}" if activity_type else f"things to do in {city_name}"
    places = search_places_text(query=query, location_bias_lat=latitude, location_bias_lng=longitude, max_results=max_results)
    return [_normalize_place(p, "activity") for p in places]


def generate_mock_places(city_name: str, category: str, count: int = 8) -> list[dict]:
    """Generate mock place data when Google Places API is unavailable."""
    mock_data = {
        "restaurant": [
            {"name": "The Golden Fork", "desc": "European fine dining"},
            {"name": "Sakura Garden", "desc": "Authentic Japanese cuisine"},
            {"name": "Trattoria Bella", "desc": "Classic Italian dishes"},
            {"name": "Le Petit Bistro", "desc": "French bistro favorites"},
            {"name": "Spice Route", "desc": "Indian & South Asian"},
            {"name": "The Local Kitchen", "desc": "Local specialties"},
            {"name": "Ocean's Catch", "desc": "Fresh seafood"},
            {"name": "Green Leaf Cafe", "desc": "Vegetarian & vegan"},
        ],
        "attraction": [
            {"name": "City Museum", "desc": "Art and history collections"},
            {"name": "Historic Cathedral", "desc": "Gothic architecture"},
            {"name": "Central Park", "desc": "Urban green space"},
            {"name": "Old Town Square", "desc": "Historic center"},
            {"name": "Royal Palace", "desc": "Former royal residence"},
            {"name": "Art Gallery", "desc": "Modern art exhibits"},
            {"name": "Botanical Gardens", "desc": "Plant collections"},
            {"name": "Harbor Promenade", "desc": "Waterfront walk"},
        ],
        "activity": [
            {"name": "City Walking Tour", "desc": "Guided city exploration"},
            {"name": "River Cruise", "desc": "Scenic boat tour"},
            {"name": "Food Market Tour", "desc": "Local cuisine tasting"},
            {"name": "Bike Rental", "desc": "Explore by bicycle"},
            {"name": "Spa & Wellness", "desc": "Relaxation treatments"},
            {"name": "Shopping District", "desc": "Retail therapy"},
            {"name": "Nightlife Tour", "desc": "Evening entertainment"},
            {"name": "Cooking Class", "desc": "Learn local recipes"},
        ],
    }
    
    items = mock_data.get(category, mock_data["activity"])
    results = []
    for i, item in enumerate(items[:count]):
        results.append({
            "id": f"mock_{category}_{i}",
            "name": f"{item['name']}",
            "address": f"{random.randint(1, 200)} Main Street, {city_name}",
            "latitude": round(random.uniform(50.0, 55.0), 6),
            "longitude": round(random.uniform(-1.0, 25.0), 6),
            "rating": round(random.uniform(4.0, 5.0), 1),
            "review_count": random.randint(50, 2000),
            "price_level": random.randint(1, 3),
            "price_display": "€" * random.randint(1, 3),
            "types": [category],
            "primary_type": category,
            "category": category,
            "photo_url": None,
            "website": None,
            "google_maps_url": f"https://maps.google.com/?q={item['name'].replace(' ', '+')}+{city_name}",
            "description": item["desc"],
            "opening_hours": [],
            "_mock": True,
        })
    return results