import datetime

from django.test import TestCase

from ..models import *

from .requires_utils import RequiresUtils


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

        # Not open yesterday
        p.date_end = datetime.date.today() - datetime.timedelta(days=1)
        self.assertEqual(p.is_open, False)
