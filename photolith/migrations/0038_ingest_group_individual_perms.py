from django.db import migrations

from ..migration_utils import group_migration


class Migration(migrations.Migration):
    dependencies = [
        ("photolith", "0037_apitoken"),
        # See https://gist.github.com/solace/6a8ac71539220b1f13a95bd559f2c4bd
        ("contenttypes", "__latest__"),
    ]

    operations = [
        group_migration(
            "Ingest",
            [
                "add_individual",
                "view_individual",
                "change_individual",
                "delete_individual",
                "view_image",
                "add_image",
            ],
            prev_perms=[
                "add_individual",
                "view_image",
                "add_image",
            ],
        )
    ]
