from .errors import NotFound, PhotolithError


class RollbackMixin:
    """
    Log of items created by the client, so they can be removed with rollback(),
    for use with PhotolithClient.

    rollback_log is a list of {"type": "individual" / "annotation", "id": ...}
    dicts, oldest first. It's plain JSON, so can be saved & given to a later
    client's rollback_log argument, to remove the work of a previous run.

    Images aren't logged, as they can't be deleted via the API. Uploading the
    same image again returns the existing one.
    """

    def _log_created(self, type, id):
        self.rollback_log.append(dict(type=type, id=id))

    def _log_deleted(self, type, id):
        self.rollback_log[:] = [
            x for x in self.rollback_log if x != dict(type=type, id=id)
        ]

    def rollback(self):
        """
        Delete everything in rollback_log, newest first (so annotations go before
        their individuals). Items that are already gone are removed from the log.

        Items that can't be deleted (e.g. an individual someone else has
        annotated) are left in the log, and the first error is raised once
        everything else has been tried.
        """
        delete = dict(
            individual=self.delete_individual,
            annotation=self.delete_annotation,
        )
        first_error = None
        for item in reversed(list(self.rollback_log)):
            try:
                delete[item["type"]](item["id"])
            except NotFound:
                self._log_deleted(item["type"], item["id"])
            except PhotolithError as e:
                first_error = first_error or e
        if first_error:
            raise first_error
