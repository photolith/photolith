from django.contrib.auth.mixins import PermissionRequiredMixin
from django.views.generic import TemplateView
from django.http import JsonResponse
from django.views import View
from django.db.models import F, Subquery
from django.db.models.base import ModelState

from ..errors import json_errors
from ..models import Individual, MetaNumeric, MetaChar, MetaTx, Taxonomy


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

        for k, vs in self.request.GET.lists():
            if all(v == "" for v in vs):
                # Ignore all-blank entries, didn't fill in the form
                pass
            elif k.startswith("nm_"):
                if len(vs) != 2:
                    raise ValueError(
                        "Numeric searches should have 2 values: %s=%s"
                        % (k, "&".join(vs))
                    )
                qs = qs.filter(
                    id__in=Subquery(
                        MetaNumeric.objects.filter(
                            key=k.replace("nm_", ""),
                            value__gte=float(vs[0]),
                            value__lte=float(vs[1]),
                        ).values("individual_id")
                    )
                )
            elif k.startswith("ch_"):
                qs = qs.filter(
                    id__in=Subquery(
                        MetaChar.objects.filter(
                            key=k.replace("ch_", ""), value__in=vs
                        ).values("individual_id")
                    )
                )
            elif k.startswith("tx_"):
                qs = qs.filter(
                    id__in=Subquery(
                        MetaTx.objects.filter(
                            key=k.replace("tx_", ""),
                            value__in=Subquery(
                                Taxonomy.objects.filter(
                                    identifier__in=vs,
                                ).values("id")
                            ),
                        ).values("individual_id")
                    )
                )

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
