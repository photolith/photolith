"""photolith URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/3.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.views import defaults as default_views


urlpatterns = [
    path("accounts/", include("django.contrib.auth.urls")),
    path("accounts/", include("photolith.auth.urls", namespace="auth")),
    path("admin/", admin.site.urls),
    path("i18n/", include("django.conf.urls.i18n")),
    path("", include("photolith.home.urls", namespace="home")),
    path("annotate/", include("photolith.annotate.urls", namespace="annotate")),
    path("ingest/", include("photolith.ingest.urls", namespace="ingest")),
    path("project/", include("photolith.project.urls", namespace="project")),
    path("search/", include("photolith.search.urls", namespace="search")),
]


if settings.DEBUG:
    # This allows the error pages to be debugged during development, just visit
    # these url (e.g 404) in browser to see how these error pages look like.
    urlpatterns += [
        path(
            r"400/",
            default_views.bad_request,
            kwargs={"exception": Exception("Bad Request!")},
        ),
        path(
            r"403/",
            default_views.permission_denied,
            kwargs={"exception": Exception("Permission Denied")},
        ),
        path(
            r"404/",
            default_views.page_not_found,
            kwargs={"exception": Exception("Page not Found")},
        ),
        path(r"500/", default_views.server_error),
    ]
    # https://docs.djangoproject.com/en/6.0/howto/static-files/#serving-static-files-during-development
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
