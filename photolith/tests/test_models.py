import datetime
import io

from django.core.exceptions import ValidationError
from django.test import TestCase

from ..models import *

from .binaries import GIF_VALID, JPEG_VALID
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

        # No div/0 errors
        self.assertEqual(
            px_to_mm([(10, 20), (10, 20)], 10),
            None,
        )
        self.assertEqual(
            px_to_mm([(10, 20), (10, 30)], 0),
            None,
        )

        self.assertEqual(px_to_mm([(10, 20), (30, 50)], None), None)

        # Scale set, but no scale line
        self.assertEqual(px_to_mm(None, 10), None)

    def test_store(self):
        user = self.create_user()

        image, created = Image.objects.store(
            io.BytesIO(JPEG_VALID), "a.jpeg", "image/jpeg", user
        )
        self.assertTrue(created)
        self.assertEqual(image.orig_filename, "a.jpeg")
        self.assertEqual(image.created_by, user)
        self.assertTrue(image.content.name.endswith(".jpeg"))
        self.assertEqual(image.content.read(), JPEG_VALID)

        # Same content returns the same image, regardless of filename / user
        image2, created = Image.objects.store(
            io.BytesIO(JPEG_VALID), "b.jpeg", "image/jpeg", self.create_user()
        )
        self.assertFalse(created)
        self.assertEqual(image2.id, image.id)
        self.assertEqual(image2.orig_filename, "a.jpeg")

        # Different content is a different image
        image3, created = Image.objects.store(
            io.BytesIO(GIF_VALID), "a.gif", "image/gif", user
        )
        self.assertTrue(created)
        self.assertNotEqual(image3.id, image.id)

        # Only images accepted
        with self.assertRaisesRegex(ValidationError, "Unknown content type text/plain"):
            Image.objects.store(io.BytesIO(b"Hello"), "a.txt", "text/plain", user)

    def test_full_data(self):
        image = self.create_image(scale_line=[[0, 0], [10, 0]], scale_mm=5)
        self.assertEqual(
            image.full_data(),
            dict(
                id=image.id,
                content=image.content.name,
                orig_filename=image.orig_filename,
                mimetype="image/jpeg",
                scale_line=[[0, 0], [10, 0]],
                scale_mm=5,
                created_by=None,
            ),
        )

    def test_set_scale(self):
        image = self.create_image(scale_line=None, scale_mm=None)

        def sis(scale_line, scale_mm):
            image.set_scale(scale_line, scale_mm)
            image.refresh_from_db()
            return image.scale_line, image.scale_mm

        self.assertEqual(sis([[0, 0], [10.5, 0]], 5), ([[0, 0], [10.5, 0]], 5))
        self.assertEqual(sis(None, None), (None, None))

        # Invalid values aren't saved
        sis([[1, 1], [2, 2]], 4)
        for scale_line, scale_mm, err in [
            ([[0, 0]], 5, "scale_line should be"),
            ([[0, 0], [1, 2, 3]], 5, "scale_line should be"),
            ([[0, 0], ["1", 2]], 5, "scale_line should be"),
            ([[0, 0], [True, 2]], 5, "scale_line should be"),
            ("[[0, 0], [1, 1]]", 5, "scale_line should be"),
            ([[0, 0], [1, 1]], 5.5, "scale_mm should be"),
            ([[0, 0], [1, 1]], "5", "scale_mm should be"),
            ([[0, 0], [1, 1]], True, "scale_mm should be"),
        ]:
            with self.assertRaisesRegex(ValidationError, err):
                image.set_scale(scale_line, scale_mm)
        image.refresh_from_db()
        self.assertEqual((image.scale_line, image.scale_mm), ([[1, 1], [2, 2]], 4))


class IndividualTest(RequiresUtils, TestCase):
    def test_data(self):
        """Make sure we can get and set data JSON, updating schema transparently"""
        ind1 = self.create_individual()
        ind2 = self.create_individual()

        # Data initially empty
        self.assertEqual(ind1.data, dict())

        # Set length
        ind1.data = dict(nm_length=42, ch_name="frank")
        self.assertEqual(ind1.data, dict(nm_length=42, ch_name="frank"))

        # Set length on second individual, forces type
        ind1.data = dict(nm_length="39", ch_name=5)
        self.assertEqual(ind1.data, dict(nm_length=39, ch_name="5"))
        ind2.data = dict(nm_length="40", ch_name=22)
        self.assertEqual(ind2.data, dict(nm_length=40, ch_name="22"))

        # Only one length entry for all individuals, old ones tidied up
        self.assertEqual(
            set((x.individual_id, x.key, x.value) for x in MetaNumeric.objects.all()),
            set(
                (
                    (ind1.id, "length", 39.0),
                    (ind2.id, "length", 40.0),
                )
            ),
        )

        # ISO dates get translated
        ind1.data = dict(nm_length=39, ch_name="5", dt_time="20230912T082738Z")
        self.assertTrue(isinstance(MetaDT.objects.all()[0].value, datetime.datetime))
        self.assertEqual(
            ind1.data,
            dict(
                nm_length=39,
                ch_name="5",
                dt_time=MetaDT.objects.all()[0].value,
            ),
        )

        # Taxonomy values added, recycled
        ind1.data = dict(
            nm_length=39,
            ch_name="5",
            dt_time="20230912T082738Z",
            tx_species={"id": 100, "en": "Fish", "is": "Fiskur"},
        )
        self.assertEqual(
            ind1.data,
            dict(
                nm_length=39,
                ch_name="5",
                tx_species={"en": "Fish", "id": 100, "is": "Fiskur"},
                dt_time=MetaDT.objects.all()[0].value,
            ),
        )
        ind2.data = dict(
            nm_length="40",
            ch_name=22,
            tx_species={"id": 200, "en": "Cat", "is": "Köttur"},
        )
        self.assertEqual(
            ind2.data,
            dict(
                nm_length=40,
                ch_name="22",
                tx_species={"id": 200, "en": "Cat", "is": "Köttur"},
            ),
        )
        ind2.data = dict(
            nm_length="40",
            ch_name=22,
            tx_species={"id": 100, "en": "Fish", "is": "Fiskur"},
        )
        self.assertEqual(
            ind2.data,
            dict(
                nm_length=40,
                ch_name="22",
                tx_species={"id": 100, "en": "Fish", "is": "Fiskur"},
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
            nm_length="40",
            ch_name=22,
            tx_species={"id": 200, "en": "Cat", "is": "Köttur"},
            tx_eats={"id": 100, "en": "Fish", "is": "Fiskur"},
        )
        self.assertEqual(
            ind2.data,
            dict(
                nm_length=40,
                ch_name="22",
                tx_species={"id": 200, "en": "Cat", "is": "Köttur"},
                tx_eats={"id": 100, "en": "Fish", "is": "Fiskur"},
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

        # Deleting taxonomy items removes entries in individuals
        Taxonomy.objects.get(str_en="Cat").delete()
        self.assertEqual(
            ind2.data,
            dict(
                nm_length=40.0,
                ch_name="22",
                tx_eats={"id": 100, "en": "Fish", "is": "Fiskur"},
            ),
        )

        # Unknown types are an error
        with self.assertRaisesRegex(ValueError, "parents"):
            ind2.data = dict(parents=["Bob", "Carla"])

    def test_data_ignores_photolith_internal_keys(self):
        """Photolith-internal keys in the data dict are silently ignored"""
        ind = self.create_individual()
        ind.data = dict(nm_length=10)

        # All photolith-internal keys should be silently ignored
        internal_keys = [
            ("__str__", "Individual 1"),
            ("id", 999),
            ("image_id", 3),
            ("dt_created_at", "2023-01-01"),
            ("dt_modified_at", "2023-01-02"),
            ("bounding_box", [[0, 0], [50, 50]]),
            ("num_annotations", 5),
            ("image__orig_filename", "photo.jpg"),
            ("image__id", 42),
        ]
        for key, value in internal_keys:
            ind.data = {key: value, "nm_length": 10}
            self.assertEqual(
                ind.data,
                dict(nm_length=10),
                msg="Expected '%s' to be silently ignored" % key,
            )

    def test_data_int(self):
        ind1 = self.create_individual()

        # Data initially empty
        self.assertEqual(ind1.data, dict())

        # Set station
        ind1.data = dict(in_station=135, nm_length=42.5)
        self.assertEqual(ind1.data, dict(in_station=135, nm_length=42.5))

    def test_data_underscore(self):
        """Only the type prefix is split off keys"""
        ind1 = self.create_individual()
        ind1.data = dict(ch_slide_label="x", nm_otolith_length=4.5)
        self.assertEqual(ind1.data, dict(ch_slide_label="x", nm_otolith_length=4.5))

    def test_str(self):
        self.assertEqual(str(self.create_individual()), "Individual 1")
        self.assertEqual(str(self.create_individual()), "Individual 2")
        self.assertEqual(
            str(
                self.create_individual(
                    data=dict(
                        ch_slideLabel="UT slide 01",
                    )
                )
            ),
            "UT slide 01",
        )
        self.assertEqual(
            str(
                self.create_individual(
                    data=dict(
                        ch_slideLabel="UT slide 02",
                        ch_individualLabel="009",
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
