from django.core.exceptions import BadRequest
from django.contrib.auth.mixins import PermissionRequiredMixin
from django.shortcuts import redirect
from django.views.generic.edit import FormView


from ..errors import json_errors
from ..forms import AnnotationForm
from ..models import Individual, Annotation


class AnnotateView(PermissionRequiredMixin, FormView):
    permission_required = ("photolith.view_annotation",)
    template_name = "annotate/annotate.html"
    form_class = AnnotationForm

    def form_valid(self, form):
        obj = form.save(commit=False)
        obj.individual_id = self.kwargs["individual_id"]
        if not obj.edit_allowed(self.request.user):
            raise PermissionDenied("Not allowed to edit %s" % (str(obj)))
        obj.save()
        return redirect(
            "annotate:annotate_existing",
            individual_id=self.kwargs["individual_id"],
            annotation_id=obj.id,
        )

    def get_form_kwargs(self):
        kw = super().get_form_kwargs()

        if "annotation_id" in self.kwargs:
            obj = Annotation.objects.get(id=self.kwargs["annotation_id"])
            if obj.individual_id != self.kwargs["individual_id"]:
                raise BadRequest(
                    "Annotation %s is for individual %d, not %d"
                    % (str(obj), obj.individual_id, self.kwargs["individual_id"])
                )
            if not obj.edit_allowed(self.request.user):
                raise PermissionDenied("Not allowed to edit %s" % (str(obj)))
            kw["instance"] = obj

        return kw

    def get_individual(self, individual_id):
        ind = Individual.objects.get(id=individual_id)
        return dict(
            bounding_box=ind.bounding_box,
            data=ind.data,
            href=ind.image.href,
            scale_line=ind.image.scale_line,
            scale_mm=ind.image.scale_mm,
        )

    def get_all_annotations(self, individual_id):
        return Annotation.objects.filter(
            individual_id=individual_id,
        ).order_by("-created_at")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["Annotation"] = Annotation
        context["annotation_id"] = self.kwargs.get("annotation_id", None)
        # If individual_id specified, fetch corresponding data
        if "individual_id" in self.kwargs:
            context["individual_id"] = int(self.kwargs["individual_id"])
            context["ind_dict"] = self.get_individual(context["individual_id"])
            context["all_annotations"] = self.get_all_annotations(
                context["individual_id"]
            )
        return context


class AnnotateSnippetView(AnnotateView):
    permission_required = ("photolith.view_individual",)
    template_name = "annotate/snippet.html"
    # As above, but an HTML snippet for the search form


class AnnotateStartView(AnnotateView):
    # As above, but won't have an individual_id
    pass
