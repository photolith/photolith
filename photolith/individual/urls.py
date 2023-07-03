from django.urls import include, path

from . import views


app_name = "photolith"


urlpatterns = [
    path(
        "upload/", views.UploadView.as_view(http_method_names=["post"]), name="upload"
    ),
]
