from django.db import models

class CityIata(models.Model):
    city = models.CharField(max_length=64, unique=True)   # e.g. "Riga"
    iata = models.CharField(max_length=8)                 # e.g. "RIX"

    def __str__(self):
        return f"{self.city} -> {self.iata}"
