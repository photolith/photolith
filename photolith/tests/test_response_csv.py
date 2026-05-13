import codecs
import csv
import datetime
import io

from django.test import TestCase

from ..response_csv import StreamingCsvResponse


class StreamingCsvResponseTest(TestCase):
    def do_scr(self, rows, **kwargs):
        scr = StreamingCsvResponse(iter(rows), **kwargs)
        self.assertEqual(scr.headers["Content-Type"], "text/csv")
        content = b"".join(scr.streaming_content)
        content = content.removeprefix(codecs.BOM_UTF8)
        return list(csv.reader(io.StringIO(content.decode("utf-8"))))

    def test_headers(self):
        scr = StreamingCsvResponse(iter([{"a": "1"}]))
        self.assertEqual(scr.headers["Content-Type"], "text/csv")
        self.assertIn("photolith-export.csv", scr.headers["Content-Disposition"])

    def test_custom_filename(self):
        scr = StreamingCsvResponse(iter([{"a": "1"}]), filename="my-export.csv")
        self.assertIn("my-export.csv", scr.headers["Content-Disposition"])

    def test_bom(self):
        scr = StreamingCsvResponse(iter([{"a": "1"}]))
        content = b"".join(scr.streaming_content)
        self.assertTrue(content.startswith(codecs.BOM_UTF8))

    def test_success(self):
        rows = [{"xx_name": "One potato"}, {"xx_name": "ორი კარტოფილი"}]
        result = self.do_scr(rows)
        self.assertEqual(result[0], ["name"])
        self.assertEqual(result[1], ["One potato"])
        self.assertEqual(result[2], ["ორი კარტოფილი"])

    def test_success_empty(self):
        result = self.do_scr([])
        self.assertEqual(result, [])

    def test_bom_included_when_empty(self):
        scr = StreamingCsvResponse(iter([]))
        content = b"".join(scr.streaming_content)
        self.assertEqual(content, codecs.BOM_UTF8)

    def test_column_prefix_stripping(self):
        rows = [{"im_col1": "a", "tx_col2": "b", "xx_col3": "c"}]
        result = self.do_scr(rows)
        self.assertEqual(result[0], ["col1", "col2", "col3"])

    def test_column_exclusion(self):
        rows = [{"id": 1, "__str__": "repr", "xx_name": "Alice"}]
        result = self.do_scr(rows)
        self.assertEqual(result[0], ["name"])
        self.assertEqual(result[1], ["Alice"])

    def test_taxonomy_value(self):
        rows = [{"xx_category": {"id": 42, "label": "Nature"}}]
        result = self.do_scr(rows)
        self.assertEqual(result[1], ["42"])

    def test_date_value(self):
        rows = [{"xx_taken": datetime.date(2024, 3, 15)}]
        result = self.do_scr(rows)
        self.assertEqual(result[1], ["2024-03-15"])

    def test_force_cols(self):
        # force_cols adds columns from subsequent rows even if absent in the first
        rows = [{"xx_name": "Alice"}, {"xx_name": "Bob", "xx_extra": "bonus"}]
        result = self.do_scr(rows, force_cols=["xx_extra"])
        self.assertEqual(result[0], ["name", "extra"])
        self.assertEqual(result[1], ["Alice", ""])
        self.assertEqual(result[2], ["Bob", "bonus"])

    def test_return_with_extra(self):
        def stuff(c):
            for i in range(c):
                yield dict(potato="%d potato" % (i + 1))
            return dict(extra="moo")

        self.assertEqual(
            self.do_scr(stuff(0)),
            [['{"extra": "moo"}']],
        )
        self.assertEqual(
            self.do_scr(stuff(1)),
            [["potato"], ["1 potato"], ['{"extra": "moo"}']],
        )
        self.assertEqual(
            self.do_scr(stuff(2)),
            [["potato"], ["1 potato"], ["2 potato"], ['{"extra": "moo"}']],
        )
