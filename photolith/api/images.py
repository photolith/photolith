import io
from urllib.parse import unquote

from django.http import JsonResponse
from django.shortcuts import get_object_or_404

from ..models import Image
from ..perm_utils import check_perms

from .base import ApiView


class ImagesView(ApiView):
    permission_required = ("photolith.add_image",)

    def post(self, *args, **kwargs):
        image, created = Image.objects.store(
            # NB: S3 storage backend requires something with is_close, self.request doesn't fit the bill
            io.BytesIO(self.request.read()),
            # NB: Headers can only contain ISO-8859-1, so clients should URI-encode
            unquote(self.request.META.get("HTTP_X_PHOTOLITH_FILENAME", "")),
            self.request.content_type,
            self.request.user,
        )
        return JsonResponse(
            dict(image.full_data(), created=created),
            status=201 if created else 200,
        )


class ImageView(ApiView):
    permission_required = ("photolith.view_image",)

    def get(self, *args, **kwargs):
        image = get_object_or_404(Image, pk=self.kwargs["image_id"])
        return JsonResponse(image.full_data())

    def patch(self, *args, **kwargs):
        # NB: Same permission as setting the scale whilst ingesting, see ingest.views.UploadView
        check_perms(self.request.user, "photolith.add_individual")
        image = get_object_or_404(Image, pk=self.kwargs["image_id"])
        body = self.json_body(["scale_line", "scale_mm"])
        image.set_scale(
            body.get("scale_line", image.scale_line),
            body.get("scale_mm", image.scale_mm),
        )
        return JsonResponse(image.full_data())
