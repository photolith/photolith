from django.core.management.sql import emit_post_migrate_signal
from django.db import migrations


def apply_group(group_name, perms, apps, schema_editor):
    # Make sure permissions are created, see https://gist.github.com/solace/6a8ac71539220b1f13a95bd559f2c4bd
    emit_post_migrate_signal(2, False, "default")
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")

    if len(perms) == 0:
        Group.objects.filter(name=group_name).delete()
        return
    g, created = Group.objects.get_or_create(name=group_name)
    g.save()
    g.permissions.set(Permission.objects.get(codename=codename) for codename in perms)
    g.save()


def group_migration(group_name, perms_apply=[], perms_revert=[]):
    return migrations.RunPython(
        lambda apps, schema_editor: apply_group(
            group_name, perms_apply, apps, schema_editor
        ),
        lambda apps, schema_editor: apply_group(
            group_name, perms_revert, apps, schema_editor
        ),
    )
