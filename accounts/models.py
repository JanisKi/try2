# accounts/models.py

import uuid  # UUID generation
from django.contrib.auth.models import AbstractUser  # Base user model
from django.db import models  # Django model tools


class User(AbstractUser):
    # Public UUID you can safely expose in URLs or APIs
    public_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)

    # Make email required + unique
    email = models.EmailField(unique=True)

    # Optional age field (consider date_of_birth instead for real apps)
    age = models.PositiveSmallIntegerField(null=True, blank=True)

    def __str__(self) -> str:
        # Display username in admin/logs
        return self.username
