import datetime

from django.utils import timezone
from django.contrib.auth import get_user_model

from ..models import Annotation


class RequiresUtils:
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

    def create_user(self, username):
        out = get_user_model().objects.create(
            username=username,
            password="%s123" % username,
            email="%s@example.com" % username,
        )
        return self._ru_append(out)

    def create_annotation(
        self,
        individual,
        created_by=None,
        created_delta=dict(),
        rating=Annotation.Rating.GOOD,
        age=10,
        axis_poly=[[0, 0], [1, 1], [2, 2]],
    ):
        if not created_by:
            created_by = self.create_user("annotator")
        out = Annotation.objects.create(
            individual=individual,
            created_by=created_by,
            rating=Annotation.Rating.GOOD,
            age=10,
            axis_poly=[[0, 0], [1, 1], [2, 2]],
        )
        out.created_at = out.modified_at = self.now + datetime.timedelta(
            **created_delta
        )
        return self._ru_append(out)
