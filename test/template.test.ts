import { describe, it, expect } from 'vitest';
import { buildHtml, buildTodayPage } from '../src/core/template.js';
import type { FeedbackItem, HistoryDataPayload, HistoryEntry } from '../src/types.js';

function makeHistoryEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: `h-${Math.random().toString(36).slice(2, 8)}`,
    taskId: 'task-1',
    title: 'Test Entry',
    type: 'generic',
    versions: 1,
    feedbackCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    filePath: 'test-entry.html',
    kept: false,
    ...overrides,
  };
}

function makeHistoryDataPayload(): HistoryDataPayload {
  return {
    formatVersion: 2,
    basePath: '/workspace/project-a',
    workspaceRoot: '/workspace',
    localHistory: [
      {
        ...makeHistoryEntry({ taskId: 'task-a', title: 'Local task', filePath: 'local-task.html' }),
        groupId: '/workspace/project-a::task-a',
        basePath: '/workspace/project-a',
        sourceLabel: 'project-a',
        relativeViewPath: 'local-task.html',
        viewPath: '/workspace/project-a/.superview/views/local-task.html',
      },
    ],
    workspaceHistory: [
      {
        ...makeHistoryEntry({ taskId: 'task-a', title: 'Local task', filePath: 'local-task.html' }),
        groupId: '/workspace/project-a::task-a',
        basePath: '/workspace/project-a',
        sourceLabel: 'project-a',
        relativeViewPath: 'local-task.html',
        viewPath: '/workspace/project-a/.superview/views/local-task.html',
      },
      {
        ...makeHistoryEntry({ taskId: 'task-b', title: 'Workspace task', filePath: 'workspace-task.html' }),
        groupId: '/workspace/project-b::task-b',
        basePath: '/workspace/project-b',
        sourceLabel: 'project-b',
        relativeViewPath: 'workspace-task.html',
        viewPath: '/workspace/project-b/.superview/views/workspace-task.html',
      },
    ],
  };
}

describe('template', () => {
  it('keeps sidebar entries with the same title when task IDs differ', () => {
    const html = buildHtml({
      title: 'Sidebar test',
      theme: 'auto',
      contentHtml: '<div>Body</div>',
      typeLabel: 'Article',
      taskId: 'current-task',
      history: [
        makeHistoryEntry({ taskId: 'task-a', title: 'Same title', filePath: 'task-a.html' }),
        makeHistoryEntry({ taskId: 'task-b', title: 'Same title', filePath: 'task-b.html' }),
      ],
    });

    expect(html).toContain('href="task-a.html"');
    expect(html).toContain('href="task-b.html"');
  });

  it('renders one sidebar task group with nested iterations for repeated task renders', () => {
    const html = buildHtml({
      title: 'Grouped sidebar',
      theme: 'auto',
      contentHtml: '<div>Body</div>',
      typeLabel: 'Article',
      taskId: 'task-a',
      versions: [
        { version: 1, content: '<div>v1</div>', renderedAt: new Date().toISOString(), feedbackCount: 0 },
        { version: 2, content: '<div>v2</div>', renderedAt: new Date().toISOString(), feedbackCount: 0 },
      ],
      history: [
        makeHistoryEntry({ taskId: 'task-a', title: 'Grouped task', versions: 2, filePath: 'task-a-v2.html' }),
        makeHistoryEntry({ taskId: 'task-a', title: 'Grouped task', versions: 1, filePath: 'task-a-v1.html', updatedAt: '2026-03-23T10:00:00Z' }),
        makeHistoryEntry({ taskId: 'task-b', title: 'Other task', versions: 1, filePath: 'task-b-v1.html' }),
      ],
    });

    expect(html).toContain('sv-sidebar-task-group');
    expect(html).toContain('sv-sidebar-task-children');
    expect(html).toContain('task-a-v2.html');
    expect(html).toContain('task-a-v1.html');
    expect(html).toContain('>v1<');
    expect(html).not.toContain('sv-sidebar-subitem-label">v2<');
  });

  it('does not reserve a hidden sidebar toggle for single-version tasks', () => {
    const html = buildHtml({
      title: 'Single sidebar item',
      theme: 'auto',
      contentHtml: '<div>Body</div>',
      typeLabel: 'Article',
      taskId: 'task-a',
      history: [
        makeHistoryEntry({ taskId: 'task-a', title: 'Task A', versions: 1, filePath: 'task-a-v1.html' }),
      ],
    });

    expect(html).not.toContain('sv-sidebar-task-toggle hidden');
  });

  it('embeds structured history data and renders the scope toggle mount point', () => {
    const html = buildHtml({
      title: 'Workspace history',
      theme: 'auto',
      contentHtml: '<div>Body</div>',
      typeLabel: 'Article',
      taskId: 'task-a',
      basePath: '/workspace/project-a',
      historyData: makeHistoryDataPayload(),
      history: [
        makeHistoryEntry({ taskId: 'task-a', title: 'Local task', filePath: 'local-task.html' }),
      ],
    });

    expect(html).toContain('id="sv-sidebar-scope"');
    expect(html).toContain('window.__svEmbeddedHistoryData');
    expect(html).toContain('_history-data.js?base=%2Fworkspace%2Fproject-a');
  });

  it('remembers the last localhost server origin for direct file-open editing', () => {
    const html = buildHtml({
      title: 'Workspace history',
      theme: 'auto',
      contentHtml: '<div>Body</div>',
      typeLabel: 'Article',
      taskId: 'task-a',
      history: [
        makeHistoryEntry({ taskId: 'task-a', title: 'Task A', filePath: 'task-a.html' }),
      ],
    });

    expect(html).toContain("localStorage.setItem('sv:lastServerBase', location.origin)");
    expect(html).toContain("localStorage.getItem('sv:lastServerBase') || defaultServerBase");
    expect(html).toContain('function probeServerBase(base)');
  });

  it('includes folder-backed review controls for no-server review flows', () => {
    const html = buildHtml({
      title: 'Review controls',
      theme: 'auto',
      contentHtml: '<div>Body</div>',
      typeLabel: 'Article',
      taskId: 'task-a',
      history: [
        makeHistoryEntry({ taskId: 'task-a', title: 'Task A', filePath: 'task-a.html' }),
      ],
    });

    expect(html).toContain('Connect folder');
    expect(html).toContain('Import review');
    expect(html).toContain('Export review');
    expect(html).toContain('window.showDirectoryPicker');
    expect(html).toContain('reviewStorageKey');
    expect(html).toContain('storageNamespace');
    expect(html).toContain('superview import-review');
    expect(html).toContain("writeTextToDirectory(superviewHandle, 'history.jsonl', rewritten)");
  });

  it('uses same-tab navigation for sidebar, today cards, and command palette history jumps', () => {
    const html = buildHtml({
      title: 'Workspace history',
      theme: 'auto',
      contentHtml: '<div>Body</div>',
      typeLabel: 'Article',
      taskId: 'task-a',
      history: [
        makeHistoryEntry({ taskId: 'task-a', title: 'Task A', filePath: 'task-a.html' }),
        makeHistoryEntry({ taskId: 'task-b', title: 'Task B', filePath: 'task-b.html' }),
      ],
    });

    expect(html).toContain('window.location.href = item.href');
    expect(html).not.toContain("window.open(item.href, '_blank')");
    expect(html).not.toContain('sv-sidebar-today" href="_today.html" target="_blank"');
    expect(html).not.toContain('href="task-b.html" target="_blank"');
    expect(html).toContain('href="task-b.html" title="Task B"');
    expect(html).toContain("location.pathname === '/_view'");
    expect(html).toContain('window.__svRuntimeVersion = 6;');
  });

  it('renders persisted feedback items into the bootstrap payload', () => {
    const feedbackItems: FeedbackItem[] = [
      {
        type: 'block_comment',
        id: 'fb-1',
        blockId: 'v1-block-0',
        version: 1,
        text: 'Carry this across renders',
        createdAt: new Date().toISOString(),
        resolved: false,
      },
    ];

    const html = buildHtml({
      title: 'Feedback bootstrap',
      theme: 'auto',
      contentHtml: '<div class="sv-block" data-block-id="v1-block-0"><p data-editable-target="true">Body</p></div>',
      typeLabel: 'Article',
      taskId: 'task-feedback',
      feedbackItems,
    });

    expect(html).toContain('Carry this across renders');
    expect(html).toContain('persistedFeedbackItems');
  });

  it('renders the inline-first review runtime and multiline editing affordances', () => {
    const html = buildHtml({
      title: 'Review runtime',
      theme: 'auto',
      contentHtml: '<div class="sv-block" data-block-id="v1-block-0" data-sv-copy-text="Body"><p data-editable-target="true" data-sv-edit-source="Body" data-sv-edit-format="markdown">Body</p></div>',
      typeLabel: 'Article',
      taskId: 'task-review-runtime',
    });

    expect(html).toContain('id="sv-inline-review-card"');
    expect(html).toContain('Enter for newline · Cmd/Ctrl+Enter to save');
    expect(html).toContain("document.addEventListener('selectionchange'");
    expect(html).toContain('sv-block-edit-textarea');
    expect(html).toContain("data-sv-edit-source");
    expect(html).toContain('Autosaves after you pause');
    expect(html).toContain('function copyBlock(btn, e)');
    expect(html).toContain('function fallbackCopyText(text)');
  });

  it('renders today page without review chrome', () => {
    const html = buildTodayPage(
      [makeHistoryEntry({ title: 'Today item', filePath: 'today-item.html' })],
      [makeHistoryEntry({ title: 'Today item', filePath: 'today-item.html' })],
    );

    expect(html).not.toContain('id="sv-comment-panel"');
    expect(html).not.toContain('id="sv-feedback-pill"');
    expect(html).not.toContain('id="sv-back-btn"');
    expect(html).toContain('Today item');
  });

  it('renders today page by latest task, not every render iteration', () => {
    const html = buildTodayPage(
      [
        makeHistoryEntry({ taskId: 'task-a', title: 'Task A', versions: 2, filePath: 'task-a-v2.html' }),
        makeHistoryEntry({ taskId: 'task-a', title: 'Task A', versions: 1, filePath: 'task-a-v1.html', updatedAt: '2026-03-23T10:00:00Z' }),
        makeHistoryEntry({ taskId: 'task-b', title: 'Task B', versions: 1, filePath: 'task-b-v1.html' }),
      ],
      [
        makeHistoryEntry({ taskId: 'task-a', title: 'Task A', versions: 2, filePath: 'task-a-v2.html' }),
        makeHistoryEntry({ taskId: 'task-a', title: 'Task A', versions: 1, filePath: 'task-a-v1.html', updatedAt: '2026-03-23T10:00:00Z' }),
        makeHistoryEntry({ taskId: 'task-b', title: 'Task B', versions: 1, filePath: 'task-b-v1.html' }),
      ],
    );

    expect(html).toContain('2 tasks rendered today');
  });
});
