# chatbot/admin.py

from django.contrib import admin  # Admin tools
from .models import TravelIntent, ChatMessage  # Import models

@admin.register(TravelIntent)
class TravelIntentAdmin(admin.ModelAdmin):
    # Columns visible in admin list
    list_display = ("id", "user", "intent_type", "origin", "destination", "departure_date", "adults", "created_at")
    # Search bar fields
    search_fields = ("raw_text", "origin", "destination", "user__username")
    # Filters on right
    list_filter = ("intent_type", "created_at")

@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "role", "created_at")
    search_fields = ("content", "user__username")
    list_filter = ("role", "created_at")
