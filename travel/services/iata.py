# travel/services/iata.py

from ..models import CityIata  # DB model for cached city -> IATA
from .amadeus import search_locations  # Amadeus location lookup


def normalize_city_name(name: str) -> str:
    """Clean up user input so DB matching works better."""
    return (name or "").strip()


def pick_best_iata(locations: list[dict]) -> str | None:
    """
    Pick best IATA code from Amadeus location results.
    Prefer CITY codes (like LON), else first available.
    """
    # Prefer city subtype first
    for loc in locations:
        if loc.get("subType") == "CITY" and loc.get("iataCode"):
            return loc["iataCode"]

    # Otherwise take first item with iataCode
    for loc in locations:
        if loc.get("iataCode"):
            return loc["iataCode"]

    return None


def city_to_iata(name: str, auto_fetch: bool = True) -> str | None:
    """
    Convert city name -> IATA.
    1) Try DB (CityIata)
    2) If not found and auto_fetch=True, ask Amadeus and save into DB
    """
    city = normalize_city_name(name)
    if not city:
        return None

    # 1) Try DB first
    row = CityIata.objects.filter(city__iexact=city).first()
    if row:
        return row.iata.upper()

    # 2) If auto_fetch disabled, stop here
    if not auto_fetch:
        return None

    # 3) Ask Amadeus locations API
    try:
        locations = search_locations(city, limit=5)
    except Exception:
        # Amadeus unavailable — return None rather than propagating a 500
        return None

    code = pick_best_iata(locations)
    if not code:
        return None

    # 4) Save it for future searches
    CityIata.objects.update_or_create(
        city=city,
        defaults={"iata": code.upper()},
    )

    return code.upper()