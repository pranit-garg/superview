import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendHistory, renameTask } from '../src/core/history.js';
import { isLegacyViewHtml, rewriteLegacyViews, rewriteTaskViews, upgradeViewHtml } from '../src/core/view-upgrade.js';
import type { HistoryEntry } from '../src/types.js';

const TEST_DIR = join(process.cwd(), '.test-superview-upgrade');

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taskId: 'upgrade-task',
    title: 'Upgradeable Task',
    type: 'document',
    versions: 1,
    feedbackCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    filePath: 'upgrade-v1.html',
    kept: false,
    ...overrides,
  };
}

function legacyHtml(taskId: string, contentHtml: string): string {
  return `<!DOCTYPE html>
<html class="night">
<head>
  <meta charset="UTF-8">
  <script src="_history-data.js"></script>
</head>
<body>
  <aside id="sv-sidebar-items"></aside>
  <!-- SV:CONTENT_START -->${contentHtml}<!-- SV:CONTENT_END -->
  <script>
    window.__svHistory = [];
    window.__svTaskId = '${taskId}';
    window.__svFeedbackEnabled = true;
  </script>
</body>
</html>`;
}

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, '.superview', 'views'), { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe('view upgrade', () => {
  it('detects legacy task views that lack embedded history data', () => {
    expect(isLegacyViewHtml(legacyHtml('legacy-task', '<div>Legacy</div>'))).toBe(true);
    expect(
      isLegacyViewHtml('<script>window.__svEmbeddedHistoryData = {};</script><script>window.__svBasePath = "";</script><script>window.__svRuntimeVersion = 6;</script><div id="sv-sidebar-scope"></div><h1 id="sv-page-title"></h1>'),
    ).toBe(false);
    expect(
      isLegacyViewHtml('<script>window.__svEmbeddedHistoryData = {};</script><script>window.__svBasePath = "";</script><script>window.__svRuntimeVersion = 6;</script><div id="sv-sidebar-scope"></div><h1 id="sv-page-title"></h1><script>window.open(item.href, \'_blank\')</script>'),
    ).toBe(true);
  });

  it('upgrades legacy task views with full history payload and previous-version accordions', () => {
    const viewsDir = join(TEST_DIR, '.superview', 'views');
    const v1Path = join(viewsDir, 'upgrade-v1.html');
    const v2Path = join(viewsDir, 'upgrade-v2.html');

    writeFileSync(v1Path, legacyHtml('upgrade-task', '<div class="sv-block" data-block-id="v1-block-0"><p data-editable-target="true">Version one</p></div>'), 'utf-8');
    writeFileSync(v2Path, legacyHtml('upgrade-task', '<div class="sv-block" data-block-id="v2-block-0"><p data-editable-target="true">Version two revised</p></div>'), 'utf-8');

    appendHistory(TEST_DIR, makeEntry({
      versions: 1,
      filePath: 'upgrade-v1.html',
      updatedAt: '2026-03-23T10:00:00Z',
      createdAt: '2026-03-23T10:00:00Z',
    }));
    appendHistory(TEST_DIR, makeEntry({
      versions: 2,
      filePath: 'upgrade-v2.html',
      updatedAt: '2026-03-23T11:00:00Z',
      createdAt: '2026-03-23T11:00:00Z',
    }));

    const upgradedHtml = upgradeViewHtml(TEST_DIR, v2Path, readFileSync(v2Path, 'utf-8'));
    expect(upgradedHtml).toBeTruthy();
    expect(upgradedHtml).toContain('window.__svEmbeddedHistoryData');
    expect(upgradedHtml).toContain('id="sv-sidebar-scope"');
    expect(upgradedHtml).toContain('Previous versions');
    expect(upgradedHtml).toContain('data-version="1"');
  });

  it('rewrites legacy html files in place, including _latest.html', () => {
    const viewsDir = join(TEST_DIR, '.superview', 'views');
    const v1Path = join(viewsDir, 'upgrade-v1.html');
    const v2Path = join(viewsDir, 'upgrade-v2.html');
    const latestPath = join(viewsDir, '_latest.html');

    writeFileSync(v1Path, legacyHtml('upgrade-task', '<div class="sv-block" data-block-id="v1-block-0"><p data-editable-target="true">Version one</p></div>'), 'utf-8');
    writeFileSync(v2Path, legacyHtml('upgrade-task', '<div class="sv-block" data-block-id="v2-block-0"><p data-editable-target="true">Version two revised</p></div>'), 'utf-8');
    writeFileSync(latestPath, legacyHtml('upgrade-task', '<div class="sv-block" data-block-id="v2-block-0"><p data-editable-target="true">Version two revised</p></div>'), 'utf-8');

    appendHistory(TEST_DIR, makeEntry({
      versions: 1,
      filePath: 'upgrade-v1.html',
      updatedAt: '2026-03-23T10:00:00Z',
      createdAt: '2026-03-23T10:00:00Z',
    }));
    appendHistory(TEST_DIR, makeEntry({
      versions: 2,
      filePath: 'upgrade-v2.html',
      updatedAt: '2026-03-23T11:00:00Z',
      createdAt: '2026-03-23T11:00:00Z',
    }));

    const rewrittenCount = rewriteLegacyViews(TEST_DIR);
    expect(rewrittenCount).toBe(3);
    expect(readFileSync(v2Path, 'utf-8')).toContain('window.__svEmbeddedHistoryData');
    expect(readFileSync(latestPath, 'utf-8')).toContain('Previous versions');
  });

  it('rewrites saved task views with the renamed title', () => {
    const viewsDir = join(TEST_DIR, '.superview', 'views');
    const v1Path = join(viewsDir, 'rename-v1.html');

    writeFileSync(v1Path, legacyHtml('rename-task', '<div class="sv-block" data-block-id="v1-block-0"><p data-editable-target="true">Rename me</p></div>'), 'utf-8');

    appendHistory(TEST_DIR, makeEntry({
      taskId: 'rename-task',
      title: 'Original Title',
      versions: 1,
      filePath: 'rename-v1.html',
      updatedAt: '2026-03-23T10:00:00Z',
      createdAt: '2026-03-23T10:00:00Z',
    }));

    renameTask(TEST_DIR, 'rename-task', 'Renamed Title');
    const rewritten = rewriteTaskViews(TEST_DIR, 'rename-task');

    expect(rewritten).toBe(1);
    const updatedHtml = readFileSync(v1Path, 'utf-8');
    expect(updatedHtml).toContain('Renamed Title');
    expect(updatedHtml).not.toContain('Original Title');
  });
});
