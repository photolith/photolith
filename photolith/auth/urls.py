from django.urls import path

from . import views


app_name = "photolith"


urlpatterns = [
    path("signup/", views.UserCreationView.as_view(), name="signup"),
    path("signup/done", views.UserCreationDoneView.as_view(), name="signup_done"),
]
