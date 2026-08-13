import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const python = process.platform === 'win32' ? 'python' : 'python3';
const validator = fileURLToPath(new URL('../scripts/validate_content.py', import.meta.url));

function runValidator(args, reportDirectory, sourceDirectory) {
  const env = { ...process.env };
  delete env.SSW2_SOURCE_DIR;
  if (sourceDirectory) env.SSW2_SOURCE_DIR = sourceDirectory;
  return spawnSync(python, [validator, '--report-dir', reportDirectory, ...args], {
    env,
    encoding: 'utf8',
  });
}

test('structural content validation reports PDF checks as skipped when source directory is unset', async () => {
  const reports = await mkdtemp(join(tmpdir(), 'ssw2-validation-'));
  try {
    const result = runValidator([], reports);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout.trim());
    assert.equal(summary.anchors.skipped, true);
    assert.equal(summary.anchors.required, false);
  } finally {
    await rm(reports, { recursive: true, force: true });
  }
});

test('configured SSW2_SOURCE_DIR fails closed when required PDFs are missing', async () => {
  const reports = await mkdtemp(join(tmpdir(), 'ssw2-validation-configured-'));
  const sourceDirectory = await mkdtemp(join(tmpdir(), 'ssw2-controlled-source-'));
  try {
    const result = runValidator([], reports, sourceDirectory);
    assert.notEqual(result.status, 0, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout.trim());
    assert.equal(summary.anchors.required, true);
    assert.equal(summary.anchors.skipped, false);
  } finally {
    await rm(reports, { recursive: true, force: true });
    await rm(sourceDirectory, { recursive: true, force: true });
  }
});

test('required PDF validation fails closed when source directory is unset', async () => {
  const reports = await mkdtemp(join(tmpdir(), 'ssw2-validation-required-'));
  try {
    const result = runValidator(['--require-pdfs'], reports);
    assert.notEqual(result.status, 0, result.stdout);
    const summary = JSON.parse(result.stdout.trim());
    assert.equal(summary.anchors.required, true);
    assert.equal(summary.anchors.skipped, false);
    assert.equal(summary.overall, 'FAIL');
  } finally {
    await rm(reports, { recursive: true, force: true });
  }
});

test('PDF verifier distinguishes valid input, SHA mismatch, and page-count mismatch', () => {
  const testScript = fileURLToPath(new URL('./validate_pdf_verifier.py', import.meta.url));
  const result = spawnSync(python, [testScript], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /Ran 3 tests/);
});
