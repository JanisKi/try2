# chatbot/api_urls.py

from django.urls import path

from .api_views import ChatSendView, GenerateTripPlanView

urlpatterns = [
    # Existing chat message endpoint
    path("send/", ChatSendView.as_view(), name="chat_send"),

    # NEW:
    # Called after user selects one flight and clicks "Generate plan"
    path("generate-trip-plan/", GenerateTripPlanView.as_view(), name="generate_trip_plan"),
]