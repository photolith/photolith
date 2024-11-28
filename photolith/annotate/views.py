from django.core.exceptions import BadRequest, PermissionDenied
from django.contrib.auth.mixins import LoginRequiredMixin
from django.db.models import Count, Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils.functional import cached_property
from django.utils.translation import gettext as _
from django.urls import reverse_lazy
from django.views.generic import View
from django.views.generic.edit import UpdateView


from ..errors import json_errors
from ..models import Individual, Annotation, Project, UserSpeciesAuthority

from .forms import AnnotationForm
from ..perm_utils import check_annotate_access


class AnnotateView(LoginRequiredMixin, UpdateView):
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
        # Set / check created_by
        if self.object:
            if not (
                self.request.user.is_superuser
                or self.object.created_by == self.request.user
            ):
                raise PermissionDenied("You do not own annotation %s" % self.object)
        else:
            form.instance.created_by = self.request.user

        # Cannot add extra annotations to a closed project
        # NB: Use form.instance.project instead of querystring in case we are copying an annotation outside a project,
        #     QS will be closed project, form.instance.project will be unset
        check_annotate_access(form.instance.project, self.request.user, rw=True)

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
        p = (
            get_object_or_404(Project, pk=self.request.GET.get("project"))
            if self.request.GET.get("project")
            else None
        )
        check_annotate_access(p, self.request.user, rw=False)
        return p

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

        # Otherwise, show annotations performed outside project
        qs = Annotation.objects.filter(
            individual_id=self.individual_id,
            project=None,
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
        )
        ind = get_object_or_404(qs)

        out = ind.full_data()
        out["bounding_box"] = ind.bounding_box
        out["image__content__url"] = ind.image.content.url
        out["image__px_to_mm"] = ind.image.px_to_mm()
        out["image__mm_to_px"] = (
            1 / out["image__px_to_mm"] if out["image__px_to_mm"] is not None else None
        )
        return out

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["object_model"] = self.model

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

            if hasattr(self.request.user, "userprofile"):
                auth_level = self.request.user.userprofile.authority_level(
                    context["ind_data"]
                )
            else:
                auth_level = UserSpeciesAuthority.AuthorityLevel.INEXPERIENCED
            context["form"].initial["authority"] = auth_level
            context["form"].fields["authority"].choices = [
                (v, n)
                for v, n in context["form"].fields["authority"].choices
                if (v < auth_level + 10)
            ]

            if self.object and self.object.id:
                # Editing an existing annotation
                context["default_tab"] = "editor"
            elif self.current_project and not self.current_project.is_open:
                # Closed project, read-only
                context["form"].initial["axis_poly"] = []
                # Save new annotations outside project
                context["form"].initial["project"] = None
                context["project_closed"] = True
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

        # See if saving will be allowed, if not page should be read only
        try:
            check_annotate_access(
                context["form"].initial["project"],
                self.request.user,
                rw=True,
            )
            context["read_only"] = False
        except PermissionDenied:
            context["read_only"] = True
            context["default_tab"] = "existing"

        return context


class AnnotateSnippetView(AnnotateView):
    template_name = "annotate/snippet.html"
    # As above, but an HTML snippet for the search form


class AnnotateStartView(AnnotateView):
    def project_progress(self):
        """Retrun all individuals in project, together with number of annotations"""
        p = self.current_project
        if not p:
            return None

        return p.individuals.annotate(
            num_annotations=Count(
                "annotation",
                filter=Q(
                    annotation__project=p,
                    annotation__created_by=self.request.user,
                ),
            )
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        context["project_progress"] = self.project_progress()

        return context


class DeleteView(LoginRequiredMixin, View):
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
