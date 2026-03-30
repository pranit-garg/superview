import { describe, expect, it } from 'vitest';
import type { FeedbackItem, TaskContentManifest } from '../src/types.js';
import {
  applyCanonicalContentEdit,
  applyLegacyContentEdits,
  ContentSaveError,
} from '../src/core/editable-content.js';

function makeManifest(overrides: Partial<TaskContentManifest> = {}): TaskContentManifest {
  return {
    taskId: 'task-1',
    type: 'document',
    title: 'Test Doc',
    metadata: {},
    basePath: '/tmp/superview',
    currentVersion: 1,
    latestViewFile: 'task-1.html',
    updatedAt: '2026-03-26T00:00:00.000Z',
    contentSchemaVersion: 1,
    ...overrides,
  };
}

describe('editable content', () => {
  it('updates the first visible document paragraph instead of the suppressed title heading', () => {
    const manifest = makeManifest({ type: 'document', title: 'Test Doc' });
    const content = '# Test Doc\n\nFirst paragraph.\n\nSecond paragraph.';

    const result = applyCanonicalContentEdit(
      manifest,
      content,
      'v1-block-0',
      'Updated first paragraph.',
    );

    expect(result.content).toBe('# Test Doc\n\nUpdated first paragraph.\n\nSecond paragraph.');
    expect(result.savedText).toBe('Updated first paragraph.');
  });

  it('updates message section bodies using section-scoped block ids', () => {
    const manifest = makeManifest({
      type: 'message',
      title: 'Kim message',
    });
    const content = '# Telegram to Kim — Final\n\nHey Kim,\n\n---\n\n# Sequencing\n\n1. Send Telegram\n2. Follow up';

    const result = applyCanonicalContentEdit(
      manifest,
      content,
      'v1-section-0-block-0',
      'Hey Kim,\n\nWanted to follow up here.',
    );

    expect(result.content).toContain('# Telegram to Kim — Final');
    expect(result.content).toContain('Hey Kim,\n\nWanted to follow up here.');
    expect(result.content).toContain('# Sequencing');
  });

  it('materializes legacy content_edit feedback into canonical content', () => {
    const manifest = makeManifest({ type: 'document', title: 'Test Doc' });
    const feedbackItems: FeedbackItem[] = [
      {
        type: 'content_edit',
        id: 'edit-1',
        blockId: 'v1-block-0',
        version: 1,
        text: 'Updated first paragraph.',
        createdAt: '2026-03-26T01:00:00.000Z',
        resolved: false,
      },
    ];

    const nextContent = applyLegacyContentEdits(
      manifest,
      '# Test Doc\n\nFirst paragraph.\n\nSecond paragraph.',
      feedbackItems,
    );

    expect(nextContent).toBe('# Test Doc\n\nUpdated first paragraph.\n\nSecond paragraph.');
  });

  it('rejects inline tweet variation saves', () => {
    const manifest = makeManifest({ type: 'tweet', title: 'Variation tweet' });
    const content = '## Variant A\n\nHello world\n---\n## RECOMMENDED Variant B\n\nBetter world';

    expect(() => applyCanonicalContentEdit(
      manifest,
      content,
      'v1-var-0-block-0',
      'Edited tweet',
    )).toThrow(ContentSaveError);
  });
});
