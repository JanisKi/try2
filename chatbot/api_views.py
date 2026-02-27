# chatbot/api_views.py

from rest_framework.views import APIView  # Base DRF view
from rest_framework.response import Response  # JSON responses
from rest_framework import permissions  # Auth permissions

from .models import ChatMessage, TravelIntent  # DB models
from .services import extract_flight_intent, openrouter_chat  # Parsing + LLM

from travel.services.iata import city_to_iata  # City -> IATA mapping
from travel.services.amadeus import search_flights  # Amadeus search


def build_preview(amadeus_json: dict, limit: int = 8):
    """
    Create a small preview list so we can show something quickly.
    Frontend can request full results again if needed.
    """
    offers = (amadeus_json or {}).get("data") or []

    # Sort by price.total (cheapest first)
    def price_num(o):
        try:
            return float(o.get("price", {}).get("total", "999999"))
        except:
            return 999999.0

    offers = sorted(offers, key=price_num)[:limit]

    preview = []
    for o in offers:
        preview.append(o)  # For MVP, include the whole offer object (frontend already knows how to render)
    return preview


class ChatSendView(APIView):
    # Require login for chat (your current setup)
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        # Read prompt from request JSON body
        prompt = (request.data.get("prompt") or "").strip()

        # Validate
        if not prompt:
            return Response({"detail": "prompt is required"}, status=400)

        # Save the user message in DB
        ChatMessage.objects.create(user=request.user, role="user", content=prompt)

        # Try to detect a flight request from the prompt
        intent = extract_flight_intent(prompt)

        # Default response fields
        answer = None
        flight_widget = None

        # If it looks like a flight request, build a flight widget response
        if intent and intent.get("intent_type") == "flight_search":
            # Save intent row in DB
            intent_obj = TravelIntent.objects.create(
                user=request.user,
                raw_text=prompt,
                intent_type="flight_search",
                origin=intent.get("origin"),
                destination=intent.get("destination"),
                departure_date=intent.get("departure_date"),
                adults=intent.get("adults") or 1,
            )

            # Convert city names to IATA (from DB mapping)
            origin_iata = city_to_iata(intent.get("origin"))
            dest_iata = city_to_iata(intent.get("destination"))

            # If user typed an IATA code directly, accept it as fallback
            if not origin_iata and intent.get("origin") and len(intent["origin"].strip()) == 3:
                origin_iata = intent["origin"].strip().upper()

            if not dest_iata and intent.get("destination") and len(intent["destination"].strip()) == 3:
                dest_iata = intent["destination"].strip().upper()

            # If we have a date and both IATAs, we can search immediately
            if intent.get("departure_date") and origin_iata and dest_iata:
                # Call Amadeus
                amadeus_json = search_flights(
                    origin=origin_iata,
                    destination=dest_iata,
                    departure_date=str(intent["departure_date"]),
                    adults=int(intent.get("adults") or 1),
                    return_date=str(intent["return_date"]) if intent.get("return_date") else None,
                )

                # Build flight widget payload for frontend
                flight_widget = {
                        "origin_city": intent.get("origin"),
                        "destination_city": intent.get("destination"),
                        "origin_iata": origin_iata,
                        "destination_iata": dest_iata,
                        "departure_date": str(intent["departure_date"]),
                        "adults": int(intent.get("adults") or 1),

                        # ✅ NEW: pass these to frontend widget
                        "return_date": str(intent["return_date"]) if intent.get("return_date") else "",
                        "return_enabled": bool(intent.get("return_date")),
                        "max_stops": intent.get("max_stops"),  # 0 means direct-only
                        "budget": intent.get("budget"), 

                        "offers": build_preview(amadeus_json, limit=12),
                    }

                # IMPORTANT: Use our own answer text (no Google Flights message)
                answer = (
                    f"Found flights for {origin_iata} → {dest_iata} on {flight_widget['departure_date']} "
                    f"for {flight_widget['adults']} adult(s). You can refine below."
                )
            else:
                # Not enough info or cannot map cities → do NOT say "use Google Flights"
                answer = (
                    "I saved your flight request. "
                    "To search, I need a departure date and valid airport/city codes. "
                    "Try: 'flight from Riga to Amsterdam tomorrow for 2 adults'."
                )

        # If it is NOT a flight request, use OpenRouter normally
        if answer is None:
            try:
                system = {
                    "role": "system",
                    "content": (
                        "You are a travel assistant inside a flight-search app. "
                        "Do NOT tell the user to use Google Flights/Skyscanner/Kayak. "
                        "If the user asks for flights, ask for missing details (from/to/date/adults/return) "
                        "or tell them to use the flight widget in the app."
                    ),
                }

                # Keep context short (existing code)
                recent = ChatMessage.objects.filter(user=request.user).order_by("-created_at")[:10]
                messages = [{"role": m.role, "content": m.content} for m in reversed(recent)]

                # Prepend system message
                messages = [system] + messages

                # Call OpenRouter
                answer = openrouter_chat(messages)

            except Exception as e:
                # If OpenRouter fails, return a helpful message instead of "no response"
                answer = f"Sorry — chat request failed: {str(e)}"

        # Save assistant message to DB
        ChatMessage.objects.create(user=request.user, role="assistant", content=answer)

        # Return JSON to frontend
        return Response({
            "answer": answer,
            "flight_widget": flight_widget,  # either None or data for UI
        })
