import re

from django.core.exceptions import PermissionDenied
from django.views.generic import TemplateView
from django.db.models import Count
from django.utils.translation import get_language

from ..models import Image, Individual, Annotation, MetaTx, Taxonomy
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

    def get_headline_numbers(self):
        lang_lbl = "str_%s" % re.sub(r"\W.*", "", get_language())

        total_ind = Individual.objects.count()
        ind_by_species = dict()
        for x in (
            Taxonomy.objects.filter(key="species")
            .values()
            .annotate(count=Count("metatx"))
        ):
            if x["count"] > 10:
                ind_by_species[re.sub(r"\s*\[.*\]", "", x.get(lang_lbl, "str_en"))] = x[
                    "count"
                ]

        return dict(
            images=Image.objects.count(),
            individuals=total_ind,
            ind_by_species=ind_by_species,
            annotations=Annotation.objects.count(),
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["projects"] = self.get_project_queryset()
        context["headline_numbers"] = self.get_headline_numbers()
        return context
