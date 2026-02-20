# chatbot/views.py

import json  # Parse JSON
from django.contrib.auth.decorators import login_required  # Require login
from django.http import JsonResponse, HttpResponseBadRequest  # Responses
from django.shortcuts import render  # Render templates
from .models import ChatMessage, TravelIntent  # DB models
from .services import openrouter_chat, extract_flight_intent  # Logic


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

    prompt = (body.get("prompt") or "").strip()  # Get user prompt
    if not prompt:
        return HttpResponseBadRequest("prompt is required")

    # Store user message
    ChatMessage.objects.create(user=request.user, role="user", content=prompt)

    # Extract and store intent if it looks like a flight search
    intent = extract_flight_intent(prompt)
    if intent:
        TravelIntent.objects.create(
            user=request.user,
            raw_text=prompt,
            intent_type=intent["intent_type"],
            origin=intent["origin"],
            destination=intent["destination"],
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
