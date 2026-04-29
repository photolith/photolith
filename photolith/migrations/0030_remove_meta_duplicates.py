import json

from django.core.serializers.json import DjangoJSONEncoder
from django.db import migrations
from django.db.models import Count


def remove_duplicate_meta_numeric(apps, schema_editor):

    def remove_duplicates(metamodel_str):
        metamodel = apps.get_model("photolith", metamodel_str)

        # Get all (individual, key) pairs that have duplicates
        duplicates = (
            metamodel.objects.values("individual", "key")
            .annotate(count=Count("id"))
            .filter(count__gt=1)
        )

        for duplicate in duplicates:
            # For each duplicate pair, keep the highest id and delete the rest
            records = metamodel.objects.filter(
                individual=duplicate["individual"],
                key=duplicate["key"],
            ).order_by("-id")
            ids_to_delete = records.values_list("id", flat=True)[1:]

            for x in metamodel.objects.filter(id__in=list(ids_to_delete)):
                print(
                    "Removing: %s"
                    % (
                        json.dumps(
                            dict(
                                id=x.id,
                                individual_id=x.individual_id,
                                key=x.key,
                                value=x.value,
                            ),
                            cls=DjangoJSONEncoder,
                        ),
                    )
                )
                x.delete()

    remove_duplicates("MetaNumeric")
    remove_duplicates("MetaDT")
    remove_duplicates("MetaChar")


class Migration(migrations.Migration):

    dependencies = [
        ("photolith", "0029_alter_userspeciesauthority_options_and_more"),
    ]

    operations = [
        migrations.RunPython(
            remove_duplicate_meta_numeric,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
