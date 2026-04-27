# travel/services/car_rental.py
"""
Car Rental API integration.

Primary: Amadeus Car Rental API (same credentials as flights/hotels)
Fallback: Mock data when API unavailable

Note: Amadeus self-service car rental API is limited. For production,
consider:
- Amadeus Enterprise (full car content)
- Cartrawler API
- Rentalcars.com API
- Auto Europe API
"""

import os
import requests
from typing import Optional
from datetime import datetime, timedelta
import logging
import random

logger = logging.getLogger(__name__)

AMADEUS_BASE_URL = "https://test.api.amadeus.com"


def get_access_token() -> str:
    """Get OAuth token for Amadeus APIs."""
    api_key = os.environ.get("AMADEUS_API_KEY")
    api_secret = os.environ.get("AMADEUS_API_SECRET")
    
    if not api_key or not api_secret:
        raise RuntimeError("AMADEUS_API_KEY / AMADEUS_API_SECRET missing")
    
    token_url = f"{AMADEUS_BASE_URL}/v1/security/oauth2/token"
    token_resp = requests.post(
        token_url,
        data={
            "grant_type": "client_credentials",
            "client_id": api_key,
            "client_secret": api_secret,
        },
        timeout=30,
    )
    token_resp.raise_for_status()
    return token_resp.json()["access_token"]


def _amadeus_headers() -> dict:
    """Get headers for Amadeus API requests."""
    return {"Authorization": f"Bearer {get_access_token()}"}


def search_car_offers(
    pickup_location: str,
    pickup_date: str,
    dropoff_date: str,
    pickup_time: str = "10:00:00",
    dropoff_time: str = "10:00:00",
    currency: str = "EUR",
) -> list[dict]:
    """
    Search for car rental offers.
    
    Note: Amadeus self-service car API is limited. This function
    uses what's available and falls back to mock data.
    
    Args:
        pickup_location: IATA airport code (e.g., "LHR")
        pickup_date: YYYY-MM-DD
        dropoff_date: YYYY-MM-DD
        pickup_time: HH:MM:SS
        dropoff_time: HH:MM:SS
        currency: Currency code
        
    Returns:
        List of car rental offers
    """
    # Note: Amadeus self-service doesn't have a direct car search endpoint
    # in the free tier. We'll use mock data with the structure that would
    # match a real car rental API.
    
    logger.info("Car rental search for %s from %s to %s", pickup_location, pickup_date, dropoff_date)
    
    # Try to get real data if available (placeholder for future API)
    # For now, return mock data that matches expected structure
    return generate_mock_car_offers(
        pickup_location=pickup_location,
        pickup_date=pickup_date,
        dropoff_date=dropoff_date,
    )


def generate_mock_car_offers(
    pickup_location: str,
    pickup_date: str,
    dropoff_date: str,
    count: int = 8,
) -> list[dict]:
    """
    Generate mock car rental offers.
    
    Structure matches typical car rental API responses.
    """
    # Calculate rental days
    pickup = datetime.strptime(pickup_date, "%Y-%m-%d")
    dropoff = datetime.strptime(dropoff_date, "%Y-%m-%d")
    num_days = max(1, (dropoff - pickup).days)
    
    car_categories = [
        {
            "code": "ECMR",
            "name": "Economy",
            "example": "Toyota Yaris or similar",
            "seats": 5,
            "bags": 2,
            "transmission": "Manual",
            "ac": True,
            "daily_rate": 25,
        },
        {
            "code": "CCAR",
            "name": "Compact",
            "example": "Volkswagen Golf or similar",
            "seats": 5,
            "bags": 3,
            "transmission": "Manual",
            "ac": True,
            "daily_rate": 35,
        },
        {
            "code": "CDAR",
            "name": "Compact Auto",
            "example": "Volkswagen Golf Automatic or similar",
            "seats": 5,
            "bags": 3,
            "transmission": "Automatic",
            "ac": True,
            "daily_rate": 45,
        },
        {
            "code": "ICAR",
            "name": "Intermediate",
            "example": "Skoda Octavia or similar",
            "seats": 5,
            "bags": 4,
            "transmission": "Manual",
            "ac": True,
            "daily_rate": 50,
        },
        {
            "code": "IDAR",
            "name": "Intermediate Auto",
            "example": "Skoda Octavia Automatic or similar",
            "seats": 5,
            "bags": 4,
            "transmission": "Automatic",
            "ac": True,
            "daily_rate": 60,
        },
        {
            "code": "SVAR",
            "name": "SUV",
            "example": "Nissan Qashqai or similar",
            "seats": 5,
            "bags": 4,
            "transmission": "Automatic",
            "ac": True,
            "daily_rate": 75,
        },
        {
            "code": "FVAR",
            "name": "Full-size SUV",
            "example": "BMW X3 or similar",
            "seats": 5,
            "bags": 5,
            "transmission": "Automatic",
            "ac": True,
            "daily_rate": 95,
        },
        {
            "code": "PVAR",
            "name": "Premium",
            "example": "Mercedes C-Class or similar",
            "seats": 5,
            "bags": 4,
            "transmission": "Automatic",
            "ac": True,
            "daily_rate": 110,
        },
    ]
    
    providers = [
        {"code": "ZE", "name": "Hertz"},
        {"code": "ZI", "name": "Avis"},
        {"code": "ZD", "name": "Budget"},
        {"code": "ET", "name": "Enterprise"},
        {"code": "AL", "name": "Alamo"},
        {"code": "ZR", "name": "National"},
        {"code": "SX", "name": "Sixt"},
        {"code": "EP", "name": "Europcar"},
    ]
    
    offers = []
    for i, car in enumerate(car_categories[:count]):
        provider = random.choice(providers)
        
        # Add some price variation
        daily_rate = car["daily_rate"] + random.randint(-5, 10)
        total_price = daily_rate * num_days
        
        offers.append({
            "id": f"car_{i}_{provider['code']}",
            "provider": {
                "code": provider["code"],
                "name": provider["name"],
            },
            "vehicle": {
                "code": car["code"],
                "category": car["name"],
                "model": car["example"],
                "seats": car["seats"],
                "bags": car["bags"],
                "doors": 4,
                "transmission": car["transmission"],
                "air_conditioning": car["ac"],
                "fuel_policy": "Full-to-full",
            },
            "pickup": {
                "location_code": pickup_location,
                "date": pickup_date,
                "time": "10:00",
            },
            "dropoff": {
                "location_code": pickup_location,  # Same location return
                "date": dropoff_date,
                "time": "10:00",
            },
            "pricing": {
                "currency": "EUR",
                "daily_rate": daily_rate,
                "total_days": num_days,
                "subtotal": total_price,
                "taxes": round(total_price * 0.2, 2),
                "total": round(total_price * 1.2, 2),
            },
            "inclusions": [
                "Collision Damage Waiver",
                "Theft Protection",
                "Unlimited mileage",
                "Airport surcharge included",
            ],
            "exclusions": [
                "Fuel",
                "Additional driver (€10/day)",
                "GPS navigation (€8/day)",
                "Child seat (€5/day)",
            ],
            "_mock": True,
        })
    
    # Sort by price
    offers.sort(key=lambda x: x["pricing"]["total"])
    return offers


def _normalize_car_offer(offer: dict) -> dict:
    """Normalize car offer to consistent structure."""
    vehicle = offer.get("vehicle", {})
    pricing = offer.get("pricing", {})
    provider = offer.get("provider", {})
    
    return {
        "id": offer.get("id"),
        "provider_name": provider.get("name"),
        "provider_code": provider.get("code"),
        "category": vehicle.get("category"),
        "model": vehicle.get("model"),
        "seats": vehicle.get("seats"),
        "bags": vehicle.get("bags"),
        "transmission": vehicle.get("transmission"),
        "air_conditioning": vehicle.get("air_conditioning"),
        "fuel_policy": vehicle.get("fuel_policy"),
        "daily_rate": pricing.get("daily_rate"),
        "total_days": pricing.get("total_days"),
        "total_price": pricing.get("total"),
        "currency": pricing.get("currency", "EUR"),
        "inclusions": offer.get("inclusions", []),
        "exclusions": offer.get("exclusions", []),
        "_mock": offer.get("_mock", False),
    }


def format_car_offer_summary(offer: dict) -> str:
    """Format a car offer as a human-readable summary."""
    norm = _normalize_car_offer(offer) if "vehicle" in offer else offer
    
    return (
        f"{norm['category']} ({norm['model']}) - {norm['provider_name']}\n"
        f"  {norm['seats']} seats, {norm['bags']} bags, {norm['transmission']}\n"
        f"  Total: {norm['total_price']} {norm['currency']} for {norm['total_days']} days"
    )