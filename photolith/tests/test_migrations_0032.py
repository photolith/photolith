from .requires_migrations import MigrationTestCase


class Migrations0032TestCase(MigrationTestCase):
    migrate_from = [("photolith", "0031_metainteger")]
    migrate_to = [("photolith", "0032_migrate_metainteger_data")]

    def test_migration(self):
        Image = self.old_apps.get_model("photolith", "Image")
        Individual = self.old_apps.get_model("photolith", "Individual")
        MetaChar = self.old_apps.get_model("photolith", "MetaChar")
        MetaInteger = self.old_apps.get_model("photolith", "MetaInteger")

        img = Image.objects.create(
            orig_filename="ut_image001.jpg",
            mimetype="image/jpeg",
            scale_line=[(10, 10), (20, 20)],
            scale_mm=10,
        )
        ind = Individual.objects.create(
            image_id=img.id, bounding_box=[[0, 0], [100, 100]], created_by=None
        )

        MetaChar.objects.create(individual_id=ind.id, key="station", value="42")
        MetaChar.objects.create(individual_id=ind.id, key="sampleId", value="7")
        MetaChar.objects.create(individual_id=ind.id, key="measureId", value="99")
        MetaChar.objects.create(individual_id=ind.id, key="color", value="red")

        self.migrate_to_dest()

        MetaChar = self.new_apps.get_model("photolith", "MetaChar")
        MetaInteger = self.new_apps.get_model("photolith", "MetaInteger")

        self.assertEqual(
            list(
                MetaChar.objects.filter(individual_id=ind.id)
                .order_by("key")
                .values("key", "value")
            ),
            [dict(key="color", value="red")],
        )
        self.assertEqual(
            list(
                MetaInteger.objects.filter(individual_id=ind.id)
                .order_by("key")
                .values("key", "value")
            ),
            [
                dict(key="measureId", value=99),
                dict(key="sampleId", value=7),
                dict(key="station", value=42),
            ],
        )

    def test_reverse_migration(self):
        Image = self.old_apps.get_model("photolith", "Image")
        Individual = self.old_apps.get_model("photolith", "Individual")
        MetaChar = self.old_apps.get_model("photolith", "MetaChar")

        img = Image.objects.create(
            orig_filename="ut_image001.jpg",
            mimetype="image/jpeg",
            scale_line=[(10, 10), (20, 20)],
            scale_mm=10,
        )
        ind = Individual.objects.create(
            image_id=img.id, bounding_box=[[0, 0], [100, 100]], created_by=None
        )

        MetaChar.objects.create(individual_id=ind.id, key="station", value="42")
        MetaChar.objects.create(individual_id=ind.id, key="sampleId", value="7")
        MetaChar.objects.create(individual_id=ind.id, key="measureId", value="99")

        self.migrate_to_dest()
        self.reverse_migrate()

        MetaChar = self.old_apps.get_model("photolith", "MetaChar")
        MetaInteger = self.old_apps.get_model("photolith", "MetaInteger")

        self.assertEqual(
            list(
                MetaChar.objects.filter(individual_id=ind.id)
                .order_by("key")
                .values("key", "value")
            ),
            [
                dict(key="measureId", value="99"),
                dict(key="sampleId", value="7"),
                dict(key="station", value="42"),
            ],
        )
        self.assertEqual(
            MetaInteger.objects.filter(individual_id=ind.id).count(),
            0,
        )
