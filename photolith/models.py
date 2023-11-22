import datetime
import re

from django.conf import settings
from django.core.files.storage import storages
from django.db import models
from django.utils.translation import get_language, gettext_lazy as _


def euclidean_dist(a, b):
    """Distance between 2 (x, y) tuples"""
    return pow(pow(b[0] - a[0], 2) + pow(b[1] - a[1], 2), 0.5)


def default_storage():
    return storages["default"]


def isisoformat(v):
    try:
        datetime.datetime.fromisoformat(v)
        return True
    except ValueError:
        return False


class UserProfile(models.Model):
    # https://docs.djangoproject.com/en/4.2/topics/auth/customizing/#extending-the-existing-user-model
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    species_expert = models.ManyToManyField(
        "Taxonomy",
        limit_choices_to=dict(key="species"),
    )

    def authority_level(self, ind_data):
        if "id" in ind_data.get("tx_species", dict()):
            if self.species_expert.filter(
                identifier=ind_data["tx_species"]["id"]
            ).exists():
                return Annotation.AuthorityLevel.EXPERT
        return Annotation.AuthorityLevel.NON_EXPERT


class Image(models.Model):
    """
    An image containing one or more otoliths
    """

    # https://docs.djangoproject.com/en/4.2/topics/files/
    content = models.ImageField(
        storage=default_storage, upload_to="image_content", null=True
    )
    orig_filename = models.CharField(max_length=255, blank=False, null=False)
    mimetype = models.CharField(max_length=255, blank=False, null=False)
    scale_line = models.JSONField(null=True)
    scale_mm = models.IntegerField(null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True, editable=False)
    modified_at = models.DateTimeField(auto_now=True, editable=False)

    def px_to_mm(self):
        if not self.scale_mm:
            return None
        return self.scale_mm / euclidean_dist(self.scale_line[0], self.scale_line[1])


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

    def full_data(self):
        """Dict of data, including values outside the meta table"""
        out = dict(
            id=self.id,
            dt_created_at=self.created_at,
            dt_modified_at=self.modified_at,
        )
        out.update(self.data)
        out["__str__"] = str(self)
        return out

    @property
    def data(self):
        out = {}
        for m in self.metanumeric_set.all():
            out["nm_" + m.key] = m.value
        for m in self.metachar_set.all():
            out["ch_" + m.key] = m.value
        for m in self.metadt_set.all():
            out["dt_" + m.key] = m.value
        for m in self.metatx_set.all():
            out["tx_" + m.key] = m.value.dict
        return out

    @data.setter
    def data(self, new_value):
        # TODO: Not removing old values
        for k, v in new_value.items():
            if "_" not in k:
                raise ValueError("'%s' has no type prefix" % k)
            t, k = k.split("_", 2)
            if t == "nm":
                self.metanumeric_set.add(
                    MetaNumeric(
                        individual=self,
                        key=k,
                        value=float(v),
                    ),
                    bulk=False,
                )

            elif t == "dt":
                self.metadt_set.add(
                    MetaDT(
                        individual=self,
                        key=k,
                        value=str(v),
                    ),
                    bulk=False,
                )

            elif t == "ch":
                self.metachar_set.add(
                    MetaChar(
                        individual=self,
                        key=k,
                        value=str(v),
                    ),
                    bulk=False,
                )

            elif t == "tx":
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

            else:  # pragma: no cover
                raise ValueError("Unknown type of %s: %s" % (k, str(v)))

    def save(self, *args, **kwargs):
        """Save any associated meta objects as well as ourselves"""
        super().save(*args, **kwargs)
        for tx in self.metanumeric_set.all():
            tx.save(*args, **kwargs)
        for tx in self.metachar_set.all():
            tx.save(*args, **kwargs)
        for tx in self.metadt_set.all():
            tx.save(*args, **kwargs)
        for tx in self.metatx_set.all():
            tx.save(*args, **kwargs)
            tx.value.save(*args, **kwargs)
        return

    def __str__(self):
        # Fetch all metachars
        # NB: Ideally .prefetch_related("metachar_set") should be used as part of any query
        #     We don't filter here to make sure any prefetch is used
        data = {x.key: x.value for x in self.metachar_set.all()}

        if data.get("individualLabel") and data.get("slideLabel"):
            return "%s : %s" % (
                data["slideLabel"],
                data["individualLabel"],
            )
        if data.get("slideLabel"):
            return data["slideLabel"]
        return "Individual %d" % self.pk


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
    key = models.CharField(
        verbose_name=_("Metadata key"),
        max_length=255,
        blank=False,
        null=False,
    )
    identifier = models.IntegerField(
        null=True,
    )
    str_en = models.CharField(
        verbose_name=_("English"),
        max_length=255,
        blank=False,
        null=False,
    )
    str_is = models.CharField(
        verbose_name=_("Icelandic"),
        max_length=255,
        blank=False,
        null=False,
    )

    class Meta:
        constraints = (
            models.UniqueConstraint(
                name="taxonomy_key_identifier",
                fields=("key", "identifier"),
            ),
        )
        indexes = [
            models.Index(fields=["key", "identifier"]),
        ]
        verbose_name_plural = "Taxonomies"

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

    def __str__(self):
        return "%s: %s" % (
            self.key,
            getattr(self, "str_%s" % re.sub(r"\W.*", "", get_language()), self.str_en),
        )


class Annotation(models.Model):
    """
    A user's annotations and verdict of an individual
    """

    class Rating(models.IntegerChoices):
        UNREADABLE = 0, _("Unreadable")
        DIFFICULT = 50, _("Difficult (+/- one year)")
        GOOD = 100, _("Easy to read")

    class AuthorityLevel(models.IntegerChoices):
        UNKNOWN = 0, _("Unknown")
        AUTOMATED = 20, _("Automated reader")
        NON_EXPERT = 50, _("Non expert, from image")
        NON_EXPERT_ORIG = 55, _("Non expert, with original otoliths or slides")
        EXPERT = 100, _("Expert, from image")
        EXPERT_ORIG = 105, _("Expert, with original otoliths or slides")

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
    authority = models.PositiveSmallIntegerField(
        _("Reader authority"),
        null=False,
        default=AuthorityLevel.UNKNOWN,
        choices=AuthorityLevel.choices,
    )
    age = models.IntegerField(_("Age reading"), null=True)
    comment = models.TextField(_("Comments"), null=False, default="")
    axis_poly = models.JSONField(null=True)

    class Meta:
        indexes = [
            models.Index(fields=["individual"]),
            models.Index(fields=["created_by", "individual"]),
        ]

    def axis_poly_dists(self):
        return [
            euclidean_dist(a, b) for a, b in zip(self.axis_poly, self.axis_poly[1:])
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
    team = models.ForeignKey(
        "Team",
        on_delete=models.SET_NULL,
        null=True,
        help_text=_("The set of users that should be included in the project"),
    )
    individuals = models.ManyToManyField(
        Individual,
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

    @property
    def is_closed(self):
        return not self.is_open

    def annotations_for(self, individual_id, annotater):
        """Return annotations that should be visible as part of this project"""
        if not self.is_open:
            # Project closed, show all results
            return Annotation.objects.filter(
                individual_id=individual_id,
                project=self,
            ).order_by("-authority", "-created_at")

        # Find previous annotations
        out = list(
            Annotation.objects.filter(
                individual_id=individual_id,
                project=self,
                created_by=annotater,
            )
            .order_by("-created_at")
            .all()
        )

        if self.base_user:
            # Find most recent annotation by base_user
            a = (
                Annotation.objects.filter(
                    individual_id=individual_id,
                    created_by=self.base_user,
                )
                .order_by("-created_at")
                .first()
            )
            if a:
                # Create copy without age assignment, intermediate nodes
                a.pk = None
                a.age = 0
                a.axis_poly = [a.axis_poly[0], a.axis_poly[-1]]
                out.append(a)

        return out

    def __str__(self):
        return self.name


class Team(models.Model):
    name = models.CharField(
        verbose_name=_("Team name"),
        max_length=4096,
        blank=False,
        null=False,
    )
    users = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        verbose_name=_("Team members"),
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="team_created_by",
    )
    created_at = models.DateTimeField(auto_now_add=True, editable=False)
    modified_at = models.DateTimeField(auto_now=True, editable=False)

    def __str__(self):
        return self.name
