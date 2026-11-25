"""Client for the Photolith API, see doc/advanced/api.rst"""

__version__ = "0.1.0"


class _Unset:
    def __repr__(self):
        return "UNSET"


# Keyword argument not given, as opposed to None (which clears a value)
UNSET = _Unset()

from .client import ApiResult, PhotolithClient  # noqa: E402
from .individuals import labels  # noqa: E402
from .search import SearchResult, search_params  # noqa: E402
from .errors import (  # noqa: E402
    Conflict,
    NotFound,
    PermissionDenied,
    PhotolithError,
    PreconditionFailed,
    SearchTruncated,
    Unauthorized,
    ValidationError,
)

__all__ = [
    "UNSET",
    "ApiResult",
    "Conflict",
    "NotFound",
    "PermissionDenied",
    "PhotolithClient",
    "PhotolithError",
    "PreconditionFailed",
    "SearchResult",
    "SearchTruncated",
    "Unauthorized",
    "ValidationError",
    "labels",
    "search_params",
]
