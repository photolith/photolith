import requests

from . import UNSET, __version__
from .annotations import AnnotationsMixin
from .errors import ERRORS_BY_STATUS, PhotolithError
from .images import ImagesMixin
from .individuals import IndividualsMixin
from .rollback import RollbackMixin
from .search import SearchMixin
from .whoami import WhoAmIMixin


class ApiResult(dict):
    """A decoded JSON response, with the response's etag & status"""

    def __init__(self, body, etag=None, status=None):
        super().__init__(body)
        self.etag = etag
        self.status = status


class PhotolithClient(
    WhoAmIMixin,
    ImagesMixin,
    IndividualsMixin,
    SearchMixin,
    AnnotationsMixin,
    RollbackMixin,
):
    """
    Client for the Photolith API, see doc/advanced/api.rst.

    >>> client = PhotolithClient("https://photolith.example.com", "0123456789abcdef")
    >>> client.whoami()["username"]
    'jbloggs'

    Any error response raises a PhotolithError subclass, see errors.py.

    Individuals & annotations created are logged in rollback_log, to be
    removed with rollback(). Give a previous rollback_log to remove the
    work of an earlier client, see RollbackMixin.
    """

    def __init__(self, base_url, token, session=None, timeout=60, rollback_log=None):
        self.base_url = base_url.rstrip("/")
        self.rollback_log = list(rollback_log or [])
        self.timeout = timeout
        self.session = session or requests.Session()
        self.session.headers.update(
            {
                "Authorization": "Token %s" % token,
                "Accept": "application/json",
                "User-Agent": "photolith-client/%s" % __version__,
            }
        )

    def request(self, method, path, json=UNSET, **kwargs):
        """
        Make a request to path (relative to base_url, e.g. "/api/v1/whoami/"),
        returning an ApiResult, or raising a PhotolithError
        """
        if json is not UNSET:
            kwargs["json"] = json
        resp = self.session.request(
            method, self.base_url + path, timeout=self.timeout, **kwargs
        )
        try:
            body = resp.json() if resp.content else {}
        except ValueError:
            body = None

        if resp.status_code >= 400:
            if not isinstance(body, dict):
                raise PhotolithError(
                    resp.status_code, resp.reason or "Error", resp.text[:500]
                )
            raise ERRORS_BY_STATUS.get(resp.status_code, PhotolithError)(
                resp.status_code,
                body.get("error_class", resp.reason or "Error"),
                body.get("error", ""),
                body,
            )
        if not isinstance(body, dict):
            raise PhotolithError(
                resp.status_code, "InvalidResponse", "Expected a JSON object"
            )
        return ApiResult(body, etag=resp.headers.get("ETag"), status=resp.status_code)
