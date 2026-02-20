# travel/services/amadeus.py

import os  # Read environment variables
import requests  # HTTP requests

def get_access_token():
    """
    Get Amadeus OAuth token.
    Reused by flight search and location search.
    """
    api_key = os.environ.get("AMADEUS_API_KEY")
    api_secret = os.environ.get("AMADEUS_API_SECRET")

    if not api_key or not api_secret:
        raise RuntimeError("AMADEUS_API_KEY / AMADEUS_API_SECRET missing")

    base_url = "https://test.api.amadeus.com"
    token_url = f"{base_url}/v1/security/oauth2/token"

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

def search_locations(keyword: str, limit: int = 5):
    """
    Use Amadeus Locations API to resolve a city/airport name to IATA codes.
    Returns a list of location objects.
    """
    base_url = "https://test.api.amadeus.com"
    token = get_access_token()

    url = f"{base_url}/v1/reference-data/locations"
    headers = {"Authorization": f"Bearer {token}"}

    # subType: CITY and AIRPORT gives best results
    params = {
        "keyword": keyword,
        "subType": "CITY,AIRPORT",
        "page[limit]": limit,
    }

    r = requests.get(url, headers=headers, params=params, timeout=30)
    r.raise_for_status()
    return r.json().get("data", [])

def search_flights(origin: str, destination: str, departure_date: str, adults: int = 1, return_date: str | None = None):
    """
    Search flights using Amadeus Flight Offers Search.
    - origin/destination are IATA codes (e.g. RIX, AMS)
    - departure_date is YYYY-MM-DD
    - return_date is optional (YYYY-MM-DD) for roundtrip
    """

    # Read keys from environment (.env should load into env variables)
    api_key = os.environ.get("AMADEUS_API_KEY")
    api_secret = os.environ.get("AMADEUS_API_SECRET")

    # Basic safety check
    if not api_key or not api_secret:
        raise RuntimeError("AMADEUS_API_KEY / AMADEUS_API_SECRET missing")

    # Choose base URL depending on your setup (example uses test environment)
    base_url = "https://test.api.amadeus.com"

    # 1) Get OAuth token from Amadeus
    token_url = f"{base_url}/v1/security/oauth2/token"
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
    access_token = token_resp.json()["access_token"]

    # 2) Call flight offers search
    offers_url = f"{base_url}/v2/shopping/flight-offers"

    # Request parameters
    params = {
        "originLocationCode": origin,
        "destinationLocationCode": destination,
        "departureDate": departure_date,
        "adults": adults,
        "currencyCode": "EUR",
        "max": 30,  # Return up to 30 offers (frontend can filter/sort)
    }

    # Add return date only if user requested roundtrip
    if return_date:
        params["returnDate"] = return_date

    # Auth headers
    headers = {"Authorization": f"Bearer {access_token}"}

    # Make request
    offers_resp = requests.get(offers_url, headers=headers, params=params, timeout=30)
    offers_resp.raise_for_status()

    # Return full JSON response
    return offers_resp.json()