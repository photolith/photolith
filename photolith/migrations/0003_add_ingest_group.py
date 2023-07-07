from django.core.management.sql import emit_post_migrate_signal
from django.db import migrations


def apply_migration(apps, schema_editor):
    # Make sure permissions are created, see https://gist.github.com/solace/6a8ac71539220b1f13a95bd559f2c4bd
    emit_post_migrate_signal(2, False, "default")
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")

    g = Group(name="Ingest")
    g.save()
    g.permissions.set(
        Permission.objects.get(codename=codename)
        for codename in (
            "add_individual",
            "view_image",
            "add_image",
        )
    )
    g.save()


def revert_migration(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.filter(name__in=("Ingest",)).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("photolith", "0002_individual_taxonomy_metatx_metanumeric_metachar"),
        # See https://gist.github.com/solace/6a8ac71539220b1f13a95bd559f2c4bd
        ("contenttypes", "__latest__"),
    ]

    operations = [migrations.RunPython(apply_migration, revert_migration)]
