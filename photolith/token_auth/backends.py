from django.contrib.auth.backends import BaseBackend
from django.utils import timezone

from .models import ApiToken


class ApiTokenBackend(BaseBackend):
    """
    Authenticate with an API token key, see ApiTokenMiddleware

    NB: Permissions are left to ModelBackend
    """

    def authenticate(self, request, token=None, **kwargs):
        if not token:
            return None
        t = (
            ApiToken.objects.select_related("user")
            .filter(key_hash=ApiToken.hash_key(token))
            .first()
        )
        if t is None or not t.user.is_active:
            return None
        ApiToken.objects.filter(pk=t.pk).update(last_used_at=timezone.now())
        return t.user
