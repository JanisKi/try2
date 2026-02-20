# travelapp/urls.py

from django.contrib import admin  # Admin site
from django.urls import path, include  # URL tools

urlpatterns = [
    path("admin/", admin.site.urls),

    # ✅ Auth routes
    path("api/auth/", include("accounts.api_urls")),

    # ✅ Chat routes
    path("api/chat/", include("chatbot.api_urls")),

    # ✅ Travel routes
    path("api/travel/", include("travel.api_urls")),
]