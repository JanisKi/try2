# chatbot/urls.py

from django.urls import path  # URL tools
from .views import chat_page, chat_send  # Views
from . import urls_extended

urlpatterns = [
    path("", chat_page, name="chat_page"),  # Page
    path("api/send/", chat_send, name="chat_send"),  # AJAX endpoint
]
urlpatterns += urls_extended.urlpatterns