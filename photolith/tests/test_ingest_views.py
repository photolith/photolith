import itertools
import json

from django.core.cache import cache
from django.test import Client, TestCase, RequestFactory

from ..ingest.views import *
from ..models import Individual, Image, Taxonomy

from .binaries import JPEG_VALID, JPEG_TRUNCATED, GIF_VALID
from .requires_utils import RequiresUtils


class IndexViewTest(RequiresUtils, TestCase):
    maxDiff = None

    def ctx_data(self, user=None):
        request = RequestFactory().get("/ingest", dict())
        request.user = user
        v = IndexView()
        v.setup(request, **(request.GET.dict()))
        out = v.get_context_data()
        return out

    def test_context_data__full_taxonomy(self):
        user = self.create_user(groups=["Ingest"])

        def ft():
            return self.ctx_data(user)["full_taxonomy"]

        # Initially empty
        self.assertEqual(ft(), {})

        # Add items in jumbled order, get sorted
        Taxonomy.objects.create(
            key="species", identifier=200, str_en="Cat", str_is="Köttur"
        )
        Taxonomy.objects.create(
            key="species", identifier=100, str_en="Fish", str_is="Fiskur"
        )
        Taxonomy.objects.create(key="sex", identifier=1, str_en="Male", str_is="M")
        Taxonomy.objects.create(key="sex", identifier=2, str_en="Female", str_is="F")
        self.assertEqual(
            ft(),
            dict(
                sex=[
                    {"en": "Male", "id": 1, "is": "M"},
                    {"en": "Female", "id": 2, "is": "F"},
                ],
                species=[
                    {"en": "Fish", "id": 100, "is": "Fiskur"},
                    {"en": "Cat", "id": 200, "is": "Köttur"},
                ],
            ),
        )


class UploadViewTest(RequiresUtils, TestCase):
    def form_post(
        self,
        user,
        ind_data=[],
        image=None,
        scale_line=None,
        scale_mm=None,
    ):
        if not image:
            image = self.create_image()
        post_dict = dict(
            image_id=image.id,
        )
        post_dict["scale_line"] = json.dumps(scale_line) if scale_line else ""
        post_dict["scale_mm"] = str(scale_mm or "")
        for i, data in enumerate(ind_data):
            if not data:
                continue
            post_dict["bounding_box:%d" % i] = json.dumps(data["_bb"])
            post_dict["data:%d" % i] = json.dumps(
                {k: v for k, v in data.items() if k not in ("_bb")}
            )

        client = Client()
        client.force_login(user)
        resp = client.post("/ingest/upload/", post_dict)
        if resp.status_code != 200:
            try:
                return resp.status_code, json.loads(resp.content)
            except:
                return resp.status_code
        out = json.loads(resp.content)
        for k, v in out.items():
            if k.startswith("data:") and out[k].get("id"):
                data = ind_data[int(k.replace("data:", ""))]
                new = Individual.objects.get(pk=int(out[k]["id"]))
                if not data.get("id"):
                    self.assertEqual(new.created_by, user)
                self.assertEqual(new.image, image)
                self.assertEqual(new.bounding_box, data["_bb"])
                # No tests for times in output, yet.
                del out[k]["dt_created_at"]
                del out[k]["dt_modified_at"]
        return out

    def test_post(self):
        # You need to be part of the ingest group to post
        user = self.create_user(groups=[])
        self.assertEqual(self.form_post(user), 403)

        # Can create nothing, but user gets a warning
        user = self.create_user(groups=["Ingest"])
        out = self.form_post(user)
        self.assertEqual(
            out,
            dict(
                dict(
                    alert=dict(
                        level="warning",
                        messageHTML="No individual boxes on image! Nothing saved.",
                    )
                ),
            ),
        )

        # Create 2 individuals
        user = self.create_user(groups=["Ingest"])
        out = self.form_post(
            user,
            [
                dict(
                    tx_species={"id": 100, "en": "Fish", "is": "Fiskur"},
                    nm_length=100,
                    _bb=[[0, 0], [100, 100]],
                ),
                dict(
                    tx_species={"id": 200, "en": "Cat", "is": "Köttur"},
                    nm_length=100,
                    _bb=[[0, 0], [200, 200]],
                ),
                dict(
                    # NB: Will be ignored since there's no bounding box
                    tx_species={"id": 200, "en": "Cat", "is": "Köttur"},
                    nm_length=300,
                    _bb=None,
                ),
            ],
        )
        self.assertEqual(
            out,
            {
                "alert": dict(
                    level="success",
                    messageHTML='Created 2 individuals. <br><a href="/search/?nm_image_id=3&nm_image_id=3" target="_blank">Show individuals</a>',
                ),
                "data:0": dict(
                    id=1,
                    tx_species={"id": 100, "en": "Fish", "is": "Fiskur"},
                    nm_length=100.0,
                ),
                "data:1": dict(
                    id=2,
                    tx_species={"id": 200, "en": "Cat", "is": "Köttur"},
                    nm_length=100.0,
                ),
            },
        )

        # We can find them in the database
        Individual.objects.all().order_by("pk")
        inds = Individual.objects.all().order_by("pk")
        self.assertEqual(len(inds), 2)
        self.assertEqual(inds[0].bounding_box, [[0, 0], [100, 100]])
        self.assertEqual(
            inds[0].data,
            {
                "nm_length": 100.0,
                "tx_species": {"id": 100, "en": "Fish", "is": "Fiskur"},
            },
        )
        self.assertEqual(inds[1].bounding_box, [[0, 0], [200, 200]])
        self.assertEqual(
            inds[1].data,
            {
                "nm_length": 100.0,
                "tx_species": {"id": 200, "en": "Cat", "is": "Köttur"},
            },
        )

        # Create 1 individual, with keys that don't start at 1
        out = self.form_post(
            user,
            [
                None,
                None,
                None,
                None,
                dict(
                    tx_species={"id": 100, "en": "Fish", "is": "Fiskur"},
                    nm_length=100,
                    _bb=[[0, 0], [920, 100]],
                ),
            ],
        )
        self.assertEqual(
            out,
            {
                "alert": dict(
                    level="success",
                    messageHTML="Created 1 individual. <br><a "
                    'href="/search/?nm_image_id=4&nm_image_id=4" '
                    'target="_blank">Show individuals</a>',
                ),
                # NB: data:* index corresponds to the above, not DB index
                "data:4": {
                    "id": 3,
                    "nm_length": 100.0,
                    "tx_species": {"en": "Fish", "id": 100, "is": "Fiskur"},
                },
            },
        )

        # We can find them in the database
        inds = Individual.objects.all().order_by("pk")
        self.assertEqual(len(inds), 3)
        self.assertEqual(inds[0].bounding_box, [[0, 0], [100, 100]])
        self.assertEqual(inds[1].bounding_box, [[0, 0], [200, 200]])
        self.assertEqual(inds[2].bounding_box, [[0, 0], [920, 100]])

        # Can simultaneously create & update
        out = self.form_post(
            user,
            [
                dict(
                    tx_species={"id": 100, "en": "Fish", "is": "Fiskur"},
                    nm_length=100,
                    _bb=[[0, 0], [925, 100]],
                    id=inds[2].id,
                ),
                dict(
                    tx_species={"id": 100, "en": "Fish", "is": "Fiskur"},
                    nm_length=100,
                    _bb=[[0, 0], [930, 100]],
                ),
                dict(
                    tx_species={"id": 200, "en": "Cat", "is": "Köttur"},
                    nm_length=100,
                    _bb=[[0, 0], [205, 200]],
                    id=inds[1].id,
                ),
            ],
        )
        inds = Individual.objects.all().order_by("pk")
        self.assertEqual(
            out,
            {
                "alert": dict(
                    level="success",
                    messageHTML="Created 1 individual. Updated 2 individuals. <br><a "
                    'href="/search/?nm_image_id=5&nm_image_id=5" '
                    'target="_blank">Show individuals</a>',
                ),
                "data:0": {
                    "id": inds[2].id,
                    "nm_length": 100.0,
                    "tx_species": {"en": "Fish", "id": 100, "is": "Fiskur"},
                },
                "data:1": {
                    "id": inds[3].id,
                    "nm_length": 100.0,
                    "tx_species": {"en": "Fish", "id": 100, "is": "Fiskur"},
                },
                "data:2": {
                    "id": inds[1].id,
                    "nm_length": 100.0,
                    "tx_species": {"en": "Cat", "id": 200, "is": "Köttur"},
                },
            },
        )

        # Ignore any empty taxonomy fields
        out = self.form_post(
            user,
            [
                dict(
                    _bb=[[0, 0], [925, 100]],
                    tx_species=dict(),
                    nm_length=100,
                )
            ],
        )
        inds = Individual.objects.all().order_by("pk")
        self.assertEqual(len(inds), 5)
        self.assertEqual(
            out,
            {
                "alert": dict(
                    level="success",
                    messageHTML="Created 1 individual. <br><a "
                    'href="/search/?nm_image_id=6&nm_image_id=6" '
                    'target="_blank">Show individuals</a>',
                ),
                "data:0": {"id": inds[4].id, "nm_length": 100.0},
            },
        )
        self.assertEqual(
            inds[4].data,
            dict(
                nm_length=100,
            ),
        )

        # Can remove items by getting rid of their bounding box
        out = self.form_post(
            user,
            [
                dict(
                    tx_species={"id": 200, "en": "Cat", "is": "Köttur"},
                    nm_length=100,
                    _bb=None,
                    id=inds[1].id,
                ),
                dict(
                    tx_species={"id": 100, "en": "Fish", "is": "Fiskur"},
                    nm_length=100,
                    _bb=[[0, 0], [925, 100]],
                    id=inds[2].id,
                ),
            ],
        )
        self.assertEqual(
            out,
            {
                "alert": {
                    "level": "success",
                    "messageHTML": "Updated 1 individual. Deleted 1 individual. <br><a "
                    'href="/search/?nm_image_id=7&nm_image_id=7" '
                    'target="_blank">Show individuals</a>',
                },
                "data:0": {
                    "nm_length": 100,
                    "tx_species": {"en": "Cat", "id": 200, "is": "Köttur"},
                },
                "data:1": {
                    "id": 3,
                    "nm_length": 100.0,
                    "tx_species": {"en": "Fish", "id": 100, "is": "Fiskur"},
                },
            },
        )
        inds = Individual.objects.all().order_by("pk")
        self.assertEqual(
            [i.id for i in inds],
            [1, 3, 4, 5],
        )

        # Restore it again, ID isn;t recycled
        out = self.form_post(
            user,
            [
                dict(
                    tx_species={"id": 200, "en": "Cat", "is": "Köttur"},
                    nm_length=100,
                    _bb=[[0, 0], [101010, 123]],
                    id=2,
                ),
                dict(
                    tx_species={"id": 100, "en": "Fish", "is": "Fiskur"},
                    nm_length=100,
                    _bb=[[0, 0], [925, 100]],
                    id=3,
                ),
            ],
        )
        self.assertEqual(
            out,
            {
                "alert": {
                    "level": "success",
                    "messageHTML": "Updated 2 individuals. <br><a "
                    'href="/search/?nm_image_id=8&nm_image_id=8" '
                    'target="_blank">Show individuals</a>',
                },
                "data:0": {
                    "id": 6,
                    "nm_length": 100.0,
                    "tx_species": {"en": "Cat", "id": 200, "is": "Köttur"},
                },
                "data:1": {
                    "id": 3,
                    "nm_length": 100.0,
                    "tx_species": {"en": "Fish", "id": 100, "is": "Fiskur"},
                },
            },
        )
        inds = Individual.objects.all().order_by("pk")
        self.assertEqual(
            [i.id for i in inds],
            [1, 3, 4, 5, 6],
        )
        self.assertEqual(inds[4].bounding_box, [[0, 0], [101010, 123]])

        # Can't update someone else's individuals
        user2 = self.create_user(groups=["Ingest"])
        out = self.form_post(
            user2,
            [
                dict(
                    tx_species={"id": 100, "en": "Fish", "is": "Fiskur"},
                    nm_length=100,
                    _bb=[[0, 0], [1025, 100]],
                    id=3,
                ),
            ],
        )
        self.assertEqual(
            out,
            {
                "alert": {
                    "level": "success",
                    "messageHTML": "Updated 1 individual. <br><a "
                    'href="/search/?nm_image_id=9&nm_image_id=9" '
                    'target="_blank">Show individuals</a>',
                },
                # NB: ID has changed
                "data:0": {
                    "id": 7,
                    "nm_length": 100.0,
                    "tx_species": {"en": "Fish", "id": 100, "is": "Fiskur"},
                },
            },
        )

    def test_post__searchquerystring(self):
        """Can add a search querystring to the output"""
        user = self.create_user(groups=["Ingest"])
        img = self.create_image(scale_line=None, scale_mm=None)

        out = self.form_post(
            user,
            [
                dict(
                    ch_slideLabel="AB-01",
                    _bb=[[0, 0], [100, 100]],
                ),
                dict(
                    ch_slideLabel="AB-01",
                    _bb=[[0, 0], [200, 200]],
                ),
                dict(
                    ch_slideLabel="AB-02",
                    _bb=[[0, 0], [300, 300]],
                ),
            ],
        )
        self.assertEqual(
            out,
            {
                "alert": {
                    "level": "success",
                    "messageHTML": 'Created 3 individuals. <br><a href="/search/?nm_image_id=2&nm_image_id=2" target="_blank">Show individuals</a>',
                },
                "data:0": {"ch_slideLabel": "AB-01", "id": 1},
                "data:1": {"ch_slideLabel": "AB-01", "id": 2},
                "data:2": {"ch_slideLabel": "AB-02", "id": 3},
            },
        )

    def test_post__image_update(self):
        """Creating individuals updates the scale"""
        user = self.create_user(groups=["Ingest"])
        img = self.create_image(scale_line=None, scale_mm=None)

        # Can update scale line at the same time as uploading individuals
        self.form_post(
            user,
            [
                dict(
                    tx_species={"id": 100, "en": "Fish", "is": "Fiskur"},
                    nm_length=100,
                    _bb=[[0, 0], [911, 100]],
                ),
            ],
            image=img,
            scale_line=[(2, 2), (4, 4)],
            scale_mm=44,
        )
        img.refresh_from_db()
        self.assertEqual(img.scale_line, [[2, 2], [4, 4]])
        self.assertEqual(img.scale_mm, 44)

        # Can clear values too
        self.form_post(user, [], image=img, scale_line=None, scale_mm=None)
        img.refresh_from_db()
        self.assertEqual(img.scale_line, None)
        self.assertEqual(img.scale_mm, None)

    def test_post__nulldata(self):
        """null entries in data generate an error"""

        user = self.create_user(groups=["Ingest"])
        out = self.form_post(
            user,
            [
                dict(
                    ch_slideLabel="slideLabel",
                    ch_individualLabel="44",
                    tx_species={"id": 100, "en": "Fish", "is": "Fiskur"},
                    nm_length=None,
                    _bb=[[0, 0], [911, 100]],
                ),
            ],
        )
        self.assertEqual(
            out,
            (
                400,
                dict(
                    error_class="ValidationError",
                    error="'length' is missing for slideLabel : 44",
                ),
            ),
        )

    def test_post__cacheempty(self):
        """Will empty search's cache"""
        user = self.create_user(groups=["Ingest", "General Annotation Editor"])
        img = self.create_image(scale_line=None, scale_mm=None)

        # Do a search, made a cache
        client = Client()
        client.force_login(user)
        resp = client.get("/search/", {})
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(cache.get("photolith_meta_fields") is not None)

        # Ingest, it's gone
        out = self.form_post(
            user,
            [
                dict(
                    ch_slideLabel="AB-01",
                    _bb=[[0, 0], [100, 100]],
                ),
                dict(
                    ch_slideLabel="AB-01",
                    _bb=[[0, 0], [200, 200]],
                ),
                dict(
                    ch_slideLabel="AB-02",
                    _bb=[[0, 0], [300, 300]],
                ),
            ],
        )
        self.assertTrue(cache.get("photolith_meta_fields") is None)


class UploadImageViewTest(RequiresUtils, TestCase):
    def upload_img(
        self, user, img_data=JPEG_VALID, mimetype="image/jpeg", filename="ut_image.jpeg"
    ):
        client = Client()
        client.force_login(user)
        resp = client.post(
            "/ingest/upload-image/",
            img_data,
            content_type=mimetype,
            headers={
                "X-Photolith-filename": filename,
            },
        )
        if resp.status_code != 200:
            return resp.status_code
        out = json.loads(resp.content)
        return out

    def test_call__permissions(self):
        """You need to be part of the ingest group to post"""
        user = self.create_user(groups=[])
        self.assertEqual(self.upload_img(user), 403)
        user = self.create_user(groups=["Ingest"])
        self.assertEqual(self.upload_img(user)["created_by"], user.id)

    def test_call__save(self):
        """Successfully save image & metadata"""
        user = self.create_user(groups=["Ingest"])

        out = self.upload_img(
            user, GIF_VALID, mimetype="image/gif", filename="ut_really_good_image.gif"
        )
        i = Image.objects.get(pk=out["id"])
        self.assertEqual(
            out,
            dict(
                content=i.content.name,
                created_by=user.id,
                id=i.id,
                mimetype="image/gif",
                orig_filename="ut_really_good_image.gif",
                scale_line=None,
                scale_mm=None,
            ),
        )
        self.assertEqual(i.content.read(), GIF_VALID)

        out = self.upload_img(
            user,
            JPEG_VALID,
            mimetype="image/jpeg",
            filename="ut_really_good_image.jpeg",
        )
        i = Image.objects.get(pk=out["id"])
        self.assertEqual(
            out,
            dict(
                content=i.content.name,
                created_by=user.id,
                id=i.id,
                mimetype="image/jpeg",
                orig_filename="ut_really_good_image.jpeg",
                scale_line=None,
                scale_mm=None,
            ),
        )
        self.assertEqual(i.content.read(), JPEG_VALID)

        out2 = self.upload_img(
            user,
            JPEG_VALID,
            mimetype="image/jpeg",
            filename="ut_really_good_image.jpeg",
        )
        i2 = Image.objects.get(pk=out2["id"])
        self.assertEqual(
            out,
            dict(
                content=i.content.name,
                created_by=user.id,
                id=i.id,
                mimetype="image/jpeg",
                orig_filename="ut_really_good_image.jpeg",
                scale_line=None,
                scale_mm=None,
            ),
        )
        # We get the same content back
        self.assertEqual(i.id, i2.id)
        self.assertEqual(i.content.name, i2.content.name)
        # UploadView can get the unique ID back
        self.assertEqual(Image.objects.get(content=i2.content.name).id, i.id)
