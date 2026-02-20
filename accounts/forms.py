# accounts/forms.py

from django import forms  # Form system
from django.contrib.auth.forms import UserCreationForm  # Secure user creation form
from .models import User  # Our custom user model


class SignUpForm(UserCreationForm):
    # Add fields we want to collect
    email = forms.EmailField(required=True)  # Email input
    first_name = forms.CharField(required=True)  # Name
    last_name = forms.CharField(required=True)  # Surname
    age = forms.IntegerField(required=False, min_value=0, max_value=130)  # Age validation

    class Meta:
        model = User  # Use our User model
        fields = ("username", "email", "first_name", "last_name", "age", "password1", "password2")
