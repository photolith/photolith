import hashlib
import secrets

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class ApiToken(models.Model):
    """
    A key a user can use to access the API, see doc/advanced/api.rst
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    name = models.CharField(
        _("Name"),
        max_length=255,
        blank=False,
        null=False,
        help_text=_("What the token is used for, e.g. the name of an import script"),
    )
    # NB: Only store a hash, the key itself is shown once on creation
    key_hash = models.CharField(max_length=64, unique=True, editable=False)
    created_at = models.DateTimeField(
        _("Created at"), auto_now_add=True, editable=False
    )
    last_used_at = models.DateTimeField(_("Last used at"), null=True, editable=False)

    class Meta:
        verbose_name = _("API token")
        verbose_name_plural = _("API tokens")

    @staticmethod
    def hash_key(key):
        # NB: Keys are long & random, so a slow password hash isn't needed
        return hashlib.sha256(key.encode("utf8")).hexdigest()

    def generate_key(self):
        """Generate a new key for this token, return the key"""
        key = secrets.token_urlsafe(32)
        self.key_hash = self.hash_key(key)
        return key

    def __str__(self):
        return "%s: %s" % (self.user, self.name)
