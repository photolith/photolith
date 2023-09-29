import json

from django.test import Client, TestCase

from ..ingest.views import *
from ..models import Individual, Image

from .requires_utils import RequiresUtils


class UploadViewTest(RequiresUtils, TestCase):
    def form_post(self, user, ind_data=[]):
        image = self.create_image()
        post_dict = dict(
            image_content=image.content.name,
        )
        for i, (data, bounding_box) in enumerate(ind_data):
            post_dict["data:%d" % i] = json.dumps(data)
            post_dict["bounding_box:%d" % i] = json.dumps(bounding_box)

        client = Client()
        client.force_login(user)
        resp = client.post("/ingest/upload/", post_dict)
        if resp.status_code != 200:
            return resp.status_code
        out = json.loads(resp.content)
        if "created_individuals" in out:
            for i, new in enumerate(out["created_individuals"]):
                self.assertEqual(new["created_by"], user.id)
                self.assertEqual(new["image"], image.id)
                self.assertEqual(new["bounding_box"], ind_data[i][1])
            return out["created_individuals"]
        raise ValueError(str(out))

    def test_post(self):
        # You need to be part of the ingest group to post
        user = self.create_user(groups=[])
        self.assertEqual(self.form_post(user), 403)

        # Can create nothing successfully
        user = self.create_user(groups=["Ingest"])
        self.assertEqual(self.form_post(user), [])

        # Create 2 individuals
        user = self.create_user(groups=["Ingest"])
        self.assertEqual(
            len(
                self.form_post(
                    user,
                    [
                        (
                            dict(
                                species={"id": 100, "en": "Fish", "is": "Fiskur"},
                                length=100,
                            ),
                            [[0, 0], [100, 100]],
                        ),
                        (
                            dict(
                                species={"id": 200, "en": "Cat", "is": "Köttur"},
                                length=100,
                            ),
                            [[0, 0], [200, 200]],
                        ),
                        (
                            # NB: Will be ignored since there's no bounding box
                            dict(
                                species={"id": 200, "en": "Cat", "is": "Köttur"},
                                length=300,
                            ),
                            None,
                        ),
                    ],
                )
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
            {"length": 100.0, "species": {"id": 100, "en": "Fish", "is": "Fiskur"}},
        )
        self.assertEqual(inds[1].bounding_box, [[0, 0], [200, 200]])
        self.assertEqual(
            inds[1].data,
            {"length": 100.0, "species": {"id": 200, "en": "Cat", "is": "Köttur"}},
        )
