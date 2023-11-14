from django.core.exceptions import PermissionDenied


def check_annotate_access(project, user, rw=False):
    if project:
        if not (project.team.users.contains(user) or project.created_by == user):
            raise PermissionDenied(
                "Contact an administrator to be added to this project"
            )
        if rw and not project.is_open:
            raise PermissionDenied(
                "Project %s closed, cannot edit annotations" % (str(project))
            )
    else:
        if rw and not user.has_perm("photolith.change_annotation"):
            raise PermissionDenied(
                "Contact an administrator to be added to the general annotation group"
            )
        if not rw and not user.has_perm("photolith.view_annotation"):
            raise PermissionDenied(
                "Contact an administrator to be added to the general annotation group"
            )
