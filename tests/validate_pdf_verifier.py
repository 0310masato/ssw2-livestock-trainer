from __future__ import annotations

import hashlib
import pathlib
import sys
import tempfile
import unittest

import fitz

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))

from content_validation_helpers import verify_pdf_documents  # noqa: E402


class PdfVerifierTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix='ssw2-pdf-verifier-')
        self.directory = pathlib.Path(self.temporary.name)
        self.pdf_path = self.directory / 'fixture.pdf'
        document = fitz.open()
        document.new_page().insert_text((72, 72), 'anchor text')
        document.save(self.pdf_path)
        document.close()
        self.digest = hashlib.sha256(self.pdf_path.read_bytes()).hexdigest()
        self.paths = {'fixture': self.pdf_path}

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_matching_hash_and_page_count_pass(self) -> None:
        ledger = [{'sourceId': 'fixture', 'sha256': self.digest, 'pageCount': 1}]
        self.assertEqual(verify_pdf_documents(self.paths, ledger, fitz), [])

    def test_sha_mismatch_fails(self) -> None:
        ledger = [{'sourceId': 'fixture', 'sha256': '0' * 64, 'pageCount': 1}]
        self.assertIn(('fixture', 'sha256 mismatch'), verify_pdf_documents(self.paths, ledger, fitz))

    def test_page_count_mismatch_fails(self) -> None:
        ledger = [{'sourceId': 'fixture', 'sha256': self.digest, 'pageCount': 2}]
        self.assertIn(('fixture', 'page count 1 != 2'), verify_pdf_documents(self.paths, ledger, fitz))


if __name__ == '__main__':
    unittest.main()
