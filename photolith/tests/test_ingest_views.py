import itertools
import json
import urllib.parse
import re

from django.test import Client, TestCase

from ..ingest.views import *
from ..models import Individual, Image

from .binaries import JPEG_VALID, JPEG_TRUNCATED, GIF_VALID
from .requires_utils import RequiresUtils


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
            image_content=image.content.name,
        )
        post_dict["scale_line"] = json.dumps(scale_line) if scale_line else ""
        post_dict["scale_mm"] = str(scale_mm or "")
        for i, data in enumerate(ind_data):
            if not data:
                continue
            post_dict["bounding_box:%d" % i] = json.dumps(data["_bb"])
            if "_id" in data:
                post_dict["individual_id:%d" % i] = json.dumps(data["_id"])
            post_dict["data:%d" % i] = json.dumps(
                {k: v for k, v in data.items() if k not in ("_bb", "_id")}
            )

        client = Client()
        client.force_login(user)
        resp = client.post("/ingest/upload/", post_dict)
        if resp.status_code != 200:
            return resp.status_code
        out = json.loads(resp.content)
        if "created_individuals" in out:
            for k, id in itertools.chain(
                out["created_individuals"].items(), out["updated_individuals"].items()
            ):
                data = ind_data[int(k)]
                new = Individual.objects.get(pk=id)
                if not data.get("_id"):
                    self.assertEqual(new.created_by, user)
                self.assertEqual(new.image, image)
                self.assertEqual(new.bounding_box, data["_bb"])
            return out
        raise ValueError(str(out))

    def test_post(self):
        # You need to be part of the ingest group to post
        user = self.create_user(groups=[])
        self.assertEqual(self.form_post(user), 403)

        # Can create nothing, but user gets a warning
        user = self.create_user(groups=["Ingest"])
        self.assertEqual(
            self.form_post(user),
            dict(
                alert_status="warning",
                alert="No individual boxes on image! Nothing saved.",
                created_individuals={},
                updated_individuals={},
            ),
        )

        # Create 2 individuals
        user = self.create_user(groups=["Ingest"])
        self.assertEqual(
            len(
                self.form_post(
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
                )["created_individuals"]
            ),
            2,
        )

        # We can find them in the database
        Individual.objects.all().order_by("pk")
        inds = Individual.objects.all().order_by("pk")
        self.assertEqual(len(inds), 2)
        self.assertEqual(inds[0].bounding_box, [[0, 0], [100, 100]])
        self.assertEqual(
            inds[0].data,
            {"nm_length": 100.0, "tx_species": {"id": 100, "en": "Fish", "is": "Fiskur"}},
        )
        self.assertEqual(inds[1].bounding_box, [[0, 0], [200, 200]])
        self.assertEqual(
            inds[1].data,
            {"nm_length": 100.0, "tx_species": {"id": 200, "en": "Cat", "is": "Köttur"}},
        )

        # Create 1 individual, with keys that don't start at 1
        user = self.create_user(groups=["Ingest"])
        self.assertEqual(
            len(
                self.form_post(
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
                )["created_individuals"]
            ),
            1,
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
                    _id=inds[2].id,
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
                    _id=inds[1].id,
                ),
            ],
        )
        inds = Individual.objects.all().order_by("pk")
        self.assertEqual(
            out,
            dict(
                alert_status="success",
                alert="Created 1 individual. Updated 2 individuals. ",
                created_individuals={"1": inds[3].id},
                updated_individuals={"0": inds[2].id, "2": inds[1].id},
            ),
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
        m = re.search(
            r'<a href="/search/\?([^"]+)".*>Show individuals</a>', out["alert"]
        )
        qs = urllib.parse.parse_qs(m.group(1))
        self.assertEqual(list(qs.keys()), ["ch_slideLabel"])
        self.assertEqual(set(qs["ch_slideLabel"]), set(("AB-02", "AB-01")))

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
