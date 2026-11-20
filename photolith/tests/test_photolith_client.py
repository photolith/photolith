import datetime
from urllib.parse import urlsplit

import requests
from django.test import Client, TestCase, override_settings
from photolith_client import (
    Conflict,
    NotFound,
    PermissionDenied,
    PhotolithClient,
    PreconditionFailed,
    SearchTruncated,
    Unauthorized,
    ValidationError,
    search_params,
)

from ..models import Annotation, ApiToken, Image, Individual

from .binaries import JPEG_VALID
from .requires_utils import RequiresUtils


class DjangoClientAdapter(requests.adapters.BaseAdapter):
    """requests adapter that sends requests to the Django test client"""

    def send(self, request, **kwargs):
        url = urlsplit(request.url)
        headers = dict(request.headers)
        content_type = headers.pop("Content-Type", "")
        for k in ("Content-Length", "Host"):
            headers.pop(k, None)
        body = request.body or b""
        if isinstance(body, str):
            body = body.encode("utf8")

        resp = Client().generic(
            request.method,
            url.path + ("?" + url.query if url.query else ""),
            body,
            content_type=content_type,
            headers=headers,
        )
        out = requests.Response()
        out.status_code = resp.status_code
        out.reason = resp.reason_phrase
        out.headers = requests.structures.CaseInsensitiveDict(resp.headers)
        out._content = (
            b"".join(resp.streaming_content) if resp.streaming else resp.content
        )
        out.encoding = "utf-8"
        out.url = request.url
        out.request = request
        return out

    def close(self):
        pass


class PhotolithClientTest(RequiresUtils, TestCase):
    maxDiff = None

    def client_for(self, user, key=None):
        if key is None:
            token = ApiToken(user=user, name="UT client")
            key = token.generate_key()
            token.save()
        session = requests.Session()
        session.mount("http://testserver/", DjangoClientAdapter())
        return PhotolithClient("http://testserver/", key, session=session)

    def superuser(self):
        out = self.create_user(groups=["Ingest"])
        out.is_superuser = True
        out.save()
        return out

    def test_whoami(self):
        user = self.create_user("jbloggs")
        out = self.client_for(user).whoami()
        self.assertEqual((out["id"], out["username"]), (user.id, "jbloggs"))

        with self.assertRaisesRegex(Unauthorized, "Invalid API token") as cm:
            self.client_for(user, key="parp").whoami()
        self.assertEqual(
            (cm.exception.status, cm.exception.error_class), (401, "Unauthorized")
        )

    def test_images(self):
        client = self.client_for(self.superuser())

        # Upload, filename is URI-encoded, mimetype guessed
        img = client.upload_image(JPEG_VALID, filename="GHL ü.jpg")
        self.assertEqual(img.status, 201)
        self.assertEqual(
            (img["created"], img["orig_filename"], img["mimetype"]),
            (True, "GHL ü.jpg", "image/jpeg"),
        )
        self.assertEqual(Image.objects.get(pk=img["id"]).orig_filename, "GHL ü.jpg")
        img2 = client.upload_image(JPEG_VALID, filename="again.jpg")
        self.assertEqual(
            (img2.status, img2["id"], img2["created"]), (200, img["id"], False)
        )
        with self.assertRaisesRegex(ValueError, "mimetype"):
            client.upload_image(JPEG_VALID, filename="parp")

        img.pop("created")
        self.assertEqual(client.get_image(img["id"]), img)
        with self.assertRaises(NotFound):
            client.get_image(999999)

        # Scale, values not given are left alone
        out = client.set_image_scale(
            img["id"], scale_line=[[0, 0], [10, 0]], scale_mm=5
        )
        self.assertEqual((out["scale_line"], out["scale_mm"]), ([[0, 0], [10, 0]], 5))
        out = client.set_image_scale(img["id"], scale_mm=6)
        self.assertEqual((out["scale_line"], out["scale_mm"]), ([[0, 0], [10, 0]], 6))
        out = client.set_image_scale(img["id"], scale_line=None, scale_mm=None)
        self.assertEqual((out["scale_line"], out["scale_mm"]), (None, None))
        with self.assertRaisesRegex(ValidationError, "scale_line should be"):
            client.set_image_scale(img["id"], scale_line=[0, 0])

        # Scale can be set when uploading, upload's created / status kept
        out = client.upload_image(
            JPEG_VALID, filename="scaled.jpg", scale_line=[[1, 1], [5, 1]], scale_mm=2
        )
        self.assertEqual(
            (out.status, out["id"], out["created"], out["scale_line"], out["scale_mm"]),
            (200, img["id"], False, [[1, 1], [5, 1]], 2),
        )
        out = client.upload_image(JPEG_VALID, filename="scaled.jpg", scale_mm=3)
        self.assertEqual((out["scale_line"], out["scale_mm"]), ([[1, 1], [5, 1]], 3))
        image = Image.objects.get(pk=img["id"])
        self.assertEqual((image.scale_line, image.scale_mm), ([[1, 1], [5, 1]], 3))
        with self.assertRaisesRegex(ValidationError, "scale_line should be"):
            client.upload_image(JPEG_VALID, filename="scaled.jpg", scale_line=[0, 0])

        # Without permissions
        with self.assertRaisesRegex(PermissionDenied, "photolith.add_image"):
            self.client_for(self.create_user()).upload_image(
                JPEG_VALID, filename="x.jpg"
            )

    def test_individuals(self):
        client = self.client_for(self.superuser())
        img = self.create_image()

        out = client.put_individuals(
            img.id,
            [
                dict(
                    bounding_box=[[0, 0], [10, 10]],
                    data=dict(ch_slideLabel="1", ch_individualLabel="1"),
                ),
                dict(
                    bounding_box=[[10, 0], [20, 10]],
                    data=dict(ch_slideLabel="1", ch_individualLabel="2"),
                ),
            ],
        )
        ind1, ind2 = (
            out["created"]["individuals[0]"],
            out["created"]["individuals[1]"],
        )
        got = client.get_individuals(img.id)
        self.assertEqual([i["id"] for i in got["individuals"]], [ind1, ind2])
        self.assertEqual(got.etag, out.etag)

        # Missing an existing individual, per-entry errors
        with self.assertRaises(ValidationError) as cm:
            client.put_individuals(
                img.id, [dict(id=ind1, bounding_box=[[0, 0], [10, 10]], data={})]
            )
        self.assertEqual(
            sorted(cm.exception.fields.keys()),
            [
                "individuals",
                "individuals[0].data.ch_individualLabel",
                "individuals[0].data.ch_slideLabel",
            ],
        )

        # Changed since etag
        client.update_individual(ind1, data=dict(nm_length=3.5))
        with self.assertRaises(PreconditionFailed):
            client.put_individuals(img.id, [], if_match=got.etag)

        # update_individual() merges data
        out = client.update_individual(ind1, bounding_box=[[0, 0], [11, 11]])
        self.assertEqual(
            (out["bounding_box"], out["data"]),
            (
                [[0, 0], [11, 11]],
                dict(ch_slideLabel="1", ch_individualLabel="1", nm_length=3.5),
            ),
        )

        # Annotations get in the way of changing bounding boxes / deleting
        ann = self.create_annotation(Individual.objects.get(pk=ind2))
        with self.assertRaises(Conflict) as cm:
            client.update_individual(ind2, bounding_box=[[0, 0], [1, 1]])
        self.assertEqual(cm.exception.annotations, [ann.id])
        with self.assertRaises(Conflict) as cm:
            client.delete_individual(ind2)
        self.assertEqual(cm.exception.annotations, [ann.id])
        client.delete_annotation(ann.id)
        client.delete_individual(ind2)
        with self.assertRaises(NotFound):
            client.delete_individual(ind2)
        self.assertEqual([i.id for i in Individual.objects.filter(image=img)], [ind1])

    def test_sync_individuals(self):
        client = self.client_for(self.superuser())
        img = self.create_image()
        ind1 = self.create_individual(
            image=img, data=dict(ch_slideLabel="1", ch_individualLabel="1")
        )
        ind2 = self.create_individual(
            image=img,
            data=dict(
                ch_slideLabel="1", ch_individualLabel="2", tx_species=dict(id=100)
            ),
        )

        # ind1 matched by labels, new individual created, ind2 left alone
        out = client.sync_individuals(
            img.id,
            [
                dict(
                    bounding_box=[[0, 0], [5, 5]],
                    data=dict(ch_slideLabel="1", ch_individualLabel="3"),
                ),
                dict(
                    bounding_box=[[0, 0], [50, 50]],
                    data=dict(ch_slideLabel="1", ch_individualLabel="1", nm_length=2.0),
                ),
            ],
        )
        ind3 = Individual.objects.get(image=img, metachar__value="3")
        self.assertEqual(out["ids"], [ind3.id, ind1.id])
        self.assertEqual(
            {i["id"]: i["data"] for i in out["individuals"]},
            {
                ind1.id: dict(ch_slideLabel="1", ch_individualLabel="1", nm_length=2.0),
                ind2.id: Individual.objects.get(pk=ind2.id).data,
                ind3.id: dict(ch_slideLabel="1", ch_individualLabel="3"),
            },
        )
        self.assertEqual(
            Individual.objects.get(pk=ind2.id).data["tx_species"]["id"], 100
        )

        # delete_missing removes the others
        out = client.sync_individuals(
            img.id,
            [
                dict(
                    bounding_box=[[0, 0], [5, 5]],
                    data=dict(ch_slideLabel="1", ch_individualLabel="3"),
                ),
            ],
            delete_missing=True,
        )
        self.assertEqual(out["ids"], [ind3.id])
        self.assertEqual(sorted(out["deleted"].values()), sorted([ind1.id, ind2.id]))
        self.assertEqual(
            [i.id for i in Individual.objects.filter(image=img)], [ind3.id]
        )

    def test_search(self):
        client = self.client_for(self.superuser())
        img = self.create_image()
        inds = [
            self.create_individual(
                image=img,
                data=dict(ch_slideLabel="1", ch_individualLabel=str(i), in_count=i),
            )
            for i in range(3)
        ]
        ann = self.create_annotation(inds[0])

        rows = client.search(nm_image_id=img.id)
        self.assertEqual([r["id"] for r in rows], [i.id for i in inds])
        self.assertEqual(rows.alert, None)
        rows = client.search(nm_image_id=img.id, ch_individualLabel=["0", "2"])
        self.assertEqual([r["id"] for r in rows], [inds[0].id, inds[2].id])
        rows = client.search(nm_image_id=img.id, in_count=(1, None))
        self.assertEqual([r["id"] for r in rows], [inds[1].id, inds[2].id])

        rows = client.search(
            {"nm_image_id": img.id, "ch_individualLabel": "0"},
            with_annotations="all",
            with_associated_images=True,
        )
        self.assertEqual(
            [(r["id"], r["annotation_id"], r["image_id"]) for r in rows],
            [(inds[0].id, ann.id, img.id)],
        )
        self.assertEqual(list(rows.images.keys()), [str(img.id)])

        with override_settings(SEARCH_RESULT_MAX_ROWS=2):
            with self.assertRaisesRegex(SearchTruncated, "Too many results") as cm:
                client.search(nm_image_id=img.id)
        self.assertEqual(len(cm.exception.result), 2)

        with self.assertRaisesRegex(ValidationError, "Invalid search"):
            client.search(in_count="parp")

    def test_search_params(self):
        self.assertEqual(
            search_params(
                dict(
                    nm_length=3.5,
                    in_count=(1, None),
                    dt_caught=datetime.datetime(2024, 1, 2, 3, 4),
                    dt_landed=(None, datetime.date(2024, 2, 3)),
                    ch_slideLabel=["12", "13"],
                    ch_individualLabel="3",
                    with_associated_images=True,
                    with_image_url=False,
                    project=None,
                )
            ),
            [
                ("nm_length", "3.5"),
                ("nm_length", "3.5"),
                ("in_count", "1"),
                ("in_count", ""),
                ("dt_caught", "2024-01-02"),
                ("dt_caught", "2024-01-02"),
                ("dt_landed", ""),
                ("dt_landed", "2024-02-03"),
                ("ch_slideLabel", "12"),
                ("ch_slideLabel", "13"),
                ("ch_individualLabel", "3"),
                ("with_associated_images", "1"),
            ],
        )
        with self.assertRaisesRegex(ValueError, "nm_length should be"):
            search_params(dict(nm_length=[1, 2, 3]))

    def test_annotations(self):
        user = self.create_user("jbloggs", groups=["General Annotation Editor"])
        client = self.client_for(user)
        ind = self.create_individual()

        ann = client.create_annotation(
            ind.id, age=7, rating=2, authority=20, axis_poly=[[50, 50], [90, 20]]
        )
        self.assertEqual(ann.status, 201)
        self.assertEqual(
            (ann["individual_id"], ann["created_by"], ann["rating"], ann["comment"]),
            (ind.id, "jbloggs", "2", ""),
        )
        self.assertEqual(
            Annotation.objects.get(pk=ann["id"]).rating, Annotation.Rating.DIFFICULT
        )

        with self.assertRaises(ValidationError) as cm:
            client.create_annotation(
                ind.id, age="x", rating="4", authority=20, axis_poly=[[0, 0]]
            )
        self.assertEqual(sorted(cm.exception.fields.keys()), ["age", "rating"])

        # Only the owner can delete
        other = self.client_for(self.create_user(groups=["General Annotation Editor"]))
        with self.assertRaisesRegex(PermissionDenied, "You do not own"):
            other.delete_annotation(ann["id"])
        client.delete_annotation(ann["id"])
        self.assertFalse(Annotation.objects.filter(pk=ann["id"]).exists())
        with self.assertRaises(NotFound):
            client.delete_annotation(ann["id"])
