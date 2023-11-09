from django.core.exceptions import PermissionDenied
from django.views.generic import TemplateView

from ..project.views import ProjectListView


class IndexView(TemplateView):
    template_name = "home/index.html"

    def get_project_queryset(self):
        if not self.request.user.is_authenticated:
            return []
        try:
            v = ProjectListView()
            v.setup(self.request, {})
            return v.get_queryset()
        except PermissionDenied:
            return []

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["projects"] = self.get_project_queryset()
        return context
