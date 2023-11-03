import datetime

from django.test import TestCase

from ..models import *

from .requires_utils import RequiresUtils


class ImageTest(RequiresUtils, TestCase):
    def test_px_to_mm(self):
        def px_to_mm(scale_line, scale_mm):
            i = self.create_image(scale_line=scale_line, scale_mm=scale_mm)
            return i.px_to_mm()

        self.assertAlmostEqual(
            px_to_mm([(10, 20), (30, 50)], 10),
            0.2773500981126146,
        )


class IndividualTest(RequiresUtils, TestCase):
    def test_data(self):
        """Make sure we can get and set data JSON, updating schema transparently"""
        ind1 = self.create_individual()
        ind2 = self.create_individual()

        # Data initially empty
        self.assertEqual(ind1.data, dict())

        # Set length
        ind1.data = dict(length=42, name="frank")
        self.assertEqual(ind1.data, dict(length=42, name="frank"))

        # Set length on second individual, forces type
        ind1.data = dict(length="39", name=5)
        self.assertEqual(ind1.data, dict(length=39, name="5"))
        ind2.data = dict(length="40", name=22)
        self.assertEqual(ind2.data, dict(length=40, name="22"))

        # ISO dates get translated
        ind1.data = dict(length=39, name="5", time="20230912T082738Z")
        self.assertTrue(isinstance(MetaDT.objects.all()[0].value, datetime.datetime))
        self.assertEqual(
            ind1.data,
            dict(
                length=39,
                name="5",
                time=MetaDT.objects.all()[0].value,
            ),
        )

        # Taxonomy values added, recycled
        ind1.data = dict(
            length=39,
            name="5",
            time="20230912T082738Z",
            species={"id": 100, "en": "Fish", "is": "Fiskur"},
        )
        self.assertEqual(
            ind1.data,
            dict(
                length=39,
                name="5",
                species={"en": "Fish", "id": 100, "is": "Fiskur"},
                time=MetaDT.objects.all()[0].value,
            ),
        )
        ind2.data = dict(
            length="40", name=22, species={"id": 200, "en": "Cat", "is": "Köttur"}
        )
        self.assertEqual(
            ind2.data,
            dict(
                length=40,
                name="22",
                species={"id": 200, "en": "Cat", "is": "Köttur"},
            ),
        )
        ind2.data = dict(
            length="40", name=22, species={"id": 100, "en": "Fish", "is": "Fiskur"}
        )
        self.assertEqual(
            ind2.data,
            dict(
                length=40,
                name="22",
                species={"id": 100, "en": "Fish", "is": "Fiskur"},
            ),
        )
        self.assertEqual(
            [(o.key, o.str_en) for o in Taxonomy.objects.all()],
            [
                ("species", "Fish"),
                ("species", "Cat"),
            ],
        )

        # But not across terms
        ind2.data = dict(
            length="40",
            name=22,
            species={"id": 200, "en": "Cat", "is": "Köttur"},
            eats={"id": 100, "en": "Fish", "is": "Fiskur"},
        )
        self.assertEqual(
            ind2.data,
            dict(
                length=40,
                name="22",
                species={"id": 200, "en": "Cat", "is": "Köttur"},
                eats={"id": 100, "en": "Fish", "is": "Fiskur"},
            ),
        )
        self.assertEqual(
            [(o.key, o.str_en) for o in Taxonomy.objects.all()],
            [
                ("species", "Fish"),
                ("species", "Cat"),
                ("eats", "Fish"),
            ],
        )

        # Unknown types are an error
        with self.assertRaisesRegex(ValueError, "parents"):
            ind2.data = dict(parents=["Bob", "Carla"])

    def test_str(self):
        self.assertEqual(str(self.create_individual()), "Individual 1")
        self.assertEqual(str(self.create_individual()), "Individual 2")
        self.assertEqual(
            str(
                self.create_individual(
                    data=dict(
                        slideLabel="UT slide 01",
                    )
                )
            ),
            "UT slide 01",
        )
        self.assertEqual(
            str(
                self.create_individual(
                    data=dict(
                        slideLabel="UT slide 02",
                        individualLabel="009",
                    )
                )
            ),
            "UT slide 02 : 009",
        )


class AnnotationTest(RequiresUtils, TestCase):
    def assertAlmostEqualList(self, a, b):
        self.assertEqual(len(a), len(b))
        for i in range(len(a)):
            self.assertAlmostEqual(a[i], b[i])

    def test_axis_poly_dists(self):
        def axis_poly_dists(axis_poly):
            ind = self.create_individual()
            ann = self.create_annotation(ind, axis_poly=axis_poly)
            return ann.axis_poly_dists()

        self.assertAlmostEqualList(
            axis_poly_dists([(0, 0), (10, 15), (20, 20), (30, 30)]),
            [18.027756377319946, 11.180339887498949, 14.142135623730951],
        )
        self.assertAlmostEqualList(
            axis_poly_dists([(20, 20), (30, 30), (40, 40)]),
            [14.142135623730951, 14.142135623730951],
        )


class ProjectTest(TestCase):
    maxDiff = None

    def test_is_open(self):
        """A project is open iff it's end_date hasn't passed"""
        p = Project.objects.create()

        # Initially date_end is in 4 weeks, is open
        self.assertEqual(
            p.date_end,
            datetime.date.today() + datetime.timedelta(weeks=4),
        )
        self.assertEqual(p.is_open, True)

        # Is still open today
        p.date_end = datetime.date.today()
        self.assertEqual(p.is_open, True)
        self.assertEqual(p.is_closed, not p.is_open)

        # Not open yesterday
        p.date_end = datetime.date.today() - datetime.timedelta(days=1)
        self.assertEqual(p.is_open, False)
        self.assertEqual(p.is_closed, not p.is_open)
