# travel/services/amadeus.py

import os
import requests

AMADEUS_BASE_URL = "https://test.api.amadeus.com"


class AmadeusProviderError(Exception):
    """Raised when Amadeus returns 5xx — their upstream fault, not ours."""
    def __init__(self, status_code, body):
        self.status_code = status_code
        self.body = body
        super().__init__(f"Amadeus provider error {status_code}: {body}")


class AmadeusClientError(Exception):
    """Raised when Amadeus returns 4xx — bad request / no results for that route."""
    def __init__(self, status_code, body):
        self.status_code = status_code
        self.body = body
        super().__init__(f"Amadeus client error {status_code}: {body}")


def get_access_token():
    """
    Get OAuth token for Amadeus Self-Service APIs.
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


def search_locations(keyword: str, limit: int = 10):
    """
    Search Amadeus locations for cities/airports.

    Example:
      "Amsterdam"
    """
    access_token = get_access_token()

    url = f"{AMADEUS_BASE_URL}/v1/reference-data/locations"

    headers = {
        "Authorization": f"Bearer {access_token}",
    }

    params = {
        "keyword": keyword,
        "subType": "CITY,AIRPORT",
        "page[limit]": limit,
    }

    resp = requests.get(url, headers=headers, params=params, timeout=30)
    resp.raise_for_status()

    return resp.json().get("data", [])


def pick_first_airport_iata(locations: list[dict]) -> str | None:
    """
    Prefer a concrete AIRPORT code over a CITY code.

    Example:
      Amsterdam -> AMS
      Paris -> CDG or ORY
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

    Returns parsed JSON.
    Raises HTTPError if Amadeus rejects the query.
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

    if not offers_resp.ok:
        try:
            error_body = offers_resp.json()
        except Exception:
            error_body = offers_resp.text

        if offers_resp.status_code >= 500:
            raise AmadeusProviderError(offers_resp.status_code, error_body)
        raise AmadeusClientError(offers_resp.status_code, error_body)

    return offers_resp.json()

def _amadeus_headers():
    return {"Authorization": f"Bearer {get_access_token()}"}

def search_hotels_by_city(city_code: str, radius: int = 20, radius_unit: str = "KM"):
    base_url = "https://test.api.amadeus.com"
    url = f"{base_url}/v1/reference-data/locations/hotels/by-city"

    r = requests.get(
        url,
        headers=_amadeus_headers(),
        params={
            "cityCode": city_code,
            "radius": radius,
            "radiusUnit": radius_unit,
            "hotelSource": "ALL",
        },
        timeout=30,
    )
    r.raise_for_status()
    return r.json().get("data", [])


def search_hotel_offers_by_hotel_id(
    hotel_id: str,
    adults: int,
    check_in_date: str,
    check_out_date: str,
    room_quantity: int = 1,
):
    base_url = "https://test.api.amadeus.com"
    url = f"{base_url}/v3/shopping/hotel-offers"

    r = requests.get(
        url,
        headers=_amadeus_headers(),
        params={
            "hotelIds": hotel_id,
            "adults": adults,
            "checkInDate": check_in_date,
            "checkOutDate": check_out_date,
            "roomQuantity": room_quantity,
        },
        timeout=30,
    )
    r.raise_for_status()
    return r.json().get("data", [])

def search_transfer_offers(
    start_location_code: str,
    end_address_line: str,
    end_geo_code: str,
    start_date_time: str,
    passengers: int = 1,
    transfer_type: str = "PRIVATE",
):
    """
    Search Amadeus transfer offers.

    Docs:
    POST /v1/shopping/transfer-offers
    """
    base_url = "https://test.api.amadeus.com"
    url = f"{base_url}/v1/shopping/transfer-offers"

    payload = {
        "startLocationCode": start_location_code,
        "endAddressLine": end_address_line,
        "endGeoCode": end_geo_code,   # "lat,lon"
        "startDateTime": start_date_time,
        "passengers": int(passengers or 1),
        "transferType": transfer_type or "PRIVATE",
    }

    r = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {get_access_token()}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30,
    )

    if not r.ok:
        try:
            error_body = r.json()
        except Exception:
            error_body = r.text
        if r.status_code >= 500:
            raise AmadeusProviderError(r.status_code, error_body)
        raise AmadeusClientError(r.status_code, error_body)

    return r.json().get("data", [])
