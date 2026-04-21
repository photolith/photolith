PROJECT=photolith
LOCALE_FILES=$(wildcard $(PROJECT)/locale/*/LC_MESSAGES/django.po)

all: compile

bin/pip:
	# 3.13+ adds "--without-scm-ignore-files", without which we blat .gitignore
	if python3 -m venv --help | grep -q -- "--without-scm-ignore-files"; then python3 -m venv --without-scm-ignore-files . ; else python3 -m venv .; fi

lib/.%.txt: %.txt bin/pip
	./bin/pip install -r $<
	touch $@

manage.py: lib/.requirements.txt
	# Create a fresh manage.py, update the python path to match venv
	rm -r /tmp/manage-py || true
	mkdir -p /tmp/manage-py
	./bin/django-admin startproject $(PROJECT) /tmp/manage-py
	mv /tmp/manage-py/manage.py .
	sed -i 's|#!/usr/bin/env python|#!$(shell pwd)/bin/python|' manage.py
	rm -r /tmp/manage-py

./photolith/settings/version.py:
	echo GIT_REVISION='"'"$(shell git describe --exact-match HEAD 2>/dev/null || git rev-parse --short HEAD)"'"' > $@

$(PROJECT)/locale/%/LC_MESSAGES/django.mo: $(PROJECT)/locale/%/LC_MESSAGES/django.po
	./manage.py compilemessages --ignore=site-packages --ignore=registration

compile: lib/.requirements.txt ./manage.py ./photolith/settings/version.py $(LOCALE_FILES:.po=.mo) node_modules/.package.json
	make -C doc html-all-lang
	npm run build

test: compile lib/.requirements-dev.txt node_modules/.package-dev.json
	./bin/python -Wa ./manage.py test --settings $(PROJECT).settings.unittest
	npm run test

coverage: compile lib/.requirements-dev.txt node_modules/.package-dev.json
	./bin/coverage run --source='$(PROJECT)' --omit='$(PROJECT)/tests/*,$(PROJECT)/[aw]sgi.py' ./manage.py test --settings $(PROJECT).settings.unittest $(PROJECT)
	./bin/coverage report
	./bin/coverage html -d staticfiles/htmlcov/
	npm run coverage
	echo "Visit https://.../static/htmlcov/ & https://.../static/clientcov/"

lint: lib/.requirements-dev.txt node_modules/.package-dev.json
	./bin/autoflake -r  --imports django,requests photolith/ | patch -p1
	./bin/black $(PROJECT)
	npm run lint

node_modules/.package.json: package.json
	npm --verbose ci --production
	touch $@

node_modules/.package-dev.json: package.json
	npm --verbose ci --include=dev
	touch node_modules/.package.json
	touch $@

start: compile
	./manage.py runserver 0.0.0.0:8000

makemessages: manage.py
	./manage.py makemessages --all --ignore=site-packages --ignore=registration
	sed -i '/POT-Creation-Date/d' photolith/locale/*/LC_MESSAGES/django.po
	sed -Ei '/^#: /{s/:[0-9]+//g}' photolith/locale/*/LC_MESSAGES/django.po
	make -C doc makemessages

makemigrations:
	./manage.py makemigrations

precommit: makemigrations lint makemessages

outdated:
	./bin/pip list --outdated
	npm outdated

clean:
	rm -rf -- bin include lib lib64 share pyvenv.cfg
	rm -rf -- manage.py $(PROJECT)/settings/version.py $(PROJECT)/locale/*/LC_MESSAGES/*.mo
	rm -rf -- node_modules client/dist .coverage
	rm -rf -- doc/_build

.PHONY: all compile test lint start makemessages ./photolith/settings/version.py outdated clean
