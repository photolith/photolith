from django.contrib.auth.mixins import PermissionRequiredMixin
from django.views.generic import TemplateView
from django.forms.models import model_to_dict
from django.http import JsonResponse
from django.views import View

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

    @json_errors
    def get(self, *args, **kwargs):
        context = {}
        context["data"] = [
            {
                **model_to_dict(x),
                **dict(image=x.image.href, data=x.data),
            }
            for x in Individual.objects.all()
        ]
        # TODO: Data from summary cols, i.e. age / rating
        return JsonResponse(context)
