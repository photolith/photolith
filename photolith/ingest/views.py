import hashlib
import io
import json
import os.path

from django.conf import settings
from django.contrib.auth.mixins import PermissionRequiredMixin
from django.core.cache import cache
from django.forms.models import model_to_dict
from django.http import FileResponse, HttpResponse, JsonResponse
from django.utils.translation import ngettext
from django.utils.translation import gettext as _
from django.views import View
from django.views.generic import TemplateView

from .photo_dir import get_next_photo, list_photo_dirs, verify_image
from ..errors import json_errors
from ..models import Image, Individual, Taxonomy


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
        yield dict(
            name="localdirselect:", description=_("Upload directory from computer")
        )
        yield dict(
            name="fileselect:", description=_("Upload selected files from computer")
        )
        yield dict(name="webcam:", description=_("Take photo (default camera)"))

    def full_taxonomy(self):
        out = {}
        for tx in Taxonomy.objects.all().order_by("key", "identifier"):
            out.setdefault(tx.key, []).append(tx.dict)
        return out

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["image_sources"] = self.image_sources()
        context["full_taxonomy"] = self.full_taxonomy()
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
        image = Image.objects.get(pk=self.request.POST["image_id"])
        image.scale_line = json.loads(self.request.POST["scale_line"] or "null")
        image.scale_mm = (
            int(self.request.POST["scale_mm"])
            if self.request.POST["scale_mm"]
            else None
        )
        image.save()

        out = {}
        created_inds = {}
        updated_inds = {}
        deleted_inds = {}
        for post_key in self.request.POST.keys():
            if not post_key.startswith("data:"):
                continue
            ind_data = json.loads(self.request.POST[post_key])
            ind_client_idx = post_key.replace("data:", "")
            ind_bounding_box = json.loads(
                self.request.POST[post_key.replace("data:", "bounding_box:", 1)]
                or "null"
            )

            # If an ID is given, fetch any existant individual
            ind = (
                Individual.objects.filter(
                    pk=int(ind_data["id"]),
                    created_by=self.request.user,
                ).first()
                if ind_data.get("id")
                else None
            )

            # No bounding box --> this individual shouldn't exist
            if not ind_bounding_box:
                if ind:
                    deleted_inds[ind_client_idx] = ind.id
                    ind.delete()
                    del ind_data["id"]
                    out["data:%s" % ind_client_idx] = ind_data
                continue

            # If no individual was found, create one at this point
            if not ind:
                ind = Individual(created_by=self.request.user)

            ind.image = image
            ind.bounding_box = ind_bounding_box
            ind.save()
            ind.data = ind_data
            ind.save()
            out["data:%s" % ind_client_idx] = ind.full_data()
            del out["data:%s" % ind_client_idx]["__str__"]
            if ind_data.get("id"):
                updated_inds[ind_client_idx] = ind.id
            else:
                created_inds[ind_client_idx] = ind.id

        if len(created_inds) > 0 or len(updated_inds) > 0:
            # Clear meta_fields cache created in search/views
            cache.delete("photolith_meta_fields")

        alert = ""
        alert_status = "success"
        if len(created_inds) == 0 and len(updated_inds) == 0:
            alert += _("No individual boxes on image! Nothing saved.")
            alert_status = "warning"
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
        if len(deleted_inds) > 0:
            alert += ngettext(
                "Deleted %(count)d individual. ",
                "Deleted %(count)d individuals. ",
                len(deleted_inds),
            ) % dict(count=len(deleted_inds))
        if len(created_inds) + len(updated_inds) > 0:
            alert += (
                '<br><a href="/search/?nm_image_id=%d&nm_image_id=%d" target="_blank">%s</a>'
                % (
                    image.id,
                    image.id,
                    _("Show individuals"),
                )
            )

        out["alert"] = dict(level=alert_status, messageHTML=alert)
        return JsonResponse(out)


class UploadImageView(PermissionRequiredMixin, View):
    permission_required = ("photolith.add_image",)

    @json_errors
    def post(self, *args, **kwargs):
        mimetype = self.request.content_type
        if not mimetype.startswith("image/"):  # e.g. image/jpeg, image/x-nikon-nef
            raise ValueError("Unknown content type %s" % mimetype)

        # Read file into memory
        # NB: S3 storage backend requires something with is_close, self.request doesn't fit the bill
        file = io.BytesIO(self.request.read())
        orig_filename = self.request.META.get("HTTP_X_PHOTOLITH_FILENAME")
        # NB: We could do verify_image(file) at this point, but it doesn't accept .nef

        # Generate content-addressed filename to store as
        digest = hashlib.file_digest(file, hashlib.sha256)
        _, file_ext = os.path.splitext(orig_filename)
        digest_filename = "%s%s" % (digest.hexdigest(), file_ext or "")
        digest_path = Image.content.field.generate_filename(None, digest_filename)

        # If we already have an image with that sha1 sum, otherwise create & save to storage
        image, created = Image.objects.get_or_create(
            content=digest_path,
            defaults=dict(
                created_by=self.request.user,
                orig_filename=self.request.META.get("HTTP_X_PHOTOLITH_FILENAME"),
                mimetype=mimetype,
            ),
        )

        # If the image file doesn't exist, save it afresh
        if not image.content.storage.exists(image.content.name):
            image.content.save(digest_filename, file)

        image.save()

        out = model_to_dict(image)
        out["content"] = out["content"].name
        return JsonResponse(out)
