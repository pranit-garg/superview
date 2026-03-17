import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { appendHistory, readHistory, searchHistory, getHistoryForTask } from '../src/core/history.js';
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
});
