from django.contrib.auth.mixins import PermissionRequiredMixin
from django.views.generic import TemplateView


from ..errors import json_errors
from ..models import Individual


class AnnotateView(PermissionRequiredMixin, TemplateView):
    permission_required = ("photolith.view_individual",)
    template_name = "annotate/annotate.html"

    def get_individual(self, individual_id):
        ind = Individual.objects.get(id=individual_id)
        return dict(
            bounding_box=ind.bounding_box,
            data=ind.data,
            href=ind.image.href,
            scale_line=ind.image.scale_line,
            scale_mm=ind.image.scale_mm,
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["ind_dict"] = self.get_individual(kwargs["individual_id"])
        context["rating"] = [
            dict(id=1, title="1: Image unreadable"),
            dict(id=2, title="2: "),
            dict(id=3, title="3: "),
            dict(id=4, title="4: "),
            dict(id=5, title="5: Image clear"),
        ]
        return context
