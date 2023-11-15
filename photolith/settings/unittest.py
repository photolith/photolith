from .base import *

UNITTEST_SETTINGS = True

DEBUG = False

SECRET_KEY = "insecure-ut"
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

DATABASES["default"]["NAME"] = "app_ut"
STORAGES["default"]["BACKEND"] = "django.core.files.storage.InMemoryStorage"

LOGGING = {}
