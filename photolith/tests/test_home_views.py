from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory, TestCase

from ..home.views import IndexView
from ..models import Annotation, Individual, Image, Project

from .requires_utils import RequiresUtils


class IndexViewTest(RequiresUtils, TestCase):
    def ctx(self, user):
        request = RequestFactory().get("/", {})
        request.user = user if user else AnonymousUser()
        v = IndexView()
        v.setup(request, **(request.GET.dict()))

        context = v.get_context_data()

        # Not interested in project content, that's for project_list to worry about
        if context["projects"] != []:
            context["projects"] = [p.name for p in context["projects"].all()]

        return context

    def test_get_context_data__projects(self):
        """Nab the projects from ProjectListView"""
        user1 = self.create_user(groups=["General Annotation Editor"])
        user2 = self.create_user(groups=["General Annotation Editor"])
        userA1 = self.create_user(groups=["General Annotation Editor", "Project Admin"])

        self.create_project(
            name="p1.1",
            team=[user1],
            date_end_delta=dict(days=4),
            created_by=userA1,
        )

        # Unauth sees nothing
        self.assertEqual(self.ctx(None)["projects"], [])

        # Can see projects
        self.assertEqual(self.ctx(user1)["projects"], ["p1.1"])
        self.assertEqual(self.ctx(user2)["projects"], [])
