import mimetypes
import os
from urllib.parse import quote

from . import UNSET


class ImagesMixin:
    """/api/v1/images/ endpoints, for use with PhotolithClient"""

    def upload_image(
        self, image, filename=None, mimetype=None, scale_line=UNSET, scale_mm=UNSET
    ):
        """
        Upload an image, returning the image object. image can be a path, bytes
        or a file object. filename / mimetype are guessed from the path if not
        given.

        If scale_line / scale_mm are given, the scale is then set as
        set_image_scale().

        Images are stored by content hash, uploading an existing image returns
        it with "created": False.
        """
        if isinstance(image, (str, os.PathLike)):
            filename = filename or os.path.basename(image)
            with open(image, "rb") as f:
                content = f.read()
        elif isinstance(image, (bytes, bytearray)):
            content = image
        else:
            filename = filename or os.path.basename(getattr(image, "name", ""))
            content = image.read()
        if not filename:
            raise ValueError("filename is required")
        mimetype = mimetype or mimetypes.guess_type(filename)[0]
        if not mimetype:
            raise ValueError("Cannot guess mimetype of %s" % filename)

        out = self.request(
            "POST",
            "/api/v1/images/",
            data=content,
            headers={
                "Content-Type": mimetype,
                # NB: Headers can only contain ISO-8859-1
                "X-Photolith-Filename": quote(filename),
            },
        )
        if scale_line is not UNSET or scale_mm is not UNSET:
            # NB: Keep the upload's created & status
            out.update(
                self.set_image_scale(
                    out["id"], scale_line=scale_line, scale_mm=scale_mm
                )
            )
        return out

    def get_image(self, image_id):
        """Fetch an image object"""
        return self.request("GET", "/api/v1/images/%d/" % image_id)

    def set_image_scale(self, image_id, scale_line=UNSET, scale_mm=UNSET):
        """
        Set an image's scale, a [[x, y], [x, y]] line of scale_mm length.
        Values not given are left alone, None clears
        """
        body = {}
        if scale_line is not UNSET:
            body["scale_line"] = scale_line
        if scale_mm is not UNSET:
            body["scale_mm"] = scale_mm
        return self.request("PATCH", "/api/v1/images/%d/" % image_id, json=body)
