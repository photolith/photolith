#!/bin/sh
set -eu
. /etc/os-release

apt-get $* update
apt-get $* install make curl


# Server dependencies
apt-get $* install \
    python3-venv python3-wheel \
    libpq-dev libpython3-dev \
    gettext \

# Client dependencies
apt-get $* install \
    nodejs npm
