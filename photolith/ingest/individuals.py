from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import transaction

from ..errors import Conflict
from ..models import Individual
from ..perm_utils import check_individual_edit_access


def _field(client_idx, name):
    """Name of field for change client_idx, in errors"""
    return "%s.%s" % (client_idx, name) if client_idx else name


@transaction.atomic
def sync_individuals(image, user, changes, drop_annotations=False):
    """
    Create, update or delete individuals on image, as user. changes is a list of
    (client_idx, bounding_box, data):

    * client_idx: Where this change came from in the client's request, used in the
      output & errors (as a prefix for fields, if not empty)
    * bounding_box: New [[x, y], ...] bounding box, or None to delete the individual
    * data: New metadata, replacing all existing metadata. data["id"] is the
      individual on image to update, if not given (or not found) one is created

    Changing the bounding box of, or deleting, an individual with annotations
    invalidates them. If drop_annotations they are deleted, otherwise Conflict
    is raised. Either way, the user needs check_individual_edit_access().

    Nothing is saved if any change fails. Returns a dict of client_idx -> individual
    for created & updated, client_idx -> ID for deleted, and client_idx ->
    annotation IDs for deleted_annotations.
    """
    # NB: metachar_set for __str__() in errors
    existing = {
        ind.id: ind
        for ind in image.individuals_with_ann_counts().prefetch_related("metachar_set")
    }
    changes = [
        (client_idx, existing.get(data.get("id")), bounding_box, data)
        for client_idx, bounding_box, data in changes
    ]

    invalidated = {}
    for client_idx, ind, bounding_box, data in changes:
        if (
            ind
            and ind.num_annotations > 0
            and (
                bounding_box is None
                or (ind.bounding_box and ind.bounding_box != bounding_box)
            )
        ):
            invalidated[client_idx] = list(
                ind.annotation_set.order_by("id").values_list("id", flat=True)
            )
    if invalidated and not drop_annotations:
        raise Conflict(
            "%d annotations would be invalidated"
            % sum(len(ann_ids) for ann_ids in invalidated.values()),
            annotations=invalidated,
        )

    out = dict(created={}, updated={}, deleted={}, deleted_annotations=invalidated)
    errors = {}
    for client_idx, ind, bounding_box, data in changes:
        if ind:
            check_individual_edit_access(ind, user)
        else:
            if bounding_box is None:
                # Deleting something that doesn't exist, nothing to do
                continue
            ind = Individual(image=image, created_by=user)

        if bounding_box is None:
            out["deleted"][client_idx] = ind.id
            # NB: Will cascade-delete any annotations
            ind.delete()
            continue
        try:
            ind.set_bounding_box(bounding_box)
        except ValidationError as e:
            errors[_field(client_idx, "bounding_box")] = e.messages
            continue

        if client_idx in invalidated:
            ind.annotation_set.all().delete()
        out["updated" if ind.id else "created"][client_idx] = ind
        ind.save()
        try:
            ind.data = data
        except ValidationError as e:
            for field, messages in e.message_dict.items():
                errors[_field(client_idx, field)] = messages
    if errors:
        # NB: Rolls back the transaction
        raise ValidationError(errors)

    if out["created"] or out["updated"]:
        # Clear meta_fields cache created in search/views
        cache.delete("photolith_meta_fields")
    return out
