#!/bin/sh
set -eu

exec ./bin/gunicorn \
  --workers 3 \
  --bind="0.0.0.0:8000" \
  --log-level=warn \
  photolith.wsgi:application
