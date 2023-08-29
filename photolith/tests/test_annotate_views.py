from django.test import RequestFactory, TestCase

from ..annotate.views import AnnotateView
from ..models import Annotation, Individual, Image, Project

from .requires_utils import RequiresUtils


class AnnotateViewTest(RequiresUtils, TestCase):
    def test_get_all_annotations(self):
        def get_all_annotations(individual, project=None):
            if project is not None:
                p = Project.objects.create(
                    name="UT Project",
                    search_qs="ut=yes",
                    **project,
                )
            else:
                p = None
            request = RequestFactory().get(
                "/",
                dict(
                    individual_id=individual.id,
                    project=p.id if p else "",
                ),
            )
            v = AnnotateView()
            v.setup(request, **(request.GET.dict()))
            out = v.get_all_annotations()
            return [
                "-".join(
                    (
                        str(a.age),
                        a.created_by.username if a.created_by else "None",
                        str((self.now - a.created_at).days),
                    )
                )
                for a in out
            ]

        # No annotations for individual yet
        ind = Individual.objects.create(
            image=Image.objects.create(
                href="//moo.jpg", orig_filename="moo.jpg", mimetype="image/jpeg"
            ),
            bounding_box=[[0, 0], [100, 100]],
        )
        self.assertEqual(get_all_annotations(ind), [])
        user1 = self.create_user("user1")
        user2 = self.create_user("user2")
        user3 = self.create_user("user3")

        # Create 4 annotations, see all 4, newest first
        self.create_annotation(ind, user1, created_delta=dict(days=-3))
        self.create_annotation(ind, user1, created_delta=dict(days=-2))
        self.create_annotation(ind, user2, created_delta=dict(days=-3))
        self.create_annotation(ind, user3, created_delta=dict(days=-3))
        self.assertEqual(
            get_all_annotations(ind),
            [
                "10-user1-2",
                "10-user1-3",
                "10-user2-3",
                "10-user3-3",
            ],
        )

        # Projects have no annotations
        self.assertEqual(
            get_all_annotations(ind, project=dict(created_by=user3, base_user=None)),
            [],
        )

        # ...unless we assign a base user, get the most recent one, details blanked
        self.assertEqual(
            get_all_annotations(ind, project=dict(created_by=user3, base_user=user1)),
            ["0-user1-2"],
        )
