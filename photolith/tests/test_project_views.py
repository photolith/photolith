from django.test import Client, RequestFactory, TestCase

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


class ProjectUpdateViewTest(RequiresUtils, TestCase):
    def do_project_update(self, project, user, **updates):
        client = Client()
        client.force_login(user)
        if "team" not in updates:
            updates["team"] = project.team.id
        if "individuals" not in updates:
            updates["individuals"] = [i.id for i in project.individuals.all()]
        if "date_end" not in updates:
            updates["date_end"] = project.date_end
        resp = client.post("/project/update/%d/" % (project.id,), updates)
        return (
            resp.status_code,
            json.loads(resp.content)
            if resp.headers["Content-Type"] == "application/json"
            else resp.content,
        )

    def test_call(self):
        userA1 = self.create_user(groups=["Annotate", "Project Admin"])
        userA2 = self.create_user(groups=["Annotate", "Project Admin"])
        user1 = self.create_user(groups=["Annotate"])
        user2 = self.create_user(groups=["Annotate"])

        p1 = self.create_project(
            name="A1_project",
            individuals=2,
            team=[user1],
            created_by=userA1,
        )

        # Only owner is allowed to update
        self.assertEqual(self.do_project_update(p1, user1, name="Gerald")[0], 403)
        self.assertEqual(Project.objects.filter(pk=p1.id).first().name, "A1_project")
        self.assertEqual(self.do_project_update(p1, user2, name="Gerald")[0], 403)
        self.assertEqual(Project.objects.filter(pk=p1.id).first().name, "A1_project")
        self.assertEqual(self.do_project_update(p1, userA2, name="Gerald")[0], 403)
        self.assertEqual(Project.objects.filter(pk=p1.id).first().name, "A1_project")
        self.assertEqual(self.do_project_update(p1, userA1, name="Gerald")[0], 302)
        self.assertEqual(Project.objects.filter(pk=p1.id).first().name, "Gerald")


class ProjectDeleteViewTest(RequiresUtils, TestCase):
    def do_project_del(self, project, user):
        client = Client()
        client.force_login(user)
        resp = client.post("/project/delete/%d/" % (project.id,), {})
        return (
            resp.status_code,
            json.loads(resp.content)
            if resp.headers["Content-Type"] == "application/json"
            else resp.content,
        )

    def test_call(self):
        userA1 = self.create_user(groups=["Annotate", "Project Admin"])
        userA2 = self.create_user(groups=["Annotate", "Project Admin"])
        user1 = self.create_user(groups=["Annotate"])
        user2 = self.create_user(groups=["Annotate"])

        p1 = self.create_project(
            name="A1_project",
            individuals=2,
            team=[user1],
            created_by=userA1,
        )
        p2 = self.create_project(
            name="A2_project",
            individuals=4,
            team=[user2],
            created_by=userA2,
        )

        # Only owner is allowed to delete
        self.assertEqual(self.do_project_del(p1, user1)[0], 403)
        self.assertEqual(Project.objects.filter(name="A1_project").count(), 1)
        self.assertEqual(self.do_project_del(p1, user2)[0], 403)
        self.assertEqual(Project.objects.filter(name="A1_project").count(), 1)
        self.assertEqual(self.do_project_del(p1, userA2)[0], 403)
        self.assertEqual(Project.objects.filter(name="A1_project").count(), 1)
        self.assertEqual(self.do_project_del(p1, userA1)[0], 302)
        self.assertEqual(Project.objects.filter(name="A1_project").count(), 0)

        # Only owner is allowed to delete
        self.assertEqual(self.do_project_del(p2, user1)[0], 403)
        self.assertEqual(Project.objects.filter(name="A2_project").count(), 1)
        self.assertEqual(self.do_project_del(p2, user2)[0], 403)
        self.assertEqual(Project.objects.filter(name="A2_project").count(), 1)
        self.assertEqual(self.do_project_del(p2, userA1)[0], 403)
        self.assertEqual(Project.objects.filter(name="A2_project").count(), 1)
        self.assertEqual(self.do_project_del(p2, userA2)[0], 302)
        self.assertEqual(Project.objects.filter(name="A2_project").count(), 0)
