import io
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
        yield dict(name="webcam:", description=_("Take photo (default camera)"))

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
        if f.get("error"):
            return HttpResponse(
                "%s: %s"
                % (
                    f["name"],
                    f["error"],
                ),
                status=400,
                headers={
                    "Content-Type": "text/plain",
                    "X-Photolith-Name": f["name"],
                    "X-Photolith-Remaining": f["remaining"],
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
        image = Image.objects.get(content=self.request.POST["image_content"])
        image.scale_line = json.loads(self.request.POST["scale_line"] or "null")
        image.scale_mm = (
            int(self.request.POST["scale_mm"])
            if self.request.POST["scale_mm"]
            else None
        )
        image.save()

        created_inds = {}
        updated_inds = {}
        sel_individual = self.request.POST.get("individual", "")
        for post_key in self.request.POST.keys():
            if not post_key.startswith("data:"):
                continue
            if sel_individual and post_key != "data:%s" % sel_individual:
                continue
            ind_data = json.loads(self.request.POST[post_key])
            ind_bounding_box = json.loads(
                self.request.POST[post_key.replace("data:", "bounding_box:", 1)]
                or "null"
            )
            if not ind_bounding_box:
                # Ignore individuals that don't have a bounding box
                continue
            ind_id = self.request.POST.get(
                post_key.replace("data:", "individual_id:", 1)
            )

            if ind_id:
                ind = Individual.objects.get(pk=int(ind_id))
            else:
                ind = Individual(created_by=self.request.user)
            ind.image = image
            ind.bounding_box = ind_bounding_box
            ind.save()
            ind.data = ind_data
            ind.save()
            if ind_id:
                updated_inds[post_key.replace("data:", "")] = ind.id
            else:
                created_inds[post_key.replace("data:", "")] = ind.id

        alert = ""
        if len(created_inds) > 0:
            alert += ngettext(
                "Created %(count)d individual. ",
                "Created %(count)d individuals. ",
                len(created_inds),
            ) % dict(count=len(created_inds))
        if len(updated_inds) > 0:
            alert += ngettext(
                "Updated %(count)d individual. ",
                "Updated %(count)d individuals. ",
                len(updated_inds),
            ) % dict(count=len(updated_inds))
        return JsonResponse(
            dict(
                alert=alert,
                created_individuals=created_inds,
                updated_individuals=updated_inds,
            )
        )


class UploadImageView(PermissionRequiredMixin, View):
    permission_required = ("photolith.add_image",)

    @json_errors
    def post(self, *args, **kwargs):
        mimetype = self.request.content_type
        if mimetype != "image/jpeg":
            raise ValueError("Unknown content type %s" % mimetype)

        image = Image(
            created_by=self.request.user,
            orig_filename=self.request.META.get("HTTP_X_PHOTOLITH_FILENAME"),
            mimetype=mimetype,
        )
        # NB: S3 storage backend requires something with is_close, self.request doesn't fit the bill
        file = io.BytesIO(self.request.read())
        # NB: to_python performs image validation
        image.content.save(image.orig_filename, image.content.field.to_python(file))
        image.save()
        out = model_to_dict(image)
        out["content"] = out["content"].name
        return JsonResponse(out)
