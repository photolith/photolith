import itertools
import json
import os
import tempfile

from django.core.cache import cache
from django.test import Client, TestCase, RequestFactory
from django.test.testcases import override_settings

from ..ingest.views import *
from ..models import Individual, Image, Taxonomy

from .binaries import JPEG_VALID, JPEG_TRUNCATED, GIF_VALID
from .requires_utils import RequiresUtils


class IndexViewTest(RequiresUtils, TestCase):
    maxDiff = None

    def ctx_data(self, user=None, get_data=None):
        request = RequestFactory().get("/ingest", get_data or dict())
        request.user = user
        v = IndexView()
        v.setup(request, **(request.GET.dict()))
        out = v.get_context_data()
        return out

    def test_context_data__image_sources(self):
        user = self.create_user(groups=["Ingest"])

        def img_src(get_data=None):
            return list(self.ctx_data(user, get_data=get_data)["image_sources"])

        with tempfile.TemporaryDirectory() as ingest_root:
            with override_settings(INGEST_ROOT=ingest_root):
                # With an empty INGEST_ROOT and no image_id, only the
                # client-side upload sources are returned
                self.assertEqual(
                    img_src(),
                    [
                        dict(
                            name="localdirselect:",
                            description="Upload directory from computer",
                        ),
                        dict(
                            name="fileselect:",
                            description="Upload selected files from computer",
                        ),
                        dict(
                            name="webcam:",
                            description="Take photo (default camera)",
                        ),
                    ],
                )

                # Subdirectories of INGEST_ROOT appear as server: sources,
                # sorted alphabetically. Loose files are ignored.
                os.makedirs(os.path.join(ingest_root, "z_cuthbert"))
                os.makedirs(os.path.join(ingest_root, "a_dibble"))
                with open(os.path.join(ingest_root, "loose_file"), "w") as f:
                    f.write("not a dir")
                self.assertEqual(
                    img_src(),
                    [
                        dict(
                            name="server:a_dibble",
                            description="Uploaded by a_dibble",
                        ),
                        dict(
                            name="server:z_cuthbert",
                            description="Uploaded by z_cuthbert",
                        ),
                        dict(
                            name="localdirselect:",
                            description="Upload directory from computer",
                        ),
                        dict(
                            name="fileselect:",
                            description="Upload selected files from computer",
                        ),
                        dict(
                            name="webcam:",
                            description="Take photo (default camera)",
                        ),
                    ],
                )

                # When image_id is present, a selected photolith: source is
                # prepended to feed the chosen image(s) back in for editing
                self.assertEqual(
                    img_src(get_data=dict(image_id="42")),
                    [
                        dict(
                            name="photolith:42",
                            description="Edit selected images",
                            selected=True,
                        ),
                        dict(
                            name="server:a_dibble",
                            description="Uploaded by a_dibble",
                        ),
                        dict(
                            name="server:z_cuthbert",
                            description="Uploaded by z_cuthbert",
                        ),
                        dict(
                            name="localdirselect:",
                            description="Upload directory from computer",
                        ),
                        dict(
                            name="fileselect:",
                            description="Upload selected files from computer",
                        ),
                        dict(
                            name="webcam:",
                            description="Take photo (default camera)",
                        ),
                    ],
                )

                # Multiple image_id values are joined into a single source
                self.assertEqual(
                    img_src(get_data=dict(image_id=["42", "43"]))[0],
                    dict(
                        name="photolith:42,43",
                        description="Edit selected images",
                        selected=True,
                    ),
                )

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
    maxDiff = None

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
        image = self.create_image()
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
            image=image,
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
            image=image,
        )
        self.assertEqual(
            out,
            {
                "alert": dict(
                    level="success",
                    messageHTML="Created 1 individual. <br><a "
                    'href="/search/?nm_image_id=3&nm_image_id=3" '
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
            image=image,
        )
        inds = Individual.objects.all().order_by("pk")
        self.assertEqual(
            out,
            {
                "alert": dict(
                    level="success",
                    messageHTML="Created 1 individual. Updated 2 individuals. <br><a "
                    'href="/search/?nm_image_id=3&nm_image_id=3" '
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
            image=image,
        )
        inds = Individual.objects.all().order_by("pk")
        self.assertEqual(len(inds), 5)
        self.assertEqual(
            out,
            {
                "alert": dict(
                    level="success",
                    messageHTML="Created 1 individual. <br><a "
                    'href="/search/?nm_image_id=3&nm_image_id=3" '
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
            image=image,
        )
        self.assertEqual(
            out,
            {
                "alert": {
                    "level": "success",
                    "messageHTML": "Updated 1 individual. Deleted 1 individual. <br><a "
                    'href="/search/?nm_image_id=3&nm_image_id=3" '
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
            image=image,
        )
        self.assertEqual(
            out,
            {
                "alert": {
                    "level": "success",
                    "messageHTML": "Updated 2 individuals. <br><a "
                    'href="/search/?nm_image_id=3&nm_image_id=3" '
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
            image=image,
        )
        self.assertEqual(
            out,
            (
                500,
                {
                    "error_class": "PermissionDenied",
                    "error": "Cannot edit Individual %d, was created by %s not you"
                    % (3, inds[3].created_by.username),
                },
            ),
        )

    def test_post__annotated_individual(self):
        """Cannot edit or delete an individual once it has annotations"""
        user = self.create_user(groups=["Ingest"])
        image = self.create_image()

        # Without annotations, updates go through normally
        ind = self.create_individual(
            image=image,
            bounding_box=[[0, 0], [100, 100]],
            created_by=user,
            data=dict(nm_length=100),
        )
        out = self.form_post(
            user,
            [
                dict(
                    nm_length=150,
                    _bb=[[0, 0], [110, 110]],
                    id=ind.id,
                ),
            ],
            image=image,
        )
        self.assertEqual(out["alert"]["level"], "success")
        ind.refresh_from_db()
        self.assertEqual(ind.bounding_box, [[0, 0], [110, 110]])
        self.assertEqual(ind.data["nm_length"], 150.0)

        # Once it has an annotation, updates are blocked
        self.create_annotation(individual=ind)
        out = self.form_post(
            user,
            [
                dict(
                    nm_length=200,
                    _bb=[[0, 0], [200, 200]],
                    id=ind.id,
                ),
            ],
            image=image,
        )
        self.assertEqual(
            out,
            (
                500,
                dict(
                    error_class="PermissionDenied",
                    error="Cannot edit %s, has already been annotated %d times"
                    % (str(ind), 1),
                ),
            ),
        )
        # The individual is unchanged
        ind.refresh_from_db()
        self.assertEqual(ind.bounding_box, [[0, 0], [110, 110]])
        self.assertEqual(ind.data["nm_length"], 150.0)

        # ...and deletes (clearing the bounding box) are blocked too
        out = self.form_post(
            user,
            [
                dict(
                    nm_length=150,
                    _bb=None,
                    id=ind.id,
                ),
            ],
            image=image,
        )
        self.assertEqual(
            out,
            (
                500,
                dict(
                    error_class="PermissionDenied",
                    error="Cannot edit %s, has already been annotated %d times"
                    % (str(ind), 1),
                ),
            ),
        )
        self.assertTrue(Individual.objects.filter(pk=ind.id).exists())

        # The count of annotations is reflected in the error message
        self.create_annotation(individual=ind)
        out = self.form_post(
            user,
            [
                dict(
                    nm_length=200,
                    _bb=[[0, 0], [200, 200]],
                    id=ind.id,
                ),
            ],
            image=image,
        )
        self.assertEqual(
            out,
            (
                500,
                dict(
                    error_class="PermissionDenied",
                    error="Cannot edit %s, has already been annotated %d times"
                    % (str(ind), 2),
                ),
            ),
        )

        # Submitting an annotated individual stops the rest of the batch
        # from being processed
        out = self.form_post(
            user,
            [
                dict(
                    nm_length=200,
                    _bb=[[0, 0], [300, 300]],
                    id=ind.id,
                ),
                dict(
                    nm_length=300,
                    _bb=[[0, 0], [50, 50]],
                ),
            ],
            image=image,
        )
        self.assertEqual(
            out,
            (
                500,
                dict(
                    error_class="PermissionDenied",
                    error="Cannot edit %s, has already been annotated %d times"
                    % (str(ind), 2),
                ),
            ),
        )
        self.assertEqual(
            list(Individual.objects.filter(image=image).values_list("pk", flat=True)),
            [ind.id],
        )

    def test_post__superuser_edits_any(self):
        """Superusers can edit individuals regardless of ownership"""
        owner = self.create_user(groups=["Ingest"])
        image = self.create_image()
        ind = self.create_individual(
            image=image,
            bounding_box=[[0, 0], [100, 100]],
            created_by=owner,
            data=dict(nm_length=100),
        )

        # A non-superuser, non-owner can't edit it
        other = self.create_user(groups=["Ingest"])
        out = self.form_post(
            other,
            [
                dict(
                    nm_length=200,
                    _bb=[[0, 0], [200, 200]],
                    id=ind.id,
                ),
            ],
            image=image,
        )
        self.assertEqual(
            out,
            (
                500,
                dict(
                    error_class="PermissionDenied",
                    error="Cannot edit %s, was created by %s not you"
                    % (str(ind), owner.username),
                ),
            ),
        )

        # A superuser can update it
        superuser = self.create_user(groups=[])
        superuser.is_superuser = True
        superuser.save()
        out = self.form_post(
            superuser,
            [
                dict(
                    nm_length=200,
                    _bb=[[0, 0], [200, 200]],
                    id=ind.id,
                ),
            ],
            image=image,
        )
        self.assertEqual(out["alert"]["level"], "success")
        ind.refresh_from_db()
        self.assertEqual(ind.bounding_box, [[0, 0], [200, 200]])
        self.assertEqual(ind.data["nm_length"], 200.0)
        # Ownership is preserved across a superuser edit
        self.assertEqual(ind.created_by, owner)

        # A superuser can also delete it
        out = self.form_post(
            superuser,
            [
                dict(
                    nm_length=200,
                    _bb=None,
                    id=ind.id,
                ),
            ],
            image=image,
        )
        self.assertEqual(out["alert"]["level"], "success")
        self.assertIn("Deleted 1 individual", out["alert"]["messageHTML"])
        self.assertFalse(Individual.objects.filter(pk=ind.id).exists())

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
