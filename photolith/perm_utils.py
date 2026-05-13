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


def check_individual_edit_access(ind, user):
    if ind.num_annotations > 0:
        raise PermissionDenied(
            "Cannot edit %s, has already been annotated %d times"
            % (
                ind,
                ind.num_annotations,
            )
        )
    if not user.is_superuser and ind.created_by != user:
        raise PermissionDenied(
            "Cannot edit %s, was created by %s not you"
            % (
                ind,
                ind.created_by,
            )
        )
