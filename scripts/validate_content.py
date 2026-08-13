from __future__ import annotations

import csv
import hashlib
import json
import os
import pathlib
import re
import sys
import unicodedata
from collections import Counter
from difflib import SequenceMatcher

try:
    import fitz
except ModuleNotFoundError:
    fitz = None

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
with (DATA / 'review-checklist.csv').open(encoding='utf-8', newline='') as review_file:
    REVIEW_READER = csv.DictReader(review_file)
    REVIEW_FIELDNAMES = REVIEW_READER.fieldnames or []
    REVIEW_ROWS = list(REVIEW_READER)

SOURCE_DIR = pathlib.Path(os.environ.get('SSW2_SOURCE_DIR', '/mnt/data'))
RUNNING_IN_GITHUB_ACTIONS = os.environ.get('GITHUB_ACTIONS') == 'true'
SOURCE_DIR_CONFIGURED = bool(os.environ.get('SSW2_SOURCE_DIR'))
PDFS = {
    'livestock-textbook-2023-09': SOURCE_DIR / '技能測定試験（畜産農業）.pdf',
    'safety-textbook-2023-09': SOURCE_DIR / '衛生管理（畜産農業）.pdf',
}
LEDGER_BY_ID = {doc['sourceId']: doc for doc in LEDGER.get('officialDocuments', [])}
SOURCE_PDFS_AVAILABLE = fitz is not None and all(path.exists() for path in PDFS.values())
if SOURCE_PDFS_AVAILABLE:
    EXECUTION_SCOPE = 'local-controlled-source-review'
elif RUNNING_IN_GITHUB_ACTIONS:
    EXECUTION_SCOPE = 'github-ci-without-official-pdfs'
else:
    EXECUTION_SCOPE = 'local-structural-validation-without-official-pdfs'
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


HAN_RE = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff々〆ヶ]')
PILOT_TERM_ANNOTATION_RE = re.compile(r'（[^（）]*[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff々〆ヶ][^（）]*）')
PILOT_TERM_WITH_READING_RE = re.compile(
    r'（[^（）]*[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff々〆ヶ][^（）]*／[^（）]+）'
)


def localized_texts(question: dict) -> list[tuple[str, dict]]:
    values = [('question', question.get('question', {})), ('explanation', question.get('explanation', {}))]
    values.extend((f"choice:{choice.get('id')}", choice.get('text', {})) for choice in question.get('choices', []))
    values.extend((f"rationale:{choice_id}", value) for choice_id, value in question.get('choiceRationales', {}).items())
    support = question.get('learningSupport', {})
    values.extend([('lessonObjective', support.get('lessonObjective', {})), ('memoryPoint', support.get('memoryPoint', {}))])
    if support.get('intentOverride'):
        values.append(('intentOverride', support['intentOverride']))
    return values


def missing_han_readings(value: dict) -> list[str]:
    return [
        str(segment.get('text', ''))
        for segment in value.get('rubyJa', [])
        if HAN_RE.search(str(segment.get('text', ''))) and not str(segment.get('reading', '')).strip()
    ]


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
    check(len(GLOSSARY) == 63, 'Glossary count', f'{len(GLOSSARY)} / 63'),
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
pilot_ids = set()
pilot_missing_translation = []
pilot_missing_furigana = []
pilot_missing_correct_reason = []
pilot_missing_wrong_reason = []
pilot_duplicate_wrong_reasons = []
pilot_missing_keywords = []
pilot_missing_source = []
pilot_missing_review_flags = []
pilot_missing_language_points = []
pilot_missing_term_annotations = []
pilot_native_unchecked = []
for q in QUESTIONS:
    for fid in q.get('sourceFactIds', []):
        if fid not in fact_ids:
            missing_refs.append((q['id'], fid))
    choice_ids = {c['id'] for c in q.get('choices', [])}
    if q.get('correctChoiceId') not in choice_ids:
        bad_correct.append(q['id'])
    src = q.get('source', {})
    sid = src.get('sourceId')
    page = src.get('pdfPage')
    page_limit = LEDGER_BY_ID.get(sid, {}).get('pageCount')
    if (
        sid not in PDFS
        or not isinstance(page, int)
        or not isinstance(page_limit, int)
        or not (1 <= page <= page_limit)
    ):
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
        q.get('schemaVersion') not in {'0.3.0', '0.4.0'}
        or not support.get('questionPattern')
        or not support.get('keyTermIds')
        or len(rationales) != len(q.get('choices', []))
        or any(not item.get('rubyJa') for item in ruby_fields)
        or any(not all(str(item.get(k, '')).strip() for k in ('ja', 'easyJa', 'id')) for item in rationales.values())
    ):
        bad_pedagogy.append(q['id'])
    if q.get('schemaVersion') == '0.4.0':
        qid = q['id']
        pilot_ids.add(qid)
        for path, value in localized_texts(q):
            if not all(str(value.get(key, '')).strip() for key in ('ja', 'easyJa', 'id')):
                pilot_missing_translation.append((qid, path))
            if not value.get('rubyJa') or missing_han_readings(value):
                pilot_missing_furigana.append((qid, path, missing_han_readings(value)))
        if not str(q.get('explanation', {}).get('ja', '')).strip() or not str(q.get('explanation', {}).get('id', '')).strip():
            pilot_missing_correct_reason.append(qid)
        for choice in q.get('choices', []):
            rationale = q.get('choiceRationales', {}).get(choice.get('id'), {})
            if choice.get('id') != q.get('correctChoiceId') and not all(str(rationale.get(key, '')).strip() for key in ('ja', 'easyJa', 'id')):
                pilot_missing_wrong_reason.append((qid, choice.get('id')))
        wrong_reason_texts = [
            norm(q.get('choiceRationales', {}).get(choice.get('id'), {}).get('ja', ''))
            for choice in q.get('choices', [])
            if choice.get('id') != q.get('correctChoiceId')
        ]
        if len(wrong_reason_texts) != len(set(wrong_reason_texts)):
            pilot_duplicate_wrong_reasons.append(qid)
        if not 1 <= len(support.get('keyTermIds', [])) <= 5:
            pilot_missing_keywords.append(qid)
        if not support.get('languagePointKeys'):
            pilot_missing_language_points.append(qid)
        annotated_translations = [('question', q.get('question', {}).get('id', ''))]
        annotated_translations.extend(
            (f"choice:{choice.get('id')}", choice.get('text', {}).get('id', ''))
            for choice in q.get('choices', [])
        )
        for path, text in annotated_translations:
            annotations = PILOT_TERM_ANNOTATION_RE.findall(str(text))
            if not annotations or any(
                HAN_RE.search(annotation) and not PILOT_TERM_WITH_READING_RE.fullmatch(annotation)
                for annotation in annotations
            ):
                pilot_missing_term_annotations.append((qid, path))
        if not all(src.get(key) not in (None, '') for key in ('documentTitle', 'edition', 'pdfPage', 'section')):
            pilot_missing_source.append(qid)
        review = q.get('review', {})
        if not all(key in review for key in ('furigana', 'japaneseLearning', 'answerLeak')):
            pilot_missing_review_flags.append(qid)
        if review.get('languageId') != 'pass':
            pilot_native_unchecked.append(qid)
    if q.get('visual'):
        aid = q['visual'].get('assetId')
        if not aid or not (ASSET_DIR / f'{aid}.svg').exists():
            missing_assets.append((q['id'], aid))

question_by_id = {q['id']: q for q in QUESTIONS}
review_ids = [row.get('question_id', '') for row in REVIEW_ROWS]
review_duplicate_ids = sorted(qid for qid, count in Counter(review_ids).items() if count > 1)
review_missing_or_extra_ids = sorted(set(question_by_id) ^ set(review_ids))
review_field_mismatches = []
review_column_map = {
    'schema_version': lambda q: q.get('schemaVersion'),
    'category': lambda q: q.get('category'),
    'topic': lambda q: q.get('topic'),
    'status': lambda q: q.get('status'),
    'source_id': lambda q: q.get('source', {}).get('sourceId'),
    'pdf_page': lambda q: q.get('source', {}).get('pdfPage'),
    'printed_page': lambda q: q.get('source', {}).get('printedPageLabel'),
    'content_review': lambda q: q.get('review', {}).get('content'),
    'japanese_review': lambda q: q.get('review', {}).get('languageJa'),
    'indonesian_review': lambda q: q.get('review', {}).get('languageId'),
    'furigana_review': lambda q: q.get('review', {}).get('furigana'),
    'japanese_learning_review': lambda q: q.get('review', {}).get('japaneseLearning'),
    'answer_leak_review': lambda q: q.get('review', {}).get('answerLeak'),
    'rights_review': lambda q: q.get('review', {}).get('legalRights'),
    'user_approval': lambda q: q.get('review', {}).get('approvalByUser'),
    'language_point_keys': lambda q: '|'.join(q.get('learningSupport', {}).get('languagePointKeys', [])),
    'question_ja': lambda q: q.get('question', {}).get('ja'),
    'notes': lambda q: q.get('review', {}).get('notes'),
}
for row in REVIEW_ROWS:
    q = question_by_id.get(row.get('question_id'))
    if not q:
        continue
    for column, expected_value in review_column_map.items():
        expected = expected_value(q)
        if (row.get(column) or '') != ('' if expected is None else str(expected)):
            review_field_mismatches.append((q['id'], column))

required_human_review_columns = {
    'pilot_set', 'source_title', 'source_edition', 'source_section',
    'current_reviewer_type', 'current_reviewed_at', 'device_review', 'correction_notes',
}
pilot_review_rows = [row for row in REVIEW_ROWS if row.get('question_id') in pilot_ids]
pilot_set_counts = Counter(row.get('pilot_set') for row in pilot_review_rows)
nonpilot_assigned_sets = sorted(
    row.get('question_id') for row in REVIEW_ROWS
    if row.get('question_id') not in pilot_ids and row.get('pilot_set')
)
pilot_review_metadata_missing = []
for row in pilot_review_rows:
    q = question_by_id[row['question_id']]
    source = q.get('source', {})
    review = q.get('review', {})
    expected_metadata = {
        'source_title': source.get('documentTitle'),
        'source_edition': source.get('edition'),
        'source_section': source.get('section'),
        'current_reviewer_type': review.get('reviewerType'),
        'current_reviewed_at': review.get('reviewedAt'),
    }
    for column, expected in expected_metadata.items():
        if (row.get(column) or '') != ('' if expected is None else str(expected)):
            pilot_review_metadata_missing.append((q['id'], column))
    if row.get('device_review') not in {'pending', 'pass', 'fail'}:
        pilot_review_metadata_missing.append((q['id'], 'device_review'))

checks += [
    check(not missing_refs, 'All question-to-fact references resolve', str(missing_refs[:10])),
    check(not bad_correct, 'Every correctChoiceId exists', str(bad_correct[:10])),
    check(not bad_sources, 'All source IDs and ledger page ranges resolve', str(bad_sources[:10])),
    check(not bad_rights, 'Rights flags prohibit official/competitor reuse', str(bad_rights[:10])),
    check(not bad_status, 'All questions remain source_checked (not auto-approved)', str(bad_status[:10])),
    check(not bad_language, 'All multilingual fields are populated', str(bad_language[:10])),
    check(not bad_pedagogy, 'All questions include ruby and pedagogical support', str(bad_pedagogy[:10])),
    check(not missing_assets, 'All declared original visual assets exist', str(missing_assets[:10])),
    check(len(pilot_ids) == 16, 'Representative question-schema 0.4 pilot count', f'{len(pilot_ids)} / 16'),
    check(len(REVIEW_ROWS) == len(QUESTIONS) and not review_duplicate_ids and not review_missing_or_extra_ids, 'Review checklist has one row for each of the 80 questions', f'rows={len(REVIEW_ROWS)}, duplicates={review_duplicate_ids[:10]}, idDiff={review_missing_or_extra_ids[:10]}'),
    check(not review_field_mismatches, 'Review checklist canonical fields match question data', str(review_field_mismatches[:10])),
    check(required_human_review_columns.issubset(REVIEW_FIELDNAMES) and pilot_set_counts == Counter({'A': 4, 'B': 4, 'C': 4, 'D': 4}) and not nonpilot_assigned_sets and not pilot_review_metadata_missing, 'Pilot review checklist exposes four 4-question sets, source metadata, device status, and correction notes', f'sets={dict(pilot_set_counts)}, nonpilotSets={nonpilot_assigned_sets[:10]}, metadata={pilot_review_metadata_missing[:10]}'),
    check(not pilot_missing_translation, 'Pilot required translations are populated', str(pilot_missing_translation[:10])),
    check(not pilot_missing_furigana, 'Pilot kanji ruby segments have readings', str(pilot_missing_furigana[:10])),
    check(not pilot_missing_correct_reason, 'Pilot correct-answer reasons are populated', str(pilot_missing_correct_reason[:10])),
    check(not pilot_missing_wrong_reason, 'Pilot wrong-choice reasons are populated', str(pilot_missing_wrong_reason[:10])),
    check(not pilot_duplicate_wrong_reasons, 'Pilot wrong-choice reasons are choice-specific', str(pilot_duplicate_wrong_reasons[:10])),
    check(not pilot_missing_keywords, 'Pilot questions have 1 to 5 key terms', str(pilot_missing_keywords[:10])),
    check(not pilot_missing_language_points, 'Pilot questions identify at least one Japanese language point', str(pilot_missing_language_points[:10])),
    check(not pilot_missing_term_annotations, 'Pilot question and choice translations retain Japanese term annotations and readings for kanji', str(pilot_missing_term_annotations[:10])),
    check(not pilot_missing_source, 'Pilot questions identify source title, edition, page, and section', str(pilot_missing_source[:10])),
    check(not pilot_missing_review_flags, 'Pilot review gates are explicit', str(pilot_missing_review_flags[:10])),
]
for name, items in [('missing_fact_reference', missing_refs), ('bad_correct_choice', bad_correct), ('bad_source', bad_sources), ('bad_rights', bad_rights), ('bad_status', bad_status), ('bad_language', bad_language), ('bad_pedagogy', bad_pedagogy), ('missing_asset', missing_assets), ('pilot_missing_translation', pilot_missing_translation), ('pilot_missing_furigana', pilot_missing_furigana), ('pilot_missing_correct_reason', pilot_missing_correct_reason), ('pilot_missing_wrong_reason', pilot_missing_wrong_reason), ('pilot_duplicate_wrong_reasons', pilot_duplicate_wrong_reasons), ('pilot_missing_keywords', pilot_missing_keywords), ('pilot_missing_language_points', pilot_missing_language_points), ('pilot_missing_term_annotations', pilot_missing_term_annotations), ('pilot_missing_source', pilot_missing_source), ('pilot_missing_review_flags', pilot_missing_review_flags)]:
    issues.extend({'type': name, 'item': item} for item in items)

# Source ledger and PDF verification.
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
    binary_skip_detail = (
        'SKIPPED in GitHub CI: official PDFs are intentionally not stored in Git; source IDs and ledger page ranges were checked.'
        if RUNNING_IN_GITHUB_ACTIONS
        else 'SKIPPED in this local run: official PDFs were unavailable. Set SSW2_SOURCE_DIR to the controlled folder containing both PDFs.'
    )
    anchor_skip_detail = (
        f'SKIPPED in GitHub CI: {anchor_total} anchored facts require official PDFs that are intentionally not stored in Git.'
        if RUNNING_IN_GITHUB_ACTIONS
        else f'SKIPPED in this local run: {anchor_total} anchored facts require both official PDFs under SSW2_SOURCE_DIR.'
    )
    checks.append({
        'name': 'Official-source binary verification',
        'pass': True,
        'detail': binary_skip_detail,
        'warning': True,
        'skipped': True,
    })
    checks.append({
        'name': 'Automated PDF anchor verification',
        'pass': True,
        'detail': anchor_skip_detail,
        'warning': True,
        'skipped': True,
    })

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
pilot_questions = [q for q in QUESTIONS if q['id'] in pilot_ids]
pilot_review_states = {
    key: dict(Counter(q.get('review', {}).get(key, 'missing') for q in pilot_questions))
    for key in ('content', 'languageJa', 'languageId', 'furigana', 'japaneseLearning', 'answerLeak', 'legalRights', 'approvalByUser')
}
pilot_device_review_states = dict(Counter(row.get('device_review', 'missing') or 'missing' for row in pilot_review_rows))
pilot_pending_gate_counts = {
    'nativeIndonesian': pilot_review_states['languageId'].get('pending_native_review', 0),
    'furigana': pilot_review_states['furigana'].get('pending', 0),
    'japaneseLearning': pilot_review_states['japaneseLearning'].get('pending', 0),
    'answerLeak': pilot_review_states['answerLeak'].get('pending', 0),
    'userApproval': pilot_review_states['approvalByUser'].get('pending', 0),
    'deviceReview': pilot_device_review_states.get('pending', 0),
}
checks.append({
    'name': 'Pilot native-Indonesian review queue',
    'pass': True,
    'detail': f'{len(pilot_native_unchecked)} / {len(pilot_ids)} pilot question(s) remain outside approved until languageId=pass',
    'warning': bool(pilot_native_unchecked),
})
all_pass = all(c['pass'] for c in checks if c['name'] != 'Near-duplicate review queue')

report = {
    'generatedAt': '2026-08-13',
    'reportKind': 'canonical-generated-summary',
    'executionScope': {
        'name': EXECUTION_SCOPE,
        'githubActions': RUNNING_IN_GITHUB_ACTIONS,
        'sourceDirConfigured': SOURCE_DIR_CONFIGURED,
        'officialPdfsAvailable': SOURCE_PDFS_AVAILABLE,
        'githubCiPolicy': 'Standard PR CI validates repository data and code but skips PDF binary hashes, page counts, and text anchors because official PDFs are not stored in Git.',
        'localPdfPolicy': 'Set SSW2_SOURCE_DIR to the controlled folder containing both official PDFs to run binary hash, page-count, and text-anchor checks.',
    },
    'overall': 'PASS' if all_pass else 'FAIL',
    'releaseMeaning': 'PASS means the Alpha v0.5 pack passed structural, pedagogical, rights, and available source checks. A skipped PDF check is reported explicitly and PASS never means public-use approval.',
    'counts': {'facts': len(FACTS), 'questions': len(QUESTIONS), 'glossary': len(GLOSSARY), 'visualAssets': len(list(ASSET_DIR.glob('*.svg')))},
    'statusCounts': dict(status_counts),
    'questionCountsByCategory': dict(category_counts),
    'factCountsBySubject': dict(fact_subject_counts),
    'indonesianReviewCounts': dict(review_counts),
    'pilot': {
        'questionIds': sorted(pilot_ids),
        'count': len(pilot_ids),
        'nativeIndonesianUnchecked': len(pilot_native_unchecked),
        'nativeIndonesianUncheckedIds': sorted(pilot_native_unchecked),
        'reviewStates': pilot_review_states,
        'deviceReviewStates': pilot_device_review_states,
        'pendingGates': {**pilot_pending_gate_counts, 'total': sum(pilot_pending_gate_counts.values())},
    },
    'anchorVerification': {'available': SOURCE_PDFS_AVAILABLE, 'skipped': anchor_skipped, 'anchoredFacts': anchor_total, 'passed': anchor_pass, 'failed': len(anchor_failures), 'legacyManualPageReferences': manual_page_refs},
    'checks': checks,
    'nearDuplicates': near_dupes,
    'issues': issues,
    'approvalGate': {
        'sourceChecked': sum(q['status'] == 'source_checked' for q in QUESTIONS),
        'approved': sum(q['status'] == 'approved' for q in QUESTIONS),
        'nativeIndonesianReviewed': sum(q.get('review', {}).get('languageId') == 'pass' for q in QUESTIONS),
        'pilotNativeIndonesianUnchecked': len(pilot_native_unchecked),
        'remaining': ['インドネシア語ネイティブ確認', '利用者操作テスト', 'マサトさん最終承認']
    }
}
(REPORTS / 'VALIDATION_REPORT.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

lines = [
    '# Alpha v0.5 Content Validation Report', '',
    f"**Overall: {report['overall']}**", '',
    '> このファイルは再生成可能な正本サマリーです。GitHub Actionsの実行ログやartifact一覧そのものではありません。', '',
    '> PASSは構造・参照・権利フラグ・この実行範囲で利用可能な自動検査が通ったことを示します。公開用approvedを意味しません。', '',
    '## Verification scope', '',
    f"- Current report scope: `{EXECUTION_SCOPE}`",
    f"- Official PDFs available in this run: {'yes' if SOURCE_PDFS_AVAILABLE else 'no'}",
    '- GitHub PR CI: リポジトリ内のデータ同期、Schema、型、単体テスト、E2E、ビルドを検査します。公式PDFをGitへ保存しないため、標準CIではPDFバイナリのSHA-256、ページ数、本文アンカー照合をSKIPします。',
    '- Controlled local review: `SSW2_SOURCE_DIR` に公式PDF 2冊を配置した場合だけ、PDFのSHA-256、ページ数、本文アンカー照合を追加実行します。', '',
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
lines += [
    '', '## Approval Gate', '',
    f"- source_checked: {report['approvalGate']['sourceChecked']}",
    f"- approved: {report['approvalGate']['approved']}",
    f"- インドネシア語ネイティブ確認: {report['approvalGate']['nativeIndonesianReviewed']}/{len(QUESTIONS)}",
    f"- 代表16問の review.languageId 未確認: {pilot_review_states['languageId'].get('pending_native_review', 0)}",
    f"- 代表16問の review.furigana 未確認: {pilot_review_states['furigana'].get('pending', 0)}",
    f"- 代表16問の review.japaneseLearning 未確認: {pilot_review_states['japaneseLearning'].get('pending', 0)}",
    f"- 代表16問の review.answerLeak 未確認: {pilot_review_states['answerLeak'].get('pending', 0)}",
    f"- 代表16問の review.approvalByUser 未確認: {pilot_review_states['approvalByUser'].get('pending', 0)}",
    f"- 代表16問の device_review 未確認: {pilot_device_review_states.get('pending', 0)}",
    f"- 代表16問の未確認ゲート記録合計: {sum(pilot_pending_gate_counts.values())}",
    '- 残り: 代表16問の人手レビュー、実機テスト、マサトさん最終承認', ''
]
if near_dupes:
    lines += ['## Near-duplicate review queue', '']
    lines += [f"- {x['q1']} / {x['q2']}: {x['ratio']}" for x in near_dupes]
(REPORTS / 'VALIDATION_REPORT.md').write_text('\n'.join(lines), encoding='utf-8')

print(json.dumps({'overall': report['overall'], 'checks': len(checks), 'issues': len(issues), 'anchors': report['anchorVerification'], 'nearDuplicates': len(near_dupes)}, ensure_ascii=False))
sys.exit(0 if all_pass else 1)
