import codecs
import csv
import datetime
import itertools
import json
import logging
import re

from django.http import StreamingHttpResponse

logger = logging.getLogger(__name__)


class StreamingCsvResponse(StreamingHttpResponse):
    def __init__(
        self,
        streaming_content=None,
        *args,
        filename="photolith-export.csv",
        force_cols=None,  # Force these columns to be added to the output, even if they're not in the first row
        **kwargs
    ):
        # https://docs.djangoproject.com/en/4.2/howto/outputting-csv/#streaming-large-csv-files
        def csv_rowgen(rows):
            class Echo:
                def write(self, value):
                    return value

            writer = csv.writer(Echo())
            yield codecs.BOM_UTF8  # BOM triggers Excel to decode as UTF8

            fieldnames = None
            try:
                while True:
                    row = next(rows)

                    # If header hasn't been sent, do that now
                    if fieldnames is None:
                        fieldnames = [
                            k for k in row.keys() if k not in ("id", "__str__")
                        ] + (force_cols or [])
                        yield writer.writerow(
                            re.sub(r"^\w{2}_", "", f) for f in fieldnames
                        )

                    row_out = []
                    for n in fieldnames:
                        if isinstance(row.get(n), dict):  # Taxonomy
                            row_out.append(row[n]["id"])
                        elif isinstance(row.get(n), datetime.date):
                            row_out.append(row[n].isoformat())
                        else:
                            row_out.append(row.get(n))
                    yield writer.writerow(row_out)
            except StopIteration as e:
                if e.value is not None:
                    yield writer.writerow([json.dumps(e.value)])

        kwargs["streaming_content"] = csv_rowgen(streaming_content or [])
        kwargs["content_type"] = "text/csv"
        if "headers" not in kwargs:
            kwargs["headers"] = dict()
        kwargs["headers"]["Content-Disposition"] = (
            'attachment; filename="%s"' % filename
        )
        super().__init__(*args, **kwargs)
