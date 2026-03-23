import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  readFeedback,
  addFeedbackItem,
  getUnresolvedFeedback,
  resolveFeedbackItem,
  summarizeFeedback,
} from '../src/core/feedback.js';
import type { FeedbackItem } from '../src/types.js';

const TEST_DIR = join(process.cwd(), '.test-superview-feedback');

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

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe('feedback', () => {
  it('returns null for non-existent feedback', () => {
    expect(readFeedback(TEST_DIR, 'nonexistent')).toBeNull();
  });

  it('adds and reads feedback items', () => {
    const item = makeItem();
    addFeedbackItem(TEST_DIR, 'task-1', item);

    const file = readFeedback(TEST_DIR, 'task-1');
    expect(file).not.toBeNull();
    expect(file!.taskId).toBe('task-1');
    expect(file!.items.length).toBe(1);
    expect(file!.items[0].text).toBe('Test comment');
  });

  it('appends multiple items', () => {
    addFeedbackItem(TEST_DIR, 'task-1', makeItem({ text: 'First' }));
    addFeedbackItem(TEST_DIR, 'task-1', makeItem({ text: 'Second' }));

    const file = readFeedback(TEST_DIR, 'task-1');
    expect(file!.items.length).toBe(2);
  });

  it('gets unresolved feedback', () => {
    addFeedbackItem(TEST_DIR, 'task-1', makeItem({ text: 'Open', resolved: false }));
    addFeedbackItem(TEST_DIR, 'task-1', makeItem({ text: 'Done', resolved: true }));

    const unresolved = getUnresolvedFeedback(TEST_DIR, 'task-1');
    expect(unresolved.length).toBe(1);
    expect(unresolved[0].text).toBe('Open');
  });

  it('resolves a feedback item', () => {
    const item = makeItem({ id: 'fb-resolve-test' });
    addFeedbackItem(TEST_DIR, 'task-1', item);

    resolveFeedbackItem(TEST_DIR, 'task-1', 'fb-resolve-test');

    const file = readFeedback(TEST_DIR, 'task-1');
    expect(file!.items[0].resolved).toBe(true);
  });

  // v0.2 summarizeFeedback tests
  it('summarizeFeedback returns no-feedback message for missing task', () => {
    const result = summarizeFeedback(TEST_DIR, 'nonexistent');
    expect(result).toContain('No feedback found');
  });

  it('summarizeFeedback formats unresolved comments', () => {
    addFeedbackItem(TEST_DIR, 'task-2', makeItem({ blockId: 'block-1', text: 'Needs more detail' }));
    addFeedbackItem(TEST_DIR, 'task-2', makeItem({ blockId: 'block-2', text: 'Good opening', resolved: true }));

    const result = summarizeFeedback(TEST_DIR, 'task-2');
    expect(result).toContain('UNRESOLVED:');
    expect(result).toContain('Needs more detail');
    expect(result).toContain('RESOLVED:');
    expect(result).toContain('Good opening');
    expect(result).toContain('2 comments');
  });

  it('summarizeFeedback counts all comments', () => {
    addFeedbackItem(TEST_DIR, 'task-3', makeItem({ blockId: 'block-1', text: 'First comment' }));
    addFeedbackItem(TEST_DIR, 'task-3', makeItem({ blockId: 'block-2', text: 'Second comment' }));

    const result = summarizeFeedback(TEST_DIR, 'task-3');
    expect(result).toContain('2 comments');
    expect(result).toContain('First comment');
    expect(result).toContain('Second comment');
  });

  it('summarizeFeedback includes text selection anchor', () => {
    addFeedbackItem(TEST_DIR, 'task-4', makeItem({
      type: 'text_selection',
      blockId: 'block-5',
      text: 'Simplify this',
      anchor: { blockId: 'block-5', prefix: '', selectedText: 'complex technical', suffix: '', startOffset: 0, endOffset: 17 },
    }));

    const result = summarizeFeedback(TEST_DIR, 'task-4');
    expect(result).toContain('complex technical');
    expect(result).toContain('Simplify this');
  });
});
