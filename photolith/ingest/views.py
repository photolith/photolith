import os

from django.conf import settings
from django.http import FileResponse, HttpResponse
from django.shortcuts import render
from django.utils.translation import ngettext
from django.utils.translation import gettext as _
from django.views import View
from django.views.generic import TemplateView

from .photo_dir import get_next_photo, list_photo_dirs


class IndexView(TemplateView):
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
        yield dict(name="fileselect:", description=_("Upload file from computer"))

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["image_sources"] = self.image_sources()
        return context


class NextPhotoView(View):
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
