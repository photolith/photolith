from .requires_migrations import MigrationTestCase


class Migrations0033TestCase(MigrationTestCase):
    migrate_from = [("photolith", "0032_migrate_metainteger_data")]
    migrate_to = [("photolith", "0033_migrate_station_year_month_to_metainteger")]

    def _create_individual(self):
        Image = self.old_apps.get_model("photolith", "Image")
        Individual = self.old_apps.get_model("photolith", "Individual")
        img = Image.objects.create(
            orig_filename="ut_image001.jpg",
            mimetype="image/jpeg",
            scale_line=[(10, 10), (20, 20)],
            scale_mm=10,
        )
        return Individual.objects.create(
            image_id=img.id, bounding_box=[[0, 0], [100, 100]], created_by=None
        )

    def test_migration(self):
        MetaNumeric = self.old_apps.get_model("photolith", "MetaNumeric")
        MetaInteger = self.old_apps.get_model("photolith", "MetaInteger")
        ind = self._create_individual()

        MetaNumeric.objects.create(
            individual_id=ind.id, key="stationYear", value=2024.0
        )
        MetaNumeric.objects.create(individual_id=ind.id, key="stationMonth", value=11.0)
        MetaNumeric.objects.create(individual_id=ind.id, key="length", value=42.5)

        self.migrate_to_dest()

        MetaNumeric = self.new_apps.get_model("photolith", "MetaNumeric")
        MetaInteger = self.new_apps.get_model("photolith", "MetaInteger")

        self.assertEqual(
            list(
                MetaNumeric.objects.filter(individual_id=ind.id)
                .order_by("key")
                .values("key", "value")
            ),
            [dict(key="length", value=42.5)],
        )
        self.assertEqual(
            list(
                MetaInteger.objects.filter(individual_id=ind.id)
                .order_by("key")
                .values("key", "value")
            ),
            [dict(key="month", value=11), dict(key="year", value=2024)],
        )

    def test_reverse_migration(self):
        MetaNumeric = self.old_apps.get_model("photolith", "MetaNumeric")
        ind = self._create_individual()

        MetaNumeric.objects.create(
            individual_id=ind.id, key="stationYear", value=2024.0
        )
        MetaNumeric.objects.create(individual_id=ind.id, key="stationMonth", value=11.0)

        self.migrate_to_dest()
        self.reverse_migrate()

        MetaNumeric = self.old_apps.get_model("photolith", "MetaNumeric")
        MetaInteger = self.old_apps.get_model("photolith", "MetaInteger")

        self.assertEqual(
            list(
                MetaNumeric.objects.filter(individual_id=ind.id)
                .order_by("key")
                .values("key", "value")
            ),
            [
                dict(key="stationMonth", value=11.0),
                dict(key="stationYear", value=2024.0),
            ],
        )
        self.assertEqual(
            MetaInteger.objects.filter(individual_id=ind.id).count(),
            0,
        )
