import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { appendHistory, buildHistoryPreview, readHistory } from '../src/core/history.js';
import { readFeedback } from '../src/core/feedback.js';
import { render } from '../src/core/renderer.js';
import { startServer } from '../src/core/server.js';
import { legacyFeedbackPath, readReviewBundle, writeReviewBundle } from '../src/core/review.js';
import { readTaskContent, upsertTaskContentManifest } from '../src/core/task-content.js';
import type { FeedbackItem, HistoryEntry } from '../src/types.js';

let TEST_DIR = '';

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taskId: 'task-save',
    title: 'Save test',
    type: 'generic',
    versions: 1,
    feedbackCount: 0,
    createdAt: '2026-03-27T10:00:00Z',
    updatedAt: '2026-03-27T10:00:00Z',
    filePath: 'task-save-v1.html',
    kept: false,
    preview: 'Original body',
    ...overrides,
  };
}

function makeFeedbackItem(overrides: Partial<FeedbackItem> = {}): FeedbackItem {
  return {
    type: 'block_comment',
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    blockId: 'v1-block-0',
    version: 1,
    text: 'Review comment',
    createdAt: '2026-03-27T08:00:00Z',
    resolved: false,
    ...overrides,
  };
}

beforeEach(() => {
  TEST_DIR = mkdtempSync(join(tmpdir(), 'superview-server-'));
  mkdirSync(join(TEST_DIR, '.superview', 'views'), { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe('server save-content', () => {
  it('writes canonical content, feedback, history preview, and rewritten task html', async () => {
    const content = 'Original body';
    const html = await render(content, {
      type: 'generic',
      title: 'Save test',
      taskId: 'task-save',
      version: 1,
      basePath: TEST_DIR,
    });
    writeFileSync(join(TEST_DIR, '.superview', 'views', 'task-save-v1.html'), html, 'utf-8');
    writeFileSync(join(TEST_DIR, '.superview', 'views', '_latest.html'), html, 'utf-8');

    appendHistory(TEST_DIR, makeEntry());
    upsertTaskContentManifest(TEST_DIR, 'task-save', content, {
      type: 'generic',
      title: 'Save test',
      metadata: {},
      currentVersion: 1,
      latestViewFile: 'task-save-v1.html',
      updatedAt: '2026-03-27T10:00:00Z',
    });

    const server = startServer(TEST_DIR, 0);
    const port = (server.address() as AddressInfo).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/save-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: 'task-save',
          blockId: 'v1-block-0',
          version: 1,
          newText: 'Updated body copy',
          basePath: TEST_DIR,
          clientId: 'test-client',
        }),
      });

      expect(response.status).toBe(200);
      const payload = await response.json() as { ok: boolean; savedText: string; rewrittenViews: number };
      expect(payload.ok).toBe(true);
      expect(payload.savedText).toBe('Updated body copy');
      expect(payload.rewrittenViews).toBeGreaterThanOrEqual(1);

      expect(readTaskContent(TEST_DIR, 'task-save')).toBe('Updated body copy');

      const feedback = readFeedback(TEST_DIR, 'task-save');
      expect(feedback?.items.some((item) => item.type === 'content_edit' && item.text === 'Updated body copy')).toBe(true);
      expect(readReviewBundle(TEST_DIR, 'task-save')?.items.some((item) => item.type === 'content_edit' && item.text === 'Updated body copy')).toBe(true);

      const history = readHistory(TEST_DIR);
      expect(history[0].preview).toBe(buildHistoryPreview('Updated body copy'));

      const rewrittenHtml = readFileSync(join(TEST_DIR, '.superview', 'views', 'task-save-v1.html'), 'utf-8');
      expect(rewrittenHtml).toContain('Updated body copy');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it('writes review bundles when feedback is added through the server', async () => {
    const content = 'Original body';
    const html = await render(content, {
      type: 'generic',
      title: 'Feedback test',
      taskId: 'task-feedback-route',
      version: 1,
      basePath: TEST_DIR,
    });
    writeFileSync(join(TEST_DIR, '.superview', 'views', 'task-feedback-route-v1.html'), html, 'utf-8');
    writeFileSync(join(TEST_DIR, '.superview', 'views', '_latest.html'), html, 'utf-8');

    appendHistory(TEST_DIR, makeEntry({
      taskId: 'task-feedback-route',
      title: 'Feedback test',
      filePath: 'task-feedback-route-v1.html',
      preview: buildHistoryPreview(content),
    }));
    upsertTaskContentManifest(TEST_DIR, 'task-feedback-route', content, {
      type: 'generic',
      title: 'Feedback test',
      metadata: {},
      currentVersion: 1,
      latestViewFile: 'task-feedback-route-v1.html',
      updatedAt: '2026-03-27T10:00:00Z',
    });

    const server = startServer(TEST_DIR, 0);
    const port = (server.address() as AddressInfo).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: 'task-feedback-route',
          item: {
            type: 'block_comment',
            id: 'fb-route-1',
            blockId: 'v1-block-0',
            version: 1,
            text: 'Route comment',
            createdAt: '2026-03-27T10:01:00Z',
            resolved: false,
          },
          basePath: TEST_DIR,
        }),
      });

      expect(response.status).toBe(200);
      expect(readReviewBundle(TEST_DIR, 'task-feedback-route')?.items.some((item) => item.id === 'fb-route-1')).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it('serves canonical review bundles through inbox and feedback compatibility routes', async () => {
    upsertTaskContentManifest(TEST_DIR, 'task-old', 'Old canonical content', {
      type: 'generic',
      title: 'Old Review',
      metadata: { title: 'Old Review' },
      currentVersion: 1,
      updatedAt: '2026-03-27T08:00:00.000Z',
      sourcePath: join(TEST_DIR, 'old.md'),
      sourceKind: 'markdown',
    });
    upsertTaskContentManifest(TEST_DIR, 'task-new', 'New canonical content', {
      type: 'generic',
      title: 'New Review',
      metadata: { title: 'New Review' },
      currentVersion: 1,
      updatedAt: '2026-03-27T12:00:00.000Z',
      sourcePath: join(TEST_DIR, 'new.md'),
      sourceKind: 'markdown',
    });
    writeReviewBundle(TEST_DIR, {
      reviewId: 'review-task-old',
      taskId: 'task-old',
      title: 'Old Review',
      basePath: TEST_DIR,
      currentVersion: 1,
      updatedAt: '2026-03-27T08:00:00.000Z',
      exportedAt: '2026-03-27T08:00:00.000Z',
      syncState: 'synced',
      reviewSchemaVersion: 1,
      items: [makeFeedbackItem({ id: 'fb-old', text: 'Old review comment' })],
    });
    writeReviewBundle(TEST_DIR, {
      reviewId: 'review-task-new',
      taskId: 'task-new',
      title: 'New Review',
      basePath: TEST_DIR,
      currentVersion: 1,
      updatedAt: '2026-03-27T12:00:00.000Z',
      exportedAt: '2026-03-27T12:00:00.000Z',
      syncState: 'synced',
      reviewSchemaVersion: 1,
      items: [makeFeedbackItem({ id: 'fb-new', text: 'New review comment' })],
    });

    const server = startServer(TEST_DIR, 0);
    const port = (server.address() as AddressInfo).port;

    try {
      const latestResponse = await fetch(`http://127.0.0.1:${port}/feedback/latest`);
      expect(latestResponse.status).toBe(200);
      const latest = await latestResponse.json() as { taskId: string; content: string };
      expect(latest.taskId).toBe('task-new');
      expect(latest.content).toBe('New canonical content');

      const feedbackResponse = await fetch(`http://127.0.0.1:${port}/feedback/task-old`);
      expect(feedbackResponse.status).toBe(200);
      const feedback = await feedbackResponse.json() as { taskId: string; title: string; content: string; sourceKind: string };
      expect(feedback.taskId).toBe('task-old');
      expect(feedback.title).toBe('Old Review');
      expect(feedback.content).toBe('Old canonical content');
      expect(feedback.sourceKind).toBe('markdown');

      const inboxResponse = await fetch(`http://127.0.0.1:${port}/inbox/task-old.json`);
      expect(inboxResponse.status).toBe(200);
      const inbox = await inboxResponse.json() as { taskId: string; title: string };
      expect(inbox.taskId).toBe('task-old');
      expect(inbox.title).toBe('Old Review');

      const reviewResponse = await fetch(`http://127.0.0.1:${port}/review/task-old`);
      expect(reviewResponse.status).toBe(200);
      const review = await reviewResponse.json() as { taskId: string; title: string };
      expect(review.taskId).toBe('task-old');
      expect(review.title).toBe('Old Review');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it('prefers fresher legacy review bundles in compatibility routes while still reading canonical content', async () => {
    upsertTaskContentManifest(TEST_DIR, 'task-legacy-route', 'Legacy route canonical content', {
      type: 'generic',
      title: 'Legacy Route',
      metadata: { title: 'Legacy Route' },
      currentVersion: 1,
      updatedAt: '2026-03-27T09:00:00.000Z',
      sourcePath: join(TEST_DIR, 'legacy-route.md'),
      sourceKind: 'markdown',
    });
    upsertTaskContentManifest(TEST_DIR, 'task-canonical-route', 'Canonical route content', {
      type: 'generic',
      title: 'Canonical Route',
      metadata: { title: 'Canonical Route' },
      currentVersion: 1,
      updatedAt: '2026-03-27T12:00:00.000Z',
      sourcePath: join(TEST_DIR, 'canonical-route.md'),
      sourceKind: 'markdown',
    });
    writeReviewBundle(TEST_DIR, {
      reviewId: 'review-task-legacy-route',
      taskId: 'task-legacy-route',
      title: 'Legacy Review',
      basePath: TEST_DIR,
      currentVersion: 1,
      updatedAt: '2026-03-27T09:00:00.000Z',
      exportedAt: '2026-03-27T09:00:00.000Z',
      syncState: 'synced',
      reviewSchemaVersion: 1,
      items: [makeFeedbackItem({ id: 'legacy-route-comment', text: 'Canonical bundle is stale' })],
    });
    writeReviewBundle(TEST_DIR, {
      reviewId: 'review-task-canonical-route',
      taskId: 'task-canonical-route',
      title: 'Canonical Review',
      basePath: TEST_DIR,
      currentVersion: 1,
      updatedAt: '2026-03-27T12:00:00.000Z',
      exportedAt: '2026-03-27T12:00:00.000Z',
      syncState: 'synced',
      reviewSchemaVersion: 1,
      items: [makeFeedbackItem({ id: 'canonical-route-comment', text: 'Later canonical bundle' })],
    });
    writeFileSync(legacyFeedbackPath(TEST_DIR, 'task-legacy-route'), JSON.stringify({
      reviewId: 'review-task-legacy-route-legacy',
      taskId: 'task-legacy-route',
      title: 'Legacy Review',
      basePath: TEST_DIR,
      currentVersion: 1,
      updatedAt: '2026-03-27T13:00:00.000Z',
      exportedAt: '2026-03-27T13:00:00.000Z',
      syncState: 'legacy',
      reviewSchemaVersion: 1,
      items: [makeFeedbackItem({ id: 'legacy-route-comment-new', text: 'Legacy bundle wins' })],
    }, null, 2), 'utf-8');

    const server = startServer(TEST_DIR, 0);
    const port = (server.address() as AddressInfo).port;

    try {
      const latestResponse = await fetch(`http://127.0.0.1:${port}/feedback/latest`);
      expect(latestResponse.status).toBe(200);
      const latest = await latestResponse.json() as {
        taskId: string;
        title: string;
        content: string;
        contentSource: string;
        contentPath: string;
      };
      expect(latest.taskId).toBe('task-legacy-route');
      expect(latest.title).toBe('Legacy Review');
      expect(latest.content).toBe('Legacy route canonical content');
      expect(latest.contentSource).toBe('superview-canonical');
      expect(latest.contentPath).toContain('.superview/content/task-legacy-route.txt');

      const reviewResponse = await fetch(`http://127.0.0.1:${port}/review/task-legacy-route`);
      expect(reviewResponse.status).toBe(200);
      const review = await reviewResponse.json() as { taskId: string; title: string; content: string };
      expect(review.taskId).toBe('task-legacy-route');
      expect(review.title).toBe('Legacy Review');
      expect(review.content).toBe('Legacy route canonical content');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it('maps document edits to the first visible block instead of the suppressed title heading', async () => {
    const content = '# Save test\n\nFirst paragraph.\n\nSecond paragraph.';
    const html = await render(content, {
      type: 'document',
      title: 'Save test',
      taskId: 'task-save-doc',
      version: 1,
      basePath: TEST_DIR,
    });
    writeFileSync(join(TEST_DIR, '.superview', 'views', 'task-save-doc-v1.html'), html, 'utf-8');
    writeFileSync(join(TEST_DIR, '.superview', 'views', '_latest.html'), html, 'utf-8');

    appendHistory(TEST_DIR, makeEntry({
      taskId: 'task-save-doc',
      title: 'Save test',
      type: 'document',
      filePath: 'task-save-doc-v1.html',
      preview: buildHistoryPreview(content),
    }));
    upsertTaskContentManifest(TEST_DIR, 'task-save-doc', content, {
      type: 'document',
      title: 'Save test',
      metadata: {},
      currentVersion: 1,
      latestViewFile: 'task-save-doc-v1.html',
      updatedAt: '2026-03-27T10:00:00Z',
    });

    const server = startServer(TEST_DIR, 0);
    const port = (server.address() as AddressInfo).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/save-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: 'task-save-doc',
          blockId: 'v1-block-0',
          version: 1,
          newText: 'Updated first paragraph.',
          basePath: TEST_DIR,
          clientId: 'test-client',
        }),
      });

      expect(response.status).toBe(200);
      expect(readTaskContent(TEST_DIR, 'task-save-doc')).toBe(
        '# Save test\n\nUpdated first paragraph.\n\nSecond paragraph.',
      );

      const rewrittenHtml = readFileSync(join(TEST_DIR, '.superview', 'views', 'task-save-doc-v1.html'), 'utf-8');
      expect(rewrittenHtml).toContain('Updated first paragraph.');
      expect(rewrittenHtml).not.toContain('<h1>Updated first paragraph.</h1>');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it('rejects saving blocks that cannot be mapped back safely', async () => {
    const content = '## Variant A\n\nFirst.\n\n---\n\n## RECOMMENDED\n\nSecond.';
    appendHistory(TEST_DIR, makeEntry({
      taskId: 'task-tweet',
      title: 'Tweet variations',
      type: 'tweet',
      filePath: 'task-tweet-v1.html',
      preview: buildHistoryPreview(content),
    }));
    upsertTaskContentManifest(TEST_DIR, 'task-tweet', content, {
      type: 'tweet',
      title: 'Tweet variations',
      metadata: {},
      currentVersion: 1,
      latestViewFile: 'task-tweet-v1.html',
    });

    const server = startServer(TEST_DIR, 0);
    const port = (server.address() as AddressInfo).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/save-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: 'task-tweet',
          blockId: 'v1-var-0-block-0',
          version: 1,
          newText: 'Changed',
          basePath: TEST_DIR,
          clientId: 'test-client',
        }),
      });

      expect(response.status).toBe(409);
      const payload = await response.json() as { error: string };
      expect(payload.error).toContain('editable');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
