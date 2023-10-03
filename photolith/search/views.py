import datetime
import itertools

from django.contrib.auth.mixins import PermissionRequiredMixin
from django.core.cache import cache
from django.views.generic import TemplateView
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views import View
from django.db.models import F, Subquery, Min, Max

from ..errors import json_errors
from ..models import Individual, MetaNumeric, MetaChar, MetaTx, Project, Taxonomy
from ..nullagg import NullAgg


class IndexView(PermissionRequiredMixin, TemplateView):
    permission_required = ("photolith.view_individual",)
    template_name = "search/index.html"

    def get_meta_fields(self):
        out = dict(
            created_at=dict(filter_name="dt_created_at"),
        )
        for m in MetaNumeric.objects.values("key").annotate(
            min=Min("value"), max=Max("value")
        ):
            out[m["key"]] = dict(
                filter_name="nm_%s" % m["key"], min=m["min"], max=m["max"]
            )

        for m in MetaChar.objects.values("key").annotate(x=NullAgg()):
            out[m["key"]] = dict(filter_name="ch_%s" % m["key"], char=True)

        # First work out a mapping of key to DB query names for all languages
        str_keys = dict(id="value__identifier")
        for f in Taxonomy._meta.fields:
            if f.name.startswith("str_"):
                str_keys[f.name] = "value__%s" % f.name

        for m in MetaTx.objects.values(*(["key"] + list(str_keys.values()))).annotate(
            x=NullAgg()
        ):
            if m["key"] not in out:
                out[m["key"]] = dict(filter_name="tx_%s" % m["key"], choices=[])
            out[m["key"]]["choices"].append({k: m[v] for k, v in str_keys.items()})

        return out

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["meta_fields"] = cache.get_or_set(
            "photolith_meta_fields",
            lambda: self.get_meta_fields(),
            timeout=600,  # Seconds
        )
        context["qs"] = self.request.META["QUERY_STRING"]
        if self.request.GET.get("project"):
            context["project"] = get_object_or_404(
                Project, pk=self.request.GET.get("project")
            )
        return context


class DataView(PermissionRequiredMixin, View):
    permission_required = ("photolith.view_individual",)

    def query(self):
        qs = Individual.objects
        qs = (
            qs.select_related("image")
            .prefetch_related("metanumeric_set")
            .prefetch_related("metachar_set")
            .prefetch_related("metadt_set")
            .prefetch_related("metatx_set")
            .prefetch_related("metatx_set__value")
            .annotate(image__content=F("image__content"))
        )

        # If searching for a project, only search within individuals part of project
        if "project" in self.request.GET:
            p = get_object_or_404(Project, pk=self.request.GET.get("project"))
            qs = qs.filter(project=p)

        for k, vs in self.request.GET.lists():
            if all(v == "" for v in vs):
                # Ignore all-blank entries, didn't fill in the form
                pass
            elif k == "dt_created_at":
                if len(vs) > 0 and vs[0]:
                    qs = qs.filter(created_at__gte=datetime.date.fromisoformat(vs[0]))
                if len(vs) > 1 and vs[1]:
                    # Date ls less than midinight the day after (i.e. filter is inclusive)
                    qs = qs.filter(
                        created_at__lt=datetime.date.fromisoformat(vs[1])
                        + datetime.timedelta(days=1)
                    )
            elif k.startswith("nm_"):
                vs = sorted(x for x in vs if x)  # Sort & remove empty strings
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
            elif k.startswith("dt_"):
                sq = MetaDT.objects.filter(key=k.replace("nm_", ""))
                vs = sorted(x for x in vs if x)  # Sort & remove empty strings
                if len(vs) > 0:
                    sq = sq.filter(value__gte=datetime.date.fromisoformat(vs[0]))
                if len(vs) > 1:
                    # Date ls less than midinight the day after (i.e. filter is inclusive)
                    sq = sq.filter(
                        value__lt=datetime.date.fromisoformat(vs[1])
                        + datetime.timedelta(days=1)
                    )
                qs = qs.filter(id__in=Subquery(sq))
            elif k.startswith("tx_"):
                qs = qs.filter(
                    id__in=Subquery(
                        MetaTx.objects.filter(
                            key=k.replace("tx_", ""),
                            value__in=Subquery(
                                Taxonomy.objects.filter(
                                    key=k.replace("tx_", ""),
                                    identifier__in=vs,
                                ).values("id")
                            ),
                        ).values("individual_id")
                    )
                )

        for ind in qs:
            out = {k: v for k, v in vars(ind).items() if not k.startswith("_")}
            out.update(ind.data)
            yield out

    @json_errors
    def get(self, *args, **kwargs):
        context = {}

        context["data"] = list(self.query())

        # TODO: Data from summary cols, i.e. age / rating
        return JsonResponse(context)
