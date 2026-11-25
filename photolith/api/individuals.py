import hashlib
import json

from django.core.exceptions import ValidationError
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils.http import parse_etags, quote_etag

from ..errors import Conflict, PreconditionFailed
from ..ingest.individuals import sync_individuals
from ..models import Image, Individual
from ..perm_utils import check_perms

from .base import ApiView


def individuals_json(image, ind_id=None):
    """List of individuals on image (or just ind_id) for responses"""
    inds = image.individuals_with_ann_counts().prefetch_related(
        "metanumeric_set",
        "metainteger_set",
        "metachar_set",
        "metadt_set",
        "metatx_set__value",
    )
    if ind_id is not None:
        inds = inds.filter(pk=ind_id)
    return [
        dict(
            id=ind.id,
            bounding_box=ind.bounding_box,
            num_annotations=ind.num_annotations,
            dt_created_at=ind.created_at,
            dt_modified_at=ind.modified_at,
            data=ind.data,
        )
        for ind in inds
    ]


def json_etag(data):
    return quote_etag(
        hashlib.sha256(
            json.dumps(data, cls=DjangoJSONEncoder, sort_keys=True).encode("utf8")
        ).hexdigest()
    )


def put_changes(image, entries):
    """
    Validate PUT individuals entries, returning changes for sync_individuals().
    Every existing individual on image has to be included, by id
    """
    if not isinstance(entries, list):
        raise ValidationError("individuals should be a list", code=400)

    # NB: metachar_set for __str__()
    existing = {
        ind.id: ind
        for ind in image.individual_set.order_by("id").prefetch_related("metachar_set")
    }
    errors = {}
    changes = []
    entry_ids = {}
    entry_labels = {}
    for i, entry in enumerate(entries):
        client_idx = "individuals[%d]" % i
        if not (
            isinstance(entry, dict)
            and "bounding_box" in entry
            and set(entry.keys()) <= set(("id", "bounding_box", "data"))
            and isinstance(entry.get("data", {}), dict)
        ):
            errors[client_idx] = [
                "%s should be {id: ..., bounding_box: ..., data: {...}}" % client_idx
            ]
            continue
        # NB: Only match by entry's id, not any in data
        data = dict(entry.get("data", {}))
        data.pop("id", None)

        if "id" in entry:
            ind_id = entry["id"]
            if (
                not isinstance(ind_id, int)
                or isinstance(ind_id, bool)
                or ind_id not in existing
            ):
                errors["%s.id" % client_idx] = [
                    "%s.id %s is not an individual on image %d"
                    % (client_idx, ind_id, image.id)
                ]
                continue
            if ind_id in entry_ids:
                errors["%s.id" % client_idx] = [
                    "%s.id %d repeats %s" % (client_idx, ind_id, entry_ids[ind_id])
                ]
                continue
            entry_ids[ind_id] = client_idx
            data["id"] = ind_id

        if entry["bounding_box"] is None:
            if "id" not in entry:
                errors["%s.bounding_box" % client_idx] = [
                    "%s.bounding_box is required" % client_idx
                ]
                continue
            # Deleting individual, data irrelevant
            changes.append((client_idx, None, data))
            continue

        missing = [
            k
            for k in ("ch_slideLabel", "ch_individualLabel")
            if not isinstance(data.get(k), str) or not data[k]
        ]
        for k in missing:
            errors["%s.data.%s" % (client_idx, k)] = [
                "%s.data.%s is required" % (client_idx, k)
            ]
        if missing:
            continue
        labels = Individual.data_labels(data)
        if labels in entry_labels:
            errors["%s.data" % client_idx] = [
                "%s %s : %s repeats %s"
                % ((client_idx,) + labels + (entry_labels[labels],))
            ]
            continue
        entry_labels[labels] = client_idx
        changes.append((client_idx, entry["bounding_box"], data))

    # Every existing individual has to be mentioned, to update or delete
    missing = [ind for ind_id, ind in existing.items() if ind_id not in entry_ids]
    if missing:
        errors["individuals"] = [
            "individuals is missing existing %s"
            % ", ".join("%s (id %d)" % (ind, ind.id) for ind in missing)
        ]
    if errors:
        raise ValidationError(errors)
    return changes


class ImageIndividualsView(ApiView):
    permission_required = ("photolith.view_individual",)

    def get(self, *args, **kwargs):
        image = get_object_or_404(Image, pk=self.kwargs["image_id"])
        out = dict(image_id=image.id, individuals=individuals_json(image))
        return JsonResponse(out, headers={"ETag": json_etag(out)})

    def put(self, *args, **kwargs):
        # NB: PUT can create, update & delete individuals
        check_perms(
            self.request.user,
            "photolith.add_individual",
            "photolith.change_individual",
            "photolith.delete_individual",
        )
        with transaction.atomic():
            # NB: Lock the image, so individuals can't change between If-Match & saving
            image = get_object_or_404(
                Image.objects.select_for_update(), pk=self.kwargs["image_id"]
            )
            if_match = self.request.headers.get("If-Match")
            if if_match:
                etag = json_etag(
                    dict(image_id=image.id, individuals=individuals_json(image))
                )
                if not set(parse_etags(if_match)) & set(("*", etag)):
                    raise PreconditionFailed(
                        "Individuals on image %d have changed, ETag now %s"
                        % (image.id, etag)
                    )

            entries = self.json_body(["individuals"]).get("individuals")
            result = sync_individuals(
                image, self.request.user, put_changes(image, entries)
            )

            out = dict(image_id=image.id, individuals=individuals_json(image))
            etag = json_etag(out)
            for k in ("created", "updated"):
                out[k] = {client_idx: ind.id for client_idx, ind in result[k].items()}
            out["deleted"] = result["deleted"]
        return JsonResponse(out, headers={"ETag": etag})


class IndividualView(ApiView):
    def get_individual(self):
        return get_object_or_404(
            Individual.objects.select_related("image"), pk=self.kwargs["individual_id"]
        )

    def sync(self, ind, bounding_box, data):
        """sync_individuals() for just ind, with a list of annotations in any Conflict"""
        try:
            # NB: Match by ID, ignoring any id in data
            sync_individuals(
                ind.image,
                self.request.user,
                [("", bounding_box, dict(data, id=ind.id))],
            )
        except Conflict as e:
            e.json_data["annotations"] = e.json_data["annotations"][""]
            raise

    def patch(self, *args, **kwargs):
        check_perms(self.request.user, "photolith.change_individual")
        ind = self.get_individual()
        image = ind.image
        body = self.json_body(["bounding_box", "data"])
        bounding_box = body.get("bounding_box", ind.bounding_box)
        data = body.get("data", {})
        if bounding_box is None:
            raise ValidationError(
                "bounding_box cannot be null, DELETE the individual instead", code=400
            )
        if not isinstance(data, dict):
            raise ValidationError("data should be an object", code=400)

        # NB: sync_individuals() replaces data, so merge with existing first
        data = dict(ind.data, **data)
        labels = Individual.data_labels(data)
        if (
            all(labels)
            and labels != ind.labels()
            and any(
                other.labels() == labels
                for other in image.individual_set.exclude(pk=ind.id).prefetch_related(
                    "metachar_set"
                )
            )
        ):
            raise ValidationError(
                "%s : %s already exists on image %d" % (labels + (image.id,)),
                code=400,
            )

        self.sync(ind, bounding_box, data)
        return JsonResponse(individuals_json(image, ind.id)[0])

    def delete(self, *args, **kwargs):
        check_perms(self.request.user, "photolith.delete_individual")
        ind = self.get_individual()
        self.sync(ind, None, {})
        return HttpResponse(status=204)
