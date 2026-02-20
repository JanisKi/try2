# chatbot/models.py

from django.conf import settings  # AUTH_USER_MODEL
from django.db import models  # Models


class ChatMessage(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)  # Owner
    role = models.CharField(max_length=16)  # "user" or "assistant"
    content = models.TextField()  # Message text
    created_at = models.DateTimeField(auto_now_add=True)  # Timestamp


class TravelIntent(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)  # Owner
    raw_text = models.TextField()  # Original request text
    intent_type = models.CharField(max_length=32)  # e.g. "flight_search"
    origin = models.CharField(max_length=64, null=True, blank=True)  # Parsed origin
    destination = models.CharField(max_length=64, null=True, blank=True)  # Parsed destination
    created_at = models.DateTimeField(auto_now_add=True)  # Timestamp

    departure_date = models.DateField(null=True, blank=True)
    adults = models.PositiveSmallIntegerField(default=1)

    created_at = models.DateTimeField(auto_now_add=True)