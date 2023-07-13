from django.urls import path

from . import views


app_name = "photolith"


urlpatterns = [
    path("<int:individual_id>/", views.AnnotateView.as_view(), name="annotate"),
    path(
        "<int:individual_id>/<int:annotation_id>",
        views.AnnotateView.as_view(),
        name="annotate_existing",
    ),
]
