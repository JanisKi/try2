# chatbot/models.py

from django.conf import settings
from django.db import models


class ChatMessage(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)  # Owner
    role = models.CharField(max_length=16)  # "user" or "assistant"
    content = models.TextField()  # Message text
    created_at = models.DateTimeField(auto_now_add=True)  # Timestamp

    def __str__(self) -> str:
        return f"{self.user_id} {self.role}: {self.content[:40]}"


class TravelIntent(models.Model):
    """
    Stores parsed flight intent so you can reuse it later
    (e.g. flight widget auto-fills from the last chat request).
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)  # Owner
    raw_text = models.TextField()  # Original request text
    intent_type = models.CharField(max_length=32)  # e.g. "flight_search"

    origin = models.CharField(max_length=64, null=True, blank=True)  # Parsed origin city
    destination = models.CharField(max_length=64, null=True, blank=True)  # Parsed destination city

    departure_date = models.DateField(null=True, blank=True)
    return_date = models.DateField(null=True, blank=True)  # NEW: store return date if present

    adults = models.PositiveSmallIntegerField(default=1)

    # Optional filters (match your widget features)
    max_stops = models.PositiveSmallIntegerField(null=True, blank=True)  # 0 means direct-only
    budget = models.FloatField(null=True, blank=True)  # budget in EUR (MVP assumption)

    created_at = models.DateTimeField(auto_now_add=True)  # Timestamp

    def __str__(self) -> str:
        return f"{self.user_id} {self.intent_type} {self.origin}->{self.destination}"