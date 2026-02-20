# accounts/urls.py

from django.urls import path  # URL tools
from django.contrib.auth import views as auth_views  # Built-in login/logout
from .views import signup_view, home_view  # Our views

urlpatterns = [
    path("", home_view, name="home"),  # Home
    path("signup/", signup_view, name="signup"),  # Sign up
    path("login/", auth_views.LoginView.as_view(template_name="accounts/login.html"), name="login"),  # Log in
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),  # Log out
]
