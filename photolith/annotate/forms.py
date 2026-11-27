from django.forms import ModelForm, HiddenInput

from crispy_forms.helper import FormHelper

from ..models import Annotation


class AnnotationForm(ModelForm):
    def __init__(self, *args, authority_level=None, **kwargs):
        super().__init__(*args, **kwargs)
        if authority_level is not None:
            # Only allow authority choices up to the user's level (or the existing value when editing)
            self.fields["authority"].choices = [
                (v, n)
                for v, n in self.fields["authority"].choices
                if v < authority_level + 10
                or (self.instance.pk and v == self.instance.authority)
            ]
        self.fields["comment"].widget.attrs["rows"] = 2
        self.fields["comment"].required = False
        # NB: Only required if readable, see clean()
        self.fields["age"].required = False
        self.fields["axis_poly"].required = False
        self.fields["authority"].widget.attrs["class"] = "pref-session"
        self.helper = FormHelper()
        self.helper.label_class = "col-sm-3"  # or col-lg-2, etc
        self.helper.field_class = "col"  # or col-lg-8, etc
        self.helper.form_class = "form-horizontal"

    def clean(self):
        cleaned_data = super().clean()
        if cleaned_data.get("rating") == Annotation.Rating.UNREADABLE:
            # Unreadable images can be annotated without an age or any points
            if not cleaned_data.get("axis_poly"):
                cleaned_data["axis_poly"] = []
            return cleaned_data

        for k in ("age", "axis_poly"):
            if cleaned_data.get(k) in (None, []) and k not in self.errors:
                self.add_error(k, self.fields[k].error_messages["required"])
        return cleaned_data

    class Meta:
        model = Annotation
        fields = [
            "individual",
            "rating",
            "authority",
            "age",
            "comment",
            "axis_poly",
            "project",
        ]
        widgets = {
            "individual": HiddenInput(),
            "project": HiddenInput(),
        }
