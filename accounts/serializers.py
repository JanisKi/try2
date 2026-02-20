from django.contrib.auth import get_user_model  # gets your custom User model
from rest_framework import serializers          # DRF serialization tools

User = get_user_model()

class RegisterSerializer(serializers.ModelSerializer):
    # Password should never be returned in API responses
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ("username", "email", "first_name", "last_name", "age", "password")

    def create(self, validated_data):
        # Create user instance without saving password as plain text
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)  # hashes + salts password
        user.save()
        return user
