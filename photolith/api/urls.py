from django.urls import path

from . import annotations, images, individuals, whoami

app_name = "photolith"


urlpatterns = [
    path("whoami/", whoami.WhoAmIView.as_view(), name="whoami"),
    path("images/", images.ImagesView.as_view(), name="images"),
    path("images/<int:image_id>/", images.ImageView.as_view(), name="image"),
    path(
        "images/<int:image_id>/individuals/",
        individuals.ImageIndividualsView.as_view(),
        name="image_individuals",
    ),
    path(
        "individuals/<int:individual_id>/",
        individuals.IndividualView.as_view(),
        name="individual",
    ),
    path(
        "individuals/<int:individual_id>/annotations/",
        annotations.IndividualAnnotationsView.as_view(),
        name="individual_annotations",
    ),
    path(
        "annotations/<int:annotation_id>/",
        annotations.AnnotationView.as_view(),
        name="annotation",
    ),
]
