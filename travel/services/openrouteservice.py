# travel/services/openrouteservice.py

import os
import requests

# ---------------------------------------------------------
# OpenRouteService base config
# ---------------------------------------------------------
ORS_BASE_URL = "https://api.openrouteservice.org"
ORS_API_KEY = os.environ.get("ORS_API_KEY")


def geocode_address(address: str):
    """
    Convert a human-readable address into coordinates.

    Example input:
        "Ogre Mednieku iela 23"

    Returns:
        {
            "lat": 56.816,
            "lon": 24.604,
            "label": "..."
        }

    Returns None if no result was found.
    """
    if not ORS_API_KEY:
        raise RuntimeError("ORS_API_KEY is missing")

    url = f"{ORS_BASE_URL}/geocode/search"

    params = {
        "api_key": ORS_API_KEY,
        "text": address,
        "size": 1,
    }

    r = requests.get(url, params=params, timeout=30)
    r.raise_for_status()

    data = r.json()
    features = data.get("features", [])

    if not features:
        return None

    feature = features[0]
    coords = feature["geometry"]["coordinates"]  # ORS returns [lon, lat]

    return {
        "lon": coords[0],
        "lat": coords[1],
        "label": feature.get("properties", {}).get("label", address),
    }


def route_driving(start_lat, start_lon, end_lat, end_lon):
    """
    Calculate a driving route between two points.

    IMPORTANT:
    - ORS expects coordinates in [lon, lat] order
    - We set radiuses to [-1, -1] so ORS can snap both points
      to the nearest routable road without the default 350 m limit
    """
    if not ORS_API_KEY:
        raise RuntimeError("ORS_API_KEY is missing")

    # ORS POST directions endpoint
    url = f"{ORS_BASE_URL}/v2/directions/driving-car/json"

    headers = {
        "Authorization": ORS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    body = {
        "coordinates": [
            [start_lon, start_lat],  # ORS wants [lon, lat]
            [end_lon, end_lat],      # ORS wants [lon, lat]
        ],

        # IMPORTANT FIX:
        # -1 means "maximum allowed snapping radius"
        # This helps when the airport geocode lands slightly away
        # from the road network or terminal access road.
        "radiuses": [-1, -1],
    }

    r = requests.post(url, json=body, headers=headers, timeout=30)

    if not r.ok:
        try:
            error_body = r.json()
        except Exception:
            error_body = r.text

        raise requests.HTTPError(
            f"ORS directions failed: {r.status_code} {error_body}",
            response=r,
        )

    data = r.json()
    routes = data.get("routes", [])

    if not routes:
        raise RuntimeError("ORS returned no routes")

    summary = routes[0]["summary"]

    return {
        "distance": summary["distance"],
        "duration": summary["duration"],
    }