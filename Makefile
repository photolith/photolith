PROJECT=photolith

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

compile: lib/.requirements.txt ./manage.py

test: compile
	./manage.py test

lint: lib/.requirements-dev.txt
	./bin/black $(PROJECT)

node_modules/.package.json: package.json
	npm ci
	npm run fetch
	touch $@

start: node_modules/.package.json
	./manage.py collectstatic --noinput
	./manage.py runserver 0.0.0.0:8000

.PHONY: all compile test lint start
