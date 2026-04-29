import datetime

from django.contrib.auth.mixins import LoginRequiredMixin
from django.conf import settings
from django.core.cache import cache
from django.views.generic import TemplateView
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _
from django.views import View
from django.db.models import Count, Exists, OuterRef, Prefetch, Subquery, Min, Max, Q

from ..errors import json_errors
from ..models import (
    Annotation,
    Individual,
    MetaNumeric,
    MetaInteger,
    MetaChar,
    MetaTx,
    MetaDT,
    Project,
    Taxonomy,
)
from ..response_csv import StreamingCsvResponse
from ..response_json import StreamingJsonResponse
from ..nullagg import NullAgg
from ..perm_utils import check_annotate_access


class IndexView(LoginRequiredMixin, TemplateView):
    template_name = "search/index.html"

    def get_meta_fields(self):
        out = dict(
            dt_created_at=dict(),
        )
        for m in MetaNumeric.objects.values("key").annotate(
            min=Min("value"), max=Max("value")
        ):
            out["nm_" + m["key"]] = dict(min=m["min"], max=m["max"])

        for m in MetaInteger.objects.values("key").annotate(
            min=Min("value"), max=Max("value")
        ):
            out["in_" + m["key"]] = dict(min=m["min"], max=m["max"])

        for m in MetaChar.objects.values("key").annotate(x=NullAgg()):
            out["ch_" + m["key"]] = dict(char=True)

        # First work out a mapping of key to DB query names for all languages
        str_keys = dict(id="value__identifier")
        for f in Taxonomy._meta.fields:
            if f.name.startswith("str_"):
                str_keys[f.name] = "value__%s" % f.name

        for tx in Taxonomy.objects.all().order_by("key", "identifier"):
            out.setdefault("tx_" + tx.key, dict(choices=[]))["choices"].append(tx.dict)

        return out

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        p = (
            get_object_or_404(Project, pk=self.request.GET.get("project"))
            if self.request.GET.get("project")
            else None
        )
        check_annotate_access(p, self.request.user, rw=False)
        context["project"] = p

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

        # Count annotations within this project / general annotations
        # NB: In theory we'd also check if the project is open, and only count our annotations,
        #     but this view is only accessible once a project is over / owners who can see everything.
        qs = qs.annotate(
            num_annotations=Count(
                "annotation",
                filter=Q(
                    annotation__project=p,
                ),
            )
        )

        for k, vs in self.request.GET.lists():
            if all(v == "" for v in vs):
                # Ignore all-blank entries, didn't fill in the form
                pass
            elif k == "dt_created_at":
                while len(vs) < 2:
                    vs.append(vs[0])
                if vs[0] != "":
                    qs = qs.filter(
                        created_at__date__gte=datetime.date.fromisoformat(vs[0])
                    )
                if vs[1] != "":
                    # Date ls less than midinight the day after (i.e. filter is inclusive)
                    qs = qs.filter(
                        created_at__date__lt=datetime.date.fromisoformat(vs[1])
                        + datetime.timedelta(days=1)
                    )
            elif k.startswith("nm_"):
                sq = MetaNumeric.objects.filter(
                    individual_id=OuterRef("id"),
                    key=k.replace("nm_", ""),
                )
                while len(vs) < 2:  # Range filter, should always have a pair of values
                    vs.append(vs[0])
                if vs[0] != "":
                    sq = sq.filter(value__gte=float(vs[0]))
                if vs[1] != "":
                    sq = sq.filter(value__lte=float(vs[1]))
                qs = qs.filter(Exists(sq))
            elif k.startswith("in_"):
                sq = MetaInteger.objects.filter(
                    individual_id=OuterRef("id"),
                    key=k.replace("in_", ""),
                )
                while len(vs) < 2:
                    vs.append(vs[0])
                if vs[0] != "":
                    sq = sq.filter(value__gte=int(vs[0]))
                if vs[1] != "":
                    sq = sq.filter(value__lte=int(vs[1]))
                qs = qs.filter(Exists(sq))
            elif k.startswith("ch_"):
                qs = qs.filter(
                    Exists(
                        MetaChar.objects.filter(
                            individual_id=OuterRef("id"),
                            key=k.replace("ch_", ""),
                            value__in=vs,
                        )
                    )
                )
            elif k.startswith("dt_"):
                sq = MetaDT.objects.filter(
                    individual_id=OuterRef("id"),
                    key=k.replace("dt_", ""),
                )
                while len(vs) < 2:
                    vs.append(vs[0])
                if vs[0] != "":
                    sq = sq.filter(value__date__gte=datetime.date.fromisoformat(vs[0]))
                if vs[1] != "":
                    # Date ls less than midinight the day after (i.e. filter is inclusive)
                    sq = sq.filter(
                        value__date__lt=datetime.date.fromisoformat(vs[1])
                        + datetime.timedelta(days=1)
                    )
                qs = qs.filter(Exists(sq))
            elif k.startswith("tx_"):
                qs = qs.filter(
                    Exists(
                        MetaTx.objects.filter(
                            individual_id=OuterRef("id"),
                            # NB: Not checking the redundant key at this level
                            value__in=Subquery(
                                Taxonomy.objects.filter(
                                    key=k.replace("tx_", ""),
                                    identifier__in=vs,
                                ).values("id")
                            ),
                        )
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

        result_count = 0
        for ind in qs.iterator(chunk_size=settings.SEARCH_RESULT_CHUNK_SIZE):
            result_count += 1
            if result_count > settings.SEARCH_RESULT_MAX_ROWS:
                yield dict(
                    truncated=_("Too many results, only first %d returned")
                    % settings.SEARCH_RESULT_MAX_ROWS
                )
                break

            out = ind.full_data()
            out["bounding_box"] = ind.bounding_box
            out["num_annotations"] = ind.num_annotations

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
        return StreamingJsonResponse(self.query())


class ExportView(DataView):
    def get(self, *args, **kwargs):
        return StreamingCsvResponse(
            self.query(
                with_annotations=self.kwargs["with_annotations"],
                with_image_url=True,
            ),
            # NB: Cheat and assume fish are at most 20 years old, we don't know at this point
            force_cols=["growth_%d" % i for i in range(1, 21)],
        )
