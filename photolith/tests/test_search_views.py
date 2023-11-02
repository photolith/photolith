import csv
import datetime

from django.test import Client, TestCase

from ..search.views import ExportView
from ..models import Annotation, Individual, Image, Project

from .requires_utils import RequiresUtils


class ExportViewTest(RequiresUtils, TestCase):
    maxDiff = None

    def test_call(self):
        userA = self.create_user("userA", groups=["Annotate", "Project Admin"])

        def export(with_annotations, search=dict()):
            client = Client()
            client.force_login(userA)
            resp = client.get("/search/export/%s/" % (with_annotations,), search)
            self.assertEqual(resp.status_code, 200)

            reader = csv.DictReader(l.decode("utf-8") for l in resp.streaming_content)
            for r in reader:
                # Make sure all dates are ISO formats
                if r["age"]:
                    datetime.datetime.fromisoformat(r["annotated_at"])
                    del r["annotated_at"]
                datetime.datetime.fromisoformat(r["created_at"])
                del r["created_at"]
                datetime.datetime.fromisoformat(r["modified_at"])
                del r["modified_at"]

                # Strip of URL base from image
                self.assertTrue(
                    r["image__content__url"].startswith("http://testserver/")
                )
                r["image__content__url"] = r["image__content__url"].replace(
                    "http://testserver", ""
                )

                # Remove empty entries to simplify output dicts
                yield {k: v for k, v in r.items() if v != ""}

        img = self.create_image(
            # Scale should multiply distances by 2
            scale_line=[(0, 0), (1, 0)],
            scale_mm=2,
        )
        # Make sure we include the right headers if the first item doesn't have any annotations
        ind0 = self.create_individual(
            image=img,
            bounding_box=[(0, 0), (0, 0)],
        )
        ind1 = self.create_individual(
            image=img,
            bounding_box=[(0, 0), (1, 1)],
        )
        ann11 = self.create_annotation(
            ind1,
            age=3,
            axis_poly=[(0, 0), (1, 0), (3, 0)],
            comment="The not-very-good annotation",
            authority=20,
        )
        ann12 = self.create_annotation(
            ind1,
            age=6,
            axis_poly=[(0, 0), (1, 0), (3, 0), (6, 0), (9, 0)],
            comment="A much better annotation",
            authority=80,
        )
        ind2 = self.create_individual(
            image=img,
            bounding_box=[(1, 1), (2, 2)],
        )
        self.assertEqual(
            list(export("all")),
            [
                {
                    "bounding_box": "[[0, 0], [0, 0]]",
                    "image__content__url": img.content.url,
                },
                {
                    "age": "10",
                    "annotated_by": "annotator",
                    "authority": "80",
                    "bounding_box": "[[0, 0], [1, 1]]",
                    "comment": "A much better annotation",
                    "growth_1": "2.0",
                    "growth_2": "4.0",
                    "growth_3": "6.0",
                    "growth_4": "6.0",
                    "image__content__url": img.content.url,
                    "rating": "100",
                },
                {
                    "age": "10",
                    "annotated_by": "annotator",
                    "authority": "20",
                    "bounding_box": "[[0, 0], [1, 1]]",
                    "comment": "The not-very-good annotation",
                    "growth_1": "2.0",
                    "growth_2": "4.0",
                    "image__content__url": img.content.url,
                    "rating": "100",
                },
                {
                    "bounding_box": "[[1, 1], [2, 2]]",
                    "image__content__url": img.content.url,
                },
            ],
        )
        self.assertEqual(
            list(export("best")),
            [
                {
                    "bounding_box": "[[0, 0], [0, 0]]",
                    "image__content__url": img.content.url,
                },
                {
                    "age": "10",
                    "annotated_by": "annotator",
                    "authority": "80",
                    "bounding_box": "[[0, 0], [1, 1]]",
                    "comment": "A much better annotation",
                    "growth_1": "2.0",
                    "growth_2": "4.0",
                    "growth_3": "6.0",
                    "growth_4": "6.0",
                    "image__content__url": img.content.url,
                    "rating": "100",
                },
                # NB: The not-very-good annotation isn't here
                {
                    "bounding_box": "[[1, 1], [2, 2]]",
                    "image__content__url": img.content.url,
                },
            ],
        )
