# travel/services/amadeus.py

import os
import requests


# ---------------------------------------------------------
# Amadeus environment config
# ---------------------------------------------------------

AMADEUS_BASE_URL = "https://test.api.amadeus.com"


def get_access_token():
    """
    Get OAuth token from Amadeus.

    This token is needed for:
    - locations search
    - flight offers search
    """
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


def search_locations(keyword: str, limit: int = 5):
    """
    Resolve a user-entered city/airport name into Amadeus locations.

    Example:
        "Paris"

    Returns a list of location objects.
    """
    token = get_access_token()

    url = f"{AMADEUS_BASE_URL}/v1/reference-data/locations"
    headers = {"Authorization": f"Bearer {token}"}

    params = {
        "keyword": keyword,
        "subType": "CITY,AIRPORT",
        "page[limit]": limit,
    }

    r = requests.get(url, headers=headers, params=params, timeout=30)
    r.raise_for_status()

    return r.json().get("data", [])


def pick_first_airport_iata(locations: list[dict]) -> str | None:
    """
    Prefer a real AIRPORT code over a CITY code.

    This is useful when Flight Offers Search fails with a city code
    like PAR and we want to retry with CDG/ORY/etc.
    """
    for loc in locations:
        if loc.get("subType") == "AIRPORT" and loc.get("iataCode"):
            return loc["iataCode"].upper()

    return None


def search_flights(
    origin: str,
    destination: str,
    departure_date: str,
    adults: int = 1,
    return_date: str | None = None,
):
    """
    Search flights using Amadeus Flight Offers Search.

    Inputs:
    - origin: IATA code (airport or city)
    - destination: IATA code (airport or city)
    - departure_date: YYYY-MM-DD
    - adults: number of adult passengers
    - return_date: optional YYYY-MM-DD

    Returns:
    - parsed JSON response

    Raises:
    - requests.HTTPError if Amadeus returns an error
    """
    access_token = get_access_token()

    offers_url = f"{AMADEUS_BASE_URL}/v2/shopping/flight-offers"

    params = {
        "originLocationCode": origin,
        "destinationLocationCode": destination,
        "departureDate": departure_date,
        "adults": adults,
        "currencyCode": "EUR",
        "max": 30,
    }

    # Only send returnDate if it exists
    if return_date:
        params["returnDate"] = return_date

    headers = {
        "Authorization": f"Bearer {access_token}",
    }

    offers_resp = requests.get(
        offers_url,
        headers=headers,
        params=params,
        timeout=30,
    )

    # If request failed, include Amadeus response body in the Python exception.
    # This makes debugging MUCH easier than a generic 400.
    if not offers_resp.ok:
        try:
            error_body = offers_resp.json()
        except Exception:
            error_body = offers_resp.text

        raise requests.HTTPError(
            f"Amadeus flight search failed: {offers_resp.status_code} {error_body}",
            response=offers_resp,
        )

    return offers_resp.json()