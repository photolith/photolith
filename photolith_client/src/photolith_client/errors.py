class PhotolithError(Exception):
    """
    An error response from the Photolith API.

    * status: HTTP status code (200 for errors part-way through a search)
    * error_class: The server's name for the error, e.g. "ValidationError"
    * error: Human-readable message
    * body: The full decoded response, or None if it wasn't JSON
    """

    def __init__(self, status, error_class, error, body=None):
        super().__init__("%s (%d): %s" % (error_class, status, error))
        self.status = status
        self.error_class = error_class
        self.error = error
        self.body = body


class ValidationError(PhotolithError):
    """400: Invalid input. fields has any per-field errors, e.g. {"age": ["..."]}"""

    @property
    def fields(self):
        return (self.body or {}).get("fields", {})


class Unauthorized(PhotolithError):
    """401: Missing or unknown API token"""


class PermissionDenied(PhotolithError):
    """403: The user isn't allowed to do this"""


class NotFound(PhotolithError):
    """404: No such object"""


class Conflict(PhotolithError):
    """
    409: Change would invalidate annotations, which should be deleted first.

    annotations is a dict of annotation IDs by entry (e.g. "individuals[0]")
    for put_individuals(), or a list for a single individual.
    """

    @property
    def annotations(self):
        return (self.body or {}).get("annotations", {})


class PreconditionFailed(PhotolithError):
    """412: The If-Match ETag no longer matches, individuals have changed since"""


class SearchTruncated(PhotolithError):
    """
    More than the server's SEARCH_RESULT_MAX_ROWS results, the search should be
    narrowed. result has the (incomplete) SearchResult
    """

    def __init__(self, status, error_class, error, body=None, result=None):
        super().__init__(status, error_class, error, body)
        self.result = result


ERRORS_BY_STATUS = {
    400: ValidationError,
    401: Unauthorized,
    403: PermissionDenied,
    404: NotFound,
    409: Conflict,
    412: PreconditionFailed,
}
