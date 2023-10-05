import os
import pathlib
import tempfile
import shutil

from django.test import TestCase

from photolith.ingest.photo_dir import list_photo_dirs, get_next_photo

from .binaries import JPEG_VALID, JPEG_TRUNCATED


class PhotoDirTestCase(TestCase):
    def setUp(self):
        super(PhotoDirTestCase, self).setUp()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_path = pathlib.Path(self.temp_dir.name)

    def tearDown(self):
        shutil.rmtree(self.base_path)
        super(PhotoDirTestCase, self).tearDown()

    def create_file(self, file_path, content=JPEG_VALID):
        with open(file_path, "wb") as f:
            f.write(content)

    def test_list_photo_dirs(self):
        def lpd():
            return list(list_photo_dirs(self.base_path))

        # Starts empty
        self.assertEqual(lpd(), [])

        # Output sorted
        os.makedirs(self.base_path / "z_cuthbert")
        os.makedirs(self.base_path / "a_dibble")
        self.assertEqual(lpd(), ["a_dibble", "z_cuthbert"])

        # Files ignored
        self.create_file(self.base_path / "f_file")
        self.assertEqual(lpd(), ["a_dibble", "z_cuthbert"])

    def test_get_next_photo(self):
        def gnp(photo_dir, prev=None):
            return get_next_photo(self.base_path, photo_dir, prev)

        os.makedirs(self.base_path / "pd")
        os.makedirs(self.base_path / "pd" / "nested")
        os.makedirs(self.base_path / "pd2")

        # Invalid photoDirs
        with self.assertRaises(ValueError):
            gnp("non-existant")
        with self.assertRaises(ValueError):
            gnp("..")
        with self.assertRaises(ValueError):
            gnp("pd/nested")

        # Empty directory, nothing to find
        self.assertEqual(gnp("pd"), None)
        self.assertEqual(gnp("pd", prev="001.jpg"), None)
        self.assertEqual(gnp("pd2"), None)

        # Create files, returned in order
        self.create_file(self.base_path / "pd" / "001.jpg")
        self.create_file(self.base_path / "pd" / "002.png")
        self.create_file(self.base_path / "pd" / "003.jpg")
        self.assertEqual(
            gnp("pd"),
            dict(
                path=self.base_path / "pd" / "001.jpg",
                name="001.jpg",
                mime="image/jpeg",
                remaining=2,
            ),
        )
        self.assertEqual(
            gnp("pd", prev="001.jpg"),
            dict(
                path=self.base_path / "pd" / "002.png",
                name="002.png",
                mime="image/png",
                remaining=1,
            ),
        )
        self.assertEqual(
            gnp("pd", prev="002.png"),
            dict(
                path=self.base_path / "pd" / "003.jpg",
                name="003.jpg",
                mime="image/jpeg",
                remaining=0,
            ),
        )
        self.assertEqual(gnp("pd", prev="003.jpg"), None)
        self.assertEqual(gnp("pd2"), None)

        # Create truncated file, complain
        self.create_file(self.base_path / "pd" / "004.jpg", JPEG_TRUNCATED)
        out = gnp("pd", prev="003.jpg")
        self.assertEqual(
            out,
            dict(
                error=out["error"],
                path=self.base_path / "pd" / "004.jpg",
                name="004.jpg",
                remaining=0,
            ),
        )
        self.assertIn("image file is truncated", out["error"])
