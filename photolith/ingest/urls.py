from django.urls import include, path

from . import views


app_name = "photolith"


urlpatterns = [
    path("", views.IndexView.as_view(), name="index"),
    path(
        "next-photo/<slug:photo_dir>/", views.NextPhotoView.as_view(), name="next-photo"
    ),
]
