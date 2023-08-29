from django.core.exceptions import BadRequest
from django.contrib.auth.mixins import PermissionRequiredMixin
from django.shortcuts import get_object_or_404
from django.utils.functional import cached_property
from django.urls import reverse_lazy
from django.views.generic.edit import UpdateView


from ..errors import json_errors
from ..models import Individual, Annotation, Project

from .forms import AnnotationForm


class AnnotateView(PermissionRequiredMixin, UpdateView):
    permission_required = ("photolith.view_annotation",)
    template_name = "annotate/annotate.html"
    model = Annotation
    form_class = AnnotationForm
    slug_field = "pk"
    slug_url_kwarg = "annotation_id"

    def get_success_url(self):
        return reverse_lazy(
            "annotate:annotate_existing",
            kwargs=dict(
                individual_id=self.object.individual_id,
                annotation_id=self.object.id,
            ),
        )

    def form_valid(self, form):
        if not self.request.user.has_perms(("photolith.edit_annotation",)):
            raise PermissionDenied("Not allowed to edit %s" % (str(self.object)))
        if self.object.project and not self.object.project.is_open:
            raise PermissionDenied(
                "Project %s closed, cannot edit annotations"
                % (str(self.object.project))
            )
        return super().form_valid(form)

    def get_object(self, queryset=None):
        if "annotation_id" not in self.kwargs:
            return None
        obj = super().get_object(queryset=queryset)

        if obj.individual_id != self.individual_id:
            raise BadRequest(
                "Annotation %s is for individual %d, not %d"
                % (str(obj), obj.individual_id, self.individual_id)
            )
        return obj

    def get_initial(self):
        return dict(
            individual=self.individual_id,
            project=self.current_project,
        )

    @cached_property
    def current_project(self):
        """Return the current project object based on the querystring"""
        p_id = self.request.GET.get("project")
        if not p_id:
            return None
        return get_object_or_404(Project, pk=p_id)

    @cached_property
    def individual_id(self):
        if "individual_id" in self.kwargs:
            return int(self.kwargs["individual_id"])
        return None

    def get_all_annotations(self):
        """Return list of alternative annotations, varied if in project mode"""
        p = self.current_project
        if p and p.is_open:
            # Annotating within a project should only show the initial annotation
            init_a = p.init_annotation(self.individual_id)
            return [init_a] if init_a else []

        if p:
            # Closed project: list all annotations within project
            return Annotation.objects.filter(
                individual_id=self.individual_id,
                project=p,
            ).order_by("-created_at")

        return Annotation.objects.filter(
            individual_id=self.individual_id,
        ).order_by("-created_at")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["object_model"] = self.model

        if self.individual_id:
            ind = get_object_or_404(Individual, pk=self.individual_id)
            context["individual_id"] = self.individual_id
            context["ind_dict"] = dict(
                bounding_box=ind.bounding_box,
                data=ind.data,
                href=ind.image.href,
                scale_line=ind.image.scale_line,
                scale_mm=ind.image.scale_mm,
            )
            context["all_annotations"] = self.get_all_annotations()
        return context


class AnnotateSnippetView(AnnotateView):
    permission_required = ("photolith.view_individual",)
    template_name = "annotate/snippet.html"
    # As above, but an HTML snippet for the search form


class AnnotateStartView(AnnotateView):
    # As above, but won't have an individual_id
    pass
