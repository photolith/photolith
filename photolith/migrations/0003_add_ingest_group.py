from django.db import models, migrations


def apply_migration(apps, schema_editor):
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
    ]

    operations = [migrations.RunPython(apply_migration, revert_migration)]
