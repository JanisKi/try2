import os
import requests

# -----------------------------------------------------
# Amadeus configuration
# -----------------------------------------------------

AMADEUS_BASE_URL = os.getenv(
    "AMADEUS_BASE_URL",
    "https://test.api.amadeus.com"
)

AMADEUS_API_KEY = os.getenv("AMADEUS_API_KEY")
AMADEUS_API_SECRET = os.getenv("AMADEUS_API_SECRET")


def get_token():
    """
    Every Amadeus request requires OAuth token.
    """

    url = f"{AMADEUS_BASE_URL}/v1/security/oauth2/token"

    data = {
        "grant_type": "client_credentials",
        "client_id": AMADEUS_API_KEY,
        "client_secret": AMADEUS_API_SECRET
    }

    r = requests.post(url, data=data)
    r.raise_for_status()

    return r.json()["access_token"]


# -----------------------------------------------------
# Airport lookup
# -----------------------------------------------------

def search_airports(city_name):
    """
    Convert city -> airport codes

    Example:
        Paris -> CDG / ORY
    """

    token = get_token()

    url = f"{AMADEUS_BASE_URL}/v1/reference-data/locations"

    headers = {"Authorization": f"Bearer {token}"}

    params = {
        "subType": "AIRPORT",
        "keyword": city_name
    }

    r = requests.get(url, headers=headers, params=params)
    r.raise_for_status()

    return r.json()


# -----------------------------------------------------
# Flights
# -----------------------------------------------------

def search_flights(origin, destination, date, adults=1):

    token = get_token()

    url = f"{AMADEUS_BASE_URL}/v2/shopping/flight-offers"

    headers = {"Authorization": f"Bearer {token}"}

    params = {
        "originLocationCode": origin,
        "destinationLocationCode": destination,
        "departureDate": date,
        "adults": adults
    }

    r = requests.get(url, headers=headers, params=params)
    r.raise_for_status()

    return r.json()


# -----------------------------------------------------
# Hotels
# -----------------------------------------------------

def search_hotels(city_code, check_in, check_out):

    token = get_token()

    url = f"{AMADEUS_BASE_URL}/v2/shopping/hotel-offers"

    headers = {"Authorization": f"Bearer {token}"}

    params = {
        "cityCode": city_code,
        "checkInDate": check_in,
        "checkOutDate": check_out
    }

    r = requests.get(url, headers=headers, params=params)
    r.raise_for_status()

    return r.json()


# -----------------------------------------------------
# Cars
# -----------------------------------------------------

def search_cars(airport_code, pickup_date):

    token = get_token()

    url = f"{AMADEUS_BASE_URL}/v1/shopping/transfer-offers"

    headers = {"Authorization": f"Bearer {token}"}

    params = {
        "startLocationCode": airport_code,
        "startDateTime": pickup_date
    }

    r = requests.get(url, headers=headers, params=params)
    r.raise_for_status()

    return r.json()