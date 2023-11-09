from django.contrib.auth.views import PasswordContextMixin
from django.utils.translation import gettext as _
from django.urls import reverse_lazy
from django.views.generic.base import TemplateView
from django.views.generic.edit import CreateView

from .forms import UserCreationForm


class UserCreationView(PasswordContextMixin, CreateView):
    template_name = "registration/signup.html"
    success_url = reverse_lazy("auth:signup_done")
    form_class = UserCreationForm
    title = _("Sign up")


class UserCreationDoneView(PasswordContextMixin, TemplateView):
    template_name = "registration/signup_done.html"
    title = _("Administrator confirmation required")
