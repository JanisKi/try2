# travel/services/ai_planner.py
"""
AI-powered travel itinerary planner using OpenRouter.

This service:
1. Takes raw place/tour data from Google Places, Viator, etc.
2. Uses AI to filter duplicates, rank quality, and create diverse recommendations
3. Generates day-by-day itineraries with timing and logistics

Uses existing OPENROUTER_API_KEY from your environment.
"""

import os
import json
import requests
from typing import Optional
from datetime import datetime, timedelta
import logging
import re

logger = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def get_api_key() -> str:
    """Get OpenRouter API key from environment."""
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY is missing")
    return key


def _call_openrouter(messages: list[dict], json_mode: bool = False, max_tokens: int = 2000) -> str:
    """Make a call to OpenRouter API."""
    api_key = get_api_key()
    model = os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini")
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
    }
    
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    
    response = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=60)
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"]


def filter_and_rank_places(
    places: list[dict],
    category: str,
    city_name: str,
    max_results: int = 8,
    user_preferences: Optional[str] = None,
) -> list[dict]:
    """
    Use AI to filter duplicates, remove chain restaurants, and rank by quality/uniqueness.
    
    This solves the "Lido problem" - where search results show many locations of 
    the same chain instead of diverse recommendations.
    
    Args:
        places: Raw places from Google Places API
        category: "restaurant", "attraction", or "activity"
        city_name: City name for context
        max_results: How many places to return
        user_preferences: Optional user preferences (e.g., "vegetarian", "family-friendly")
        
    Returns:
        Filtered and ranked list of places
    """
    if not places:
        return []
    
    # Prepare simplified place data for AI
    simplified_places = []
    for i, p in enumerate(places):
        simplified_places.append({
            "index": i,
            "name": p.get("name", "Unknown"),
            "rating": p.get("rating"),
            "review_count": p.get("review_count"),
            "price_level": p.get("price_level"),
            "types": p.get("types", [])[:3],
            "description": p.get("description", "")[:200] if p.get("description") else None,
        })
    
    preferences_text = f"\nUser preferences: {user_preferences}" if user_preferences else ""
    
    system_prompt = f"""You are a local travel expert helping tourists find the best {category}s in {city_name}.

Your job is to:
1. REMOVE duplicates and chain establishments (e.g., if "Lido" appears 5 times, keep only the best one)
2. PRIORITIZE unique, authentic, local establishments over chains
3. ENSURE diversity - mix different types/cuisines/experiences
4. RANK by a combination of rating, review count, and uniqueness
5. Consider the user's preferences if provided{preferences_text}

Return a JSON object with this structure:
{{
    "selected_indices": [list of indices from the input, in order of recommendation],
    "reasoning": "Brief explanation of your selections"
}}

Select up to {max_results} places. Be selective - quality over quantity."""

    user_prompt = f"Here are {len(simplified_places)} {category}s found in {city_name}. Select the best ones:\n\n{json.dumps(simplified_places, indent=2)}"
    
    try:
        response = _call_openrouter(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            json_mode=True,
        )
        
        result = json.loads(response)
        selected_indices = result.get("selected_indices", [])
        
        # Return the original places in the AI-selected order
        filtered_places = []
        for idx in selected_indices:
            if 0 <= idx < len(places):
                place = places[idx].copy()
                place["ai_recommended"] = True
                filtered_places.append(place)
        
        logger.info("AI filtered %d places down to %d for %s", len(places), len(filtered_places), category)
        return filtered_places
        
    except Exception as e:
        logger.warning("AI filtering failed, using fallback: %s", e)
        # Fallback: sort by rating and return top results
        sorted_places = sorted(places, key=lambda x: (x.get("rating") or 0, x.get("review_count") or 0), reverse=True)
        return sorted_places[:max_results]


def generate_day_itinerary(
    day_number: int,
    city_name: str,
    attractions: list[dict],
    restaurants: list[dict],
    tours: list[dict],
    hotel_address: Optional[str] = None,
    user_preferences: Optional[str] = None,
    start_time: str = "09:00",
    end_time: str = "21:00",
) -> dict:
    """
    Generate a single day's itinerary using AI.
    
    Args:
        day_number: Which day of the trip (1, 2, 3...)
        city_name: City name
        attractions: Available attractions
        restaurants: Available restaurants
        tours: Available tours/activities
        hotel_address: Hotel address for start/end point
        user_preferences: Optional preferences
        start_time: Day start time
        end_time: Day end time
        
    Returns:
        Day itinerary with timed activities
    """
    # Prepare condensed data for AI
    def condense(items, category):
        return [{"name": p.get("name"), "rating": p.get("rating"), "address": p.get("address", "")[:50]} 
                for p in (items or [])[:10]]
    
    available = {
        "attractions": condense(attractions, "attraction"),
        "restaurants": condense(restaurants, "restaurant"),
        "tours": condense(tours, "tour"),
    }
    
    preferences_text = f"User preferences: {user_preferences}" if user_preferences else "No specific preferences"
    hotel_text = f"Hotel: {hotel_address}" if hotel_address else "Hotel location not specified"
    
    system_prompt = f"""You are creating Day {day_number} of a trip to {city_name}.

{preferences_text}
{hotel_text}
Day hours: {start_time} to {end_time}

Create a realistic, enjoyable day plan with:
- Morning activity (attraction or tour)
- Lunch at a restaurant
- Afternoon activity (attraction or tour)
- Optional: coffee/snack break
- Dinner at a restaurant
- Optional: evening activity

Consider:
- Travel time between locations (15-30 min in a city)
- Typical visit durations (museums 1.5-2h, walking tours 2-3h, meals 1-1.5h)
- Logical geographic grouping to minimize travel

Return a JSON object:
{{
    "day_number": {day_number},
    "theme": "Brief theme for the day (e.g., 'Historic Old Town')",
    "activities": [
        {{
            "time": "09:00",
            "end_time": "11:30",
            "type": "attraction|restaurant|tour|break",
            "name": "Place name",
            "description": "What you'll do here",
            "tips": "Insider tip or practical advice"
        }}
    ],
    "total_estimated_cost": 0,
    "walking_distance_km": 0
}}"""

    user_prompt = f"Create Day {day_number} using these options:\n\n{json.dumps(available, indent=2)}"
    
    try:
        response = _call_openrouter(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            json_mode=True,
            max_tokens=1500,
        )
        
        itinerary = json.loads(response)
        itinerary["_generated"] = True
        return itinerary
        
    except Exception as e:
        logger.error("Day itinerary generation failed: %s", e)
        # Return basic fallback itinerary
        return _fallback_day_itinerary(day_number, city_name, attractions, restaurants, tours)


def generate_full_trip_itinerary(
    city_name: str,
    num_days: int,
    check_in_date: str,
    attractions: list[dict],
    restaurants: list[dict],
    tours: list[dict],
    hotel_address: Optional[str] = None,
    user_preferences: Optional[str] = None,
    budget_remaining: Optional[float] = None,
) -> dict:
    """
    Generate a complete multi-day trip itinerary.
    
    Args:
        city_name: Destination city
        num_days: Number of days
        check_in_date: Check-in date (YYYY-MM-DD)
        attractions: Available attractions
        restaurants: Available restaurants
        tours: Available tours
        hotel_address: Hotel location
        user_preferences: User preferences
        budget_remaining: Remaining budget after flights/hotel
        
    Returns:
        Complete trip itinerary
    """
    check_in = datetime.strptime(check_in_date, "%Y-%m-%d")
    
    days = []
    used_places = set()  # Track what we've already scheduled
    
    for day_num in range(1, num_days + 1):
        current_date = check_in + timedelta(days=day_num - 1)
        
        # Filter out already-used places for variety
        available_attractions = [a for a in attractions if a.get("name") not in used_places]
        available_restaurants = [r for r in restaurants if r.get("name") not in used_places]
        available_tours = [t for t in tours if t.get("name") not in used_places]
        
        # Adjust start/end time for first/last day
        start_time = "14:00" if day_num == 1 else "09:00"  # Arrival day starts later
        end_time = "12:00" if day_num == num_days else "21:00"  # Departure day ends earlier
        
        day_itinerary = generate_day_itinerary(
            day_number=day_num,
            city_name=city_name,
            attractions=available_attractions,
            restaurants=available_restaurants,
            tours=available_tours,
            hotel_address=hotel_address,
            user_preferences=user_preferences,
            start_time=start_time,
            end_time=end_time,
        )
        
        day_itinerary["date"] = current_date.strftime("%Y-%m-%d")
        day_itinerary["day_of_week"] = current_date.strftime("%A")
        days.append(day_itinerary)
        
        # Mark places as used
        for activity in day_itinerary.get("activities", []):
            used_places.add(activity.get("name"))
    
    return {
        "city": city_name,
        "check_in": check_in_date,
        "check_out": (check_in + timedelta(days=num_days)).strftime("%Y-%m-%d"),
        "num_days": num_days,
        "hotel_address": hotel_address,
        "budget_remaining": budget_remaining,
        "days": days,
        "_generated": True,
    }


def _fallback_day_itinerary(day_number: int, city_name: str, attractions: list, restaurants: list, tours: list) -> dict:
    """Generate a basic fallback itinerary when AI fails."""
    activities = []
    
    if attractions:
        activities.append({
            "time": "10:00",
            "end_time": "12:00",
            "type": "attraction",
            "name": attractions[0].get("name", "Morning attraction"),
            "description": "Morning visit",
            "tips": "Arrive early to avoid crowds",
        })
    
    if restaurants:
        activities.append({
            "time": "12:30",
            "end_time": "13:30",
            "type": "restaurant",
            "name": restaurants[0].get("name", "Lunch spot"),
            "description": "Lunch break",
            "tips": "Try the local specialties",
        })
    
    if len(attractions) > 1:
        activities.append({
            "time": "14:00",
            "end_time": "16:30",
            "type": "attraction",
            "name": attractions[1].get("name", "Afternoon attraction"),
            "description": "Afternoon exploration",
            "tips": "Take your time here",
        })
    
    if len(restaurants) > 1:
        activities.append({
            "time": "19:00",
            "end_time": "20:30",
            "type": "restaurant",
            "name": restaurants[1].get("name", "Dinner restaurant"),
            "description": "Dinner",
            "tips": "Make a reservation if possible",
        })
    
    return {
        "day_number": day_number,
        "theme": f"Exploring {city_name}",
        "activities": activities,
        "total_estimated_cost": 50,
        "walking_distance_km": 5,
        "_fallback": True,
    }


def suggest_activities_for_preferences(
    city_name: str,
    user_preferences: str,
    available_activities: list[dict],
) -> list[dict]:
    """
    Use AI to match user preferences to available activities.
    
    Args:
        city_name: City name
        user_preferences: What the user likes (e.g., "I love history and local food")
        available_activities: List of available activities/tours
        
    Returns:
        Matched and ranked activities
    """
    if not available_activities:
        return []
    
    # Prepare simplified activity data
    simplified = []
    for i, a in enumerate(available_activities[:20]):
        simplified.append({
            "index": i,
            "name": a.get("name"),
            "description": a.get("description", "")[:150] if a.get("description") else a.get("short_description", "")[:150],
            "categories": a.get("categories", [])[:3],
            "rating": a.get("rating"),
            "price": a.get("price_from"),
        })
    
    system_prompt = f"""You are a personal travel concierge for someone visiting {city_name}.

The traveler said: "{user_preferences}"

Match their preferences to these available activities and rank them by relevance.
Return a JSON object:
{{
    "matched_indices": [list of indices in order of recommendation],
    "why_these_match": "Brief explanation of why these activities match their preferences"
}}

Select up to 5 best matches. Only include activities that genuinely match their interests."""

    user_prompt = f"Available activities:\n\n{json.dumps(simplified, indent=2)}"
    
    try:
        response = _call_openrouter(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            json_mode=True,
        )
        
        result = json.loads(response)
        matched_indices = result.get("matched_indices", [])
        
        matched = []
        for idx in matched_indices:
            if 0 <= idx < len(available_activities):
                activity = available_activities[idx].copy()
                activity["preference_match"] = True
                activity["match_reason"] = result.get("why_these_match", "")
                matched.append(activity)
        
        return matched
        
    except Exception as e:
        logger.warning("Activity matching failed: %s", e)
        return available_activities[:5]