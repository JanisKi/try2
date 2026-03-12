from datetime import timedelta

from integrations.որս_service import geocode_address, route_driving


def calculate_leave_time(flight_departure, driving_seconds):
    """
    User must be at airport 90 minutes before flight.

    leave_time =
        flight_time
        - 90 minutes
        - driving_time
    """

    return flight_departure - timedelta(minutes=90) - timedelta(seconds=driving_seconds)


def plan_route_to_airport(address, airport_coords, flight_time):

    start = geocode_address(address)

    route = route_driving(
        start["lat"],
        start["lon"],
        airport_coords["lat"],
        airport_coords["lon"]
    )

    leave_time = calculate_leave_time(
        flight_time,
        route["duration"]
    )

    return {
        "leave_home": leave_time,
        "drive_seconds": route["duration"],
        "distance": route["distance"]
    }