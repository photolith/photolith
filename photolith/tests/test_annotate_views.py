import datetime
import re

from django.core.exceptions import BadRequest
from django.test import Client, RequestFactory, TestCase

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

    def form_post(self, user, ind, **kwargs):
        ann_dict = dict(
            individual=ind.id,
            project=kwargs["project"].id if "project" in kwargs else "",
            age=kwargs.get("age", 10),
            axis_poly=kwargs.get("axis_poly", [[0, 0], [1, 1], [2, 2]]),
            comment=kwargs.get("comment", "UT comment"),
            rating=kwargs.get("rating", Annotation.Rating.GOOD),
        )

        client = Client()
        client.force_login(user)
        resp = client.post("/annotate/%d/" % (ind.id,), ann_dict)
        self.assertEqual(resp.status_code, 302)
        m = re.fullmatch(r"/annotate/(\d+)/(\d+)\?(.*)", resp.url)
        self.assertTrue(m is not None)
        self.assertEqual(int(m.group(1)), ind.id)
        out = Annotation.objects.get(pk=int(m.group(2)))
        return out

    def test_form_valid_authority(self):
        """Make sure authority is set appropriately on save"""
        ind_nospecies = Individual.objects.create(
            image=self.create_image("moo0.jpg"),
            bounding_box=[[0, 0], [100, 100]],
        )
        ind_fish = Individual.objects.create(
            image=self.create_image("moo1.jpg"),
            bounding_box=[[0, 0], [100, 100]],
        )
        ind_fish.data = dict(species={"id": 100, "en": "Fish", "is": "Fiskur"})
        ind_rock = Individual.objects.create(
            image=self.create_image("moo1.jpg"),
            bounding_box=[[0, 0], [100, 100]],
        )
        ind_rock.data = dict(species={"id": 200, "en": "Rock", "is": "Rockur"})

        # User without profile isn't an authority
        user1 = self.create_user(groups=["Annotate"])
        ann = self.form_post(user1, ind_nospecies)
        self.assertEqual(ann.authority, Annotation.AuthorityLevel.NON_EXPERT)
        ann = self.form_post(user1, ind_fish)
        self.assertEqual(ann.authority, Annotation.AuthorityLevel.NON_EXPERT)
        ann = self.form_post(user1, ind_rock)
        self.assertEqual(ann.authority, Annotation.AuthorityLevel.NON_EXPERT)

        # Add profile, only authority for relevant species
        user2 = self.create_user(groups=["Annotate"], species_expert="Fish")
        ann = self.form_post(user2, ind_nospecies)
        self.assertEqual(ann.authority, Annotation.AuthorityLevel.NON_EXPERT)
        ann = self.form_post(user2, ind_fish)
        self.assertEqual(ann.authority, Annotation.AuthorityLevel.EXPERT)
        ann = self.form_post(user2, ind_rock)
        self.assertEqual(ann.authority, Annotation.AuthorityLevel.NON_EXPERT)

        user3 = self.create_user(groups=["Annotate"], species_expert="Rock")
        ann = self.form_post(user3, ind_nospecies)
        self.assertEqual(ann.authority, Annotation.AuthorityLevel.NON_EXPERT)
        ann = self.form_post(user3, ind_fish)
        self.assertEqual(ann.authority, Annotation.AuthorityLevel.NON_EXPERT)
        ann = self.form_post(user3, ind_rock)
        self.assertEqual(ann.authority, Annotation.AuthorityLevel.EXPERT)

    def test_get_object(self):
        def get_object(**kwargs):
            request = RequestFactory().get("/", kwargs)
            v = AnnotateView()
            v.setup(request, **(request.GET.dict()))
            out = v.get_object()
            return out

        ind = Individual.objects.create(
            image=self.create_image(),
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
        def get_all_annotations(individual, project=None, user=None):
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
            request.user = user
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
            image=self.create_image("moo1.jpg"),
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
        # and your own annotations
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
        self.assertEqual(
            get_all_annotations(ind, project=p, user=user1),
            [
                "10-user1-4",
                "10-user1-5",
                "0-user1-2",
            ],
        )
        self.assertEqual(
            get_all_annotations(ind, project=p, user=user2),
            [
                "10-user2-2",
                "10-user2-3",
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
