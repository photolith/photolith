import datetime

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group

from ..models import Annotation, Image, Individual, Project, UserProfile, Taxonomy, Team

from .binaries import JPEG_VALID


class RequiresUtils:
    @classmethod
    def setUpClass(cls):
        super(RequiresUtils, cls).setUpClass()
        # Force SECRET_KEY to be set in all unit-tests, don't worry about teardown
        # NB: override_settings() would be neater, but it's own teardown complains
        # about lack of SECRET_KEY
        settings.SECRET_KEY = "insecure-ut"

    def setUp(self):
        super(RequiresUtils, self).setUp()
        self.now = timezone.now()
        self._ru_objects = []

    def tearDown(self):
        for o in self._ru_objects:
            o.delete()
        super(RequiresUtils, self).tearDown()

    def _ru_append(self, o):
        o.save()
        self._ru_objects.append(o)
        return o

    def create_user(self, username=None, groups=[], species_expert=[]):
        if not username:
            username = "ut_user%d" % (get_user_model().objects.count() + 1)
        out = get_user_model().objects.create(
            username=username,
            password="%s123" % username,
            email="%s@example.com" % username,
        )
        out.groups.set(Group.objects.filter(name__in=groups))
        self.assertEqual(out.groups.count(), len(groups))

        up = UserProfile.objects.create(user=out)
        if len(species_expert) > 0:
            up.species_expert.set(
                Taxonomy.objects.filter(str_en__in=species_expert).all()
            )

        return self._ru_append(out)

    def create_individual(
        self,
        image=None,
        bounding_box=[[0, 0], [100, 100]],
        created_by=None,
        created_delta=dict(),
        data=dict(),
    ):
        out = Individual.objects.create(
            image=image or self.create_image(),
            bounding_box=bounding_box,
            created_by=created_by,
        )
        out.data = data
        return self._ru_append(out)

    def create_annotation(
        self,
        individual,
        created_by=None,
        created_delta=dict(),
        rating=Annotation.Rating.GOOD,
        age=10,
        axis_poly=[[0, 0], [1, 1], [2, 2]],
        authority=0,
        comment="",
        project=None,
    ):
        if not created_by:
            if not hasattr(self, "_ru_annotator"):
                self._ru_annotator = self.create_user("annotator")
            created_by = self._ru_annotator
        out = Annotation.objects.create(
            individual=individual,
            created_by=created_by,
            rating=Annotation.Rating.GOOD,
            age=10,
            axis_poly=axis_poly,
            authority=authority,
            comment=comment,
            project=project,
        )
        out.created_at = out.modified_at = self.now + datetime.timedelta(
            **created_delta
        )
        return self._ru_append(out)

    def create_image(
        self,
        orig_filename=None,
        mimetype="image/jpeg",
        scale_line=[(10, 10), (20, 20)],
        scale_mm=10,
    ):
        if not orig_filename:
            orig_filename = "ut_image%d.jpg" % (Image.objects.count() + 1)
        out = Image.objects.create(
            orig_filename=orig_filename,
            mimetype=mimetype,
            scale_line=scale_line,
            scale_mm=scale_mm,
        )
        out.content = SimpleUploadedFile(
            name=orig_filename,
            content=JPEG_VALID,
            content_type=mimetype,
        )
        return self._ru_append(out)

    def create_project(
        self,
        team=[],
        individuals=[],
        date_end_delta=dict(days=1),
        base_user=None,
        created_by=None,
        created_delta=dict(),
    ):
        if isinstance(individuals, int):
            individuals = [
                self.create_individual(created_by=created_by, data=dict(idx=i))
                for i in range(individuals)
            ]
        out = Project.objects.create(
            name="UT Project %d" % (Project.objects.count() + 1),
            date_end=(self.now + datetime.timedelta(**date_end_delta)).date(),
            base_user=base_user,
            created_by=created_by,
        )
        out.save()

        if isinstance(team, list):
            t = Team.objects.create(name=out.name + " Team")
            t.users.set(team)
            team = t
        out.team = team
        out.individuals.set(individuals)
        out.save()
        return self._ru_append(out)

    def close_project(self, project):
        project.date_end = (self.now - datetime.timedelta(days=1)).date()
        project.save()
        return project
