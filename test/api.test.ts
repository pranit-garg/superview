import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeAndOpen } from '../src/index.js';
import { readHistory } from '../src/core/history.js';

let TEST_DIR = '';

beforeEach(() => {
  TEST_DIR = mkdtempSync(join(tmpdir(), 'superview-api-'));
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe('programmatic api', () => {
  it('writes history and artifacts under the provided basePath', async () => {
    const outPath = await writeAndOpen('API content', {
      title: 'API Test',
      type: 'generic',
      basePath: TEST_DIR,
      noOpen: true,
      open: false,
    });

    const history = readHistory(TEST_DIR);
    expect(history).toHaveLength(1);
    expect(history[0].title).toBe('API Test');
    expect(history[0].filePath).toBe(outPath.split(/[\\/]/).pop());
    const manifestPath = join(TEST_DIR, '.superview', 'content', `${history[0].taskId}.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.taskId).toBe(history[0].taskId);
    expect(manifest.title).toBe('API Test');
    expect(manifest.currentVersion).toBe(1);
  });

  it('writes full render history to _history-data.js instead of latest task snapshots only', async () => {
    await writeAndOpen('First version', {
      title: 'Versioned API Test',
      type: 'generic',
      taskId: 'api-task-history',
      basePath: TEST_DIR,
      noOpen: true,
      open: false,
    });
    await writeAndOpen('Second version', {
      title: 'Versioned API Test',
      type: 'generic',
      taskId: 'api-task-history',
      basePath: TEST_DIR,
      noOpen: true,
      open: false,
    });

    const js = readFileSync(join(TEST_DIR, '.superview', 'views', '_history-data.js'), 'utf-8');
    expect(js).toContain('window.__svHistoryData');
    expect(js).toContain('"formatVersion":2');
    expect(js).toContain('"localHistory"');
    expect(js).toContain('"workspaceHistory"');
    expect((js.match(/"taskId":"api-task-history"/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
