import mimetypes
import os
import os.path
import pathlib
import re

from PIL import Image


def list_photo_dirs(base):
    for p in sorted(pathlib.Path(base).iterdir()):
        if p.is_dir():
            yield os.path.basename(p)


def get_next_photo(base, photo_dir, prev=None):
    dir_path = pathlib.Path(base) / photo_dir
    if not re.match(r"^\w+$", photo_dir) or not os.path.exists(dir_path):
        raise ValueError("Invalid photo_dir '%s'" % photo_dir)

    file_path = None
    remaining = 0
    for p in sorted(dir_path.iterdir(), key=os.path.getmtime):
        if not p.is_file():
            # Ignore directories
            pass
        elif prev:
            if os.path.basename(p) == prev:
                # Found previous entry, stop looking for it & return next file
                prev = None
        elif file_path is None:
            # Return first file we found (but keep counting)
            file_path = p
        else:
            # Count anything else left
            remaining += 1

    if file_path is None:
        return None

    # Try reading the image, if we can't assume it's not fully uploaded yet
    # Based on lib/python3.11/site-packages/django/forms/fields.py:to_python
    with Image.open(file_path) as im:
        try:
            im.load()
        except OSError as exc:
            # Pillow returns OSError('image file is truncated (1 bytes not processed)')
            return dict(
                path=file_path,
                name=os.path.basename(file_path),
                remaining=remaining,
                error=str(exc),
            )

    # Open file, removing it now it's been handed clientside
    return dict(
        path=file_path,
        name=os.path.basename(file_path),
        mime=mimetypes.guess_type(file_path)[0],
        remaining=remaining,
    )
