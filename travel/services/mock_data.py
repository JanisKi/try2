# travel/services/mock_data.py
"""
Mock data for development when Amadeus API is unavailable.
Enable by setting USE_MOCK_DATA=true in environment or Django settings.
"""

import os
from datetime import datetime, timedelta
from typing import Optional
import random

# Check if mock mode is enabled
def is_mock_enabled() -> bool:
    """Check if mock data should be used."""
    return os.environ.get("USE_MOCK_DATA", "").lower() in ("true", "1", "yes")


# ---------------------------------------------------------------------------
# MOCK FLIGHT DATA
# ---------------------------------------------------------------------------

MOCK_AIRLINES = [
    {"code": "LH", "name": "Lufthansa"},
    {"code": "AF", "name": "Air France"},
    {"code": "KL", "name": "KLM"},
    {"code": "BA", "name": "British Airways"},
    {"code": "SK", "name": "SAS Scandinavian"},
    {"code": "AY", "name": "Finnair"},
    {"code": "LO", "name": "LOT Polish"},
    {"code": "BT", "name": "airBaltic"},
    {"code": "FR", "name": "Ryanair"},
    {"code": "W6", "name": "Wizz Air"},
]

MOCK_AIRPORTS = {
    "RIX": {"city": "Riga", "name": "Riga International Airport"},
    "LON": {"city": "London", "name": "London (All Airports)"},
    "LHR": {"city": "London", "name": "London Heathrow"},
    "LGW": {"city": "London", "name": "London Gatwick"},
    "STN": {"city": "London", "name": "London Stansted"},
    "AMS": {"city": "Amsterdam", "name": "Amsterdam Schiphol"},
    "CDG": {"city": "Paris", "name": "Paris Charles de Gaulle"},
    "ORY": {"city": "Paris", "name": "Paris Orly"},
    "FRA": {"city": "Frankfurt", "name": "Frankfurt Airport"},
    "MUC": {"city": "Munich", "name": "Munich Airport"},
    "BCN": {"city": "Barcelona", "name": "Barcelona El Prat"},
    "MAD": {"city": "Madrid", "name": "Madrid Barajas"},
    "FCO": {"city": "Rome", "name": "Rome Fiumicino"},
    "VNO": {"city": "Vilnius", "name": "Vilnius Airport"},
    "TLL": {"city": "Tallinn", "name": "Tallinn Airport"},
    "HEL": {"city": "Helsinki", "name": "Helsinki Vantaa"},
    "CPH": {"city": "Copenhagen", "name": "Copenhagen Kastrup"},
    "OSL": {"city": "Oslo", "name": "Oslo Gardermoen"},
    "ARN": {"city": "Stockholm", "name": "Stockholm Arlanda"},
    "WAW": {"city": "Warsaw", "name": "Warsaw Chopin"},
    "PRG": {"city": "Prague", "name": "Prague Vaclav Havel"},
    "VIE": {"city": "Vienna", "name": "Vienna International"},
    "ZRH": {"city": "Zurich", "name": "Zurich Airport"},
    "BRU": {"city": "Brussels", "name": "Brussels Airport"},
    "DUB": {"city": "Dublin", "name": "Dublin Airport"},
    "LIS": {"city": "Lisbon", "name": "Lisbon Portela"},
    "ATH": {"city": "Athens", "name": "Athens International"},
    "IST": {"city": "Istanbul", "name": "Istanbul Airport"},
}

# Map city codes to concrete airport codes
CITY_TO_AIRPORT = {
    "LON": ["LHR", "LGW", "STN"],
    "PAR": ["CDG", "ORY"],
    "MIL": ["MXP", "LIN"],
    "NYC": ["JFK", "EWR", "LGA"],
}


def _resolve_airport(code: str) -> str:
    """Resolve city code to a concrete airport code."""
    if code in CITY_TO_AIRPORT:
        return random.choice(CITY_TO_AIRPORT[code])
    return code


def _generate_flight_number(carrier: str) -> str:
    """Generate realistic flight number."""
    return f"{random.randint(100, 9999)}"


def _generate_mock_segment(
    origin: str,
    destination: str,
    departure_dt: datetime,
    carrier: dict,
    duration_minutes: int,
) -> dict:
    """Generate a single flight segment."""
    arrival_dt = departure_dt + timedelta(minutes=duration_minutes)
    
    return {
        "departure": {
            "iataCode": origin,
            "terminal": str(random.randint(1, 5)),
            "at": departure_dt.strftime("%Y-%m-%dT%H:%M:%S"),
        },
        "arrival": {
            "iataCode": destination,
            "terminal": str(random.randint(1, 5)),
            "at": arrival_dt.strftime("%Y-%m-%dT%H:%M:%S"),
        },
        "carrierCode": carrier["code"],
        "number": _generate_flight_number(carrier["code"]),
        "aircraft": {"code": random.choice(["320", "321", "737", "738", "E90", "AT7"])},
        "operating": {"carrierCode": carrier["code"]},
        "duration": f"PT{duration_minutes // 60}H{duration_minutes % 60}M",
        "id": f"seg_{random.randint(1000, 9999)}",
        "numberOfStops": 0,
        "blacklistedInEU": False,
    }


def generate_mock_flights(
    origin: str,
    destination: str,
    departure_date: str,
    adults: int = 1,
    return_date: Optional[str] = None,
    num_offers: int = 12,
) -> dict:
    """
    Generate mock flight offers that match Amadeus API structure.
    """
    origin = _resolve_airport(origin.upper())
    destination = _resolve_airport(destination.upper())
    
    dep_date = datetime.strptime(departure_date, "%Y-%m-%d")
    ret_date = datetime.strptime(return_date, "%Y-%m-%d") if return_date else None
    
    offers = []
    
    # Base prices vary by route "distance"
    base_prices = [89, 119, 145, 169, 199, 229, 259, 289, 319, 349, 399, 449]
    random.shuffle(base_prices)
    
    for i in range(num_offers):
        carrier = random.choice(MOCK_AIRLINES)
        is_direct = random.random() > 0.4  # 60% direct flights
        
        # Outbound flight
        dep_hour = random.randint(6, 21)
        dep_minute = random.choice([0, 15, 30, 45])
        outbound_departure = dep_date.replace(hour=dep_hour, minute=dep_minute)
        
        if is_direct:
            flight_duration = random.randint(120, 240)  # 2-4 hours direct
            outbound_segments = [
                _generate_mock_segment(
                    origin, destination, outbound_departure, carrier, flight_duration
                )
            ]
        else:
            # Connection flight
            connection_airport = random.choice(["FRA", "AMS", "CDG", "MUC", "VIE", "ZRH", "CPH"])
            leg1_duration = random.randint(60, 150)
            layover = random.randint(60, 180)
            leg2_duration = random.randint(60, 150)
            
            leg1_arrival = outbound_departure + timedelta(minutes=leg1_duration)
            leg2_departure = leg1_arrival + timedelta(minutes=layover)
            
            outbound_segments = [
                _generate_mock_segment(
                    origin, connection_airport, outbound_departure, carrier, leg1_duration
                ),
                _generate_mock_segment(
                    connection_airport, destination, leg2_departure, carrier, leg2_duration
                ),
            ]
        
        itineraries = [
            {
                "duration": f"PT{random.randint(2, 8)}H{random.randint(0, 59)}M",
                "segments": outbound_segments,
            }
        ]
        
        # Return flight if round trip
        if ret_date:
            ret_hour = random.randint(8, 22)
            ret_minute = random.choice([0, 15, 30, 45])
            return_departure = ret_date.replace(hour=ret_hour, minute=ret_minute)
            
            if is_direct:
                return_duration = random.randint(120, 240)
                return_segments = [
                    _generate_mock_segment(
                        destination, origin, return_departure, carrier, return_duration
                    )
                ]
            else:
                connection_airport = random.choice(["FRA", "AMS", "CDG", "MUC", "VIE", "ZRH", "CPH"])
                leg1_duration = random.randint(60, 150)
                layover = random.randint(60, 180)
                leg2_duration = random.randint(60, 150)
                
                leg1_arrival = return_departure + timedelta(minutes=leg1_duration)
                leg2_departure = leg1_arrival + timedelta(minutes=layover)
                
                return_segments = [
                    _generate_mock_segment(
                        destination, connection_airport, return_departure, carrier, leg1_duration
                    ),
                    _generate_mock_segment(
                        connection_airport, origin, leg2_departure, carrier, leg2_duration
                    ),
                ]
            
            itineraries.append(
                {
                    "duration": f"PT{random.randint(2, 8)}H{random.randint(0, 59)}M",
                    "segments": return_segments,
                }
            )
        
        # Calculate price
        base_price = base_prices[i % len(base_prices)]
        if ret_date:
            base_price = int(base_price * 1.8)  # Round trip markup
        if not is_direct:
            base_price = int(base_price * 0.85)  # Connection discount
        
        total_price = base_price * adults
        
        offer = {
            "type": "flight-offer",
            "id": str(i + 1),
            "source": "GDS",
            "instantTicketingRequired": False,
            "nonHomogeneous": False,
            "oneWay": ret_date is None,
            "lastTicketingDate": departure_date,
            "numberOfBookableSeats": random.randint(2, 9),
            "itineraries": itineraries,
            "price": {
                "currency": "EUR",
                "total": f"{total_price:.2f}",
                "base": f"{int(total_price * 0.85):.2f}",
                "fees": [{"amount": "0.00", "type": "SUPPLIER"}],
                "grandTotal": f"{total_price:.2f}",
            },
            "pricingOptions": {"fareType": ["PUBLISHED"], "includedCheckedBagsOnly": True},
            "validatingAirlineCodes": [carrier["code"]],
            "travelerPricings": [
                {
                    "travelerId": str(t + 1),
                    "fareOption": "STANDARD",
                    "travelerType": "ADULT",
                    "price": {
                        "currency": "EUR",
                        "total": f"{base_price:.2f}",
                        "base": f"{int(base_price * 0.85):.2f}",
                    },
                    "fareDetailsBySegment": [],
                }
                for t in range(adults)
            ],
        }
        
        offers.append(offer)
    
    # Sort by price
    offers.sort(key=lambda x: float(x["price"]["total"]))
    
    return {
        "meta": {"count": len(offers)},
        "data": offers,
        "dictionaries": {
            "carriers": {a["code"]: a["name"] for a in MOCK_AIRLINES},
        },
        "_mock": True,  # Flag to indicate this is mock data
    }


# ---------------------------------------------------------------------------
# MOCK HOTEL DATA
# ---------------------------------------------------------------------------

MOCK_HOTEL_NAMES = [
    "Grand Hotel Central",
    "Hotel Europa",
    "City Plaza Hotel",
    "The Royal Inn",
    "Riverside Suites",
    "Park View Hotel",
    "Metropolitan Lodge",
    "Harbor House Hotel",
    "The Garden Hotel",
    "Central Station Hotel",
    "Old Town Residence",
    "Skyline Hotel",
    "Comfort Inn Downtown",
    "Business Park Hotel",
    "Heritage Hotel",
]

MOCK_HOTEL_CHAINS = [
    "Independent",
    "Hilton",
    "Marriott",
    "Radisson",
    "Best Western",
    "Holiday Inn",
    "Novotel",
    "Ibis",
    "Premier Inn",
    "Scandic",
]


def generate_mock_hotels(
    city_code: str,
    check_in: str,
    check_out: str,
    adults: int = 1,
    num_results: int = 8,
    budget_remaining: Optional[float] = None,
) -> dict:
    """
    Generate mock hotel offers that match the expected structure.
    """
    city_info = MOCK_AIRPORTS.get(city_code.upper(), {"city": city_code, "name": city_code})
    city_name = city_info.get("city", city_code)
    
    # Calculate nights
    check_in_dt = datetime.strptime(check_in, "%Y-%m-%d")
    check_out_dt = datetime.strptime(check_out, "%Y-%m-%d")
    nights = (check_out_dt - check_in_dt).days
    
    hotels = []
    
    # Base nightly rates
    nightly_rates = [65, 79, 89, 99, 119, 139, 159, 179, 199, 229, 259, 299]
    random.shuffle(nightly_rates)
    
    for i in range(num_results):
        hotel_name = random.choice(MOCK_HOTEL_NAMES)
        chain = random.choice(MOCK_HOTEL_CHAINS)
        
        nightly_rate = nightly_rates[i % len(nightly_rates)]
        total_price = nightly_rate * nights
        
        # Skip if over budget
        if budget_remaining is not None and total_price > budget_remaining:
            continue
        
        hotel = {
            "hotel_id": f"MOCK{city_code.upper()}{i + 1:04d}",
            "offer_id": f"offer_{random.randint(10000, 99999)}",
            "name": f"{hotel_name} {city_name}",
            "address": f"{random.randint(1, 200)} {random.choice(['Main Street', 'Central Avenue', 'Park Road', 'Station Square', 'Old Town', 'Harbor View'])}, {city_name}",
            "geo": {
                "latitude": round(random.uniform(50.0, 60.0), 6),
                "longitude": round(random.uniform(0.0, 25.0), 6),
            },
            "check_in": check_in,
            "check_out": check_out,
            "price_total": total_price,
            "currency": "EUR",
            "price_total_eur": round(total_price, 2),
            "room_description": random.choice([
                "Standard Double Room with city view",
                "Superior Room with breakfast included",
                "Deluxe Room with king bed and minibar",
                "Business Room with desk and WiFi",
                "Comfort Room with balcony",
                "Classic Double Room",
                "Executive Suite with lounge access",
            ]),
            "rating": round(random.uniform(7.0, 9.5), 1),
            "chain": chain,
            "_mock": True,
        }
        
        hotels.append(hotel)
    
    # Sort by price
    hotels.sort(key=lambda x: x["price_total_eur"])
    
    return {
        "check_in": check_in,
        "check_out": check_out,
        "hotels": hotels,
        "_mock": True,
    }


# ---------------------------------------------------------------------------
# MOCK TRANSFER DATA
# ---------------------------------------------------------------------------

MOCK_TRANSFER_PROVIDERS = [
    {"name": "Airport Express", "type": "PRIVATE"},
    {"name": "City Shuttle", "type": "SHARED"},
    {"name": "Executive Cars", "type": "PRIVATE"},
    {"name": "Quick Transfer", "type": "PRIVATE"},
    {"name": "Budget Shuttle", "type": "SHARED"},
]

MOCK_VEHICLES = [
    {"name": "Economy Sedan", "seats": 3, "bags": 2},
    {"name": "Standard Sedan", "seats": 4, "bags": 3},
    {"name": "Premium Sedan", "seats": 3, "bags": 3},
    {"name": "Minivan", "seats": 6, "bags": 6},
    {"name": "Executive Van", "seats": 7, "bags": 8},
    {"name": "Luxury SUV", "seats": 4, "bags": 4},
]


def generate_mock_transfers(
    direction: str,
    pickup_address: str,
    dropoff_address: str,
    pickup_at: str,
    adults: int = 1,
    budget_remaining: Optional[float] = None,
) -> dict:
    """
    Generate mock transfer offers.
    """
    transfers = []
    
    base_prices = [35, 45, 55, 65, 85, 110]
    
    for i, (provider, vehicle) in enumerate(
        zip(MOCK_TRANSFER_PROVIDERS, MOCK_VEHICLES)
    ):
        if i >= len(base_prices):
            break
            
        price = base_prices[i]
        
        # Skip if over budget
        if budget_remaining is not None and price > budget_remaining:
            continue
        
        transfer = {
            "id": f"{direction}-mock-{i + 1}",
            "name": provider["name"],
            "vehicle": vehicle["name"],
            "passengers": min(vehicle["seats"], max(adults, 1)),
            "bags": vehicle["bags"],
            "currency": "EUR",
            "price_total": float(price),
            "price_total_eur": float(price),
            "pickup_address": pickup_address,
            "dropoff_address": dropoff_address,
            "pickup_at": pickup_at,
            "transfer_type": provider["type"],
            "_mock": True,
        }
        
        transfers.append(transfer)
    
    # Sort by price
    transfers.sort(key=lambda x: x["price_total_eur"])
    
    return {
        "title": f"{'Return' if direction == 'return' else 'Arrival'} airport transfer",
        "direction": direction,
        "pickup_address": pickup_address,
        "dropoff_address": dropoff_address,
        "pickup_at": pickup_at,
        "transfers": transfers,
        "provider_warning": "Using mock data — Amadeus API is currently unavailable.",
        "_mock": True,
    }


# ---------------------------------------------------------------------------
# MOCK LOCATION DATA
# ---------------------------------------------------------------------------

def generate_mock_locations(keyword: str, limit: int = 10) -> list:
    """
    Generate mock location search results.
    """
    keyword_lower = keyword.lower()
    
    results = []
    for code, info in MOCK_AIRPORTS.items():
        if (
            keyword_lower in code.lower()
            or keyword_lower in info["city"].lower()
            or keyword_lower in info["name"].lower()
        ):
            results.append({
                "type": "location",
                "subType": "AIRPORT",
                "name": info["name"],
                "iataCode": code,
                "address": {"cityName": info["city"]},
            })
            
            if len(results) >= limit:
                break
    
    return results
