from django.urls import path
from .api_views import ChatSendView

urlpatterns = [
    path("send/", ChatSendView.as_view()),
]
