import json

from django.core.exceptions import ValidationError
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404

from ..annotate.forms import AnnotationForm
from ..models import Annotation, Individual, UserProfile
from ..perm_utils import check_annotate_access, check_annotation_edit_access

from .base import ApiView

# Official notation (the choice labels) -> value stored
RATINGS = {label: value for value, label in Annotation.Rating.choices}


def annotation_json(ann):
    return dict(
        id=ann.id,
        individual_id=ann.individual_id,
        created_by=ann.created_by.username if ann.created_by else None,
        age=ann.age,
        rating=next((k for k, v in RATINGS.items() if v == ann.rating), None),
        authority=ann.authority,
        comment=ann.comment,
        axis_poly=ann.axis_poly,
        project=ann.project_id,
        created_at=ann.created_at,
        modified_at=ann.modified_at,
    )


def create_annotation(individual, user, data):
    """
    Create an annotation on individual, as user, from form data. Validation is
    as the annotate form: authority can't exceed the user's level, and the
    user must be able to annotate in the project (or generally, if none).
    """
    form = AnnotationForm(
        data=dict(data, individual=individual.id),
        authority_level=UserProfile.for_user(user).authority_level(individual.data),
    )
    errors = {k: list(v) for k, v in form.errors.items()}
    if "axis_poly" in form.cleaned_data:
        try:
            form.instance.set_axis_poly(form.cleaned_data["axis_poly"])
        except ValidationError as e:
            errors["axis_poly"] = e.messages
    if errors:
        raise ValidationError(errors)

    check_annotate_access(form.instance.project, user, rw=True)
    form.instance.created_by = user
    return form.save()


class IndividualAnnotationsView(ApiView):
    def post(self, *args, **kwargs):
        ind = get_object_or_404(Individual, pk=self.kwargs["individual_id"])
        data = self.json_body(
            ["age", "rating", "authority", "comment", "axis_poly", "project"]
        )

        errors = {}
        if "rating" in data:
            if data["rating"] in RATINGS:
                data["rating"] = RATINGS[data["rating"]]
            else:
                errors["rating"] = [
                    "rating should be one of %s, not %s"
                    % (
                        ", ".join(json.dumps(k) for k in sorted(RATINGS)),
                        data["rating"],
                    )
                ]
                # NB: rating is required, so the form won't save
                data["rating"] = None
        try:
            ann = create_annotation(ind, self.request.user, data)
        except ValidationError as e:
            raise ValidationError(dict(e.message_dict, **errors))
        return JsonResponse(annotation_json(ann), status=201)


class AnnotationView(ApiView):
    def delete(self, *args, **kwargs):
        ann = get_object_or_404(Annotation, pk=self.kwargs["annotation_id"])
        check_annotation_edit_access(ann, self.request.user)
        ann.delete()
        return HttpResponse(status=204)
