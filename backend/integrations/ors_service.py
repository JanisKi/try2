import os
import requests

# -----------------------------------------------------
# OpenRouteService API configuration
# -----------------------------------------------------

ORS_API_KEY = os.getenv("ORS_API_KEY")

ORS_BASE_URL = "https://api.openrouteservice.org"


def geocode_address(address: str):
    """
    Convert address -> coordinates.

    Example:
        "Ogre Mednieku iela 23"

    Returns:
        {
            "lat": 56.816,
            "lon": 24.604
        }
    """

    url = f"{ORS_BASE_URL}/geocode/search"

    params = {
        "api_key": ORS_API_KEY,
        "text": address,
        "size": 1
    }

    r = requests.get(url, params=params)
    r.raise_for_status()

    data = r.json()

    if not data["features"]:
        return None

    coords = data["features"][0]["geometry"]["coordinates"]

    return {
        "lon": coords[0],
        "lat": coords[1]
    }


def route_driving(start_lat, start_lon, end_lat, end_lon):
    """
    Calculate route between two coordinates.

    Returns:
        distance (meters)
        duration (seconds)
    """

    url = f"{ORS_BASE_URL}/v2/directions/driving-car"

    headers = {
        "Authorization": ORS_API_KEY,
        "Content-Type": "application/json"
    }

    body = {
        "coordinates": [
            [start_lon, start_lat],
            [end_lon, end_lat]
        ]
    }

    r = requests.post(url, json=body, headers=headers)
    r.raise_for_status()

    data = r.json()

    summary = data["routes"][0]["summary"]

    return {
        "distance": summary["distance"],
        "duration": summary["duration"]
    }