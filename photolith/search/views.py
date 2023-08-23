from django.contrib.auth.mixins import PermissionRequiredMixin
from django.views.generic import TemplateView
from django.http import JsonResponse
from django.views import View
from django.db.models import F, Subquery, Min, Max

from ..errors import json_errors
from ..models import Individual, MetaNumeric, MetaChar, MetaTx, Taxonomy
from ..nullagg import NullAgg


class IndexView(PermissionRequiredMixin, TemplateView):
    permission_required = ("photolith.view_individual",)
    template_name = "search/index.html"

    def get_meta_fields(self):
        out = {}
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
        context["meta_fields"] = self.get_meta_fields()
        return context


class DataView(PermissionRequiredMixin, View):
    permission_required = ("photolith.view_individual",)

    def query(self, pg_start, pg_end, order_cols):
        qs = Individual.objects
        qs = (
            qs.select_related("image")
            .prefetch_related("metanumeric_set")
            .prefetch_related("metachar_set")
            .prefetch_related("metatx_set")
            .prefetch_related("metatx_set__value")
            .annotate(image__href=F("image__href"))
        )

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

        for ind in qs:
            out = {k: v for k, v in vars(ind).items() if not k.startswith("_")}
            out["data"] = ind.data
            yield out

    @json_errors
    def get(self, *args, **kwargs):
        context = {}
        rows, total_count = self.query(
            # https://datatables.net/manual/server-side#Sent-parameters
            pg_start=self.request.GET.get("start", 0),
            pg_length=self.request.GET.get("pg_length", 10),
            order_cols=[
                dict(
                    col=self.request.GET[k],
                    dir=self.request.GET.get(k.replace("[column]", "[dir]"), 'asc'),
                ),
                for k in self.request.GET.keys()
                if k.startswith("order") and k.endswith("[column]")
            ],
        )

        # https://datatables.net/manual/server-side#Returned-data
        context["draw"] = self.request.GET.get("draw")
        context["recordsTotal"] = context["recordsFiltered"] = total_count
        context["data"] = list(rows)

        # TODO: Data from summary cols, i.e. age / rating
        return JsonResponse(context)
