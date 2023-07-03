from django.urls import include, path

from . import views


app_name = "photolith"


urlpatterns = [
    path(
        "upload/", views.UploadView.as_view(http_method_names=["post"]), name="upload"
    ),
    path(
        "<uuid:basename>.<str:extension>", views.DownloadView.as_view(), name="download"
    ),
]
