from django.db import migrations

from ..migration_utils import group_migration


class Migration(migrations.Migration):
    dependencies = [
        ("photolith", "0010_alter_project_date_end"),
        # See https://gist.github.com/solace/6a8ac71539220b1f13a95bd559f2c4bd
        ("contenttypes", "__latest__"),
    ]

    operations = [
        group_migration(
            "Annotate",
            [
                "view_individual",
                "view_annotation",
                "change_annotation",
                "delete_annotation",
                "view_project",
            ],
            [],
        )
    ]
