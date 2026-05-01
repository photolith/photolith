from django.db import migrations


def move_to_metainteger(apps, schema_editor):
    MetaChar = apps.get_model("photolith", "MetaChar")
    MetaInteger = apps.get_model("photolith", "MetaInteger")

    rows = MetaChar.objects.filter(key__in=["station", "sampleId", "measureId"])
    new_rows = [
        MetaInteger(individual=row.individual, key=row.key, value=int(row.value))
        for row in rows
    ]
    MetaInteger.objects.bulk_create(new_rows)
    rows.delete()


def move_to_metachar(apps, schema_editor):
    MetaChar = apps.get_model("photolith", "MetaChar")
    MetaInteger = apps.get_model("photolith", "MetaInteger")

    rows = MetaInteger.objects.filter(key__in=["station", "sampleId", "measureId"])
    new_rows = [
        MetaChar(individual=row.individual, key=row.key, value=str(row.value))
        for row in rows
    ]
    MetaChar.objects.bulk_create(new_rows)
    rows.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("photolith", "0031_metainteger"),
    ]

    operations = [
        migrations.RunPython(move_to_metainteger, move_to_metachar),
    ]
