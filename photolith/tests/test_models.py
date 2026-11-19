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

    def test_individuals_with_ann_counts(self):
        image = self.create_image()
        self.assertEqual(list(image.individuals_with_ann_counts()), [])

        ind1 = self.create_individual(image=image)
        ind2 = self.create_individual(image=image)
        self.create_individual()  # Other image
        self.create_annotation(individual=ind2)
        self.create_annotation(individual=ind2)

        # In ID order, with annotation counts
        self.assertEqual(
            [(i.id, i.num_annotations) for i in image.individuals_with_ann_counts()],
            [(ind1.id, 0), (ind2.id, 2)],
        )


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
        with self.assertRaisesRegex(ValidationError, "parents"):
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

    def test_set_bounding_box(self):
        ind = self.create_individual(bounding_box=[[0, 0], [100, 100]])

        # Set, but not saved
        ind.set_bounding_box([[0, 0], [10.5, 20]])
        self.assertEqual(ind.bounding_box, [[0, 0], [10.5, 20]])
        ind.refresh_from_db()
        self.assertEqual(ind.bounding_box, [[0, 0], [100, 100]])
        ind.set_bounding_box([[1, 1], [2, 2], [3, 3]])
        self.assertEqual(ind.bounding_box, [[1, 1], [2, 2], [3, 3]])

        # Invalid values aren't set
        for bounding_box in [
            None,
            [],
            [0, 0],
            [[0, 0], [1, 2, 3]],
            [[0, 0], ["1", 2]],
            [[0, 0], [True, 2]],
            "[[0, 0], [1, 1]]",
        ]:
            with self.assertRaisesRegex(ValidationError, "bounding_box should be"):
                ind.set_bounding_box(bounding_box)
        self.assertEqual(ind.bounding_box, [[1, 1], [2, 2], [3, 3]])

    def test_data_replace(self):
        """Setting data replaces all of it, all or nothing"""
        ind1 = self.create_individual(
            data=dict(
                ch_slideLabel="x",
                ch_individualLabel="1",
                nm_length=4.5,
                in_station=3,
                dt_caught="2024-01-01",
                tx_species=dict(id=100),
            )
        )
        ind2 = self.create_individual(data=dict(ch_slideLabel="y", nm_length=5.5))

        # Keys not given are removed, matching type prefix too. "id" etc. ignored
        ind1.data = dict(
            ch_slideLabel="z", nm_station=4, tx_species=dict(id=100), id=99
        )
        self.assertEqual(
            ind1.data,
            dict(
                ch_slideLabel="z",
                nm_station=4.0,
                tx_species=Taxonomy.objects.get(key="species", identifier=100).dict,
            ),
        )
        ind1.data = dict()
        self.assertEqual(ind1.data, dict())
        ind1.data = dict(ch_slideLabel="x", nm_length=4.5)

        # Errors for every invalid key, nothing changed
        with self.assertRaises(ValidationError) as cm:
            ind1.data = dict(
                ch_slideLabel="q", nm_length="x", length=3, ch_comment=None
            )
        self.assertEqual(
            cm.exception.message_dict,
            {
                "data.nm_length": ["could not convert string to float: 'x'"],
                "data.length": ["'length' has no type prefix"],
                "data.ch_comment": ["'comment' is missing for q"],
            },
        )
        self.assertEqual(ind1.data, dict(ch_slideLabel="x", nm_length=4.5))
        ind1.refresh_from_db()
        self.assertEqual(ind1.data, dict(ch_slideLabel="x", nm_length=4.5))

        # Other individuals unaffected
        self.assertEqual(ind2.data, dict(ch_slideLabel="y", nm_length=5.5))

    def test_data_prefetched(self):
        """Changing data on a prefetched individual doesn't leave stale copies"""
        ind = self.create_individual(
            data=dict(
                ch_slideLabel="12", ch_individualLabel="3", tx_species=dict(id=100)
            )
        )

        def prefetched(expected_str):
            out = Individual.objects.prefetch_related(
                "metachar_set", "metatx_set__value"
            ).get(pk=ind.id)
            self.assertEqual(str(out), expected_str)
            return out

        # Updating
        ind_pf = prefetched("12 : 3")
        ind_pf.data = dict(
            ch_slideLabel="12",
            ch_individualLabel="4",
            tx_species=dict(id=100, en="Fish"),
        )
        self.assertEqual(str(ind_pf), "12 : 4")
        self.assertEqual(ind_pf.labels(), ("12", "4"))
        self.assertEqual(ind_pf.data["tx_species"]["en"], "Fish")

        # ...rolling back, after saving some keys
        ind_pf = prefetched("12 : 4")
        with self.assertRaisesRegex(ValidationError, "is missing"):
            ind_pf.data = dict(
                ch_slideLabel="12", ch_individualLabel="5", nm_length=None
            )
        self.assertEqual(str(ind_pf), "12 : 4")

        # ...removing keys
        ind_pf = prefetched("12 : 4")
        ind_pf.data = dict(ch_individualLabel="5")
        self.assertEqual(str(ind_pf), "Individual %d" % ind.id)
        self.assertEqual(ind_pf.data, dict(ch_individualLabel="5"))

    def test_data_underscore(self):
        """Only the type prefix is split off keys"""
        ind1 = self.create_individual()
        ind1.data = dict(ch_slide_label="x", nm_otolith_length=4.5)
        self.assertEqual(ind1.data, dict(ch_slide_label="x", nm_otolith_length=4.5))

    def test_labels(self):
        self.assertEqual(self.create_individual().labels(), (None, None))
        self.assertEqual(
            self.create_individual(data=dict(ch_slideLabel="12")).labels(), ("12", None)
        )
        self.assertEqual(
            self.create_individual(data=dict(ch_individualLabel="3")).labels(),
            (None, "3"),
        )
        self.assertEqual(
            self.create_individual(
                data=dict(ch_slideLabel="12", ch_individualLabel="3", ch_other="x")
            ).labels(),
            ("12", "3"),
        )

    def test_data_labels(self):
        self.assertEqual(Individual.data_labels({}), (None, None))
        self.assertEqual(
            Individual.data_labels(dict(ch_slideLabel="12", ch_other="x")),
            ("12", None),
        )
        self.assertEqual(
            Individual.data_labels(dict(ch_slideLabel="12", ch_individualLabel="3")),
            ("12", "3"),
        )

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


class UserProfileTest(RequiresUtils, TestCase):
    def test_for_user(self):
        Taxonomy.objects.create(
            key="species", identifier=100, str_en="Fish", str_is="Fiskur"
        )
        fish = dict(tx_species=dict(id=100))

        # Existing profile
        user = self.create_user(
            base_authority_level=UserSpeciesAuthority.AuthorityLevel.JUNIOR
        )
        self.assertEqual(UserProfile.for_user(user), user.userprofile)

        # No profile, an unsaved default one
        user = self.create_user()
        profile = UserProfile.for_user(user)
        self.assertEqual((profile.pk, profile.user), (None, user))
        self.assertEqual(
            profile.base_authority_level,
            UserSpeciesAuthority.AuthorityLevel.INEXPERIENCED,
        )
        self.assertEqual(
            profile.authority_level(fish),
            UserSpeciesAuthority.AuthorityLevel.INEXPERIENCED,
        )
        self.assertFalse(UserProfile.objects.filter(user=user).exists())

        # ...that still uses any species authority
        UserSpeciesAuthority.objects.create(
            user=user,
            species=Taxonomy.objects.get(key="species", identifier=100),
            level=UserSpeciesAuthority.AuthorityLevel.EXPERT,
        )
        self.assertEqual(
            UserProfile.for_user(user).authority_level(fish),
            UserSpeciesAuthority.AuthorityLevel.EXPERT,
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
