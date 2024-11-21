from django.db import connection, reset_queries
from django.db.migrations.executor import MigrationExecutor
from django.test.testcases import TransactionTestCase, override_settings


class MigrationTestCase(TransactionTestCase):
    """A Test case for testing migrations"""

    # https://gist.github.com/blueyed/4fb0a807104551f103e6#gistcomment-1546191

    # These must be defined by subclasses.
    migrate_from = None
    migrate_to = None

    def setUp(self):
        super(MigrationTestCase, self).setUp()

        self.executor = MigrationExecutor(connection)
        self.executor.migrate(self.migrate_from)

    def migrate_to_dest(self):
        self.executor.loader.build_graph()  # reload.
        self.executor.migrate(self.migrate_to)

    def reverse_migrate(self):
        self.executor.loader.build_graph()  # reload.
        self.executor.migrate(self.migrate_from)

    @property
    def old_apps(self):
        return self.executor.loader.project_state(self.migrate_from).apps

    @property
    def new_apps(self):
        return self.executor.loader.project_state(self.migrate_to).apps


class FooTestCaseCase(MigrationTestCase):
    migrate_from = [("photolith", "0025_alter_annotation_rating")]
    migrate_to = [
        ("photolith", "0026_alter_metatx_value_alter_taxonomy_identifier_and_more")
    ]

    @override_settings(DEBUG=True)
    def test_migration(self):
        reset_queries()
        Individual = self.old_apps.get_model("photolith", "Individual")
        Image = self.old_apps.get_model("photolith", "Image")
        Taxonomy = self.old_apps.get_model("photolith", "Taxonomy")
        MetaTx = self.old_apps.get_model("photolith", "MetaTx")

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
        tx_cat, created = Taxonomy.objects.get_or_create(
            key="species", identifier=1, str_en="Cat"
        )
        tx_fish, created = Taxonomy.objects.get_or_create(
            key="species", identifier=2, str_en="Fish"
        )
        tx_fishfood, created = Taxonomy.objects.get_or_create(
            key="eats", identifier=1, str_en="FishFood"
        )
        MetaTx.objects.create(individual_id=ind1.id, key="species", value_id=tx_fish.id)
        MetaTx.objects.create(individual_id=ind2.id, key="species", value_id=tx_cat.id)
        MetaTx.objects.create(
            individual_id=ind1.id, key="eats", value_id=tx_fishfood.id
        )
        MetaTx.objects.create(
            individual_id=ind2.id, key="eats", value_id=tx_fishfood.id
        )
        self.assertEqual(
            [x.value.str_en for x in MetaTx.objects.all()],
            ["Fish", "Cat", "FishFood", "FishFood"],
        )
        # print(connection.queries)

        Taxonomy.objects.get(str_en="FishFood").delete()
        self.assertEqual(
            [x.value is None for x in MetaTx.objects.all()],
            [False, False, True, True],
        )

        # Play migration, get a missing field
        self.migrate_to_dest()
        MetaTx = self.new_apps.get_model("photolith", "MetaTx")
        Taxonomy = self.new_apps.get_model("photolith", "Taxonomy")
        self.assertEqual(
            [x.value.str_en for x in MetaTx.objects.all()],
            ["Fish", "Cat", "Missing", "Missing"],
        )
        mtxs = MetaTx.objects.all()
        self.assertEqual(mtxs[2].value.id, mtxs[3].value.id)

        # Can't reverse until Missings are deleted
        with self.assertRaisesRegex(ValueError, "invalid data: MetaTx object"):
            self.reverse_migrate()
        Taxonomy.objects.get(str_en="Missing").delete()
        self.assertEqual(
            [x.value.str_en for x in MetaTx.objects.all()],
            ["Fish", "Cat"],
        )
        self.reverse_migrate()
