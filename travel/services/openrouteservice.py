# travel/services/openrouteservice.py

import os
import requests

# Base URL for OpenRouteService
ORS_BASE_URL = "https://api.openrouteservice.org"

# Read API key from environment
ORS_API_KEY = os.environ.get("ORS_API_KEY")


def geocode_address(address: str):
    """
    Convert an address into coordinates using OpenRouteService.

    Example input:
        "Ogre Mednieku iela 23"

    Returns:
        {
            "lat": 56.816,
            "lon": 24.604
        }

    Or None if no match is found.
    """
    url = f"{ORS_BASE_URL}/geocode/search"

    params = {
        "api_key": ORS_API_KEY,
        "text": address,
        "size": 1,  # only need the best match
    }

    r = requests.get(url, params=params, timeout=30)
    r.raise_for_status()

    data = r.json()

    features = data.get("features", [])
    if not features:
        return None

    coords = features[0]["geometry"]["coordinates"]

    # ORS returns [lon, lat]
    return {
        "lon": coords[0],
        "lat": coords[1],
    }


def route_driving(start_lat, start_lon, end_lat, end_lon):
    """
    Calculate driving route between two coordinate points.

    Returns:
        {
            "distance": meters,
            "duration": seconds
        }
    """
    url = f"{ORS_BASE_URL}/v2/directions/driving-car"

    headers = {
        "Authorization": ORS_API_KEY,
        "Content-Type": "application/json",
    }

    body = {
        "coordinates": [
            [start_lon, start_lat],
            [end_lon, end_lat],
        ]
    }

    r = requests.post(url, json=body, headers=headers, timeout=30)
    r.raise_for_status()

    data = r.json()
    summary = data["routes"][0]["summary"]

    return {
        "distance": summary["distance"],
        "duration": summary["duration"],
    }