import io
import json
import sys


from django.db import reset_queries
from django.test.testcases import override_settings

from .requires_migrations import MigrationTestCase


class Capturing(list):
    # https://stackoverflow.com/a/16571630
    def __enter__(self):
        self._stdout = sys.stdout
        sys.stdout = self._stringio = io.StringIO()
        return self

    def __exit__(self, *args):
        self.extend(self._stringio.getvalue().splitlines())
        del self._stringio
        sys.stdout = self._stdout


class Migrations0030TestCase(MigrationTestCase):
    migrate_from = [("photolith", "0029_alter_userspeciesauthority_options_and_more")]
    migrate_to = [("photolith", "0030_remove_meta_duplicates")]

    @override_settings(DEBUG=True)
    def test_migration(self):
        reset_queries()
        Individual = self.old_apps.get_model("photolith", "Individual")
        Image = self.old_apps.get_model("photolith", "Image")
        Taxonomy = self.old_apps.get_model("photolith", "Taxonomy")
        MetaNumeric = self.old_apps.get_model("photolith", "MetaNumeric")
        MetaDT = self.old_apps.get_model("photolith", "MetaDT")
        MetaChar = self.old_apps.get_model("photolith", "MetaChar")

        # Create some invalid data
        img = Image.objects.create(
            orig_filename="ut_image001.jpg",
            mimetype="image/jpeg",
            scale_line=[(10, 10), (20, 20)],
            scale_mm=10,
        )
        ind1 = Individual.objects.create(
            image_id=img.id, bounding_box=[[0, 0], [100, 100]], created_by=None
        )
        ind2 = Individual.objects.create(
            image_id=img.id, bounding_box=[[0, 0], [200, 200]], created_by=None
        )

        # Make duplicates for each type
        i1_lengths = [18, 29, 14]
        i1_weights = [100, 200, 300]
        i1_animals = ["cow", "dog", "sheep"]
        i1_colors = ["pink", "red"]
        i1_whens = [
            "2026-04-10T09:59:54.922000+00:00",
            "2026-04-11T09:59:54.922000+00:00",
            "2026-04-12T09:59:54.922000+00:00",
        ]
        i2_lengths = [92, 182]
        i2_weights = [300, 100]
        i2_animals = ["rabbit", "sheep", "fox"]
        i2_colors = ["pink", "orange"]
        i2_whens = [
            "2026-04-10T09:59:54.922000+00:00",
            "2026-04-11T09:59:54.922000+00:00",
        ]

        for x in i1_lengths:
            MetaNumeric.objects.get_or_create(
                individual_id=ind1.id, key="length", value=x
            )
        for x in i1_weights:
            MetaNumeric.objects.get_or_create(
                individual_id=ind1.id, key="weight", value=x
            )
        for x in i1_animals:
            MetaChar.objects.get_or_create(individual_id=ind1.id, key="animal", value=x)
        for x in i1_colors:
            MetaChar.objects.get_or_create(individual_id=ind1.id, key="color", value=x)
        for x in i1_whens:
            MetaDT.objects.get_or_create(individual_id=ind1.id, key="when", value=x)
        for x in i2_lengths:
            MetaNumeric.objects.get_or_create(
                individual_id=ind2.id, key="length", value=x
            )
        for x in i2_weights:
            MetaNumeric.objects.get_or_create(
                individual_id=ind2.id, key="weight", value=x
            )
        for x in i2_animals:
            MetaChar.objects.get_or_create(individual_id=ind2.id, key="animal", value=x)
        for x in i2_colors:
            MetaChar.objects.get_or_create(individual_id=ind2.id, key="color", value=x)
        for x in i2_whens:
            MetaDT.objects.get_or_create(individual_id=ind2.id, key="when", value=x)

        self.assertEqual(
            [
                dict(key=x["key"], value=x["value"])
                for x in ind1.metanumeric_set.order_by("id").values()
            ],
            [dict(key="length", value=x) for x in i1_lengths]
            + [dict(key="weight", value=x) for x in i1_weights],
        )
        self.assertEqual(
            [
                dict(key=x["key"], value=x["value"])
                for x in ind1.metachar_set.order_by("id").values()
            ],
            [dict(key="animal", value=x) for x in i1_animals]
            + [dict(key="color", value=x) for x in i1_colors],
        )
        self.assertEqual(
            [
                dict(key=x["key"], value=x["value"].isoformat())
                for x in ind1.metadt_set.order_by("id").values()
            ],
            [dict(key="when", value=x) for x in i1_whens],
        )
        self.assertEqual(
            [
                dict(key=x["key"], value=x["value"])
                for x in ind2.metanumeric_set.order_by("id").values()
            ],
            [dict(key="length", value=x) for x in i2_lengths]
            + [dict(key="weight", value=x) for x in i2_weights],
        )
        self.assertEqual(
            [
                dict(key=x["key"], value=x["value"])
                for x in ind2.metachar_set.order_by("id").values()
            ],
            [dict(key="animal", value=x) for x in i2_animals]
            + [dict(key="color", value=x) for x in i2_colors],
        )
        self.assertEqual(
            [
                dict(key=x["key"], value=x["value"].isoformat())
                for x in ind2.metadt_set.order_by("id").values()
            ],
            [dict(key="when", value=x) for x in i2_whens],
        )

        # Play migration, duplicates went away
        with Capturing() as log_messages:
            self.migrate_to_dest()
        log_messages = [
            json.loads(
                l.replace("Removing: ", ""),
            )
            for l in log_messages
            if l.startswith("Removing: ")
        ]
        for l in log_messages:
            del l["id"]
        self.assertEqual(
            log_messages,
            [
                {"individual_id": ind1.id, "key": "length", "value": 18.0},
                {"individual_id": ind1.id, "key": "length", "value": 29.0},
                {"individual_id": ind1.id, "key": "weight", "value": 100.0},
                {"individual_id": ind1.id, "key": "weight", "value": 200.0},
                {"individual_id": ind2.id, "key": "length", "value": 92.0},
                {"individual_id": ind2.id, "key": "weight", "value": 300.0},
                {
                    "individual_id": ind1.id,
                    "key": "when",
                    "value": "2026-04-10T09:59:54.922Z",
                },
                {
                    "individual_id": ind1.id,
                    "key": "when",
                    "value": "2026-04-11T09:59:54.922Z",
                },
                {
                    "individual_id": ind2.id,
                    "key": "when",
                    "value": "2026-04-10T09:59:54.922Z",
                },
                {"individual_id": ind1.id, "key": "animal", "value": "cow"},
                {"individual_id": ind1.id, "key": "animal", "value": "dog"},
                {"individual_id": ind1.id, "key": "color", "value": "pink"},
                {"individual_id": ind2.id, "key": "animal", "value": "rabbit"},
                {"individual_id": ind2.id, "key": "animal", "value": "sheep"},
                {"individual_id": ind2.id, "key": "color", "value": "pink"},
            ],
        )

        self.assertEqual(
            [
                dict(key=x["key"], value=x["value"])
                for x in ind1.metanumeric_set.order_by("id").values()
            ],
            [dict(key="length", value=x) for x in i1_lengths[-1:]]
            + [dict(key="weight", value=x) for x in i1_weights[-1:]],
        )
        self.assertEqual(
            [
                dict(key=x["key"], value=x["value"])
                for x in ind1.metachar_set.order_by("id").values()
            ],
            [dict(key="animal", value=x) for x in i1_animals[-1:]]
            + [dict(key="color", value=x) for x in i1_colors[-1:]],
        )
        self.assertEqual(
            [
                dict(key=x["key"], value=x["value"].isoformat())
                for x in ind1.metadt_set.order_by("id").values()
            ],
            [dict(key="when", value=x) for x in i1_whens[-1:]],
        )
        self.assertEqual(
            [
                dict(key=x["key"], value=x["value"])
                for x in ind2.metanumeric_set.order_by("id").values()
            ],
            [dict(key="length", value=x) for x in i2_lengths[-1:]]
            + [dict(key="weight", value=x) for x in i2_weights[-1:]],
        )
        self.assertEqual(
            [
                dict(key=x["key"], value=x["value"])
                for x in ind2.metachar_set.order_by("id").values()
            ],
            [dict(key="animal", value=x) for x in i2_animals[-1:]]
            + [dict(key="color", value=x) for x in i2_colors[-1:]],
        )
        self.assertEqual(
            [
                dict(key=x["key"], value=x["value"].isoformat())
                for x in ind2.metadt_set.order_by("id").values()
            ],
            [dict(key="when", value=x) for x in i2_whens[-1:]],
        )

        # Reverse migration does nothing, we just threw data away
        self.reverse_migrate()
