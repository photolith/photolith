from .requires_migrations import MigrationTestCase


class Migrations0039TestCase(MigrationTestCase):
    migrate_from = [("photolith", "0038_ingest_group_individual_perms")]
    migrate_to = [("photolith", "0039_backfill_maturity_labels")]

    def _create_taxonomies(self):
        Taxonomy = self.old_apps.get_model("photolith", "Taxonomy")
        for key, identifier, str_en in [
            ("maturity", 5, "Unknown"),
            ("maturity", 22, "Unknown"),
            ("maturity", 2885, "Unknown"),
            ("maturity", 71, "Unknown"),  # Not in backfill, left alone
            ("maturity", 27, "POK/52 (edited)"),  # Already labelled, overwritten
            ("sex", 1, "Unknown"),  # Not maturity, left alone
        ]:
            Taxonomy.objects.create(
                key=key, identifier=identifier, str_en=str_en, str_is=""
            )

    def _taxonomies(self, apps):
        Taxonomy = apps.get_model("photolith", "Taxonomy")
        return list(
            Taxonomy.objects.order_by("key", "identifier").values_list(
                "key", "identifier", "str_en", "str_is"
            )
        )

    def test_migration(self):
        self._create_taxonomies()

        self.migrate_to_dest()

        self.assertEqual(
            self._taxonomies(self.new_apps),
            [
                ("maturity", 5, "COD/5", "COD/5"),
                ("maturity", 22, "POK/4", "POK/4"),
                ("maturity", 27, "POK/52", "POK/52"),
                ("maturity", 71, "Unknown", ""),
                ("maturity", 2885, "LEM/22", "LEM/22"),
                ("sex", 1, "Unknown", ""),
            ],
        )

    def test_reverse_migration(self):
        self._create_taxonomies()

        self.migrate_to_dest()
        self.reverse_migrate()

        self.assertEqual(
            self._taxonomies(self.old_apps),
            [
                ("maturity", 5, "Unknown", ""),
                ("maturity", 22, "Unknown", ""),
                ("maturity", 27, "Unknown", ""),
                ("maturity", 71, "Unknown", ""),
                ("maturity", 2885, "Unknown", ""),
                ("sex", 1, "Unknown", ""),
            ],
        )
