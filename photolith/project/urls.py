from django.urls import path

from . import views

app_name = "photolith"


urlpatterns = [
    path("", views.ProjectListView.as_view(), name="index"),
    path("create/", views.ProjectCreateView.as_view(), name="create"),
    path("update/<slug:slug>/", views.ProjectUpdateView.as_view(), name="update"),
    path("delete/<slug:slug>/", views.ProjectDeleteView.as_view(), name="delete"),
]
