from django.urls import path

from . import images, whoami

app_name = "photolith"


urlpatterns = [
    path("whoami/", whoami.WhoAmIView.as_view(), name="whoami"),
    path("images/", images.ImagesView.as_view(), name="images"),
    path("images/<int:image_id>/", images.ImageView.as_view(), name="image"),
]
