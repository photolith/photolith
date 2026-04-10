import json
import logging

from django.core.serializers.json import DjangoJSONEncoder
from django.http import StreamingHttpResponse


logger = logging.getLogger(__name__)


class StreamingJsonResponse(StreamingHttpResponse):
    def __init__(self, streaming_content=None, *args, root_key="data", **kwargs):
        def stream_json(iter, root_key="data"):
            data_header_sent = False
            try:
                for r in iter:
                    yield (
                        ",\n" if data_header_sent else '{"%s":[\n' % root_key
                    ) + json.dumps(r, cls=DjangoJSONEncoder)
                    data_header_sent = True
            except Exception as e:
                logger.exception(e)
                yield "\n]," if data_header_sent else "{"
                yield '"error_class":%s,\n"error":%s}' % (
                    json.dumps(e.__class__.__name__),
                    json.dumps(getattr(e, "message", str(e))),
                )
                return
            yield "\n]}" if data_header_sent else '{"%s":[]}' % root_key

        kwargs["streaming_content"] = stream_json(streaming_content or [], root_key)
        kwargs["content_type"] = "application/json"
        super().__init__(*args, **kwargs)
