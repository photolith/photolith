from django.contrib.auth.mixins import PermissionRequiredMixin
from django.db.models import Count, Q
from django.urls import reverse_lazy
from django.views.generic.edit import CreateView, UpdateView, DeleteView
from django.views.generic.list import ListView

from ..models import Project
from .forms import ProjectForm


# https://docs.djangoproject.com/en/4.2/ref/class-based-views/generic-display/#listview
class ProjectListView(PermissionRequiredMixin, ListView):
    permission_required = ("photolith.view_project",)
    template_name = "project/list.html"
    model = Project

    def get_queryset(self):
        qs = super().get_queryset()
        if not self.request.user.has_perm("photolith.change_project"):
            qs = qs.filter(team__users=self.request.user)
        qs = qs.order_by("-date_end")
        # Count annotations made by self
        qs = qs.annotate(
            num_annotations=Count("annotation", filter=Q(created_by=self.request.user))
        )
        return qs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["object_model"] = self.model
        return context


# https://docs.djangoproject.com/en/4.2/ref/class-based-views/generic-editing/#django.views.generic.edit.CreateView
class ProjectCreateView(PermissionRequiredMixin, CreateView):
    permission_required = ("photolith.add_project",)
    template_name = "project/update.html"
    model = Project
    form_class = ProjectForm
    success_url = reverse_lazy("project:index")

    def form_valid(self, form):
        form.instance.created_by = self.request.user
        return super().form_valid(form)


# https://docs.djangoproject.com/en/4.2/ref/class-based-views/generic-editing/#updateview
class ProjectUpdateView(PermissionRequiredMixin, UpdateView):
    permission_required = ("photolith.change_project",)
    template_name = "project/update.html"
    model = Project
    slug_field = "id"
    form_class = ProjectForm
    success_url = reverse_lazy("project:index")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["object_model"] = self.model
        return context


# https://docs.djangoproject.com/en/4.2/ref/class-based-views/generic-editing/#django.views.generic.edit.DeleteView
class ProjectDeleteView(PermissionRequiredMixin, DeleteView):
    permission_required = ("photolith.delete_project",)
    model = Project
    slug_field = "id"
    success_url = reverse_lazy("project:index")
