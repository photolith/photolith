import numbers
import json
import re

from django.contrib.auth.mixins import PermissionRequiredMixin
from django.forms.models import model_to_dict
from django.http import JsonResponse
from django.views import View

from ..errors import json_errors
from ..models import Image, Individual, MetaNumeric, MetaChar, MetaTx, Taxonomy


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

            for k, v in ind_data.items():
                if isinstance(v, numbers.Number):
                    MetaNumeric(
                        individual=ind,
                        key=k,
                        value=float(v),
                    ).save()

                elif isinstance(v, str):
                    MetaChar(
                        individual=ind,
                        key=k,
                        value=v,
                    ).save()

                elif isinstance(v, dict):
                    v["key"] = k
                    tx, created = Taxonomy.objects.get_or_create(
                        key=k, identifier=v["id"]
                    )
                    for lang in v.keys():
                        if lang == "id":
                            continue
                        setattr(tx, "str_%s" % lang, v[lang])
                    tx.save()

                    MetaTx(
                        individual=ind,
                        key=k,
                        value=tx,
                    ).save()

                else:
                    raise ValueError("Unknown type of %s: %s" % (k, str(v)))
        return JsonResponse(
            dict(
                created_individuals=[model_to_dict(ind) for ind in created_inds],
            )
        )
