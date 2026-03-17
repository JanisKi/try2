# travel/services/google_routes.py

import os
import requests


# ---------------------------------------------------------
# Google Routes API configuration
# ---------------------------------------------------------
GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY")


def _headers(field_mask: str):
    """
    Build Google Routes API headers.

    IMPORTANT:
    Google Routes API uses:
    - X-Goog-Api-Key
    - X-Goog-FieldMask

    Field masks are important because Google only returns
    the fields you explicitly request.
    """
    if not GOOGLE_MAPS_API_KEY:
        raise RuntimeError("GOOGLE_MAPS_API_KEY is missing")

    return {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": field_mask,
    }


def compute_transit_route(origin_address: str, destination_address: str, departure_time_iso: str | None = None):
    """
    Get a public transport route using Google Routes API.

    Parameters:
    - origin_address: plain address string
    - destination_address: plain address string
    - departure_time_iso: optional RFC3339 timestamp string

    Returns parsed JSON from Google Routes API.
    """
    body = {
        "origin": {
            "address": origin_address
        },
        "destination": {
            "address": destination_address
        },
        "travelMode": "TRANSIT",
        "computeAlternativeRoutes": False,
    }

    # Optional transit preferences
    body["transitPreferences"] = {
        # Allowed values can include:
        # BUS, TRAIN, SUBWAY, LIGHT_RAIL, RAIL
        "allowedTravelModes": ["BUS", "TRAIN", "SUBWAY", "LIGHT_RAIL", "RAIL"]
    }

    # Optional departure time for schedule-aware transit routing
    if departure_time_iso:
        body["departureTime"] = departure_time_iso

    field_mask = ",".join([
        "routes.duration",
        "routes.distanceMeters",
        "routes.legs.steps",
        "routes.legs.duration",
        "routes.legs.distanceMeters",
        "routes.legs.steps.navigationInstruction",
        "routes.legs.steps.transitDetails",
        "routes.legs.steps.travelMode",
        "routes.polyline.encodedPolyline",
    ])

    r = requests.post(
        GOOGLE_ROUTES_URL,
        headers=_headers(field_mask),
        json=body,
        timeout=30,
    )

    if not r.ok:
        try:
            error_body = r.json()
        except Exception:
            error_body = r.text

        raise requests.HTTPError(
            f"Google transit route failed: {r.status_code} {error_body}",
            response=r,
        )

    return r.json()


def summarize_transit_route(route_json: dict):
    """
    Convert Google transit route response into a small summary
    the frontend can display easily.
    """
    routes = route_json.get("routes", [])
    if not routes:
        raise RuntimeError("Google Routes returned no transit routes")

    route = routes[0]

    total_duration = route.get("duration")
    total_distance = route.get("distanceMeters")

    legs = route.get("legs", [])
    steps_out = []

    for leg in legs:
        for step in leg.get("steps", []):
            step_mode = step.get("travelMode", "")

            item = {
                "travel_mode": step_mode,
                "instruction": "",
                "duration": step.get("staticDuration") or step.get("duration"),
                "distance_meters": step.get("distanceMeters"),
            }

            nav = step.get("navigationInstruction", {})
            if nav.get("instructions"):
                item["instruction"] = nav["instructions"]

            transit = step.get("transitDetails")
            if transit:
                line = transit.get("transitLine", {})
                vehicle = line.get("vehicle", {})
                stop_details = transit.get("stopDetails", {})

                item["transit"] = {
                    "vehicle_type": vehicle.get("type"),
                    "line_name": line.get("name") or line.get("nameShort"),
                    "headsign": transit.get("headsign"),
                    "departure_stop": stop_details.get("departureStop", {}).get("name"),
                    "arrival_stop": stop_details.get("arrivalStop", {}).get("name"),
                }

            steps_out.append(item)

    return {
        "duration": total_duration,
        "distance_meters": total_distance,
        "steps": steps_out,
        "polyline": route.get("polyline", {}).get("encodedPolyline"),
    }