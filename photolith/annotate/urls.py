from django.urls import path
from django.views.decorators.csrf import csrf_exempt

from . import views


app_name = "photolith"


urlpatterns = [
    path("", views.AnnotateStartView.as_view(), name="start"),
    path("<int:individual_id>/", views.AnnotateView.as_view(), name="annotate"),
    path(
        "<int:individual_id>/<int:annotation_id>",
        views.AnnotateView.as_view(),
        name="annotate_existing",
    ),
    path(
        "delete/<int:annotation_id>/",
        csrf_exempt(views.DeleteView.as_view(http_method_names=["post"])),
        name="annotate_delete",
    ),
    path(
        "<int:individual_id>/snippet/",
        views.AnnotateSnippetView.as_view(),
        name="annotate_snippet",
    ),
]
