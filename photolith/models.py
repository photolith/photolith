import datetime
import numbers

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


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

    @property
    def data(self):
        out = {}
        for m in self.metanumeric_set.all():
            out[m.key] = m.value
        for m in self.metachar_set.all():
            out[m.key] = m.value
        for m in self.metatx_set.all():
            out[m.key] = m.value.dict
        return out

    @data.setter
    def data(self, new_value):
        for k, v in new_value.items():
            if isinstance(v, numbers.Number):
                self.metanumeric_set.add(
                    MetaNumeric(
                        individual=self,
                        key=k,
                        value=float(v),
                    ),
                    bulk=False,
                )

            elif isinstance(v, str):
                self.metachar_set.add(
                    MetaChar(
                        individual=self,
                        key=k,
                        value=str(v),
                    ),
                    bulk=False,
                )

            elif isinstance(v, dict):
                tx, created = Taxonomy.objects.get_or_create(key=k, identifier=v["id"])
                v["key"] = k
                tx.dict = v
                tx.save()
                self.metatx_set.add(
                    MetaTx(
                        individual=self,
                        key=k,
                        value=tx,
                    ),
                    bulk=False,
                )

            else:
                raise ValueError("Unknown type of %s: %s" % (k, str(v)))

    def data_save(self):
        for tx in self.metanumeric_set.all():
            tx.save()
        for tx in self.metachar_set.all():
            tx.save()
        for tx in self.metatx_set.all():
            tx.save()
            tx.value.save()


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

    # NB: key isn't generally needed, but key/identifier is our business-logic key, and
    #     we compare this when upserting
    key = models.CharField(max_length=255, blank=False, null=False)
    identifier = models.IntegerField(null=True)
    str_en = models.CharField(max_length=255, blank=False, null=False)
    str_is = models.CharField(max_length=255, blank=False, null=False)

    @property
    def dict(self):
        out = dict(id=self.identifier)
        for f in self._meta._get_fields():
            if f.name.startswith("str_"):
                out[f.name.replace("str_", "")] = getattr(self, f.name)
        return out

    @dict.setter
    def dict(self, new_dict):
        for k, v in new_dict.items():
            if k == "id":
                self.identifier = v
            elif hasattr(self, "str_%s" % k):
                setattr(self, "str_%s" % k, v)


class Annotation(models.Model):
    """
    A user's annotations and verdict of an individual
    """

    class Rating(models.IntegerChoices):
        UNREADABLE = 0, _("Unreadable")
        DIFFICULT = 50, _("Difficult (+/- one year)")
        GOOD = 100, _("Easy to read")

    individual = models.ForeignKey("Individual", on_delete=models.CASCADE, null=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name=_("Created by"),
        on_delete=models.SET_NULL,
        null=True,
    )
    created_at = models.DateTimeField(
        _("Created at"), auto_now_add=True, editable=False
    )
    modified_at = models.DateTimeField(
        _("Last modified"), auto_now=True, editable=False
    )
    rating = models.PositiveSmallIntegerField(
        _("Image rating"), null=True, choices=Rating.choices
    )
    age = models.IntegerField(_("Age reading"), null=True)
    comment = models.TextField(_("Comments"), null=False, default="")
    axis_poly = models.JSONField(null=True)

    def edit_allowed(self, user):
        """True iff (user) is allowed to edit this annotation. Assign user if one not already assigned"""
        if not self.created_by:
            self.created_by = user
        return user.is_superuser or created_by == user


class Project(models.Model):
    name = models.CharField(
        verbose_name=_("Project name"),
        max_length=4096,
        blank=False,
        null=False,
    )
    search_qs = models.CharField(
        verbose_name=_("Search querystring"),
        max_length=4096,
        blank=False,
        null=False,
    )
    date_end = models.DateField(
        verbose_name=_("Project end date"),
        # Default 4 weeks from now
        default=datetime.date.today() + datetime.timedelta(weeks=4),
        null=False,
    )
    base_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name=_("Base axis on user"),
        help_text=_(
            "If a user is selected, then their most recent annotation for each individual will be used as a starting point for annotations"
        ),
        related_name="projects_based_on_set",
        on_delete=models.SET_NULL,
        null=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name=_("Created by"),
        on_delete=models.SET_NULL,
        null=True,
    )
    created_at = models.DateTimeField(
        _("Created at"), auto_now_add=True, editable=False
    )
    modified_at = models.DateTimeField(
        _("Last modified"), auto_now=True, editable=False
    )

    @property
    def is_open(self):
        return self.date_end >= datetime.date.today()
