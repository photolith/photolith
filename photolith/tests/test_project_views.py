from django.test import RequestFactory, TestCase

from ..project.views import ProjectListView
from ..models import Annotation, Individual, Image, Project

from .requires_utils import RequiresUtils


class ProjectListViewTest(RequiresUtils, TestCase):
    def query(self, user, **kwargs):
        request = RequestFactory().get("/", kwargs)
        request.user = user
        v = ProjectListView()
        v.setup(request, **(request.GET.dict()))
        out = [
            dict(
                name=p.name,
                is_open=p.is_open,
                num_annotations=p.num_annotations,
                num_individuals=p.num_individuals,
            )
            for p in v.get_queryset().all()
        ]
        return out

    def test_get_queryset(self):
        user1 = self.create_user(groups=["Annotate"])
        user2 = self.create_user(groups=["Annotate"])
        user3 = self.create_user(groups=["Annotate"])
        userA = self.create_user(groups=["Annotate", "Project Admin"])
        self.assertEqual(self.query(user1), [])

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

        # Create projects, see number of individuals
        p1 = self.create_project(
            individuals=[ind_fish, ind_rock],
            team=[user1, user2],
            date_end_delta=dict(days=4),
        )
        p2 = self.create_project(
            individuals=[ind_rock],
            team=[user2],
            date_end_delta=dict(days=2),
        )
        self.assertEqual(
            self.query(user1),
            [
                dict(
                    name="UT Project 1",
                    is_open=True,
                    num_annotations=0,
                    num_individuals=2,
                ),
            ],
        )
        self.assertEqual(
            self.query(user2),
            [
                dict(
                    name="UT Project 1",
                    is_open=True,
                    num_annotations=0,
                    num_individuals=2,
                ),
                dict(
                    name="UT Project 2",
                    is_open=True,
                    num_annotations=0,
                    num_individuals=1,
                ),
            ],
        )
        # NB: Not part of p1 or p2
        self.assertEqual(self.query(user3), [])

        # user1 does some annotating
        self.create_annotation(ind_fish, created_by=user1, project=p1)
        self.assertEqual(
            self.query(user1),
            [
                dict(
                    name="UT Project 1",
                    is_open=True,
                    num_annotations=1,
                    num_individuals=2,
                ),
            ],
        )

        # Do some more on the same individual, doesn't alter counts
        self.create_annotation(ind_fish, created_by=user1, project=p1)
        self.assertEqual(
            self.query(user1),
            [
                dict(
                    name="UT Project 1",
                    is_open=True,
                    num_annotations=1,
                    num_individuals=2,
                ),
            ],
        )

        # Do annotation on other individual
        self.create_annotation(ind_rock, created_by=user1, project=p1)
        self.assertEqual(
            self.query(user1),
            [
                dict(
                    name="UT Project 1",
                    is_open=True,
                    num_annotations=2,
                    num_individuals=2,
                ),
            ],
        )

        # User2 sees none of this
        self.assertEqual(
            self.query(user2),
            [
                dict(
                    name="UT Project 1",
                    is_open=True,
                    num_annotations=0,
                    num_individuals=2,
                ),
                dict(
                    name="UT Project 2",
                    is_open=True,
                    num_annotations=0,
                    num_individuals=1,
                ),
            ],
        )

        # user2 annotates outside a project, no change
        self.create_annotation(
            ind_fish,
            created_by=user2,
            project=None,
        )
        self.assertEqual(
            self.query(user2),
            [
                dict(
                    name="UT Project 1",
                    is_open=True,
                    num_annotations=0,
                    num_individuals=2,
                ),
                dict(
                    name="UT Project 2",
                    is_open=True,
                    num_annotations=0,
                    num_individuals=1,
                ),
            ],
        )

        # Annotation only counts for associated project
        self.create_annotation(
            ind_rock,
            created_by=user2,
            project=p1,
        )
        self.assertEqual(
            self.query(user2),
            [
                dict(
                    name="UT Project 1",
                    is_open=True,
                    num_annotations=1,
                    num_individuals=2,
                ),
                dict(
                    name="UT Project 2",
                    is_open=True,
                    num_annotations=0,
                    num_individuals=1,
                ),
            ],
        )
        self.create_annotation(
            ind_rock,
            created_by=user2,
            project=p2,
        )
        self.assertEqual(
            self.query(user2),
            [
                dict(
                    name="UT Project 1",
                    is_open=True,
                    num_annotations=1,
                    num_individuals=2,
                ),
                dict(
                    name="UT Project 2",
                    is_open=True,
                    num_annotations=1,
                    num_individuals=1,
                ),
            ],
        )
