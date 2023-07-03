from django.conf import settings
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


class Individual(models.Model):
    """
    An otolith within an image
    """

    image = models.ForeignKey("Image", on_delete=models.CASCADE, null=False)
    bounding_box = models.JSONField(null=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True, editable=False)
    modified_at = models.DateTimeField(auto_now=True, editable=False)


class MetaNumeric(models.Model):
    """
    Numeric Metadata about an individual, e.g. length
    NB: This is only for floats. Serials such as individualId have to be stringified
    """

    individual = models.ForeignKey("Individual", on_delete=models.CASCADE, null=False)
    key = models.CharField(max_length=255, blank=False, null=False)
    value = models.FloatField(blank=True, null=True)


class MetaChar(models.Model):
    """
    Character Metadata about an individual, e.g. station
    """

    individual = models.ForeignKey("Individual", on_delete=models.CASCADE, null=False)
    key = models.CharField(max_length=255, blank=False, null=False)
    value = models.CharField(max_length=255, blank=True, null=True)


class MetaTx(models.Model):
    """
    Taxonomy Metadata about an individual, e.g. species
    """

    individual = models.ForeignKey("Individual", on_delete=models.CASCADE, null=False)
    key = models.CharField(max_length=255, blank=False, null=False)
    value = models.ForeignKey("Taxonomy", on_delete=models.SET_NULL, null=True)


class Taxonomy(models.Model):
    """
    Translatable values for keys
    """

    key = models.CharField(max_length=255, blank=False, null=False)
    identifier = models.IntegerField(null=True)
    str_en = models.CharField(max_length=255, blank=False, null=False)
    str_is = models.CharField(max_length=255, blank=False, null=False)
