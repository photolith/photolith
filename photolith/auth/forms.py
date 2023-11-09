from django import forms
from django.contrib.auth.forms import BaseUserCreationForm, UsernameField
from django.contrib.auth.models import User


class UserCreationForm(BaseUserCreationForm):
    email = forms.EmailField(max_length=254)
    # Remove password fields, we reset when ready
    password1 = None
    password2 = None

    def save(self, commit=True):
        # NB: Skip BaseUserCreationForm, so we don't try and set password
        user = super(forms.ModelForm, self).save(commit=False)
        user.is_active = False
        if commit:
            user.save()
            if hasattr(self, "save_m2m"):
                self.save_m2m()
        return user

    class Meta:
        model = User
        fields = (
            "username",
            "first_name",
            "last_name",
            "email",
        )
        field_classes = {"username": UsernameField}
