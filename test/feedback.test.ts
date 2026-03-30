import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  readFeedback,
  addFeedbackItem,
  deleteFeedbackItem,
  getUnresolvedFeedback,
  getUnresolvedCommentCount,
  resolveFeedbackItem,
  summarizeFeedback,
} from '../src/core/feedback.js';
import { legacyFeedbackPath, writeReviewBundle } from '../src/core/review.js';
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

  it('prefers the freshest review bundle even when canonical and legacy files diverge', () => {
    mkdirSync(join(TEST_DIR, '.superview', 'feedback'), { recursive: true });

    writeReviewBundle(TEST_DIR, {
      reviewId: 'review-task-divergent',
      taskId: 'task-divergent',
      title: 'Canonical Title',
      basePath: TEST_DIR,
      currentVersion: 1,
      updatedAt: '2026-03-27T08:00:00.000Z',
      exportedAt: '2026-03-27T08:00:00.000Z',
      syncState: 'synced',
      reviewSchemaVersion: 1,
      items: [makeItem({ id: 'canonical-comment', text: 'Canonical review' })],
    });

    writeFileSync(legacyFeedbackPath(TEST_DIR, 'task-divergent'), JSON.stringify({
      reviewId: 'review-task-divergent-legacy',
      taskId: 'task-divergent',
      title: 'Legacy Title',
      basePath: TEST_DIR,
      currentVersion: 1,
      updatedAt: '2026-03-27T13:00:00.000Z',
      exportedAt: '2026-03-27T13:00:00.000Z',
      syncState: 'legacy',
      reviewSchemaVersion: 1,
      items: [makeItem({ id: 'legacy-comment', text: 'Legacy wins' })],
    }, null, 2), 'utf-8');

    const file = readFeedback(TEST_DIR, 'task-divergent');
    expect(file).not.toBeNull();
    expect(file!.title).toBe('Legacy Title');
    expect(file!.items[0].text).toBe('Legacy wins');
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

  it('deletes a feedback item', () => {
    addFeedbackItem(TEST_DIR, 'task-1', makeItem({ id: 'fb-delete-1', text: 'Keep' }));
    addFeedbackItem(TEST_DIR, 'task-1', makeItem({ id: 'fb-delete-2', text: 'Delete me' }));

    deleteFeedbackItem(TEST_DIR, 'task-1', 'fb-delete-2');

    const file = readFeedback(TEST_DIR, 'task-1');
    expect(file!.items).toHaveLength(1);
    expect(file!.items[0].id).toBe('fb-delete-1');
  });

  it('counts only unresolved comment feedback in totals', () => {
    addFeedbackItem(TEST_DIR, 'task-5', makeItem({ id: 'fb-open-comment', resolved: false }));
    addFeedbackItem(TEST_DIR, 'task-5', makeItem({ id: 'fb-resolved-comment', resolved: true }));
    addFeedbackItem(TEST_DIR, 'task-5', {
      type: 'general_notes',
      id: 'notes-general',
      blockId: 'general',
      version: 1,
      text: 'Page-level notes',
      createdAt: new Date().toISOString(),
      resolved: false,
    });
    addFeedbackItem(TEST_DIR, 'task-5', {
      type: 'content_edit',
      id: 'edit-block-1',
      blockId: 'block-1',
      version: 1,
      text: 'Edited copy',
      createdAt: new Date().toISOString(),
      resolved: false,
    });

    expect(getUnresolvedCommentCount(TEST_DIR, 'task-5')).toBe(1);
    expect(getUnresolvedFeedback(TEST_DIR, 'task-5')).toHaveLength(3);
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
