import json

from django.contrib.auth.models import Permission
from django.test import Client, TestCase

from ..models import Annotation, Individual

from .requires_utils import RequiresUtils


class ApiIndividualsTestBase(RequiresUtils, TestCase):
    maxDiff = None

    def request(self, method, user, path, body=None, **headers):
        client = Client()
        if user:
            client.force_login(user)
        resp = getattr(client, method)(
            path,
            json.dumps(body) if body is not None else None,
            content_type="application/json",
            headers=headers,
        )
        out = resp.json() if resp.content else None
        # No tests for times in output, yet.
        for ind in (out or {}).get("individuals", [out or {}]):
            if isinstance(ind, dict):
                ind.pop("dt_created_at", None)
                ind.pop("dt_modified_at", None)
        return resp.status_code, out

    def user_with_perms(self, *codenames):
        out = self.create_user()
        out.user_permissions.set(Permission.objects.filter(codename__in=codenames))
        return out

    def superuser(self):
        out = self.create_user(groups=["Ingest"])
        out.is_superuser = True
        out.save()
        return out

    def ind_json(self, ind, **kwargs):
        """Expected JSON for ind"""
        ind.refresh_from_db()
        return dict(
            dict(
                id=ind.id,
                bounding_box=ind.bounding_box,
                num_annotations=ind.annotation_set.count(),
                data=ind.data,
            ),
            **kwargs,
        )


class ImageIndividualsViewTest(ApiIndividualsTestBase):
    def get(self, user, image, **headers):
        client = Client()
        if user:
            client.force_login(user)
        resp = client.get(
            "/api/v1/images/%d/individuals/" % image.id,
            headers=headers,
        )
        return resp

    def put(self, user, image, individuals, **headers):
        return self.request(
            "put",
            user,
            "/api/v1/images/%d/individuals/" % image.id,
            dict(individuals=individuals),
            **headers,
        )

    def test_get(self):
        user = self.create_user(groups=["Ingest"])
        image = self.create_image()

        # Need to be logged in, with view_individual
        self.assertEqual(self.get(None, image).status_code, 401)
        self.assertEqual(
            self.request(
                "get", self.create_user(), "/api/v1/images/%d/individuals/" % image.id
            ),
            (
                403,
                dict(
                    error_class="PermissionDenied",
                    error="Missing permission photolith.view_individual",
                ),
            ),
        )
        self.assertEqual(
            self.get(self.user_with_perms("view_individual"), image).status_code, 200
        )
        self.assertEqual(
            self.request("get", user, "/api/v1/images/999/individuals/"),
            (
                404,
                dict(error_class="Http404", error="No Image matches the given query."),
            ),
        )
        resp = self.get(user, image)
        self.assertEqual(
            (resp.status_code, resp.json()),
            (200, dict(image_id=image.id, individuals=[])),
        )
        empty_etag = resp["ETag"]

        ind1 = self.create_individual(
            image=image,
            data=dict(
                ch_slideLabel="12", ch_individualLabel="3", tx_species=dict(id=100)
            ),
        )
        ind2 = self.create_individual(
            image=image,
            bounding_box=[[110, 0], [210, 100]],
            data=dict(ch_slideLabel="12", nm_length=35.0),
        )
        self.create_individual(data=dict(ch_individualLabel="3"))  # Other image
        self.create_annotation(individual=ind1)
        self.assertEqual(
            self.request("get", user, "/api/v1/images/%d/individuals/" % image.id),
            (
                200,
                dict(
                    image_id=image.id,
                    individuals=[self.ind_json(ind1), self.ind_json(ind2)],
                ),
            ),
        )
        self.assertEqual(self.ind_json(ind1)["num_annotations"], 1)

        # ETag changes when individuals do, quoted
        etag = self.get(user, image)["ETag"]
        self.assertNotEqual(etag, empty_etag)
        self.assertEqual(self.get(user, image)["ETag"], etag)
        self.assertRegex(etag, r'^"[0-9a-f]{64}"$')
        ind2.data = dict(nm_length=36.0)
        self.assertNotEqual(self.get(user, image)["ETag"], etag)

    def test_put(self):
        image = self.create_image()

        # Need view_individual, as the response lists individuals...
        all_perms = ["add_individual", "change_individual", "delete_individual"]
        self.assertEqual(
            self.put(self.user_with_perms(*all_perms), image, []),
            (
                403,
                dict(
                    error_class="PermissionDenied",
                    error="Missing permission photolith.view_individual",
                ),
            ),
        )
        # ...and add, change & delete individual, as PUT can do any of them
        for perms in [[], all_perms[:2], all_perms[1:], all_perms[::2]]:
            self.assertEqual(
                self.put(self.user_with_perms("view_individual", *perms), image, []),
                (
                    403,
                    dict(
                        error_class="PermissionDenied",
                        error="Missing permission photolith.add_individual, "
                        "photolith.change_individual, photolith.delete_individual",
                    ),
                ),
            )
        self.assertEqual(
            self.put(self.user_with_perms("view_individual", *all_perms), image, [])[0],
            200,
        )

        # Create individuals, the same individual label can be on different slides
        user = self.create_user(groups=["Ingest"])
        status, out = self.put(
            user,
            image,
            [
                dict(
                    bounding_box=[[0, 0], [100, 100]],
                    data=dict(
                        ch_slideLabel="12", ch_individualLabel="1", nm_length=35.0
                    ),
                ),
                dict(
                    bounding_box=[[110, 0], [210, 100]],
                    data=dict(
                        ch_slideLabel="13",
                        ch_individualLabel="1",
                        tx_species=dict(id=100),
                    ),
                ),
                dict(
                    bounding_box=[[220, 0], [320, 100]],
                    data=dict(ch_slideLabel="12", ch_individualLabel="2"),
                ),
            ],
        )
        ind12_1, ind13_1, ind12_2 = Individual.objects.filter(image=image).order_by(
            "id"
        )
        self.assertEqual(
            (status, out),
            (
                200,
                dict(
                    image_id=image.id,
                    individuals=[
                        self.ind_json(ind12_1),
                        self.ind_json(ind13_1),
                        self.ind_json(ind12_2),
                    ],
                    created={
                        "individuals[0]": ind12_1.id,
                        "individuals[1]": ind13_1.id,
                        "individuals[2]": ind12_2.id,
                    },
                    updated={},
                    deleted={},
                ),
            ),
        )
        self.assertEqual(
            ind12_1.data,
            dict(ch_slideLabel="12", ch_individualLabel="1", nm_length=35.0),
        )
        self.assertEqual(ind13_1.bounding_box, [[110, 0], [210, 100]])
        self.assertEqual(ind13_1.created_by, user)

        # Individuals without both labels (e.g. from web interface) can be updated / deleted by ID
        ind_slide_only = self.create_individual(
            image=image, created_by=user, data=dict(ch_slideLabel="12")
        )
        ind_ind_only = self.create_individual(
            image=image, created_by=user, data=dict(ch_individualLabel="1")
        )
        other_image_ind = self.create_individual(
            created_by=user, data=dict(ch_slideLabel="12", ch_individualLabel="2")
        )

        # Update 13 : 1, remove 12 : 1 & 12 : 2, add 13 : 2. Data for 13 : 1 is replaced
        # Relabel ind_slide_only as 12 : 3
        status, out = self.put(
            user,
            image,
            [
                dict(id=ind12_1.id, bounding_box=None),
                dict(
                    id=ind13_1.id,
                    bounding_box=[[0, 0], [120, 100]],
                    data=dict(ch_slideLabel="13", ch_individualLabel="1", in_age=4),
                ),
                dict(id=ind12_2.id, bounding_box=None, data=dict(ignored="x")),
                dict(
                    bounding_box=[[220, 0], [320, 100]],
                    data=dict(ch_slideLabel="13", ch_individualLabel="2"),
                ),
                dict(
                    id=ind_slide_only.id,
                    bounding_box=ind_slide_only.bounding_box,
                    data=dict(ch_slideLabel="12", ch_individualLabel="3"),
                ),
                dict(id=ind_ind_only.id, bounding_box=None),
            ],
        )
        ind13_1_after, ind12_3, ind13_2 = Individual.objects.filter(
            image=image
        ).order_by("id")
        self.assertEqual(
            (ind13_1_after.id, ind12_3.id), (ind13_1.id, ind_slide_only.id)
        )
        self.assertEqual(
            (status, out),
            (
                200,
                dict(
                    image_id=image.id,
                    individuals=[
                        self.ind_json(ind13_1),
                        self.ind_json(ind12_3),
                        self.ind_json(ind13_2),
                    ],
                    created={"individuals[3]": ind13_2.id},
                    updated={
                        "individuals[1]": ind13_1.id,
                        "individuals[4]": ind12_3.id,
                    },
                    deleted={
                        "individuals[0]": ind12_1.id,
                        "individuals[2]": ind12_2.id,
                        "individuals[5]": ind_ind_only.id,
                    },
                ),
            ),
        )
        self.assertEqual(
            ind13_1_after.data,
            dict(ch_slideLabel="13", ch_individualLabel="1", in_age=4),
        )
        self.assertEqual(ind13_1_after.bounding_box, [[0, 0], [120, 100]])
        self.assertEqual(ind12_3.labels(), ("12", "3"))
        self.assertTrue(Individual.objects.filter(pk=other_image_ind.id).exists())

        # Can remove everything
        status, out = self.put(
            user,
            image,
            [dict(id=ind.id, bounding_box=None) for ind in [ind13_1, ind12_3, ind13_2]],
        )
        self.assertEqual(
            (status, out),
            (
                200,
                dict(
                    image_id=image.id,
                    individuals=[],
                    created={},
                    updated={},
                    deleted={
                        "individuals[0]": ind13_1.id,
                        "individuals[1]": ind12_3.id,
                        "individuals[2]": ind13_2.id,
                    },
                ),
            ),
        )
        self.assertEqual(self.put(user, image, [])[0], 200)

    def test_put__validation(self):
        user = self.create_user(groups=["Ingest"])
        image = self.create_image()
        ind = self.create_individual(
            image=image,
            created_by=user,
            data=dict(ch_slideLabel="12", ch_individualLabel="1", nm_length=1.0),
        )

        def put_err(body):
            status, out = self.request(
                "put", user, "/api/v1/images/%d/individuals/" % image.id, body
            )
            self.assertEqual(status, 400)
            self.assertEqual(out["error_class"], "ValidationError")
            return out.get("fields", out["error"])

        def labels(slide="12", ind="2"):
            return dict(ch_slideLabel=slide, ch_individualLabel=ind)

        other_image_ind = self.create_individual(created_by=user)
        ind_entry = dict(id=ind.id, bounding_box=None)

        self.assertEqual(put_err(dict(individuals={})), "individuals should be a list")
        self.assertEqual(put_err(dict(parp=[])), "Unknown keys: parp")
        self.assertEqual(
            put_err(
                dict(
                    individuals=[
                        "parp",
                        dict(data=labels()),
                        dict(bounding_box=[[0, 0], [1, 1]], data=[]),
                        dict(bounding_box=[[0, 0], [1, 1]], data=labels(), parp=1),
                        dict(bounding_box=[[0, 0], [1, 1]]),
                        dict(bounding_box=None, data=labels()),
                        dict(bounding_box=[[0, 0], [1, 1]], data=labels()),
                        dict(bounding_box=[[0, 0], [1, 1]], data=labels()),
                        dict(bounding_box=[[0, 0], [1, 1]], data=labels(ind=3)),
                        dict(bounding_box=[[0, 0], [1, 1]], data=labels(slide="")),
                        dict(bounding_box=[[0, 0], [1, 1]], data=labels(slide="13")),
                        dict(id="1", bounding_box=None),
                        dict(id=[1], bounding_box=None),
                        dict(id=True, bounding_box=None),
                        dict(id=other_image_ind.id, bounding_box=None),
                    ]
                )
            ),
            {
                "individuals": [
                    "individuals is missing existing 12 : 1 (id %d)" % ind.id
                ],
                **{
                    "individuals[%d]"
                    % i: [
                        "individuals[%d] should be {id: ..., bounding_box: ..., data: {...}}"
                        % i
                    ]
                    for i in range(4)
                },
                "individuals[4].data.ch_slideLabel": [
                    "individuals[4].data.ch_slideLabel is required"
                ],
                "individuals[4].data.ch_individualLabel": [
                    "individuals[4].data.ch_individualLabel is required"
                ],
                "individuals[5].bounding_box": [
                    "individuals[5].bounding_box is required"
                ],
                "individuals[7].data": ["individuals[7] 12 : 2 repeats individuals[6]"],
                "individuals[8].data.ch_individualLabel": [
                    "individuals[8].data.ch_individualLabel is required"
                ],
                "individuals[9].data.ch_slideLabel": [
                    "individuals[9].data.ch_slideLabel is required"
                ],
                "individuals[11].id": [
                    "individuals[11].id 1 is not an individual on image %d" % image.id
                ],
                "individuals[12].id": [
                    "individuals[12].id [1] is not an individual on image %d" % image.id
                ],
                "individuals[13].id": [
                    "individuals[13].id True is not an individual on image %d"
                    % image.id
                ],
                "individuals[14].id": [
                    "individuals[14].id %d is not an individual on image %d"
                    % (other_image_ind.id, image.id)
                ],
            },
        )

        # IDs can't repeat, labels can't repeat in the result
        self.assertEqual(
            put_err(
                dict(
                    individuals=[
                        ind_entry,
                        dict(ind_entry, bounding_box=[[0, 0], [1, 1]], data=labels()),
                        dict(bounding_box=[[0, 0], [1, 1]], data=labels(ind="1")),
                    ]
                )
            ),
            {
                "individuals[1].id": [
                    "individuals[1].id %d repeats individuals[0]" % ind.id
                ]
            },
        )
        self.assertEqual(
            put_err(
                dict(
                    individuals=[
                        dict(ind_entry, bounding_box=[[0, 0], [1, 1]], data=labels()),
                        dict(bounding_box=[[0, 0], [1, 1]], data=labels()),
                    ]
                )
            ),
            {"individuals[1].data": ["individuals[1] 12 : 2 repeats individuals[0]"]},
        )

        # Invalid bounding boxes / data are named, and nothing is saved
        self.assertEqual(
            put_err(
                dict(
                    individuals=[
                        dict(
                            id=ind.id,
                            bounding_box=[[0, 0], [9, 9]],
                            data=dict(labels(ind="1"), nm_length=2.0),
                        ),
                        dict(
                            bounding_box=[[0, 0], [9, 9]],
                            data=dict(labels(), nm_length="x", length=3),
                        ),
                        dict(bounding_box=[0, 0], data=labels(ind="3")),
                    ]
                )
            ),
            {
                "individuals[1].data.nm_length": [
                    "could not convert string to float: 'x'"
                ],
                "individuals[1].data.length": ["'length' has no type prefix"],
                "individuals[2].bounding_box": [
                    "bounding_box should be [[x, y], ...], not [0, 0]"
                ],
            },
        )
        self.assertEqual(list(Individual.objects.filter(image=image)), [ind])
        ind.refresh_from_db()
        self.assertEqual(
            ind.data, dict(ch_slideLabel="12", ch_individualLabel="1", nm_length=1.0)
        )
        self.assertEqual(ind.bounding_box, [[0, 0], [100, 100]])

    def test_put__access(self):
        """Same restrictions on editing as the ingest form"""
        owner = self.create_user(groups=["Ingest"])
        other = self.create_user(groups=["Ingest"])
        image = self.create_image()
        ind = self.create_individual(
            image=image,
            created_by=owner,
            data=dict(ch_slideLabel="12", ch_individualLabel="1"),
        )
        entry = dict(
            id=ind.id,
            bounding_box=ind.bounding_box,
            data=dict(ch_slideLabel="12", ch_individualLabel="1"),
        )

        # Can't update / delete someone else's individuals
        for individuals in [[entry], [dict(entry, bounding_box=None)]]:
            self.assertEqual(
                self.put(other, image, individuals),
                (
                    403,
                    dict(
                        error_class="PermissionDenied",
                        error="Cannot edit 12 : 1, was created by %s not you" % owner,
                    ),
                ),
            )
        # ...so can't add to the image either, since PUT has to include them
        status, out = self.put(
            other,
            image,
            [
                entry,
                dict(
                    bounding_box=[[0, 0], [1, 1]],
                    data=dict(ch_slideLabel="12", ch_individualLabel="2"),
                ),
            ],
        )
        self.assertEqual(status, 403)
        self.assertEqual(Individual.objects.filter(image=image).count(), 1)
        self.assertEqual(self.put(owner, image, [entry])[0], 200)

    def test_put__annotations(self):
        """Annotations are never deleted as a side-effect"""
        user = self.create_user(groups=["Ingest"])
        su = self.superuser()
        image = self.create_image()
        ind1 = self.create_individual(
            image=image,
            created_by=user,
            data=dict(ch_slideLabel="12", ch_individualLabel="1"),
        )
        ind2 = self.create_individual(
            image=image,
            created_by=user,
            bounding_box=[[110, 0], [210, 100]],
            data=dict(ch_slideLabel="13", ch_individualLabel="1"),
        )
        # Unlabelled individuals with the same name are listed separately
        ind_unlabelled = [
            self.create_individual(
                image=image, created_by=user, data=dict(ch_slideLabel="14")
            )
            for i in range(2)
        ]
        ann1 = self.create_annotation(individual=ind1)
        ann2a = self.create_annotation(individual=ind2)
        ann2b = self.create_annotation(individual=ind2, age=4)
        ann_unlabelled = [
            self.create_annotation(individual=ind) for ind in ind_unlabelled
        ]
        entry1 = dict(
            id=ind1.id,
            bounding_box=ind1.bounding_box,
            data=dict(ch_slideLabel="12", ch_individualLabel="1"),
        )
        entry2 = dict(
            id=ind2.id,
            bounding_box=ind2.bounding_box,
            data=dict(ch_slideLabel="13", ch_individualLabel="1"),
        )

        # Changing bounding box / removing is a conflict, even for superusers
        for u in [user, su]:
            self.assertEqual(
                self.put(
                    u,
                    image,
                    [
                        dict(entry1, bounding_box=[[0, 0], [1, 1]]),
                        dict(entry2, bounding_box=None),
                    ]
                    + [dict(id=ind.id, bounding_box=None) for ind in ind_unlabelled],
                ),
                (
                    409,
                    dict(
                        error_class="Conflict",
                        error="5 annotations would be invalidated",
                        annotations={
                            "individuals[0]": [ann1.id],
                            "individuals[1]": [ann2a.id, ann2b.id],
                            "individuals[2]": [ann_unlabelled[0].id],
                            "individuals[3]": [ann_unlabelled[1].id],
                        },
                    ),
                ),
            )
        self.assertEqual(Annotation.objects.filter(individual__image=image).count(), 5)
        Annotation.objects.filter(individual__in=ind_unlabelled).delete()
        Individual.objects.filter(pk__in=[i.id for i in ind_unlabelled]).delete()

        # Otherwise, annotated individuals can't be edited, as ingest form
        self.assertEqual(
            self.put(user, image, [entry1, entry2]),
            (
                403,
                dict(
                    error_class="PermissionDenied",
                    error="Cannot edit 12 : 1, has already been annotated 1 times",
                ),
            ),
        )

        # Superusers can change metadata, keeping annotations
        status, out = self.put(
            su,
            image,
            [entry1, dict(entry2, data=dict(entry2["data"], nm_length=4.0))],
        )
        self.assertEqual(status, 200)
        self.assertEqual(
            out["updated"], {"individuals[0]": ind1.id, "individuals[1]": ind2.id}
        )
        self.assertEqual(
            ind2.data, dict(ch_slideLabel="13", ch_individualLabel="1", nm_length=4.0)
        )
        self.assertEqual(Annotation.objects.filter(individual__image=image).count(), 3)

        # Once annotations are removed, can change
        Annotation.objects.filter(individual=ind1).delete()
        status, out = self.put(user, image, [dict(entry1, bounding_box=None), entry2])
        self.assertEqual(status, 403)  # ...but not ind2, which is still annotated
        Annotation.objects.filter(individual=ind2).delete()
        status, out = self.put(
            user,
            image,
            [
                dict(entry1, bounding_box=None),
                dict(entry2, bounding_box=[[0, 0], [5, 5]]),
            ],
        )
        self.assertEqual(
            (status, out["updated"], out["deleted"]),
            (200, {"individuals[1]": ind2.id}, {"individuals[0]": ind1.id}),
        )

    def test_put__if_match(self):
        user = self.create_user(groups=["Ingest"])
        image = self.create_image()
        entry = dict(
            bounding_box=[[0, 0], [1, 1]],
            data=dict(ch_slideLabel="12", ch_individualLabel="1"),
        )
        etag = self.get(user, image)["ETag"]

        # Current ETag (or *) works, response has new ETag
        resp = Client()
        resp.force_login(user)
        resp = resp.put(
            "/api/v1/images/%d/individuals/" % image.id,
            json.dumps(dict(individuals=[entry])),
            content_type="application/json",
            headers={"If-Match": etag},
        )
        self.assertEqual(resp.status_code, 200)
        new_etag = resp["ETag"]
        self.assertNotEqual(new_etag, etag)
        self.assertEqual(new_etag, self.get(user, image)["ETag"])
        entry["id"] = Individual.objects.get(image=image).id
        self.assertEqual(self.put(user, image, [entry], **{"If-Match": "*"})[0], 200)

        # Stale ETag doesn't
        status, out = self.put(
            user, image, [dict(entry, bounding_box=None)], **{"If-Match": etag}
        )
        self.assertEqual(
            (status, out),
            (
                412,
                dict(
                    error_class="PreconditionFailed",
                    error="Individuals on image %d have changed, ETag now %s"
                    % (image.id, self.get(user, image)["ETag"]),
                ),
            ),
        )
        self.assertEqual(Individual.objects.filter(image=image).count(), 1)

        # Any in a list works
        self.assertEqual(
            self.put(
                user,
                image,
                [dict(entry, bounding_box=None)],
                **{"If-Match": '"parp", %s' % self.get(user, image)["ETag"]},
            )[0],
            200,
        )


class IndividualViewTest(ApiIndividualsTestBase):
    def path(self, ind_id):
        return "/api/v1/individuals/%d/" % ind_id

    def test_patch(self):
        user = self.create_user(groups=["Ingest"])
        image = self.create_image()
        ind = self.create_individual(
            image=image,
            created_by=user,
            data=dict(ch_slideLabel="12", ch_individualLabel="3", nm_length=1.0),
        )
        other = self.create_individual(
            image=image,
            created_by=user,
            data=dict(ch_slideLabel="13", ch_individualLabel="3"),
        )
        self.create_individual(
            created_by=user,
            data=dict(ch_slideLabel="12", ch_individualLabel="4"),
        )  # Other image

        # Need change_individual, existing individual
        for perms in [[], ["add_individual", "delete_individual"]]:
            self.assertEqual(
                self.request(
                    "patch", self.user_with_perms(*perms), self.path(ind.id), dict()
                ),
                (
                    403,
                    dict(
                        error_class="PermissionDenied",
                        error="Missing permission photolith.change_individual",
                    ),
                ),
            )
        self.assertEqual(
            self.request("patch", user, self.path(9999), dict()),
            (
                404,
                dict(
                    error_class="Http404",
                    error="No Individual matches the given query.",
                ),
            ),
        )

        # Data is merged, bounding box left alone
        self.assertEqual(
            self.request(
                "patch", user, self.path(ind.id), dict(data=dict(nm_length=35.0))
            ),
            (200, self.ind_json(ind)),
        )
        self.assertEqual(
            ind.data, dict(ch_slideLabel="12", ch_individualLabel="3", nm_length=35.0)
        )
        self.assertEqual(ind.bounding_box, [[0, 0], [100, 100]])

        # Bounding box can be changed
        status, out = self.request(
            "patch",
            user,
            self.path(other.id),
            dict(bounding_box=[[0, 0], [120, 100]]),
        )
        self.assertEqual((status, out), (200, self.ind_json(other)))
        self.assertEqual(other.bounding_box, [[0, 0], [120, 100]])

        # Can rename, but not to existing labels on the same image
        self.assertEqual(
            self.request(
                "patch",
                user,
                self.path(ind.id),
                dict(data=dict(ch_slideLabel="13")),
            ),
            (
                400,
                dict(
                    error_class="ValidationError",
                    error="13 : 3 already exists on image %d" % image.id,
                ),
            ),
        )
        for data in [dict(ch_individualLabel="4"), dict(ch_slideLabel="14")]:
            self.assertEqual(
                self.request("patch", user, self.path(ind.id), dict(data=data))[0],
                200,
            )
        self.assertEqual(ind.labels(), ("14", "4"))

        # Invalid input
        for body, err, fields in [
            (dict(parp=1), "Unknown keys: parp", None),
            (
                dict(bounding_box=None),
                "bounding_box cannot be null, DELETE the individual instead",
                None,
            ),
            (dict(data=[]), "data should be an object", None),
            (
                dict(data=dict(nm_length="x")),
                "could not convert string to float: 'x'",
                {"data.nm_length": ["could not convert string to float: 'x'"]},
            ),
            (
                dict(bounding_box="x"),
                "bounding_box should be [[x, y], ...], not x",
                {"bounding_box": ["bounding_box should be [[x, y], ...], not x"]},
            ),
        ]:
            status, out = self.request("patch", user, self.path(ind.id), body)
            self.assertEqual(
                (status, out["error"], out.get("fields")), (400, err, fields)
            )
        self.assertEqual(ind.data["nm_length"], 35.0)

        # Changing bounding box of annotated individuals is a conflict
        ann = self.create_annotation(individual=ind)
        self.assertEqual(
            self.request(
                "patch",
                user,
                self.path(ind.id),
                dict(bounding_box=[[0, 0], [1, 1]]),
            ),
            (
                409,
                dict(
                    error_class="Conflict",
                    error="1 annotations would be invalidated",
                    annotations=[ann.id],
                ),
            ),
        )

    def test_delete(self):
        user = self.create_user(groups=["Ingest"])
        image = self.create_image()
        ind = self.create_individual(
            image=image,
            created_by=user,
            data=dict(ch_slideLabel="12", ch_individualLabel="3"),
        )
        other_ind = self.create_individual(
            image=image,
            created_by=user,
            data=dict(ch_slideLabel="13", ch_individualLabel="3"),
        )

        # Need delete_individual, existing individual
        for perms in [[], ["add_individual", "change_individual"]]:
            self.assertEqual(
                self.request("delete", self.user_with_perms(*perms), self.path(ind.id)),
                (
                    403,
                    dict(
                        error_class="PermissionDenied",
                        error="Missing permission photolith.delete_individual",
                    ),
                ),
            )
        self.assertEqual(self.request("delete", user, self.path(9999))[0], 404)

        # Can't delete annotated individuals
        ann = self.create_annotation(individual=ind)
        self.assertEqual(
            self.request("delete", user, self.path(ind.id)),
            (
                409,
                dict(
                    error_class="Conflict",
                    error="1 annotations would be invalidated",
                    annotations=[ann.id],
                ),
            ),
        )

        Annotation.objects.filter(pk=ann.id).delete()
        self.assertEqual(self.request("delete", user, self.path(ind.id)), (204, None))
        self.assertFalse(Individual.objects.filter(pk=ind.id).exists())
        self.assertTrue(Individual.objects.filter(pk=other_ind.id).exists())
        self.assertEqual(self.request("delete", user, self.path(ind.id))[0], 404)
