from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from ...models import ApiToken


class Command(BaseCommand):
    help = "Create an API token for a user, and print its key"

    def add_arguments(self, parser):
        parser.add_argument("username", type=str)
        parser.add_argument(
            "--name",
            type=str,
            default="Created by create_api_token",
            help="What the token is used for",
        )

    def handle(self, *args, **options):
        try:
            user = get_user_model().objects.get(username=options["username"])
        except get_user_model().DoesNotExist:
            raise CommandError("Unknown user %s" % options["username"])

        token = ApiToken(user=user, name=options["name"])
        key = token.generate_key()
        token.save()
        self.stdout.write(key)
