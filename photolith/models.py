from django.db import models
from django.conf import settings


class Image(models.Model):
    """
    An image containing one or more otoliths
    """

    # href: Web-accessible location of image
    href = models.CharField(max_length=255, blank=False, null=False, unique=True)
    orig_filename = models.CharField(max_length=255, blank=False, null=False)
    mimetype = models.CharField(max_length=255, blank=False, null=False)
    scale_line = models.JSONField(null=True)
    scale_mm = models.IntegerField(null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True, editable=False)
    modified_at = models.DateTimeField(auto_now=True, editable=False)
