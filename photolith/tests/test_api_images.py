import json
from urllib.parse import quote

from django.contrib.auth.models import Permission
from django.test import Client, TestCase

from ..models import Image

from .binaries import GIF_VALID, JPEG_VALID
from .requires_utils import RequiresUtils


class ApiImagesTestBase(RequiresUtils, TestCase):
    def client_for(self, user=None):
        client = Client()
        if user:
            client.force_login(user)
        return client

    def resp(self, r):
        return r.status_code, r.json() if r.content else None


class ImagesViewTest(ApiImagesTestBase):
    def upload(self, user, data=JPEG_VALID, mimetype="image/jpeg", filename="a.jpeg"):
        return self.resp(
            self.client_for(user).post(
                "/api/v1/images/",
                data,
                content_type=mimetype,
                headers={"X-Photolith-Filename": filename},
            )
        )

    def test_post(self):
        # Need to be logged in, with add_image
        self.assertEqual(self.upload(None)[0], 401)
        self.assertEqual(
            self.upload(self.create_user()),
            (
                403,
                dict(
                    error_class="PermissionDenied",
                    error="Missing permission photolith.add_image",
                ),
            ),
        )

        user = self.create_user(groups=["Ingest"])
        status, out = self.upload(
            user, GIF_VALID, "image/gif", quote("Þorskur 100%.gif")
        )
        image = Image.objects.get(pk=out["id"])
        self.assertEqual(
            (status, out),
            (
                201,
                dict(
                    id=image.id,
                    content=image.content.name,
                    orig_filename="Þorskur 100%.gif",
                    mimetype="image/gif",
                    scale_line=None,
                    scale_mm=None,
                    created_by=user.id,
                    created=True,
                ),
            ),
        )
        self.assertEqual(image.content.read(), GIF_VALID)

        # Uploading again returns the existing image
        status, out2 = self.upload(user, GIF_VALID, "image/gif", "other.gif")
        self.assertEqual(status, 200)
        self.assertEqual(out2, dict(out, created=False))

        # Not an image
        self.assertEqual(
            self.upload(user, b"Hello", "text/plain", "a.txt"),
            (
                400,
                dict(
                    error_class="ValidationError",
                    error="Unknown content type text/plain",
                ),
            ),
        )

        # Only POST
        self.assertEqual(self.client_for(user).get("/api/v1/images/").status_code, 405)


class ImageViewTest(ApiImagesTestBase):
    def test_get(self):
        image = self.create_image(scale_line=[[0, 0], [10, 0]], scale_mm=5)
        url = "/api/v1/images/%d/" % image.id

        self.assertEqual(self.resp(self.client_for().get(url))[0], 401)
        self.assertEqual(
            self.resp(self.client_for(self.create_user()).get(url))[0], 403
        )

        user = self.create_user(groups=["Ingest"])
        self.assertEqual(
            self.resp(self.client_for(user).get(url)),
            (
                200,
                dict(
                    id=image.id,
                    content=image.content.name,
                    orig_filename=image.orig_filename,
                    mimetype="image/jpeg",
                    scale_line=[[0, 0], [10, 0]],
                    scale_mm=5,
                    created_by=None,
                ),
            ),
        )

        self.assertEqual(
            self.resp(self.client_for(user).get("/api/v1/images/%d/" % (image.id + 1))),
            (
                404,
                dict(error_class="Http404", error="No Image matches the given query."),
            ),
        )

        # Only methods defined on the view are allowed
        resp = self.client_for(user).delete(url)
        self.assertEqual(
            self.resp(resp),
            (
                405,
                dict(error_class="MethodNotAllowed", error="Method DELETE not allowed"),
            ),
        )
        self.assertEqual(resp["Allow"], "GET, PATCH, HEAD, OPTIONS")

    def test_patch(self):
        image = self.create_image(scale_line=None, scale_mm=None)
        url = "/api/v1/images/%d/" % image.id

        def patch(user, body):
            return self.resp(
                self.client_for(user).patch(
                    url,
                    body if isinstance(body, str) else json.dumps(body),
                    content_type="application/json",
                )
            )

        self.assertEqual(patch(None, dict(scale_mm=5))[0], 401)

        # Can view images, but not ingest
        user = self.create_user()
        user.user_permissions.add(Permission.objects.get(codename="view_image"))
        self.assertEqual(
            patch(user, dict(scale_mm=5)),
            (
                403,
                dict(
                    error_class="PermissionDenied",
                    error="Missing permission photolith.add_individual",
                ),
            ),
        )

        user = self.create_user(groups=["Ingest"])
        status, out = patch(user, dict(scale_line=[[10, 950], [410, 950]], scale_mm=5))
        self.assertEqual(status, 200)
        self.assertEqual(
            (out["scale_line"], out["scale_mm"]), ([[10, 950], [410, 950]], 5)
        )

        # Keys not given are left alone
        status, out = patch(user, dict(scale_mm=6))
        self.assertEqual(
            (out["scale_line"], out["scale_mm"]), ([[10, 950], [410, 950]], 6)
        )
        status, out = patch(user, dict(scale_line=[[0, 0], [1, 1]]))
        self.assertEqual((out["scale_line"], out["scale_mm"]), ([[0, 0], [1, 1]], 6))

        # null clears
        status, out = patch(user, dict(scale_line=None, scale_mm=None))
        self.assertEqual((out["scale_line"], out["scale_mm"]), (None, None))

        # Invalid input
        for body, err in [
            ("{", "Invalid JSON: "),
            ([1, 2], "Expected a JSON object"),
            (dict(scale_mm=5, scale=4), "Unknown keys: scale"),
            (dict(scale_mm="5"), "scale_mm should be a whole number, not 5"),
            (dict(scale_line=[[0, 0]]), "scale_line should be [[x, y], [x, y]]"),
        ]:
            status, out = patch(user, body)
            self.assertEqual((status, out["error_class"]), (400, "ValidationError"))
            self.assertTrue(out["error"].startswith(err), out["error"])
        image.refresh_from_db()
        self.assertEqual((image.scale_line, image.scale_mm), (None, None))
