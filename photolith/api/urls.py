from django.urls import path

from . import whoami

app_name = "photolith"


urlpatterns = [
    path("whoami/", whoami.WhoAmIView.as_view(), name="whoami"),
]
