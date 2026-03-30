import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../src/cli.js';
import {
  getLatestReviewTaskId,
  listReviewBundles,
  migrateLegacyReviewBundles,
  readReviewBundle,
  readReviewBundleFromPath,
  writeReviewBundle,
} from '../src/core/review.js';
import { upsertTaskContentManifest } from '../src/core/task-content.js';
import type { FeedbackItem, ReviewBundle } from '../src/types.js';

const TEST_DIR = join(process.cwd(), '.test-superview-review');

function makeItem(overrides: Partial<FeedbackItem> = {}): FeedbackItem {
  return {
    type: 'block_comment',
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    blockId: 'block-1',
    version: 1,
    text: 'Test comment',
    createdAt: new Date().toISOString(),
    resolved: false,
    ...overrides,
  };
}

function makeBundle(overrides: Partial<ReviewBundle> = {}): ReviewBundle {
  return {
    reviewId: `review-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    taskId: 'task-1',
    title: 'Test Task',
    basePath: TEST_DIR,
    currentVersion: 1,
    updatedAt: new Date().toISOString(),
    exportedAt: new Date().toISOString(),
    syncState: 'synced',
    reviewSchemaVersion: 1,
    items: [makeItem()],
    ...overrides,
  };
}

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  vi.restoreAllMocks();
});

describe('review bundle storage', () => {
  it('writes canonical review bundles and mirrors legacy feedback files', () => {
    const bundle = makeBundle({ taskId: 'task-storage', title: 'Storage Task' });
    writeReviewBundle(TEST_DIR, bundle);

    const read = readReviewBundle(TEST_DIR, 'task-storage');
    expect(read).not.toBeNull();
    expect(read?.title).toBe('Storage Task');
    expect(read?.items).toHaveLength(1);
    expect(getLatestReviewTaskId(TEST_DIR)).toBe('task-storage');

    const canonicalPath = join(TEST_DIR, '.superview', 'reviews', 'task-storage.json');
    const legacyPath = join(TEST_DIR, '.superview', 'feedback', 'task-storage.json');
    expect(existsSync(canonicalPath)).toBe(true);
    expect(existsSync(legacyPath)).toBe(true);
  });

  it('migrates legacy feedback files into canonical review bundles on sync', () => {
    const legacyPath = join(TEST_DIR, '.superview', 'feedback', 'task-legacy.json');
    mkdirSync(join(TEST_DIR, '.superview', 'feedback'), { recursive: true });
    writeFileSync(legacyPath, JSON.stringify({
      taskId: 'task-legacy',
      items: [makeItem({ id: 'legacy-fb', text: 'Legacy comment' })],
      exportedAt: '2026-03-27T08:00:00.000Z',
    }, null, 2), 'utf-8');

    const migrated = migrateLegacyReviewBundles(TEST_DIR);
    expect(migrated).toHaveLength(1);
    expect(readReviewBundle(TEST_DIR, 'task-legacy')?.items[0].text).toBe('Legacy comment');
    expect(existsSync(join(TEST_DIR, '.superview', 'reviews', 'task-legacy.json'))).toBe(true);
  });
});

describe('review cli', () => {
  it('prints a file-first setup snippet for Claude instead of localhost-first guidance', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['setup-claude']);
    const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');

    expect(output).toContain('Open that HTML file directly');
    expect(output).toContain('superview render /tmp/sv-draft.md');
    expect(output).toContain('superview content --latest --json --base-dir');
    expect(output).toContain('superview inbox --latest --json --base-dir');
    expect(output).toContain('Do NOT tell the user to open localhost');
    expect(output).not.toContain('feedback --latest --json');
    expect(output).not.toContain('npx superview');
  });

  it('runs the installed bin correctly through a symlinked path', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'superview-bin-'));
    const linkPath = join(tempDir, 'superview');
    const builtCliPath = join(process.cwd(), 'dist', 'cli.js');
    symlinkSync(builtCliPath, linkPath);

    try {
      const output = execFileSync('node', [linkPath, '--help'], { encoding: 'utf-8' });

      expect(output).toContain('superview - Render AI output to file-first review HTML');
      expect(output).toContain('superview render <file|->');
      expect(output).toContain('superview setup-claude');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('resolves the latest review bundle by review activity, not render history', async () => {
    upsertTaskContentManifest(TEST_DIR, 'task-older', 'Older canonical content', {
      type: 'generic',
      title: 'Older Review',
      metadata: { title: 'Older Review' },
      currentVersion: 1,
      updatedAt: '2026-03-27T08:00:00.000Z',
      sourcePath: join(TEST_DIR, 'older.md'),
      sourceKind: 'markdown',
    });
    upsertTaskContentManifest(TEST_DIR, 'task-newer', 'Newer canonical content', {
      type: 'generic',
      title: 'Newer Review',
      metadata: { title: 'Newer Review' },
      currentVersion: 2,
      updatedAt: '2026-03-27T12:00:00.000Z',
      sourcePath: join(TEST_DIR, 'newer.md'),
      sourceKind: 'markdown',
    });
    writeReviewBundle(TEST_DIR, makeBundle({
      taskId: 'task-older',
      title: 'Older Review',
      updatedAt: '2026-03-27T08:00:00.000Z',
      exportedAt: '2026-03-27T08:00:00.000Z',
    }));
    writeReviewBundle(TEST_DIR, makeBundle({
      taskId: 'task-newer',
      title: 'Newer Review',
      updatedAt: '2026-03-27T12:00:00.000Z',
      exportedAt: '2026-03-27T12:00:00.000Z',
    }));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['review', '--latest', '--json', '--base-dir', TEST_DIR]);
    const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');

    expect(output).toContain('"taskId": "task-newer"');
    expect(output).toContain('"reviewSchemaVersion": 1');
    expect(output).toContain('"unresolvedComments"');
    expect(output).toContain('"renameRequests"');
    expect(output).toContain('"content": "Newer canonical content"');
    expect(output).toContain('"contentSource": "superview-canonical"');
    expect(output).toContain('"sourceKind": "markdown"');

    logSpy.mockClear();
    await runCli(['feedback', '--latest', '--json', '--base-dir', TEST_DIR]);
    const feedbackOutput = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(feedbackOutput).toContain('"taskId": "task-newer"');

    logSpy.mockClear();
    await runCli(['inbox', '--latest', '--json', '--base-dir', TEST_DIR]);
    const inboxOutput = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(inboxOutput).toContain('"taskId": "task-newer"');
  });

  it('prints canonical latest content directly via the content command', async () => {
    upsertTaskContentManifest(TEST_DIR, 'task-content', 'Latest edited body', {
      type: 'document',
      title: 'Latest task',
      metadata: { title: 'Latest task' },
      currentVersion: 3,
      updatedAt: '2026-03-27T15:00:00.000Z',
      sourcePath: join(TEST_DIR, 'draft.md'),
      sourceKind: 'markdown',
    });
    writeReviewBundle(TEST_DIR, makeBundle({
      taskId: 'task-content',
      title: 'Latest task',
      updatedAt: '2026-03-27T15:00:00.000Z',
      exportedAt: '2026-03-27T15:00:00.000Z',
    }));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['content', '--latest', '--base-dir', TEST_DIR]);
    expect(logSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('Latest edited body');

    logSpy.mockClear();
    await runCli(['content', '--task-id', 'task-content', '--json', '--base-dir', TEST_DIR]);
    const jsonOutput = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(jsonOutput).toContain('"content": "Latest edited body"');
    expect(jsonOutput).toContain('"contentSource": "superview-canonical"');
    expect(jsonOutput).toContain('"sourcePath"');
  });

  it('imports review bundles from a file and serves them back via --view', async () => {
    const imported = makeBundle({
      taskId: 'task-import',
      title: 'Imported Task',
      items: [makeItem({ id: 'imported-comment', text: 'Imported comment' })],
    });
    const importPath = join(TEST_DIR, 'bundle.json');
    writeFileSync(importPath, JSON.stringify(imported, null, 2), 'utf-8');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['import-review', importPath, '--base-dir', TEST_DIR]);
    expect(logSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('"ok": true');

    const htmlPath = join(TEST_DIR, '.superview', 'views', 'task-import.html');
    mkdirSync(join(TEST_DIR, '.superview', 'views'), { recursive: true });
    writeFileSync(htmlPath, `<!DOCTYPE html><html><body><script>window.__svTaskId = 'task-import';</script></body></html>`, 'utf-8');

    logSpy.mockClear();
    await runCli(['review', '--view', htmlPath, '--json', '--base-dir', TEST_DIR]);
    const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('"taskId": "task-import"');
    expect(output).toContain('"Imported comment"');

    expect(readReviewBundleFromPath(importPath)?.taskId).toBe('task-import');
    expect(listReviewBundles(TEST_DIR).map((bundle) => bundle.taskId)).toContain('task-import');
  });
});
