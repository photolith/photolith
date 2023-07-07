from django.urls import path

from . import views
from . import view_upload


app_name = "photolith"


urlpatterns = [
    path("", views.IndexView.as_view(), name="index"),
    path(
        "next-photo/<slug:photo_dir>/", views.NextPhotoView.as_view(), name="next-photo"
    ),
    path(
        "upload/",
        view_upload.UploadView.as_view(http_method_names=["post"]),
        name="upload",
    ),
]
