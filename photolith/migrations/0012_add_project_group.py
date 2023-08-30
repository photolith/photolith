from django.db import migrations

from ..migration_utils import group_migration


class Migration(migrations.Migration):
    dependencies = [
        ("photolith", "0011_add_annotate_group"),
        # See https://gist.github.com/solace/6a8ac71539220b1f13a95bd559f2c4bd
        ("contenttypes", "__latest__"),
    ]

    operations = [
        group_migration(
            "Project Admin",
            [
                "view_project",
                "add_project",
                "change_project",
                "delete_project",
            ],
            [],
        )
    ]
