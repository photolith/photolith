import json
import re

from django.contrib.auth.mixins import PermissionRequiredMixin
from django.forms.models import model_to_dict
from django.http import JsonResponse
from django.views import View

from ..errors import json_errors
from ..models import Image, Individual, MetaNumeric, MetaChar, MetaTx, Taxonomy


# TODO: Why is this here, and not under ingest/views?
class UploadView(PermissionRequiredMixin, View):
    permission_required = ("photolith.add_individual",)

    @json_errors
    def post(self, *args, **kwargs):
        image = Image.objects.get(href=self.request.POST["image_href"])

        created_inds = []
        for post_key in self.request.POST.keys():
            if not re.fullmatch(r"individuals\[\d+\]\[data\]", post_key):
                continue
            ind_data = json.loads(self.request.POST[post_key])
            ind_bounding_box = json.loads(
                self.request.POST[post_key.replace("[data]", "[bounding_box]")]
            )

            ind = Individual(
                image=image,
                created_by=self.request.user,
                bounding_box=ind_bounding_box,
            )
            ind.save()
            created_inds.append(ind)

            ind.data = ind_data
            ind.data_save()
        return JsonResponse(
            dict(
                created_individuals=[model_to_dict(ind) for ind in created_inds],
            )
        )
