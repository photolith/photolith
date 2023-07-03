import json
import os
import os.path
import pathlib
import uuid

import PIL.Image

from django.conf import settings
from django.contrib.auth.mixins import PermissionRequiredMixin
from django.forms.models import model_to_dict
from django.http import FileResponse, JsonResponse
from django.views import View

from ..errors import json_errors
from ..models import Image


class UploadView(PermissionRequiredMixin, View):
    permission_required = ("photolith.add_image",)

    @json_errors
    def post(self, *args, **kwargs):
        mimetype = self.request.content_type
        if mimetype == "image/jpeg":
            out_ext = ".jpeg"
        else:
            raise ValueError("Unknown content type %s" % mimetype)

        file_name = "%s%s" % (uuid.uuid4(), out_ext)
        with open(pathlib.Path(settings.MEDIA_ROOT) / file_name, "wb") as f:
            f.write(self.request.read())

        try:
            if mimetype == "image/jpeg":
                PIL.Image.open(pathlib.Path(settings.MEDIA_ROOT) / file_name).verify()

            image = Image(
                created_by=self.request.user,
                href="/media/%s" % file_name,
                orig_filename=self.request.META.get("HTTP_X_PHOTOLITH_FILENAME"),
                mimetype=mimetype,
                scale_line=json.loads(
                    self.request.META.get("HTTP_X_PHOTOLITH_SCALE_LINE", "None")
                ),
                scale_mm=self.request.META.get("HTTP_X_PHOTOLITH_SCALE_MM", None),
            )
            image.save()
        except Exception as e:
            if file_name and os.path.isfile(file_name):
                os.remove(file_name)
            raise e
        return JsonResponse(model_to_dict(image))


class DownloadView(View):
    def get(self, *args, **kwargs):
        file_name = "%s.%s" % (kwargs["basename"], kwargs["extension"])
        image = Image.objects.get(
            href="/media/%s" % file_name,
        )
        return FileResponse(
            open(pathlib.Path(settings.MEDIA_ROOT) / file_name, "rb"),
            headers={
                "Content-Type": image.mimetype,
                "X-Photolith-Orig-Filename": image.orig_filename,
                "X-Photolith-Scale-Line": image.scale_line,
                "X-Photolith-Scale-mm": image.scale_mm,
            },
        )
