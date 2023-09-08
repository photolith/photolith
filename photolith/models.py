import datetime
import numbers

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


def isisoformat(v):
    try:
        datetime.datetime.fromisoformat(v)
        return True
    except ValueError:
        return False


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
        settings.AUTH_USER_MODEL,
        verbose_name=_("Created by"),
        on_delete=models.SET_NULL,
        null=True,
    )
    created_at = models.DateTimeField(
        _("Created at"), auto_now_add=True, editable=False
    )
    modified_at = models.DateTimeField(_("Modified at"), auto_now=True, editable=False)

    @property
    def data(self):
        out = {}
        for m in self.metanumeric_set.all():
            out[m.key] = m.value
        for m in self.metachar_set.all():
            out[m.key] = m.value
        for m in self.metadt_set.all():
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

            elif isinstance(v, str) and isisoformat(v):
                self.metadt_set.add(
                    MetaDT(
                        individual=self,
                        key=k,
                        value=str(v),
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
        for tx in self.metadt_set.all():
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

    class Meta:
        indexes = [
            models.Index(fields=["key"]),
        ]


class MetaChar(models.Model):
    """
    Character Metadata about an individual, e.g. station
    """

    individual = models.ForeignKey("Individual", on_delete=models.CASCADE, null=False)
    key = models.CharField(max_length=255, blank=False, null=False)
    value = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=["key"]),
        ]


class MetaDT(models.Model):
    """
    DateTime Metadata about an individual, e.g. station date
    """

    individual = models.ForeignKey("Individual", on_delete=models.CASCADE, null=False)
    key = models.CharField(max_length=255, blank=False, null=False)
    value = models.DateTimeField(blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=["key"]),
        ]


class MetaTx(models.Model):
    """
    Taxonomy Metadata about an individual, e.g. species
    """

    individual = models.ForeignKey("Individual", on_delete=models.CASCADE, null=False)
    key = models.CharField(max_length=255, blank=False, null=False)
    value = models.ForeignKey("Taxonomy", on_delete=models.SET_NULL, null=True)

    class Meta:
        indexes = [
            models.Index(fields=["key", "value"]),
        ]


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

    class Meta:
        indexes = [
            models.Index(fields=["key", "identifier"]),
        ]

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
    project = models.ForeignKey(
        "Project",
        verbose_name=_("Part of project"),
        on_delete=models.CASCADE,
        blank=True,
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

    class Meta:
        indexes = [
            models.Index(fields=["individual"]),
            models.Index(fields=["created_by", "individual"]),
        ]


def in_4_weeks():
    return datetime.date.today() + datetime.timedelta(weeks=4)


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
        default=in_4_weeks,
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

    def init_annotation(self, individual_id):
        """Return the initial annotation for (individual_id) when working within this project"""
        if not self.base_user:
            return None

        # Find most recent annotation by base_user
        a = (
            Annotation.objects.filter(
                individual_id=individual_id,
                created_by=self.base_user,
            )
            .order_by("-created_at")
            .first()
        )
        if a is None:
            return None

        # Create copy without age assignment, intermediate nodes
        a.pk = None
        a.age = 0
        a.axis_poly = [a.axis_poly[0], a.axis_poly[-1]]
        return a
