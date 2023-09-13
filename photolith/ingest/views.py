import json

from django.conf import settings
from django.contrib.auth.mixins import PermissionRequiredMixin
from django.forms.models import model_to_dict
from django.http import FileResponse, HttpResponse, JsonResponse
from django.utils.translation import ngettext
from django.utils.translation import gettext as _
from django.views import View
from django.views.generic import TemplateView

from .photo_dir import get_next_photo, list_photo_dirs
from ..errors import json_errors
from ..models import Image, Individual


class IndexView(PermissionRequiredMixin, TemplateView):
    permission_required = ("photolith.add_individual",)
    template_name = "ingest/index.html"

    def image_sources(self):
        def count_string(count):
            return ngettext("(%(count)d photo)", "(%(count)d photos)", count) % dict(
                count=count,
            )

        for d in list_photo_dirs(settings.INGEST_ROOT):
            yield dict(
                name="server:%s" % d,
                description=_("Uploaded by %(photo_dir)s") % dict(photo_dir=d),
            )
        yield dict(name="fileselect:", description=_("Upload files from computer"))

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["image_sources"] = self.image_sources()
        return context


class NextPhotoView(PermissionRequiredMixin, View):
    permission_required = ("photolith.view_image",)

    def get(self, *args, **kwargs):
        f = get_next_photo(
            settings.INGEST_ROOT,
            kwargs["photo_dir"],
            prev=self.request.GET.get("prev", None),
        )
        if f is None:
            return HttpResponse(
                None,
                status=204,
                headers={
                    "X-Photolith-Remaining": 0,
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": 0,
                },
            )
        return FileResponse(
            open(f["path"], "rb"),
            headers={
                "X-Photolith-Remaining": f["remaining"],
                "Content-Type": f["mime"],
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": 0,
            },
        )


class UploadView(PermissionRequiredMixin, View):
    permission_required = ("photolith.add_individual",)

    @json_errors
    def post(self, *args, **kwargs):
        image = Image.objects.get(href=self.request.POST["image_href"])

        created_inds = []
        for post_key in self.request.POST.keys():
            if not post_key.startswith("data:"):
                continue
            ind_data = json.loads(self.request.POST[post_key])
            ind_bounding_box = json.loads(
                self.request.POST[post_key.replace("data:", "bounding_box:", 1)]
                or "null"
            )
            if not ind_bounding_box:
                # Ignore individuals that don't have a bounding box
                continue

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
