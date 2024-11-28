from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test.testcases import TransactionTestCase


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
