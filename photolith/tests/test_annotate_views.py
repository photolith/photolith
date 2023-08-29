import datetime

from django.core.exceptions import BadRequest
from django.test import RequestFactory, TestCase

from ..annotate.views import AnnotateView
from ..models import Annotation, Individual, Image, Project

from .requires_utils import RequiresUtils


class AnnotateViewTest(RequiresUtils, TestCase):
    def create_project(self, **kwargs):
        p = Project.objects.create(
            name="UT Project",
            search_qs="ut=yes",
            **kwargs,
        )
        return p

    def test_get_object(self):
        def get_object(**kwargs):
            request = RequestFactory().get("/", kwargs)
            v = AnnotateView()
            v.setup(request, **(request.GET.dict()))
            out = v.get_object()
            return out

        ind = Individual.objects.create(
            image=Image.objects.create(
                href="//moo.jpg", orig_filename="moo.jpg", mimetype="image/jpeg"
            ),
            bounding_box=[[0, 0], [100, 100]],
        )
        ind.save()
        user1 = self.create_user("user1")
        ann = self.create_annotation(ind, user1, created_delta=dict(days=-5))
        ann.save()
        # Returns None, not an error (as the default would)
        self.assertEqual(get_object(), None)
        self.assertEqual(get_object(individual_id=ind.id), None)

        # Returns annotation object
        self.assertEqual(get_object(individual_id=ind.id, annotation_id=ann.id), ann)

        # individual mismatch reported
        with self.assertRaisesRegexp(BadRequest, r"individual"):
            get_object(individual_id=ind.id + 1, annotation_id=ann.id)

    def test_get_all_annotations(self):
        def get_all_annotations(individual, project=None):
            if isinstance(project, dict):
                p = self.create_project(**project)
            else:
                p = project
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

        # Assign a project with a base_user, only see init_annotation (which isn't part of project)
        p = self.create_project(
            created_by=user3,
            base_user=user1,
        )
        self.create_annotation(ind, user1, created_delta=dict(days=-5), project=p)
        self.create_annotation(ind, user1, created_delta=dict(days=-4), project=p)
        self.create_annotation(ind, user2, created_delta=dict(days=-3), project=p)
        self.create_annotation(ind, user2, created_delta=dict(days=-2), project=p)
        self.assertEqual(p.is_open, True)
        self.assertEqual(
            get_all_annotations(ind, project=p),
            [
                "0-user1-2",
            ],
        )

        # Close & see everything part of project
        p.date_end = (self.now + datetime.timedelta(days=-1)).date()
        p.save()
        self.assertEqual(p.is_open, False)
        self.assertEqual(
            get_all_annotations(ind, project=p),
            [
                "10-user2-2",
                "10-user2-3",
                "10-user1-4",
                "10-user1-5",
            ],
        )
