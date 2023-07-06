from django.urls import include, path

from . import views


app_name = "photolith"


urlpatterns = [
    path("", views.IndexView.as_view(), name="index"),
    path("data/", views.DataView.as_view(), name="data"),
]
