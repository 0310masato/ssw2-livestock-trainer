from __future__ import annotations

import hashlib
import pathlib
from typing import Any


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def verify_pdf_documents(
    pdf_paths: dict[str, pathlib.Path],
    ledger_documents: list[dict[str, Any]],
    fitz_module: Any,
) -> list[tuple[str, str]]:
    issues: list[tuple[str, str]] = []
    for document in ledger_documents:
        source_id = document.get('sourceId')
        if not isinstance(source_id, str):
            issues.append(('<missing-source-id>', 'ledger sourceId is missing'))
            continue
        pdf_path = pdf_paths.get(source_id)
        if not pdf_path or not pdf_path.exists():
            issues.append((source_id, 'missing file'))
            continue
        if sha256_file(pdf_path) != document.get('sha256'):
            issues.append((source_id, 'sha256 mismatch'))
        try:
            with fitz_module.open(pdf_path) as pdf:
                if pdf.page_count != document.get('pageCount'):
                    issues.append((source_id, f"page count {pdf.page_count} != {document.get('pageCount')}"))
        except Exception as error:  # PyMuPDF exposes several format-specific exception classes.
            issues.append((source_id, f'cannot open PDF: {error}'))
    return issues
