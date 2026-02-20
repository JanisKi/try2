# travel/admin.py

from django.contrib import admin  # Admin tools
from .models import CityIata  # Import model

@admin.register(CityIata)
class CityIataAdmin(admin.ModelAdmin):
    list_display = ("city", "iata")
    search_fields = ("city", "iata")
