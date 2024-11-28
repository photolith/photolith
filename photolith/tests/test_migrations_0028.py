from django.db import reset_queries
from django.test.testcases import override_settings

from .requires_migrations import MigrationTestCase


class Migrations0026TestCase(MigrationTestCase):
    migrate_from = [
        ("photolith", "0027_alter_annotation_options_alter_image_options_and_more")
    ]
    migrate_to = [("photolith", "0028_remove_userprofile_species_expert_and_more")]

    @override_settings(DEBUG=True)
    def test_migration(self):
        reset_queries()
        User = self.old_apps.get_model("auth", "User")
        UserProfile = self.old_apps.get_model("photolith", "UserProfile")
        Taxonomy = self.old_apps.get_model("photolith", "Taxonomy")

        tx_cat = Taxonomy.objects.create(key="species", identifier=1, str_en="Cat")
        tx_fish = Taxonomy.objects.create(key="species", identifier=2, str_en="Fish")

        user_noprofile = User.objects.create(
            username="user_noprofile",
            password="123",
            email="ut@example.com",
            is_active=True,
        )

        user_notexpert = User.objects.create(
            username="user_notexpert",
            password="123",
            email="ut@example.com",
            is_active=True,
        )
        UserProfile.objects.create(user_id=user_notexpert.id)

        user_expertcat = User.objects.create(
            username="user_expertcat",
            password="123",
            email="ut@example.com",
            is_active=True,
        )
        up = UserProfile.objects.create(user_id=user_expertcat.id)
        up.species_expert.set([tx_cat.id])

        user_expertfish = User.objects.create(
            username="user_expertfish",
            password="123",
            email="ut@example.com",
            is_active=True,
        )
        up = UserProfile.objects.create(user_id=user_expertfish.id)
        up.species_expert.set([tx_fish.id])

        # Play migration
        self.migrate_to_dest()
        User = self.new_apps.get_model("auth", "User")
        UserProfile = self.new_apps.get_model("photolith", "UserProfile")
        Taxonomy = self.new_apps.get_model("photolith", "Taxonomy")

        user_noprofile = User.objects.get(username="user_noprofile")
        self.assertEqual(
            [
                (x.species.str_en, x.level)
                for x in user_noprofile.userspeciesauthority_set.all()
            ],
            [],
        )

        user_notexpert = User.objects.get(username="user_notexpert")
        self.assertEqual(
            [
                (x.species.str_en, x.level)
                for x in user_notexpert.userspeciesauthority_set.all()
            ],
            [],
        )

        user_expertfish = User.objects.get(username="user_expertfish")
        self.assertEqual(
            [
                (x.species.str_en, x.level)
                for x in user_expertfish.userspeciesauthority_set.all()
            ],
            [("Fish", 100)],
        )

        user_expertcat = User.objects.get(username="user_expertcat")
        self.assertEqual(
            [
                (x.species.str_en, x.level)
                for x in user_expertcat.userspeciesauthority_set.all()
            ],
            [("Cat", 100)],
        )
