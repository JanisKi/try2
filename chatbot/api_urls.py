# chatbot/api_urls.py

from django.urls import path

from .api_views import ChatSendView, GenerateTripPlanView, SearchHotelsView

urlpatterns = [
    # Existing chat message endpoint
    path("send/", ChatSendView.as_view(), name="chat_send"),

    path("search-hotels/", SearchHotelsView.as_view()),

    path("search-transfers/", SearchTransfersView.as_view()),
    # Called after user selects one flight and clicks "Generate plan"
    path("generate-trip-plan/", GenerateTripPlanView.as_view(), name="generate_trip_plan"),
]