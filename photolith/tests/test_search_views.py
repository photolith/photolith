import codecs
import csv
import datetime
import json

from django.conf import settings
from django.core.exceptions import PermissionDenied
from django.test import Client, TestCase, RequestFactory

from ..search.views import IndexView
from ..models import Annotation, Individual, Image, Project

from .requires_utils import RequiresUtils


class IndexViewTest(RequiresUtils, TestCase):
    maxDiff = None

    def ctx_data(self, user, search=dict()):
        request = RequestFactory().get("/", search)
        request.user = user
        v = IndexView()
        v.setup(request, **(request.GET.dict()))
        out = v.get_context_data()
        return out

    def do_get_meta_fields(self):
        request = RequestFactory().get("/", dict())
        v = IndexView()
        v.setup(request, **(request.GET.dict()))
        out = v.get_meta_fields()
        return out

    def test_call__perms(self):
        """Not allowed access without general annotation / project"""
        user = self.create_user(groups=[])

        with self.assertRaisesRegex(PermissionDenied, "general annotation"):
            out = self.ctx_data(user)
        with self.assertRaisesRegex(PermissionDenied, "project"):
            p = self.create_project()
            out = self.ctx_data(user, dict(project=p.id))

    def test_get_meta_fields(self):
        self.assertEqual(
            self.do_get_meta_fields(),
            dict(
                dt_created_at={},
            ),
        )

    def test_get_meta_fields_numeric(self):
        self.create_individual(
            data=dict(
                nm_length=100,
            )
        )
        self.assertEqual(
            self.do_get_meta_fields()["nm_length"],
            dict(
                min=100.0,
                max=100.0,
            ),
        )
        self.create_individual(
            data=dict(
                nm_length=200,
            )
        )
        self.assertEqual(
            self.do_get_meta_fields()["nm_length"],
            dict(
                min=100.0,
                max=200.0,
            ),
        )

    def test_get_meta_fields_integer(self):
        self.create_individual(
            data=dict(
                in_length=100,
            )
        )
        self.assertEqual(
            self.do_get_meta_fields()["in_length"],
            dict(
                min=100.0,
                max=100.0,
            ),
        )
        self.create_individual(
            data=dict(
                in_length=200,
            )
        )
        self.assertEqual(
            self.do_get_meta_fields()["in_length"],
            dict(
                min=100.0,
                max=200.0,
            ),
        )

    def test_get_meta_fields_string(self):
        self.create_individual(
            data=dict(
                ch_name="Barry",
            )
        )
        self.assertEqual(
            self.do_get_meta_fields()["ch_name"],
            dict(
                char=True,
            ),
        )

    def test_get_meta_fields_taxonomy(self):
        self.create_individual(
            data=dict(
                tx_species={"id": 100, "en": "Fish", "is": "Fiskur"},
            )
        )
        self.assertEqual(
            self.do_get_meta_fields()["tx_species"],
            dict(choices=[{"en": "Fish", "id": 100, "is": "Fiskur"}]),
        )
        self.create_individual(
            data=dict(
                tx_species={"id": 200, "en": "Cat", "is": "Köttur"},
            )
        )
        self.assertEqual(
            self.do_get_meta_fields()["tx_species"],
            dict(
                choices=[
                    {"id": 100, "en": "Fish", "is": "Fiskur"},
                    {"id": 200, "en": "Cat", "is": "Köttur"},
                ]
            ),
        )


class DataViewTest(RequiresUtils, TestCase):
    maxDiff = None

    def data(self, user, search=dict(), expect_success=True):
        client = Client()
        client.force_login(user)
        resp = client.get("/search/data/", search)
        out = json.loads(b"".join(resp.streaming_content))
        if expect_success:
            if "error" in out.keys():
                self.fail(out)
            self.assertEqual(list(out.keys()), ["data"])
            return out["data"]
        return out

    def test_call__perms(self):
        """Not allowed access without general annotation / project"""
        user = self.create_user(groups=[])

        self.assertEqual(
            self.data(user, expect_success=False),
            dict(
                error_class="PermissionDenied",
                error="Contact an administrator to be added to the general annotation group",
            ),
        )
        p = self.create_project()
        self.assertEqual(
            self.data(user, dict(project=p.id), expect_success=False),
            dict(
                error_class="PermissionDenied",
                error="Contact an administrator to be added to this project",
            ),
        )

    def test_query_filter_numeric(self):
        userA = self.create_user(
            "userA", groups=["General Annotation Editor", "Project Admin"]
        )
        inds = [
            self.create_individual(
                data=dict(nm_length=i / 10),
            )
            for i in range(60)
        ]
        self.assertEqual(
            [x["id"] for x in self.data(userA, search=dict(nm_length="5"))],
            [x.id for x in [inds[50]]],
        )
        self.assertEqual(
            [x["id"] for x in self.data(userA, search=dict(nm_length=("2.4", "3.5")))],
            [x.id for x in inds[24:36]],
        )
        self.assertEqual(
            [x["id"] for x in self.data(userA, search=dict(nm_length=("", "3.2")))],
            [x.id for x in inds[0:33]],
        )
        self.assertEqual(
            [x["id"] for x in self.data(userA, search=dict(nm_length=("7.6", "")))],
            [x.id for x in inds[76:60]],
        )

    def test_query_filter_date(self):
        userA = self.create_user(
            "userA", groups=["General Annotation Editor", "Project Admin"]
        )
        inds = [
            self.create_individual(
                data=dict(dt_sampled="2010-04-%02dT00:00:00+00:00" % (i + 1)),
            )
            for i in range(10)
        ]
        self.assertEqual(
            [x["id"] for x in self.data(userA, search=dict(dt_sampled="2010-04-05"))],
            [x.id for x in [inds[4]]],  # NB: 0 indexed
        )
        self.assertEqual(
            [
                x["id"]
                for x in self.data(
                    userA, search=dict(dt_sampled=("2010-04-06", "2010-04-08"))
                )
            ],
            [x.id for x in inds[5:8]],  # NB: 0 indexed
        )
        self.assertEqual(
            [
                x["id"]
                for x in self.data(userA, search=dict(dt_sampled=("2010-04-03", "")))
            ],
            [x.id for x in inds[2:10]],  # NB: 0 indexed
        )
        self.assertEqual(
            [
                x["id"]
                for x in self.data(userA, search=dict(dt_sampled=("", "2010-04-02")))
            ],
            [x.id for x in inds[0:2]],  # NB: 0 indexed
        )

    def test_query_filter_integer(self):
        userA = self.create_user(
            "userA", groups=["General Annotation Editor", "Project Admin"]
        )
        # Create individuals with station=0..9
        inds = [
            self.create_individual(
                data=dict(
                    in_station=s,
                )
            )
            for s in range(10)
        ]
        self.assertEqual(
            [x["id"] for x in self.data(userA, search=dict(in_station=(5)))],
            [x.id for x in [inds[5]]],
        )
        self.assertEqual(
            [x["id"] for x in self.data(userA, search=dict(in_station=(0, 3)))],
            [x.id for x in inds[0:4]],
        )
        self.assertEqual(
            [x["id"] for x in self.data(userA, search=dict(in_station=(2, 5)))],
            [x.id for x in inds[2:6]],
        )
        self.assertEqual(
            [x["id"] for x in self.data(userA, search=dict(in_station=(2, 99)))],
            [x.id for x in inds[2:10]],
        )

    def test_truncated_results(self):
        userA = self.create_user(
            "userA", groups=["General Annotation Editor", "Project Admin"]
        )

        img = self.create_image(
            # Scale should multiply distances by 2
            scale_line=[(0, 0), (1, 0)],
            scale_mm=2,
        )
        for i in range(settings.SEARCH_RESULT_MAX_ROWS + 4):
            self.create_individual(
                image=img,
                bounding_box=[(i, i), (i + 1, i + 1)],
                data=dict(nm_category=i // 10),
            )

        # A filtered subset is fine
        out = [
            (r["id"] if "id" in r else r)
            for r in self.data(userA, dict(nm_category=[4, 5]))
        ]
        self.assertEqual(out, list(range(41, 61)))

        # Every possible result results in truncated response
        out = [(r["id"] if "id" in r else r) for r in self.data(userA, dict())]
        self.assertEqual(
            out,
            list(range(1, settings.SEARCH_RESULT_MAX_ROWS + 1))
            + [
                dict(
                    truncated="Too many results, only first %d returned"
                    % settings.SEARCH_RESULT_MAX_ROWS
                )
            ],
        )


class ExportViewTest(RequiresUtils, TestCase):
    maxDiff = None

    def export(self, user, with_annotations, search=dict()):
        client = Client()
        client.force_login(user)
        resp = client.get("/search/export/%s/" % (with_annotations,), search)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.headers["Content-Type"], "text/csv")
        self.assertEqual(
            resp.headers["Content-Disposition"],
            'attachment; filename="photolith-export.csv"',
        )

        body = b"".join(resp.streaming_content)
        # Got a BOM, so Excel will think the content is unicode
        self.assertTrue(body.startswith(codecs.BOM_UTF8))

        reader = csv.DictReader(body.decode("utf-8-sig").split("\r\n"))
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
            self.assertTrue(r["image__content__url"].startswith("http://testserver/"))
            r["image__content__url"] = r["image__content__url"].replace(
                "http://testserver", ""
            )

            # Remove empty entries to simplify output dicts
            yield {k: v for k, v in r.items() if v != ""}

    def test_call__perms(self):
        """Not allowed access without general annotation / project"""
        user = self.create_user(groups=[])

        with self.assertRaisesRegex(PermissionDenied, "general annotation"):
            out = list(self.export(user, "all"))
        with self.assertRaisesRegex(PermissionDenied, "project"):
            p = self.create_project()
            out = list(self.export(user, "all", dict(project=p.id)))

    def test_call(self):
        userA = self.create_user(
            "userA", groups=["General Annotation Editor", "Project Admin"]
        )

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
            comment="Ekki mjög góð skýring",
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
            list(self.export(userA, "all")),
            [
                {
                    "bounding_box": "[[0, 0], [0, 0]]",
                    "image__content__url": img.content.url,
                    "num_annotations": "0",
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
                    "num_annotations": "2",
                },
                {
                    "age": "10",
                    "annotated_by": "annotator",
                    "authority": "20",
                    "bounding_box": "[[0, 0], [1, 1]]",
                    "comment": "Ekki mjög góð skýring",
                    "growth_1": "2.0",
                    "growth_2": "4.0",
                    "image__content__url": img.content.url,
                    "rating": "100",
                    "num_annotations": "2",
                },
                {
                    "bounding_box": "[[1, 1], [2, 2]]",
                    "image__content__url": img.content.url,
                    "num_annotations": "0",
                },
            ],
        )
        self.assertEqual(
            list(self.export(userA, "best")),
            [
                {
                    "bounding_box": "[[0, 0], [0, 0]]",
                    "image__content__url": img.content.url,
                    "num_annotations": "0",
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
                    "num_annotations": "2",
                },
                # NB: Ekki mjög góð skýring isn't here
                {
                    "bounding_box": "[[1, 1], [2, 2]]",
                    "image__content__url": img.content.url,
                    "num_annotations": "0",
                },
            ],
        )

    def test_call__noscale(self):
        userA = self.create_user(
            "userA", groups=["General Annotation Editor", "Project Admin"]
        )

        img = self.create_image(
            scale_line=[(0, 0), (1, 0)],
            scale_mm=None,
        )
        ind1 = self.create_individual(
            image=img,
            bounding_box=[(0, 0), (1, 1)],
        )
        ann11 = self.create_annotation(
            ind1,
            age=3,
            axis_poly=[(0, 0), (1, 0), (3, 0)],
        )
        # No growth columns
        self.assertEqual(
            list(self.export(userA, "best")),
            [
                {
                    "age": "10",
                    "annotated_by": "annotator",
                    "authority": "0",
                    "bounding_box": "[[0, 0], [1, 1]]",
                    "image__content__url": img.content.url,
                    "rating": "100",
                    "num_annotations": "1",
                }
            ],
        )

        # Set scale_mm, they come back
        img.scale_mm = 1
        img.save()
        self.assertEqual(
            list(self.export(userA, "best")),
            [
                {
                    "age": "10",
                    "annotated_by": "annotator",
                    "authority": "0",
                    "bounding_box": "[[0, 0], [1, 1]]",
                    "growth_1": "1.0",
                    "growth_2": "2.0",
                    "image__content__url": img.content.url,
                    "rating": "100",
                    "num_annotations": "1",
                }
            ],
        )
