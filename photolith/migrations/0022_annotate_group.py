from django.db import migrations

from ..migration_utils import group_migration


class Migration(migrations.Migration):
    dependencies = [
        ("photolith", "0021_remove_userprofile_species_expert_and_more"),
        # See https://gist.github.com/solace/6a8ac71539220b1f13a95bd559f2c4bd
        ("contenttypes", "__latest__"),
    ]

    operations = [
        group_migration(
            prev_name="Annotate",
            group_name="General Annotation Editor",
            prev_perms=[
                "view_individual",
                "view_annotation",
                "add_annotation",
                "change_annotation",
                "delete_annotation",
                "view_project",
            ],
            perms=[
                "view_annotation",
                "change_annotation",
            ],
        ),
        group_migration(
            group_name="General Annotation Viewer",
            prev_perms=[],
            perms=[
                "view_annotation",
            ],
        ),
    ]
