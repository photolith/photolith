from django.core.exceptions import BadRequest, PermissionDenied
from django.contrib.auth.mixins import PermissionRequiredMixin
from django.db.models import F
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils.functional import cached_property
from django.utils.translation import gettext as _
from django.urls import reverse_lazy
from django.views.generic import View
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
        return (
            reverse_lazy(
                "annotate:annotate",
                kwargs=dict(
                    individual_id=self.object.individual_id,
                ),
            )
            + "?"
            + self.request.GET.urlencode()
        )

    def form_valid(self, form):
        if not self.request.user.has_perms(
            ("photolith.add_annotation", "photolith.change_annotation")
        ):
            raise PermissionDenied("Not allowed to edit annotations")

        # Set / check created_by
        if self.object:
            if not (
                self.request.user.is_superuser
                or self.object.created_by == self.request.user
            ):
                raise PermissionDenied("You do not own annotation %s" % self.object)
        else:
            form.instance.created_by = self.request.user

        # Set / check project
        if self.current_project:
            p = self.current_project
            if not p.is_open:
                raise PermissionDenied(
                    "Project %s closed, cannot edit annotations" % (str(p))
                )
            form.instance.project = p

        # Set authority based on user's profile
        form.instance.authority = Annotation.AuthorityLevel.NON_EXPERT
        if hasattr(self.request.user, "userprofile"):
            ind_data = self.get_individual()
            if (
                "id" in ind_data.get("species", dict())
                and self.request.user.userprofile.species_expert
            ):
                if (
                    self.request.user.userprofile.species_expert.filter(
                        identifier=ind_data["species"]["id"]
                    ).count()
                    > 0
                ):
                    form.instance.authority = Annotation.AuthorityLevel.EXPERT

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
        if self.object:
            # Don't set initial for update forms, otherwise axis_poly gets reset?
            return dict()
        return dict(individual=self.individual_id, project=self.current_project)

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
        if p:
            # Only show annotations relevant for this project
            return p.annotations_for(self.individual_id, self.request.user)

        qs = Annotation.objects.filter(
            individual_id=self.individual_id,
        )
        return qs.order_by("-authority", "-created_at")

    def get_individual(self):
        # Shortened form of search.views:DataView
        qs = Individual.objects.filter(pk=self.individual_id)
        qs = (
            qs.select_related("image")
            .prefetch_related("metanumeric_set")
            .prefetch_related("metachar_set")
            .prefetch_related("metadt_set")
            .prefetch_related("metatx_set")
            .prefetch_related("metatx_set__value")
            .annotate(image__scale_line=F("image__scale_line"))
            .annotate(image__scale_mm=F("image__scale_mm"))
        )
        ind = get_object_or_404(qs)

        out = {k: v for k, v in vars(ind).items() if not k.startswith("_")}
        out.update(ind.data)
        out["image__content__url"] = ind.image.content.url
        return out

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["object_model"] = self.model
        context["read_only"] = False

        # Find base_poly if within project with base_user
        def get_base_poly():
            p = self.current_project
            if p and p.base_user:
                try:
                    return next(
                        a.axis_poly for a in context["all_annotations"] if a.age == 0
                    )
                except StopIteration:
                    return None
            return None

        if self.individual_id:
            context["ind_data"] = self.get_individual()
            context["all_annotations"] = self.get_all_annotations()
            if self.object and self.object.id:
                # Editing an existing annotation
                context["default_tab"] = "editor"
            elif self.current_project and not self.current_project.is_open:
                # Closed project, read-only
                context["read_only"] = True
                context["default_tab"] = "existing"
            elif base_poly := get_base_poly():
                # Open project with base_poly
                context["form"].initial["axis_poly"] = base_poly
                context["default_tab"] = (
                    "existing" if len(context["all_annotations"]) > 1 else "editor"
                )
            else:
                # Generate default axis_poly
                bb = context["ind_data"]["bounding_box"]
                context["form"].initial["axis_poly"] = [
                    [(bb[0][0] + bb[1][0]) / 2, (bb[0][1] + bb[1][1]) / 2],
                    [bb[0][0] + 5, bb[0][1] + 5],
                ]
                # Show editor iff there's no existing annotations
                context["default_tab"] = (
                    "existing" if len(context["all_annotations"]) > 0 else "editor"
                )
        return context


class AnnotateSnippetView(AnnotateView):
    permission_required = ("photolith.view_individual",)
    template_name = "annotate/snippet.html"
    # As above, but an HTML snippet for the search form


class AnnotateStartView(AnnotateView):
    # As above, but won't have an individual_id
    pass


class DeleteView(PermissionRequiredMixin, View):
    permission_required = ("photolith.delete_annotation",)

    @json_errors
    def post(self, *args, **kwargs):
        obj = get_object_or_404(Annotation, pk=int(self.kwargs["annotation_id"]))
        if not (self.request.user.is_superuser or obj.created_by == self.request.user):
            raise PermissionDenied("You do not own annotation %s" % obj)

        old_annotation_id = obj.id
        obj.delete()

        context = dict(old_annotation_id=old_annotation_id)
        context["message"] = _("Successfully deleted annotation")
        return JsonResponse(context)
