# accounts/views.py

from django.contrib.auth import login  # Log the user in after signup
from django.contrib.auth.decorators import login_required  # Protect views
from django.shortcuts import render, redirect  # Render templates + redirects
from .forms import SignUpForm  # Our signup form


def signup_view(request):
    # If user submitted the form
    if request.method == "POST":
        form = SignUpForm(request.POST)  # Bind POST data
        if form.is_valid():
            user = form.save()  # Create user (password hashed automatically)
            login(request, user)  # Start session
            return redirect("home")  # Go home
    else:
        form = SignUpForm()  # Empty form for GET
    return render(request, "accounts/signup.html", {"form": form})  # Render page


@login_required
def home_view(request):
    # Simple home page (only for logged-in users)
    return render(request, "home.html")
