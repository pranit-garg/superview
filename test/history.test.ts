import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  appendHistory,
  getHistoryDataPayload,
  groupHistoryByTask,
  renameTask,
  readHistory,
  renderHistoryDataScript,
  searchHistory,
  getHistoryForTask,
} from '../src/core/history.js';
import { addFeedbackItem } from '../src/core/feedback.js';
import type { HistoryEntry } from '../src/types.js';

const TEST_DIR = join(process.cwd(), '.test-superview-history');

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    taskId: 'task-1',
    title: 'Test Entry',
    type: 'generic',
    versions: 1,
    feedbackCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    filePath: '/tmp/test.html',
    kept: false,
    ...overrides,
  };
}

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe('history', () => {
  it('appends and reads entries', () => {
    const entry1 = makeEntry({ title: 'First' });
    const entry2 = makeEntry({ title: 'Second' });

    appendHistory(TEST_DIR, entry1);
    appendHistory(TEST_DIR, entry2);

    const history = readHistory(TEST_DIR);
    expect(history.length).toBe(2);
    expect(history.map(h => h.title)).toContain('First');
    expect(history.map(h => h.title)).toContain('Second');
  });

  it('returns empty array when no history', () => {
    const history = readHistory(TEST_DIR);
    expect(history).toEqual([]);
  });

  it('sorts by updatedAt descending', () => {
    const old = makeEntry({ title: 'Old', updatedAt: '2025-01-01T00:00:00Z' });
    const recent = makeEntry({ title: 'Recent', updatedAt: '2026-01-01T00:00:00Z' });

    appendHistory(TEST_DIR, old);
    appendHistory(TEST_DIR, recent);

    const history = readHistory(TEST_DIR);
    expect(history[0].title).toBe('Recent');
    expect(history[1].title).toBe('Old');
  });

  it('searches by title', () => {
    appendHistory(TEST_DIR, makeEntry({ title: 'Email Draft' }));
    appendHistory(TEST_DIR, makeEntry({ title: 'Tweet Copy' }));

    const results = searchHistory(TEST_DIR, 'email');
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Email Draft');
  });

  it('filters by taskId', () => {
    appendHistory(TEST_DIR, makeEntry({ taskId: 'task-a', title: 'A' }));
    appendHistory(TEST_DIR, makeEntry({ taskId: 'task-b', title: 'B' }));

    const results = getHistoryForTask(TEST_DIR, 'task-a');
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('A');
  });

  it('recomputes feedback counts from persisted feedback', () => {
    appendHistory(TEST_DIR, makeEntry({ taskId: 'task-feedback', title: 'Needs review', feedbackCount: 0 }));
    addFeedbackItem(TEST_DIR, 'task-feedback', {
      type: 'block_comment',
      id: 'fb-1',
      blockId: 'block-1',
      version: 1,
      text: 'Open comment',
      createdAt: new Date().toISOString(),
      resolved: false,
    });
    addFeedbackItem(TEST_DIR, 'task-feedback', {
      type: 'general_notes',
      id: 'notes-general',
      blockId: 'general',
      version: 1,
      text: 'Notes do not count',
      createdAt: new Date().toISOString(),
      resolved: false,
    });

    const history = readHistory(TEST_DIR);
    expect(history[0].feedbackCount).toBe(1);
  });

  it('groups history by task while keeping versions newest first', () => {
    const firstVersion = makeEntry({
      taskId: 'task-grouped',
      title: 'Grouped Task',
      versions: 1,
      updatedAt: '2026-03-23T10:00:00Z',
    });
    const secondVersion = makeEntry({
      taskId: 'task-grouped',
      title: 'Grouped Task',
      versions: 2,
      updatedAt: '2026-03-23T11:00:00Z',
    });
    const otherTask = makeEntry({
      taskId: 'task-other',
      title: 'Other Task',
      versions: 1,
      updatedAt: '2026-03-23T12:00:00Z',
    });

    const history = [otherTask, secondVersion, firstVersion];
    const groups = groupHistoryByTask(history);

    expect(groups).toHaveLength(2);
    expect(groups[0].taskId).toBe('task-other');
    expect(groups[1].taskId).toBe('task-grouped');
    expect(groups[1].entries.map((entry) => entry.versions)).toEqual([2, 1]);
    expect(groups[1].latestEntry.versions).toBe(2);
  });

  it('builds structured history payloads with workspace and compatibility data', () => {
    const workspaceRoot = join(TEST_DIR, 'workspace');
    const currentBase = join(workspaceRoot, 'Project A');
    const siblingBase = join(workspaceRoot, 'Project B');

    mkdirSync(join(workspaceRoot, 'CONTEXT'), { recursive: true });
    mkdirSync(currentBase, { recursive: true });
    mkdirSync(siblingBase, { recursive: true });
    writeFileSync(join(workspaceRoot, 'AGENTS.md'), '# workspace', 'utf-8');
    writeFileSync(join(workspaceRoot, 'CONTEXT', 'current.md'), 'current', 'utf-8');

    appendHistory(currentBase, makeEntry({ taskId: 'task-a', title: 'Project A task', filePath: 'task-a.html' }));
    appendHistory(siblingBase, makeEntry({ taskId: 'task-b', title: 'Project B task', filePath: 'task-b.html' }));

    const payload = getHistoryDataPayload(currentBase);
    expect(payload.formatVersion).toBe(2);
    expect(payload.basePath).toBe(currentBase);
    expect(payload.workspaceRoot).toBe(workspaceRoot);
    expect(payload.localHistory).toHaveLength(1);
    expect(payload.workspaceHistory).toHaveLength(2);
    expect(payload.workspaceHistory.some((entry) => entry.sourceLabel === 'Project B')).toBe(true);

    const script = renderHistoryDataScript(currentBase);
    expect(script).toContain('window.__svHistoryData');
    expect(script).toContain('window.__svHistory = window.__svHistoryData.workspaceHistory;');
  });

  it('dedupes repeated renders of the same task version in grouped history', () => {
    const duplicateOlder = makeEntry({
      taskId: 'task-dedupe',
      title: 'Task Dedupe',
      versions: 1,
      updatedAt: '2026-03-23T10:00:00Z',
      filePath: 'task-dedupe-old.html',
    });
    const duplicateNewer = makeEntry({
      taskId: 'task-dedupe',
      title: 'Task Dedupe',
      versions: 1,
      updatedAt: '2026-03-23T11:00:00Z',
      filePath: 'task-dedupe-new.html',
    });
    const versionTwo = makeEntry({
      taskId: 'task-dedupe',
      title: 'Task Dedupe',
      versions: 2,
      updatedAt: '2026-03-23T12:00:00Z',
      filePath: 'task-dedupe-v2.html',
    });

    const groups = groupHistoryByTask([duplicateOlder, duplicateNewer, versionTwo]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[0].entries.map((entry) => entry.filePath)).toEqual([
      'task-dedupe-v2.html',
      'task-dedupe-new.html',
    ]);
  });

  it('renames all history entries for a task', () => {
    appendHistory(TEST_DIR, makeEntry({ taskId: 'task-rename', title: 'Old Title', versions: 1 }));
    appendHistory(TEST_DIR, makeEntry({ taskId: 'task-rename', title: 'Old Title', versions: 2 }));
    appendHistory(TEST_DIR, makeEntry({ taskId: 'task-other', title: 'Other Title', versions: 1 }));

    const renamedCount = renameTask(TEST_DIR, 'task-rename', 'New Intuitive Title');
    const history = readHistory(TEST_DIR);

    expect(renamedCount).toBe(2);
    expect(history.filter((entry) => entry.taskId === 'task-rename').every((entry) => entry.title === 'New Intuitive Title')).toBe(true);
    expect(history.find((entry) => entry.taskId === 'task-other')?.title).toBe('Other Title');
  });
});
