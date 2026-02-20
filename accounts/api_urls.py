# accounts/api_urls.py

from django.urls import path  # Django URL helper

# ✅ SimpleJWT built-in endpoints
# TokenObtainPairView = "login" (username/password -> access+refresh)
# TokenRefreshView    = "refresh" (refresh -> new access)
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

# ✅ Your own registration view (you already have this)
from .api_views import RegisterView

urlpatterns = [
    # Register a new user in your DB
    path("register/", RegisterView.as_view(), name="register"),

    # ✅ Login: returns {"access": "...", "refresh": "..."}
    path("login/", TokenObtainPairView.as_view(), name="login"),

    # ✅ Refresh: send {"refresh": "..."} to get new {"access": "..."}
    path("refresh/", TokenRefreshView.as_view(), name="refresh"),
]