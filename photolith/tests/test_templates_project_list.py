import re

from django.test import Client, TestCase

from ..project.views import ProjectListView
from ..models import Annotation, Individual, Image, Project

from .requires_utils import RequiresUtils


class TemplatesProjectListTest(RequiresUtils, TestCase):
    def do_project_list(self, user):
        client = Client()
        client.force_login(user)
        resp = client.get("/project/", {})
        out = re.findall(
            r"<tbody>.*?</tbody>", resp.content.decode("utf8"), flags=re.DOTALL
        )
        out = [
            [
                re.findall(r"<td>.*?</td>", y, flags=re.DOTALL)
                for y in re.findall(r"<tr>.*?</tr>", x, flags=re.DOTALL)
            ]
            for x in out
        ]
        return out

    def test_get_queryset__visibility(self):
        user1 = self.create_user(groups=[])
        user2 = self.create_user(groups=[])
        user3 = self.create_user(groups=[])
        userA1 = self.create_user(groups=["Project Admin"])
        userA2 = self.create_user(groups=["Project Admin"])

        projects = [
            self.create_project(
                name="p1.1",
                team=[user1, user2, userA2],
                date_end_delta=dict(days=4),
                created_by=userA1,
            ),
            self.create_project(
                name="p1.2",
                team=[user2, user3, userA1],
                date_end_delta=dict(days=3),
                created_by=userA1,
            ),
            self.create_project(
                name="p2.1",
                team=[user1, user2, userA2],
                date_end_delta=dict(days=2),
                created_by=userA2,
            ),
            self.create_project(
                name="p2.2",
                team=[user2, user3, userA1],
                date_end_delta=dict(days=1),
                created_by=userA2,
            ),
        ]

        out = self.do_project_list(user1)
        self.assertEqual(
            [x[0] for x in out[0]],
            ["<td>p1.1</td>", "<td>p2.1</td>"],
        )
        self.assertHTMLEqual(
            out[0][0][4],
            "<td>"
            '<a href="/annotate/?project=1" class="btn btn-info">Annotate project</a>'
            "</td>",
        )
        self.assertHTMLEqual(
            out[0][1][4],
            "<td>"
            '<a href="/annotate/?project=3" class="btn btn-info">Annotate project</a>'
            "</td>",
        )

        out = self.do_project_list(userA1)
        self.assertEqual(
            [x[0] for x in out[0]],
            ["<td>p1.1</td>", "<td>p1.2</td>", "<td>p2.2</td>"],
        )
        # Our project, can view results & edit (but not annotate)
        self.assertHTMLEqual(
            out[0][0][4],
            "<td>"
            '<a href="/search/?project=1" class="btn btn-info">View results</a>'
            '<a href="/project/update/1/" class="btn btn-info float-end">Edit</a>'
            "</td>",
        )
        # Part of own project, can annotate & edit
        self.assertHTMLEqual(
            out[0][1][4],
            "<td>"
            '<a href="/annotate/?project=2" class="btn btn-info">Annotate project</a>'
            '<a href="/project/update/2/" class="btn btn-info float-end">Edit</a>'
            "</td>",
        )
        # Part of someone else's project, can annotate
        self.assertHTMLEqual(
            out[0][2][4],
            "<td>"
            '<a href="/annotate/?project=4" class="btn btn-info">Annotate project</a>'
            "</td>",
        )

        for p in projects:
            self.close_project(p)

        out = self.do_project_list(user1)
        self.assertEqual(
            [x[0] for x in out[0]],
            ["<td>p1.1</td>", "<td>p2.1</td>"],
        )
        self.assertHTMLEqual(
            out[0][0][3],
            "<td>"
            '<a href="/search/?project=1" class="btn btn-info">View results</a>'
            "</td>",
        )
        self.assertHTMLEqual(
            out[0][1][3],
            "<td>"
            '<a href="/search/?project=3" class="btn btn-info">View results</a>'
            "</td>",
        )

        out = self.do_project_list(userA1)
        self.assertEqual(
            [x[0] for x in out[0]],
            ["<td>p1.1</td>", "<td>p1.2</td>", "<td>p2.2</td>"],
        )
        # Our project, can view results & edit (but not annotate)
        self.assertHTMLEqual(
            out[0][0][3],
            "<td>"
            '<a href="/search/?project=1" class="btn btn-info">View results</a>'
            '<a href="/project/update/1/" class="btn btn-info float-end">Edit</a>'
            "</td>",
        )
        # Part of own project, can view results & edit
        self.assertHTMLEqual(
            out[0][1][3],
            "<td>"
            '<a href="/search/?project=2" class="btn btn-info">View results</a>'
            '<a href="/project/update/2/" class="btn btn-info float-end">Edit</a>'
            "</td>",
        )
        # Part of someone else's project, can annotate
        self.assertHTMLEqual(
            out[0][2][3],
            "<td>"
            '<a href="/search/?project=4" class="btn btn-info">View results</a>'
            "</td>",
        )
