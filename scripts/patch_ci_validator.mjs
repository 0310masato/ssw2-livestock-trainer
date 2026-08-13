import { readFile, writeFile } from 'node:fs/promises';

const path = 'scripts/validate_content.py';
let source = await readFile(path, 'utf8');

function replaceRequired(search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing ${label}`);
  source = source.replace(search, replacement);
}

replaceRequired(
  'import fitz\nfrom jsonschema import Draft202012Validator',
  `try:
    import fitz
except ModuleNotFoundError:
    fitz = None

from jsonschema import Draft202012Validator`,
  'optional PyMuPDF import',
);

replaceRequired(
  `PDFS = {
    'livestock-textbook-2023-09': pathlib.Path('/mnt/data/技能測定試験（畜産農業）.pdf'),
    'safety-textbook-2023-09': pathlib.Path('/mnt/data/衛生管理（畜産農業）.pdf'),
}
ASSET_DIR = ROOT / 'public' / 'assets'`,
  `PDFS = {
    'livestock-textbook-2023-09': pathlib.Path('/mnt/data/技能測定試験（畜産農業）.pdf'),
    'safety-textbook-2023-09': pathlib.Path('/mnt/data/衛生管理（畜産農業）.pdf'),
}
LEDGER_BY_ID = {doc['sourceId']: doc for doc in LEDGER.get('officialDocuments', [])}
SOURCE_PDFS_AVAILABLE = fitz is not None and all(path.exists() for path in PDFS.values())
ASSET_DIR = ROOT / 'public' / 'assets'`,
  'source availability metadata',
);

replaceRequired(
  `    sid = src.get('sourceId')
    if sid not in PDFS or not isinstance(src.get('pdfPage'), int):
        bad_sources.append(q['id'])
    elif not (1 <= src['pdfPage'] <= fitz.open(PDFS[sid]).page_count):
        bad_sources.append(q['id'])`,
  `    sid = src.get('sourceId')
    page = src.get('pdfPage')
    page_limit = LEDGER_BY_ID.get(sid, {}).get('pageCount')
    if (
        sid not in PDFS
        or not isinstance(page, int)
        or not isinstance(page_limit, int)
        or not (1 <= page <= page_limit)
    ):
        bad_sources.append(q['id'])`,
  'source-page structural validation',
);

const ledgerStart = source.indexOf('# Source ledger hash and page-count verification.');
const duplicateStart = source.indexOf('# Exact and near-duplicate question wording checks.');
if (ledgerStart < 0 || duplicateStart < 0 || duplicateStart <= ledgerStart) {
  throw new Error('Could not locate source-verification section');
}

const sourceVerification = `# Source ledger and PDF verification.
# GitHub Actions does not receive the copyrighted source PDFs. In that
# environment we validate source IDs and page ranges against source-ledger.json,
# and clearly record the binary/hash and text-anchor checks as skipped.
ledger_issues = []
anchor_total = sum(bool(fact.get('source', {}).get('verificationAnchors')) for fact in FACTS)
manual_page_refs = len(FACTS) - anchor_total
anchor_pass = 0
anchor_failures = []
anchor_skipped = not SOURCE_PDFS_AVAILABLE

if SOURCE_PDFS_AVAILABLE:
    for doc in LEDGER.get('officialDocuments', []):
        sid = doc['sourceId']
        pdf_path = PDFS.get(sid)
        if not pdf_path or not pdf_path.exists():
            ledger_issues.append((sid, 'missing file'))
            continue
        if sha256(pdf_path) != doc.get('sha256'):
            ledger_issues.append((sid, 'sha256 mismatch'))
        with fitz.open(pdf_path) as pdf:
            if pdf.page_count != doc.get('pageCount'):
                ledger_issues.append((sid, f"page count {pdf.page_count} != {doc.get('pageCount')}"))
    checks.append(check(not ledger_issues, 'Official-source hashes and page counts match ledger', str(ledger_issues)))
    issues.extend({'type': 'source_ledger', 'item': item} for item in ledger_issues)

    opened = {sid: fitz.open(pdf_path) for sid, pdf_path in PDFS.items()}
    for fact in FACTS:
        anchors = fact.get('source', {}).get('verificationAnchors') or []
        if not anchors:
            continue
        src = fact['source']
        page = opened[src['sourceId']].load_page(src['pdfPage'] - 1)
        page_text = norm(main_pdf_text(page))
        results = [(anchor, norm(anchor) in page_text) for anchor in anchors]
        if all(ok for _, ok in results):
            anchor_pass += 1
        else:
            anchor_failures.append({'factId': fact['factId'], 'pdfPage': src['pdfPage'], 'results': results})
    for pdf in opened.values():
        pdf.close()
    checks.append(check(
        not anchor_failures,
        'Automated PDF anchor verification',
        f'{anchor_pass}/{anchor_total} anchored facts passed; {manual_page_refs} legacy facts retain manual page references',
    ))
    issues.extend({'type': 'anchor', **item} for item in anchor_failures)
else:
    checks.append({
        'name': 'Official-source binary verification',
        'pass': True,
        'detail': 'SKIPPED: official PDFs are not mounted in this CI environment; source IDs and page ranges were checked against source-ledger.json.',
        'warning': True,
        'skipped': True,
    })
    checks.append({
        'name': 'Automated PDF anchor verification',
        'pass': True,
        'detail': f'SKIPPED: {anchor_total} anchored facts require the mounted official PDFs. Run npm run validate:content in the controlled source-review environment for full verification.',
        'warning': True,
        'skipped': True,
    })

`;
source = `${source.slice(0, ledgerStart)}${sourceVerification}${source.slice(duplicateStart)}`;

replaceRequired(
  "'releaseMeaning': 'PASS means the Alpha v0.4 review build is structurally and source-reference valid. It does not mean questions are approved for public use.',",
  "'releaseMeaning': 'PASS means the Alpha v0.5 pack passed structural, pedagogical, rights, and available source checks. A skipped PDF check is reported explicitly and PASS never means public-use approval.',",
  'release meaning',
);

replaceRequired(
  "'anchorVerification': {'anchoredFacts': anchor_total, 'passed': anchor_pass, 'failed': len(anchor_failures), 'legacyManualPageReferences': manual_page_refs},",
  "'anchorVerification': {'available': SOURCE_PDFS_AVAILABLE, 'skipped': anchor_skipped, 'anchoredFacts': anchor_total, 'passed': anchor_pass, 'failed': len(anchor_failures), 'legacyManualPageReferences': manual_page_refs},",
  'anchor verification report',
);

source = source
  .replace("'# Alpha v0.4 Content Validation Report'", "'# Alpha v0.5 Content Validation Report'")
  .replace("'PASS means the Alpha v0.4 review build", "'PASS means the Alpha v0.5 review build");

await writeFile(path, source, 'utf8');
