from django.db import migrations

KEY_MAP = {
    "stationYear": "year",
    "stationMonth": "month",
}
KEY_MAP_REVERSE = {v: k for k, v in KEY_MAP.items()}


def move_to_metainteger(apps, schema_editor):
    MetaNumeric = apps.get_model("photolith", "MetaNumeric")
    MetaInteger = apps.get_model("photolith", "MetaInteger")

    rows = MetaNumeric.objects.filter(key__in=KEY_MAP.keys())
    MetaInteger.objects.bulk_create(
        [
            MetaInteger(
                individual=row.individual, key=KEY_MAP[row.key], value=int(row.value)
            )
            for row in rows
        ]
    )
    rows.delete()


def move_to_metanumeric(apps, schema_editor):
    MetaNumeric = apps.get_model("photolith", "MetaNumeric")
    MetaInteger = apps.get_model("photolith", "MetaInteger")

    rows = MetaInteger.objects.filter(key__in=KEY_MAP_REVERSE.keys())
    MetaNumeric.objects.bulk_create(
        [
            MetaNumeric(
                individual=row.individual,
                key=KEY_MAP_REVERSE[row.key],
                value=float(row.value),
            )
            for row in rows
        ]
    )
    rows.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("photolith", "0032_migrate_metainteger_data"),
    ]

    operations = [
        migrations.RunPython(move_to_metainteger, move_to_metanumeric),
    ]
