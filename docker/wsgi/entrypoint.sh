#!/bin/sh
set -eu

# Run collectstatic at every startup to ensure static volume is up-to-date
./manage.py collectstatic --noinput --clear

exec ./bin/gunicorn \
  --workers 3 \
  --bind="0.0.0.0:8000" \
  --log-level=warn \
  photolith.wsgi:application
