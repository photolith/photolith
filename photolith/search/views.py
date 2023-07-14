from django.contrib.auth.mixins import PermissionRequiredMixin
from django.views.generic import TemplateView
from django.http import JsonResponse
from django.views import View
from django.db.models import F
from django.db.models.base import ModelState

from ..errors import json_errors
from ..models import Individual


class IndexView(PermissionRequiredMixin, TemplateView):
    permission_required = ("photolith.view_individual",)
    template_name = "search/index.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        return context


class DataView(PermissionRequiredMixin, View):
    permission_required = ("photolith.view_individual",)

    def query(self):
        qs = Individual.objects
        qs = qs.select_related("image").annotate(image__href=F("image__href"))

        def subitem(v):
            if isinstance(v, ModelState):
                return None  # Not JSON serialisable, not interesting anyway
            return v

        for ind in qs:
            out = {k: subitem(v) for k, v in vars(ind).items()}
            out["data"] = ind.data
            yield out

    @json_errors
    def get(self, *args, **kwargs):
        context = {}

        context["data"] = list(self.query())

        # TODO: Data from summary cols, i.e. age / rating
        return JsonResponse(context)
