import csv
import datetime
import itertools

from django.contrib.auth.mixins import LoginRequiredMixin
from django.core.cache import cache
from django.views.generic import TemplateView
from django.http import JsonResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.views import View
from django.db.models import Prefetch, Subquery, Min, Max

from ..errors import json_errors
from ..models import (
    Annotation,
    Individual,
    MetaNumeric,
    MetaChar,
    MetaTx,
    Project,
    Taxonomy,
)
from ..nullagg import NullAgg
from ..perm_utils import check_annotate_access


class IndexView(LoginRequiredMixin, TemplateView):
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

        p = (
            get_object_or_404(Project, pk=self.request.GET.get("project"))
            if self.request.GET.get("project")
            else None
        )
        check_annotate_access(p, self.request.user, rw=False)

        context["meta_fields"] = cache.get_or_set(
            "photolith_meta_fields",
            lambda: self.get_meta_fields(),
            timeout=600,  # Seconds
        )
        context["qs"] = self.request.META["QUERY_STRING"]

        return context


class DataView(LoginRequiredMixin, View):
    def query(self, with_annotations="", with_image_url=False):
        qs = Individual.objects
        qs = (
            qs.select_related("image")
            .prefetch_related("metanumeric_set")
            .prefetch_related("metachar_set")
            .prefetch_related("metadt_set")
            .prefetch_related("metatx_set")
            .prefetch_related("metatx_set__value")
        )

        # If searching for a project, only search within individuals part of project
        p = (
            get_object_or_404(Project, pk=self.request.GET.get("project"))
            if self.request.GET.get("project")
            else None
        )
        check_annotate_access(p, self.request.user, rw=False)
        if p:
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

        if with_annotations:
            if with_annotations == "all" or with_annotations == "best":
                ann_qs = Annotation.objects.order_by("-authority", "-created_at")
            else:
                raise ValueError("Unknown annotations type '%s'" % with_annotations)
            qs = qs.prefetch_related(
                Prefetch(
                    "annotation_set",
                    queryset=ann_qs,
                    to_attr="_annotations",
                )
            )

        for ind in qs:
            out = {k: v for k, v in vars(ind).items() if not k.startswith("_")}
            out.update(ind.data)
            out["__str__"] = str(ind)

            if with_image_url:
                out["image__content__url"] = self.request.build_absolute_uri(
                    ind.image.content.url
                )

            if with_annotations and len(ind._annotations) > 0:
                px_to_mm = ind.image.px_to_mm()
                for a in ind._annotations:
                    a_out = dict(
                        age=a.age,
                        rating=a.rating,
                        authority=a.authority,
                        annotated_by=a.created_by,
                        annotated_at=a.created_at,
                        comment=a.comment,
                    )
                    if px_to_mm:
                        for i, x in enumerate(a.axis_poly_dists()):
                            a_out["growth_%d" % (i + 1)] = px_to_mm * x

                    yield {**out, **a_out}
                    if with_annotations == "best":
                        # Only want one annotation, stop now
                        break
            elif with_annotations:
                # Output row with dummy data
                a_out = dict(
                    age=None,
                    rating=None,
                    authority=None,
                    annotated_by=None,
                    annotated_at=None,
                    comment=None,
                )

                yield {**out, **a_out}
            else:
                yield out

    @json_errors
    def get(self, *args, **kwargs):
        context = {}

        context["data"] = list(self.query())

        return JsonResponse(context)


class ExportView(DataView):
    def get(self, *args, **kwargs):
        # https://docs.djangoproject.com/en/4.2/howto/outputting-csv/#streaming-large-csv-files
        def csv_rowgen(rows):
            class Echo:
                def write(self, value):
                    return value

            # Extract fieldnames by reading first row early
            try:
                first_row = next(rows)
                # NB: Cheat and assume fish are at most 20 years old, we don't know at this point
                fieldnames = [
                    k
                    for k in first_row.keys()
                    if k not in ("id", "image_id", "created_by_id", "__str__")
                ] + ["growth_%d" % i for i in range(1, 21)]
                # Put first row back again
                rows = itertools.chain([first_row], rows)
            except StopIteration:
                # Nothing in search, return empty CSV
                return

            writer = csv.writer(Echo())
            yield writer.writerow(fieldnames)
            for row in rows:
                row_out = []
                for n in fieldnames:
                    if isinstance(row.get(n), dict):  # Taxonomy
                        row_out.append(row[n]["id"])
                    elif isinstance(row.get(n), datetime.date):
                        row_out.append(row[n].isoformat())
                    else:
                        row_out.append(row.get(n))
                yield writer.writerow(row_out)

        return StreamingHttpResponse(
            csv_rowgen(
                self.query(
                    with_annotations=self.kwargs["with_annotations"],
                    with_image_url=True,
                )
            ),
            content_type="text/csv",
            headers={
                "Content-Disposition": 'attachment; filename="photolith-export.csv"'
            },
        )
