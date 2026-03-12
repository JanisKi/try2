# chatbot/views.py

import json
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponseBadRequest
from django.shortcuts import render

from .models import ChatMessage, TravelIntent
from .services import openrouter_chat, extract_flight_intent


@login_required
def chat_page(request):
    # Render chat UI page
    return render(request, "chatbot/chat.html")


@login_required
def chat_send(request):
    # Only allow POST
    if request.method != "POST":
        return HttpResponseBadRequest("POST required")

    # Decode JSON body
    body = json.loads(request.body.decode("utf-8"))
    prompt = (body.get("prompt") or "").strip()
    if not prompt:
        return HttpResponseBadRequest("prompt is required")

    # Store user message
    ChatMessage.objects.create(user=request.user, role="user", content=prompt)

    # Extract and store intent if it looks like a flight request
    intent = extract_flight_intent(prompt)
    if intent:
        # IMPORTANT:
        # Previously you only saved origin/destination.
        # Now we also save departure_date/return_date/adults/max_stops/budget.
        TravelIntent.objects.create(
            user=request.user,
            raw_text=prompt,
            intent_type=intent.get("intent_type") or "flight_search",
            origin=intent.get("origin"),
            destination=intent.get("destination"),
            departure_date=intent.get("departure_date"),
            return_date=intent.get("return_date"),
            adults=intent.get("adults") or 1,
            max_stops=intent.get("max_stops"),
            budget=intent.get("budget"),
        )

    # Build message list for OpenRouter (simple: last few messages)
    recent = ChatMessage.objects.filter(user=request.user).order_by("-created_at")[:10]
    messages = [{"role": m.role, "content": m.content} for m in reversed(recent)]

    # Call OpenRouter
    answer = openrouter_chat(messages)

    # Store assistant message
    ChatMessage.objects.create(user=request.user, role="assistant", content=answer)

    # Return JSON for frontend
    return JsonResponse({"answer": answer})