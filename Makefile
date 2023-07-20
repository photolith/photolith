PROJECT=photolith
LOCALE_FILES=$(wildcard $(PROJECT)/locale/*/LC_MESSAGES/django.po)

all: test

bin/pip:
	python3 -m venv .

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

$(PROJECT)/locale/%/LC_MESSAGES/django.mo: $(PROJECT)/locale/%/LC_MESSAGES/django.po
	./manage.py compilemessages --ignore=site-packages --ignore=registration

compile: lib/.requirements.txt ./manage.py $(LOCALE_FILES:.po=.mo) node_modules/.package.json
	npm run build

test: compile
	./manage.py test

lint: lib/.requirements-dev.txt node_modules/.package-dev.json
	./bin/autoflake -r  --imports django,requests photolith/ | patch -p1
	./bin/black $(PROJECT)
	npm run lint

node_modules/.package.json: package.json
	npm ci --production
	touch $@

node_modules/.package-dev.json: package.json
	npm ci --include=dev
	touch node_modules/.package.json
	touch $@

start: compile
	./manage.py runserver 0.0.0.0:8000

makemessages: manage.py
	./manage.py makemessages --all --ignore=site-packages --ignore=registration
	sed -i '/POT-Creation-Date/d' photolith/locale/*/LC_MESSAGES/django.po
	sed -Ei 's/:[0-9]+$$//' photolith/locale/*/LC_MESSAGES/django.po

precommit: lint makemessages

.PHONY: all compile test lint start makemessages
