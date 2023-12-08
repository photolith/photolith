# Minimal makefile for Sphinx documentation
#

# You can set these variables from the command line, and also
# from the environment for the first two.
SPHINXOPTS    ?=
SPHINXBUILD   ?= ../bin/sphinx-build
SOURCEDIR     = .
BUILDDIR      = _build

# Put it first so that "make" without argument is like "make help".
help:
	@$(SPHINXBUILD) -M help "$(SOURCEDIR)" "$(BUILDDIR)" $(SPHINXOPTS) $(O)

makemessages:
	make gettext
	../bin/sphinx-intl update -p _build/gettext

html-all-lang:
	for lang in en $(shell ls -1 locale); do $(SPHINXBUILD) -b html "$(SOURCEDIR)" "$(BUILDDIR)/html/$$lang" -D language="$$lang"; done
	echo '<meta http-equiv="refresh" content="0; url=/doc/en/" />' > "$(BUILDDIR)/html/index.html"

.PHONY: help makemessages html-all-lang Makefile

# Catch-all target: route all unknown targets to Sphinx using the new
# "make mode" option.  $(O) is meant as a shortcut for $(SPHINXOPTS).
%: Makefile
	@$(SPHINXBUILD) -M $@ "$(SOURCEDIR)" "$(BUILDDIR)" $(SPHINXOPTS) $(O)
