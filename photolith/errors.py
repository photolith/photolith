import functools

from django.http import FileResponse, JsonResponse


def json_errors(func):
    @functools.wraps(func)
    def wrapper(request, *args, **kwargs):
        try:
            return func(request, *args, **kwargs)
        except Exception as e:
            return JsonResponse(
                dict(
                    error_class=e.__class__.__name__,
                    error=str(e),
                ),
                status=500,
            )

    return wrapper
