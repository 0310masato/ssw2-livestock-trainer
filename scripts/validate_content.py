from __future__ import annotations

import hashlib
import json
import pathlib
import re
import sys
import unicodedata
from collections import Counter
from difflib import SequenceMatcher

import fitz
from jsonschema import Draft202012Validator

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / 'public'
REPORTS = ROOT / 'reports'
REPORTS.mkdir(exist_ok=True, parents=True)

QUESTIONS = json.loads((DATA / 'questions-alpha-80.json').read_text(encoding='utf-8'))
FACTS = json.loads((DATA / 'source-facts.json').read_text(encoding='utf-8'))
GLOSSARY = json.loads((DATA / 'glossary-ja-id.json').read_text(encoding='utf-8'))
SCHEMA = json.loads((DATA / 'question.schema.json').read_text(encoding='utf-8'))
LEDGER = json.loads((DATA / 'source-ledger.json').read_text(encoding='utf-8'))

PDFS = {
    'livestock-textbook-2023-09': pathlib.Path('/mnt/data/技能測定試験（畜産農業）.pdf'),
    'safety-textbook-2023-09': pathlib.Path('/mnt/data/衛生管理（畜産農業）.pdf'),
}
ASSET_DIR = ROOT / 'public' / 'assets'


def sha256(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def norm(text: str) -> str:
    text = unicodedata.normalize('NFKC', text)
    return re.sub(r'[\s\u3000・、。,.，．:：;；()（）\[\]「」『』【】/／\-ー—–~〜～\u0007]+', '', text).lower()


def main_pdf_text(page: fitz.Page) -> str:
    # Ruby/furigana are smaller text spans in these official PDFs. Filtering them
    # produces a stable main-text layer for anchor checks without OCR.
    data = page.get_text('dict')
    return ''.join(
        span.get('text', '')
        for block in data.get('blocks', []) if 'lines' in block
        for line in block.get('lines', [])
        for span in line.get('spans', [])
        if float(span.get('size', 0)) >= 7.0
    )


def check(condition: bool, name: str, detail: str = '') -> dict:
    return {'name': name, 'pass': bool(condition), 'detail': detail}


checks: list[dict] = []
issues: list[dict] = []
validator = Draft202012Validator(SCHEMA)
schema_errors = []
for q in QUESTIONS:
    for err in validator.iter_errors(q):
        schema_errors.append({'questionId': q.get('id'), 'path': '/'.join(map(str, err.path)), 'message': err.message})
checks.append(check(not schema_errors, 'JSON Schema validation', f'{len(schema_errors)} error(s)'))
issues.extend({'type': 'schema', **e} for e in schema_errors)

checks += [
    check(len(FACTS) == 100, 'Knowledge-card count', f'{len(FACTS)} / 100'),
    check(len(QUESTIONS) == 80, 'Alpha-question count', f'{len(QUESTIONS)} / 80'),
    check(len(GLOSSARY) == 60, 'Glossary count', f'{len(GLOSSARY)} / 60'),
]

qids = [q['id'] for q in QUESTIONS]
fids = [f['factId'] for f in FACTS]
gids = [g['id'] for g in GLOSSARY]
checks += [
    check(len(qids) == len(set(qids)), 'Unique question IDs'),
    check(len(fids) == len(set(fids)), 'Unique fact IDs'),
    check(len(gids) == len(set(gids)), 'Unique glossary IDs'),
]

fact_ids = set(fids)
missing_refs = []
bad_correct = []
bad_sources = []
bad_rights = []
bad_status = []
bad_language = []
missing_assets = []
bad_pedagogy = []
for q in QUESTIONS:
    for fid in q.get('sourceFactIds', []):
        if fid not in fact_ids:
            missing_refs.append((q['id'], fid))
    choice_ids = {c['id'] for c in q.get('choices', [])}
    if q.get('correctChoiceId') not in choice_ids:
        bad_correct.append(q['id'])
    src = q.get('source', {})
    sid = src.get('sourceId')
    if sid not in PDFS or not isinstance(src.get('pdfPage'), int):
        bad_sources.append(q['id'])
    elif not (1 <= src['pdfPage'] <= fitz.open(PDFS[sid]).page_count):
        bad_sources.append(q['id'])
    rights = q.get('rights', {})
    if not rights.get('originalWording') or rights.get('usesOfficialImage') or rights.get('usesCompetitorContent'):
        bad_rights.append(q['id'])
    if q.get('status') != 'source_checked':
        bad_status.append(q['id'])
    for field in ('question', 'explanation'):
        text = q.get(field, {})
        if not all(str(text.get(k, '')).strip() for k in ('ja', 'easyJa', 'id')):
            bad_language.append((q['id'], field))
    for c in q.get('choices', []):
        if not all(str(c.get('text', {}).get(k, '')).strip() for k in ('ja', 'easyJa', 'id')):
            bad_language.append((q['id'], f"choice:{c.get('id')}"))
    support = q.get('learningSupport', {})
    rationales = q.get('choiceRationales', {})
    ruby_fields = [q.get('question', {}), q.get('explanation', {}), *[c.get('text', {}) for c in q.get('choices', [])], *rationales.values()]
    if (
        q.get('schemaVersion') != '0.3.0'
        or not support.get('questionPattern')
        or not support.get('keyTermIds')
        or len(rationales) != len(q.get('choices', []))
        or any(not item.get('rubyJa') for item in ruby_fields)
        or any(not all(str(item.get(k, '')).strip() for k in ('ja', 'easyJa', 'id')) for item in rationales.values())
    ):
        bad_pedagogy.append(q['id'])
    if q.get('visual'):
        aid = q['visual'].get('assetId')
        if not aid or not (ASSET_DIR / f'{aid}.svg').exists():
            missing_assets.append((q['id'], aid))

checks += [
    check(not missing_refs, 'All question-to-fact references resolve', str(missing_refs[:10])),
    check(not bad_correct, 'Every correctChoiceId exists', str(bad_correct[:10])),
    check(not bad_sources, 'All source documents and PDF pages exist', str(bad_sources[:10])),
    check(not bad_rights, 'Rights flags prohibit official/competitor reuse', str(bad_rights[:10])),
    check(not bad_status, 'All questions remain source_checked (not auto-approved)', str(bad_status[:10])),
    check(not bad_language, 'All multilingual fields are populated', str(bad_language[:10])),
    check(not bad_pedagogy, 'All questions include ruby and pedagogical support', str(bad_pedagogy[:10])),
    check(not missing_assets, 'All declared original visual assets exist', str(missing_assets[:10])),
]
for name, items in [('missing_fact_reference', missing_refs), ('bad_correct_choice', bad_correct), ('bad_source', bad_sources), ('bad_rights', bad_rights), ('bad_status', bad_status), ('bad_language', bad_language), ('bad_pedagogy', bad_pedagogy), ('missing_asset', missing_assets)]:
    issues.extend({'type': name, 'item': item} for item in items)

# Source ledger hash and page-count verification.
ledger_issues = []
for doc in LEDGER.get('officialDocuments', []):
    sid = doc['sourceId']
    path = PDFS.get(sid)
    if not path or not path.exists():
        ledger_issues.append((sid, 'missing file'))
        continue
    if sha256(path) != doc.get('sha256'):
        ledger_issues.append((sid, 'sha256 mismatch'))
    with fitz.open(path) as pdf:
        if pdf.page_count != doc.get('pageCount'):
            ledger_issues.append((sid, f"page count {pdf.page_count} != {doc.get('pageCount')}"))
checks.append(check(not ledger_issues, 'Official-source hashes and page counts match ledger', str(ledger_issues)))
issues.extend({'type': 'source_ledger', 'item': x} for x in ledger_issues)

# Automated anchor checks for the 50 newly added fact cards.
opened = {sid: fitz.open(path) for sid, path in PDFS.items()}
anchor_total = 0
anchor_pass = 0
anchor_failures = []
manual_page_refs = 0
for fact in FACTS:
    anchors = fact.get('source', {}).get('verificationAnchors') or []
    if not anchors:
        manual_page_refs += 1
        continue
    anchor_total += 1
    src = fact['source']
    page = opened[src['sourceId']].load_page(src['pdfPage'] - 1)
    page_text = norm(main_pdf_text(page))
    results = [(a, norm(a) in page_text) for a in anchors]
    if all(ok for _, ok in results):
        anchor_pass += 1
    else:
        anchor_failures.append({'factId': fact['factId'], 'pdfPage': src['pdfPage'], 'results': results})
for pdf in opened.values():
    pdf.close()
checks.append(check(not anchor_failures, 'Automated PDF anchor verification', f'{anchor_pass}/{anchor_total} anchored facts passed; {manual_page_refs} legacy facts retain manual page references'))
issues.extend({'type': 'anchor', **x} for x in anchor_failures)

# Exact and near-duplicate question wording checks.
normalized_questions = [(q['id'], norm(q['question']['ja'])) for q in QUESTIONS]
exact_dupes = []
seen = {}
for qid, text in normalized_questions:
    if text in seen:
        exact_dupes.append((seen[text], qid))
    seen[text] = qid
near_dupes = []
for i, (id1, t1) in enumerate(normalized_questions):
    for id2, t2 in normalized_questions[i+1:]:
        ratio = SequenceMatcher(None, t1, t2).ratio()
        if ratio >= 0.92:
            near_dupes.append({'q1': id1, 'q2': id2, 'ratio': round(ratio, 3)})
checks.append(check(not exact_dupes, 'No exact duplicate question wording', str(exact_dupes)))
# Near duplicates are reported but do not fail the pack by themselves.
checks.append({'name': 'Near-duplicate review queue', 'pass': True, 'detail': f'{len(near_dupes)} pair(s) at similarity >= 0.92', 'warning': bool(near_dupes)})

status_counts = Counter(q['status'] for q in QUESTIONS)
category_counts = Counter(q['category'] for q in QUESTIONS)
fact_subject_counts = Counter(f['subject'] for f in FACTS)
review_counts = Counter(q.get('review', {}).get('languageId', 'missing') for q in QUESTIONS)
all_pass = all(c['pass'] for c in checks if c['name'] != 'Near-duplicate review queue')

report = {
    'generatedAt': '2026-08-13',
    'overall': 'PASS' if all_pass else 'FAIL',
    'releaseMeaning': 'PASS means the Alpha v0.4 review build is structurally and source-reference valid. It does not mean questions are approved for public use.',
    'counts': {'facts': len(FACTS), 'questions': len(QUESTIONS), 'glossary': len(GLOSSARY), 'visualAssets': len(list(ASSET_DIR.glob('*.svg')))},
    'statusCounts': dict(status_counts),
    'questionCountsByCategory': dict(category_counts),
    'factCountsBySubject': dict(fact_subject_counts),
    'indonesianReviewCounts': dict(review_counts),
    'anchorVerification': {'anchoredFacts': anchor_total, 'passed': anchor_pass, 'failed': len(anchor_failures), 'legacyManualPageReferences': manual_page_refs},
    'checks': checks,
    'nearDuplicates': near_dupes,
    'issues': issues,
    'approvalGate': {
        'sourceChecked': sum(q['status'] == 'source_checked' for q in QUESTIONS),
        'approved': sum(q['status'] == 'approved' for q in QUESTIONS),
        'nativeIndonesianReviewed': sum(q.get('review', {}).get('languageId') == 'pass' for q in QUESTIONS),
        'remaining': ['インドネシア語ネイティブ確認', '利用者操作テスト', 'マサトさん最終承認']
    }
}
(REPORTS / 'VALIDATION_REPORT.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

lines = [
    '# Alpha v0.4 Content Validation Report', '',
    f"**Overall: {report['overall']}**", '',
    '> PASSは構造・参照・権利フラグ・自動検査が通ったことを示します。公開用approvedを意味しません。', '',
    '## Counts', '',
    f"- Knowledge cards: {len(FACTS)}", f"- Questions: {len(QUESTIONS)}", f"- Glossary: {len(GLOSSARY)}", f"- Original SVG assets: {report['counts']['visualAssets']}", '',
    '## Checks', '',
]
for c in checks:
    icon = 'PASS' if c['pass'] else 'FAIL'
    suffix = ' (warning)' if c.get('warning') else ''
    lines.append(f"- **{icon}{suffix}** — {c['name']}: {c.get('detail','')}")
lines += ['', '## Coverage', '']
for k, v in sorted(category_counts.items()):
    lines.append(f'- {k}: {v}問')
lines += ['', '## Approval Gate', '', '- source_checked: 80', '- approved: 0', '- インドネシア語ネイティブ確認: 0/80', '- 残り: ネイティブ確認、利用者操作テスト、マサトさん最終承認', '']
if near_dupes:
    lines += ['## Near-duplicate review queue', '']
    lines += [f"- {x['q1']} / {x['q2']}: {x['ratio']}" for x in near_dupes]
(REPORTS / 'VALIDATION_REPORT.md').write_text('\n'.join(lines), encoding='utf-8')

print(json.dumps({'overall': report['overall'], 'checks': len(checks), 'issues': len(issues), 'anchors': report['anchorVerification'], 'nearDuplicates': len(near_dupes)}, ensure_ascii=False))
sys.exit(0 if all_pass else 1)
