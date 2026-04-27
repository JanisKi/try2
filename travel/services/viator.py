# travel/services/viator.py
"""
Viator Partner API integration for tours, activities, and experiences.

To use this service:
1. Apply for Viator Partner API access at https://partnerresources.viator.com/
2. Get your API key and set VIATOR_API_KEY environment variable

Viator API documentation: https://docs.viator.com/partner-api/
"""

import os
import requests
from typing import Optional
from datetime import datetime, timedelta
import logging
import random

logger = logging.getLogger(__name__)

VIATOR_BASE_URL = "https://api.viator.com/partner"


def get_api_key() -> str:
    """Get Viator API key from environment."""
    key = os.environ.get("VIATOR_API_KEY")
    if not key:
        raise RuntimeError("VIATOR_API_KEY is missing - apply at https://partnerresources.viator.com/")
    return key


def _viator_headers() -> dict:
    """Get headers for Viator API requests."""
    return {
        "Accept": "application/json;version=2.0",
        "Accept-Language": "en-US",
        "exp-api-key": get_api_key(),
        "Content-Type": "application/json",
    }


def search_freetext(query: str, currency: str = "EUR", max_results: int = 20) -> dict:
    """
    Search for Viator products using free-text query.
    """
    url = f"{VIATOR_BASE_URL}/search/freetext"
    
    payload = {
        "searchTerm": query,
        "currency": currency,
        "pagination": {"start": 1, "count": min(max_results, 50)},
    }
    
    try:
        response = requests.post(url, headers=_viator_headers(), json=payload, timeout=30)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error("Viator freetext search failed: %s", e)
        raise


def get_product_details(product_code: str, currency: str = "EUR") -> dict:
    """
    Get detailed information about a specific Viator product.
    """
    url = f"{VIATOR_BASE_URL}/products/{product_code}"
    params = {"currency": currency}
    
    try:
        response = requests.get(url, headers=_viator_headers(), params=params, timeout=30)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error("Viator product details failed: %s", e)
        raise


def check_availability(product_code: str, travel_date: str, currency: str = "EUR") -> dict:
    """
    Check availability for a product on a specific date.
    """
    url = f"{VIATOR_BASE_URL}/availability/schedules/{product_code}"
    params = {"currency": currency, "travelDate": travel_date}
    
    try:
        response = requests.get(url, headers=_viator_headers(), params=params, timeout=30)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error("Viator availability check failed: %s", e)
        raise


def _normalize_viator_product(product: dict) -> dict:
    """Normalize Viator product to consistent structure."""
    pricing = product.get("pricing", {})
    summary = pricing.get("summary", {})
    
    images = product.get("images", [])
    photo_url = None
    if images:
        variants = images[0].get("variants", [])
        for v in variants:
            if v.get("width", 0) >= 300:
                photo_url = v.get("url")
                break
    
    reviews = product.get("reviews", {})
    
    return {
        "id": product.get("productCode"),
        "name": product.get("title", "Unknown"),
        "description": product.get("description", ""),
        "short_description": product.get("shortDescription", ""),
        "duration": product.get("duration", {}).get("fixedDurationInMinutes"),
        "duration_text": product.get("duration", {}).get("variableDurationFromMinutes"),
        "price_from": summary.get("fromPrice"),
        "price_from_formatted": summary.get("fromPriceFormatted"),
        "currency": pricing.get("currency", "EUR"),
        "rating": reviews.get("combinedAverageRating"),
        "review_count": reviews.get("totalReviews"),
        "photo_url": photo_url,
        "categories": [t.get("tagName") for t in product.get("tags", []) if t.get("tagName")],
        "highlights": product.get("highlights", []),
        "inclusions": product.get("inclusions", []),
        "exclusions": product.get("exclusions", []),
        "booking_url": f"https://www.viator.com/tours/{product.get('productCode')}",
        "source": "viator",
    }


def search_tours(city_name: str, activity_type: Optional[str] = None, max_results: int = 10) -> list[dict]:
    """
    Search for tours and activities in a city.
    """
    query = f"{activity_type} in {city_name}" if activity_type else f"tours in {city_name}"
    
    try:
        response = search_freetext(query=query, max_results=max_results)
        products = response.get("products", [])
        return [_normalize_viator_product(p) for p in products]
    except Exception as e:
        logger.warning("Viator search failed, using mock data: %s", e)
        return generate_mock_tours(city_name, max_results)


# --------------------------------------------------------
# Mock data (when Viator API is unavailable or not set up)
# --------------------------------------------------------

def generate_mock_tours(city_name: str, count: int = 8) -> list[dict]:
    """Generate mock tour data when Viator API is unavailable."""
    mock_tours = [
        {"name": "City Walking Tour", "duration": 180, "price": 35, "type": "walking_tour"},
        {"name": "Hop-on Hop-off Bus Tour", "duration": 120, "price": 28, "type": "bus_tour"},
        {"name": "Food & Market Tour", "duration": 210, "price": 65, "type": "food_tour"},
        {"name": "Historic Sites Tour", "duration": 240, "price": 45, "type": "history"},
        {"name": "River Cruise", "duration": 90, "price": 22, "type": "cruise"},
        {"name": "Street Art & Hidden Gems", "duration": 150, "price": 30, "type": "art"},
        {"name": "Night Tour & Pub Crawl", "duration": 240, "price": 40, "type": "nightlife"},
        {"name": "Day Trip to Countryside", "duration": 480, "price": 85, "type": "day_trip"},
        {"name": "Photography Tour", "duration": 180, "price": 55, "type": "photography"},
        {"name": "Local Experience Tour", "duration": 180, "price": 50, "type": "local"},
    ]
    
    results = []
    for i, tour in enumerate(mock_tours[:count]):
        results.append({
            "id": f"mock_tour_{i}",
            "name": f"{city_name} {tour['name']}",
            "description": f"Experience the best of {city_name} with this amazing {tour['type'].replace('_', ' ')}.",
            "short_description": f"Popular {tour['type'].replace('_', ' ')} in {city_name}",
            "duration": tour["duration"],
            "duration_text": f"{tour['duration'] // 60}h {tour['duration'] % 60}m" if tour["duration"] >= 60 else f"{tour['duration']}m",
            "price_from": tour["price"] + random.randint(-5, 15),
            "price_from_formatted": f"€{tour['price'] + random.randint(-5, 15):.2f}",
            "currency": "EUR",
            "rating": round(random.uniform(4.2, 4.9), 1),
            "review_count": random.randint(100, 3000),
            "photo_url": None,
            "categories": [tour["type"]],
            "highlights": [
                f"Expert local guide",
                f"Small group experience",
                f"Skip-the-line access",
            ],
            "inclusions": ["Professional guide", "Entrance fees"],
            "exclusions": ["Food and drinks", "Tips"],
            "booking_url": f"https://www.viator.com/search/{city_name.replace(' ', '-')}-tours",
            "source": "viator_mock",
            "_mock": True,
        })
    return results


def is_viator_configured() -> bool:
    """Check if Viator API is configured."""
    return bool(os.environ.get("VIATOR_API_KEY"))