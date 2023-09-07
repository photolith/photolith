from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Closes the specified poll for voting"

    def add_arguments(self, parser):
        parser.add_argument("setting_key", nargs="+", type=str)

        parser.add_argument(
            "--head",
            action="store_true",
            help="Return first item in list of values",
        )
        parser.add_argument(
            "--tail",
            action="store_true",
            help="Return remaining items in list of values",
        )

    def handle(self, *args, **options):
        for k in options["setting_key"]:
            v = getattr(settings, k)
            if isinstance(v, list):
                if options["head"]:
                    v = v[0:1]
                if options["tail"]:
                    v = v[1:]
                v = " ".join(v)
            print(v)
