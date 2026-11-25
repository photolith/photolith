import datetime

from .errors import PhotolithError, SearchTruncated

# Metadata prefixes that are range filters in search()
RANGE_PREFIXES = ("nm_", "in_", "dt_")


class SearchResult(list):
    """
    Rows from search(), with any extra keys from the response:

    * alert: Any alert the server returned (e.g. with_annotations="alert")
    * images: Image ID -> image details, with with_associated_images=True
    """

    def __init__(self, rows, alert=None, images=None):
        super().__init__(rows)
        self.alert = alert
        self.images = images or {}


def _search_value(v):
    if v is None:
        return ""
    if isinstance(v, datetime.datetime):
        # NB: Date filters are by day
        return v.date().isoformat()
    if isinstance(v, datetime.date):
        return v.isoformat()
    return str(v)


def search_params(filters):
    """
    Convert search() filters to a list of query parameters.

    * nm_ / in_ / dt_ filters are ranges. A single value is an exact match, a
      (min, max) tuple is a range, None for an open end.
    * Other filters can be a single value or a list, where any value matches.
    * True flags (e.g. with_associated_images) are sent as 1, False / None
      values are left out.
    """
    out = []
    for k, v in filters.items():
        if v is None or v is False:
            continue
        if v is True:
            v = 1
        if k.startswith(RANGE_PREFIXES):
            if isinstance(v, (list, tuple)):
                if len(v) != 2:
                    raise ValueError("%s should be (min, max), not %r" % (k, v))
                vs = v
            else:
                vs = (v, v)
        elif isinstance(v, (list, tuple, set, frozenset)):
            vs = v
        else:
            vs = (v,)
        out.extend((k, _search_value(x)) for x in vs)
    return out


class SearchMixin:
    """/search/data/, for use with PhotolithClient"""

    def search(self, filters=None, **kwargs):
        """
        Search individuals, as /search/data/, returning a SearchResult list of
        rows. Filters are given as a dict or keyword arguments, see
        search_params(), e.g:

        >>> client.search(nm_image_id=812, with_annotations="all")
        >>> client.search(ch_slideLabel=["12", "13"], nm_length=(30, None))

        Raises SearchTruncated if there are too many results.
        """
        filters = dict(filters or {}, **kwargs)
        out = self.request("GET", "/search/data/", params=search_params(filters))
        if "error_class" in out:
            # NB: An error part-way through the results, status is still 200
            raise PhotolithError(out.status, out["error_class"], out["error"], out)
        result = SearchResult(
            out.get("data", []),
            alert=out.get("alert"),
            images=out.get("images"),
        )
        if result.alert and filters.get("with_annotations") != "alert":
            raise SearchTruncated(
                out.status,
                "SearchTruncated",
                result.alert.get("messageHTML", ""),
                out,
                result=result,
            )
        return result
