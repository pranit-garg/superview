import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '../src/core/renderer.js';
import { appendHistory } from '../src/core/history.js';
import { addFeedbackItem } from '../src/core/feedback.js';

const TEST_DIR = join(process.cwd(), '.test-superview-renderer');

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe('render', () => {
  it('produces valid HTML with doctype', async () => {
    const html = await render('Hello world', { type: 'generic' });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('</html>');
  });

  it('includes the title', async () => {
    const html = await render('Content here', { title: 'My Title', type: 'generic' });
    expect(html).toContain('My Title');
  });

  it('includes the type label', async () => {
    const html = await render('Test', { type: 'email' });
    expect(html).toContain('Email');
  });

  it('includes theme CSS variables', async () => {
    const html = await render('Test', { type: 'generic' });
    expect(html).toContain('--sv-bg');
    expect(html).toContain('--sv-accent');
    expect(html).toContain('--sv-text');
  });

  it('includes paper grain texture', async () => {
    const html = await render('Test', { type: 'generic' });
    expect(html).toContain('feTurbulence');
  });

  it('includes attribution footer by default', async () => {
    const html = await render('Test', { type: 'generic' });
    expect(html).toContain('Built by');
    expect(html).toContain('x.com/Pranit');
  });

  it('includes feedback system', async () => {
    const html = await render('Test', { type: 'generic' });
    expect(html).toContain('sv-selection-toolbar');
    expect(html).toContain('exportFeedback');
    expect(html).toContain('Connect folder');
    expect(html).toContain('Import review');
  });

  it('includes keyboard shortcut handlers', async () => {
    const html = await render('Test', { type: 'generic' });
    expect(html).toContain('toggleTheme');
    expect(html).toContain('keydown');
  });

  it('renders tweet with character count', async () => {
    const html = await render('Short tweet text', { type: 'tweet' });
    expect(html).toContain('Tweet');
    expect(html).toContain('sv-tweet');
  });

  it('renders thread items for 1) and 1- style numbering', async () => {
    const html = await render('1) First point\n\n2- Second point', { type: 'thread' });
    expect(html).toContain('data-block-id="v1-block-0"');
    expect(html).toContain('data-block-id="v1-block-1"');
  });

  it('renders email with header fields', async () => {
    const html = await render('To: alice@test.com\nSubject: Hi\n\nBody text', { type: 'email' });
    expect(html).toContain('Email');
  });

  it('renders email headers from bold markdown labels and exposes canonical copy text', async () => {
    const html = await render('**To:** alice@test.com\n**Subject:** Hi there\n\nBody text', { type: 'email' });
    expect(html).toContain('To:</strong>');
    expect(html).toContain('Subject:</strong>');
    expect(html).toContain('data-sv-copy-text=');
  });

  it('strips duplicate email header lines from the body even when metadata is partially supplied', async () => {
    const html = await render('To: alice@test.com\nSubject: Hi there\n\nBody text', {
      type: 'email',
      metadata: { from: 'pranit@test.com' },
    });

    expect(html).toContain('From:</strong>');
    expect(html).toContain('To:</strong>');
    expect(html).toContain('Subject:</strong>');
    expect(html).not.toContain('<p data-editable-target="true" style="margin:0;line-height:1.7">To: alice@test.com');
  });

  it('renders composite email content with real headings, dividers, and header blocks', async () => {
    const html = await render(
      '# Wednesday Follow-Ups\n\nContext paragraph.\n\n---\n\n## Follow-Up Email to Kim\n\nTo: kim@example.com\nFrom: pranit@example.com\nSubject: Checking in\n\nHey Kim,\n\nFollowing up here.',
      { type: 'email' },
    );

    expect(html).toContain('<h2');
    expect(html).toContain('Follow-Up Email to Kim');
    expect(html).toContain('<hr');
    expect(html).toContain('Subject:</strong>');
    expect(html).not.toContain('## Follow-Up Email to Kim');
  });

  it('renders code with syntax area', async () => {
    const html = await render('const x = 42;', { type: 'code' });
    expect(html).toContain('Code');
  });

  it('renders document markdown blocks including ordered lists and tables', async () => {
    const html = await render(
      '# Title\n\n## Program Details\n\n1. First item\n2. Second item\n\n| Field | Value |\n| --- | --- |\n| Program | Claude for Open Source |\n| Benefit | Claude Max |\n',
      { type: 'document' },
    );

    expect(html).toContain('<h1');
    expect(html).toContain('<h2');
    expect(html).toContain('<ol');
    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expect(html).toContain('Claude for Open Source');
  });

  it('suppresses a duplicated leading document heading in the rendered body while keeping canonical copy text', async () => {
    const html = await render('# Claude for Open Source Application\n\n## Details\n\nBody text', {
      type: 'document',
      title: 'Claude for Open Source Application',
    });

    expect(html).toContain('data-sv-copy-text=');
    expect(html).toContain('%23%20Claude%20for%20Open%20Source%20Application');
    expect(html).toContain('<h2');
    expect(html).toContain('Details');
    expect(html).not.toContain('<h1 data-editable-target="true" style="font-size:1.5rem;margin:0;line-height:1.3">Claude for Open Source Application</h1>');
  });

  it('generates diff HTML when previous content provided', async () => {
    const html = await render('New content here', {
      type: 'generic',
      previousContent: 'Old content here',
      version: 2,
    });
    expect(html).toContain('sv-diff');
  });

  it('supports all 9 content types without errors', async () => {
    const types = ['email', 'tweet', 'thread', 'message', 'linkedin', 'document', 'code', 'table', 'generic'] as const;
    for (const type of types) {
      const html = await render('Test content for ' + type, { type });
      expect(html).toContain('<!DOCTYPE html>');
    }
  });

  it('renders message drafts as sectioned copyable cards instead of fragmented bubbles', async () => {
    const html = await render(
      '# Telegram to Kim — Final\n\nHey Kim,\n\nHere are three bullets:\n1. First\n2. Second\n\n---\n\n# Sequencing\n\n1. Send Telegram\n2. Follow up',
      { type: 'message', metadata: { platform: 'Telegram' } },
    );

    expect(html).toContain('Telegram draft');
    expect(html).toContain('Copy draft');
    expect(html).toContain('data-sv-primary-copy="true"');
    expect(html).toContain(encodeURIComponent('Hey Kim,\n\nHere are three bullets:\n1. First\n2. Second'));
    expect(html).not.toContain('18px 18px 4px 18px');
  });

  it('strips structural separators out of message draft copy payloads', async () => {
    const html = await render(
      '# Telegram to Kim — Final\n\nHey Kim,\n\nLine two.\n\n---\n\n# Notes\n\nKeep this note.',
      { type: 'message', metadata: { platform: 'Telegram' } },
    );

    expect(html).toContain(encodeURIComponent('Hey Kim,\n\nLine two.'));
    expect(html).not.toContain(encodeURIComponent('Hey Kim,\n\nLine two.\n\n---'));
  });

  it('recovers legacy plain-text message drafts into a single copyable draft plus notes', async () => {
    const legacyContent = [
      'Context',
      'Message draft',
      'Hey Kim, hope you have been well.',
      'I wanted to reach out about the role.',
      'Changes from Original',
      'Tightened the opening.',
      'Removed hedging.',
      '07:56 PM',
    ].join('\n');

    const html = await render(legacyContent, { type: 'message' });

    expect(html).toContain('Message draft');
    expect(html).toContain('Copy draft');
    expect(html).toContain('Changes from Original');
  });

  it('does not steal a simple opener line as a legacy message title', async () => {
    const legacyContent = [
      'Quick update',
      'Wanted to share a short note here.',
      'Changes from Original',
      'Removed filler.',
    ].join('\n');

    const html = await render(legacyContent, { type: 'message' });

    expect(html).toContain('Message draft');
    expect(html).toContain(encodeURIComponent('Quick update\nWanted to share a short note here.'));
    expect(html).not.toContain('<h2 class="sv-message-section-title">Quick update</h2>');
  });

  // v0.2 tests
  it('includes comment panel', async () => {
    const html = await render('Test', { type: 'generic' });
    expect(html).toContain('sv-comment-panel');
  });

  it('renders version accordions when previousContent provided', async () => {
    const html = await render('New version content', {
      type: 'generic',
      previousContent: 'Old version content',
      version: 2,
    });
    expect(html).toContain('sv-accordion');
    expect(html).toContain('sv-accordion-header');
  });

  it('does not render accordion elements for single version', async () => {
    const html = await render('Single version', { type: 'generic', noSidebar: true });
    // No accordion div elements should be rendered for a single version
    expect(html).not.toContain('<div class="sv-accordion"');
  });

  it('renders LinkedIn profile layout for sectioned content', async () => {
    const profileContent = '## About\nI am a marketer.\n\n## Experience\nCMO at Irys.\n\n## Skills\nMarketing, Strategy';
    const html = await render(profileContent, { type: 'linkedin' });
    expect(html).toContain('sv-linkedin-profile');
    expect(html).toContain('About');
    expect(html).toContain('Experience');
    expect(html).toContain('Skills');
  });

  it('renders LinkedIn post layout for regular content', async () => {
    const postContent = 'Just launched a new product!\n\nExcited to share this with the world.';
    const html = await render(postContent, { type: 'linkedin' });
    expect(html).toContain('sv-linkedin');
    expect(html).not.toContain('sv-linkedin-profile');
  });

  it('does not infer previous versions from same-title history entries', async () => {
    appendHistory(TEST_DIR, {
      id: 'hist-1',
      taskId: 'other-task',
      title: 'Shared Title',
      type: 'generic',
      versions: 3,
      feedbackCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      filePath: 'shared-title.html',
      kept: false,
    });

    const html = await render('Fresh content', {
      type: 'generic',
      basePath: TEST_DIR,
      taskId: 'new-task',
      title: 'Shared Title',
    });

    expect(html).not.toContain('<div class="sv-accordion"');
  });

  it('hydrates persisted feedback into the page payload', async () => {
    addFeedbackItem(TEST_DIR, 'task-1', {
      type: 'block_comment',
      id: 'fb-persisted',
      blockId: 'v1-block-0',
      version: 1,
      text: 'Persisted review note',
      createdAt: new Date().toISOString(),
      resolved: false,
    });

    const html = await render('Persist me', {
      type: 'generic',
      basePath: TEST_DIR,
      taskId: 'task-1',
    });

    expect(html).toContain('Persisted review note');
    expect(html).toContain('persistedFeedbackItems');
  });

  it('marks comment mode as enabled when requested', async () => {
    const html = await render('Comment first', {
      type: 'generic',
      commentMode: true,
    });

    expect(html).toContain('var commentModeEnabled = true;');
  });

  it('renders unique block ids for tweet variations and tabs', async () => {
    const html = await render(
      '## Variant A\nFirst variation text\n---\n## RECOMMENDED: Variant B\nSecond variation text',
      { type: 'tweet' },
    );

    expect(html).toContain('data-block-id="v1-variation-tab-0"');
    expect(html).toContain('data-block-id="v1-variation-tab-1"');
    expect(html).toContain('data-block-id="v1-var-0-block-0"');
    expect(html).toContain('data-block-id="v1-var-1-block-0"');
  });

  it('renders all previous task versions from history artifacts into the accordion', async () => {
    const viewsDir = join(TEST_DIR, '.superview', 'views');
    mkdirSync(viewsDir, { recursive: true });
    writeFileSync(
      join(viewsDir, 'task-history-v1.html'),
      '<!DOCTYPE html><div id="sv-content-area"><!-- SV:CONTENT_START --><div>Historical v1</div><!-- SV:CONTENT_END --></div>',
      'utf-8',
    );
    writeFileSync(
      join(viewsDir, 'task-history-v2.html'),
      '<!DOCTYPE html><div id="sv-content-area"><!-- SV:CONTENT_START --><div>Historical v2</div><!-- SV:CONTENT_END --></div>',
      'utf-8',
    );

    appendHistory(TEST_DIR, {
      id: 'hist-v1',
      taskId: 'task-history',
      title: 'History task',
      type: 'generic',
      versions: 1,
      feedbackCount: 0,
      createdAt: '2026-03-23T10:00:00Z',
      updatedAt: '2026-03-23T10:00:00Z',
      filePath: 'task-history-v1.html',
      kept: false,
    });
    appendHistory(TEST_DIR, {
      id: 'hist-v2',
      taskId: 'task-history',
      title: 'History task',
      type: 'generic',
      versions: 2,
      feedbackCount: 0,
      createdAt: '2026-03-23T11:00:00Z',
      updatedAt: '2026-03-23T11:00:00Z',
      filePath: 'task-history-v2.html',
      kept: false,
    });

    const html = await render('Current v3', {
      type: 'generic',
      basePath: TEST_DIR,
      taskId: 'task-history',
      version: 3,
      previousContent: 'Historical v2',
    });

    expect(html).toContain('Historical v2');
    expect(html).toContain('Historical v1');
    expect((html.match(/class="sv-accordion"/g) || []).length).toBe(2);
  });

  it('dedupes duplicate history renders for the same version in the accordion', async () => {
    const viewsDir = join(TEST_DIR, '.superview', 'views');
    mkdirSync(viewsDir, { recursive: true });
    writeFileSync(
      join(viewsDir, 'task-dedupe-v1-old.html'),
      '<!DOCTYPE html><div id="sv-content-area"><!-- SV:CONTENT_START --><div>Old duplicate v1</div><!-- SV:CONTENT_END --></div>',
      'utf-8',
    );
    writeFileSync(
      join(viewsDir, 'task-dedupe-v1-new.html'),
      '<!DOCTYPE html><div id="sv-content-area"><!-- SV:CONTENT_START --><div>New duplicate v1</div><!-- SV:CONTENT_END --></div>',
      'utf-8',
    );

    appendHistory(TEST_DIR, {
      id: 'hist-v1-old',
      taskId: 'task-dedupe',
      title: 'History dedupe',
      type: 'generic',
      versions: 1,
      feedbackCount: 0,
      createdAt: '2026-03-23T10:00:00Z',
      updatedAt: '2026-03-23T10:00:00Z',
      filePath: 'task-dedupe-v1-old.html',
      kept: false,
    });
    appendHistory(TEST_DIR, {
      id: 'hist-v1-new',
      taskId: 'task-dedupe',
      title: 'History dedupe',
      type: 'generic',
      versions: 1,
      feedbackCount: 0,
      createdAt: '2026-03-23T11:00:00Z',
      updatedAt: '2026-03-23T11:00:00Z',
      filePath: 'task-dedupe-v1-new.html',
      kept: false,
    });

    const html = await render('Current v2', {
      type: 'generic',
      basePath: TEST_DIR,
      taskId: 'task-dedupe',
      version: 2,
      previousContent: 'New duplicate v1',
    });

    expect(html).toContain('New duplicate v1');
    expect(html).not.toContain('Old duplicate v1');
    expect((html.match(/class="sv-accordion"/g) || []).length).toBe(1);
  });

  it('normalizes dirty historical artifacts before rendering previous versions', async () => {
    const viewsDir = join(TEST_DIR, '.superview', 'views');
    mkdirSync(viewsDir, { recursive: true });
    writeFileSync(
      join(viewsDir, 'dirty-v1.html'),
      `<!DOCTYPE html><div id="sv-content-area"><!-- SV:CONTENT_START --><div class="sv-email">
        <div class="sv-block" data-block-id="v1-block-0"><h1 data-editable-target="true">Wednesday Follow-Ups</h1><div class="sv-block-actions"><button class="sv-block-action">&#128172;</button></div></div>
        <div class="sv-block" data-block-id="v1-block-1"><p data-editable-target="true"></p><div class="sv-block-actions"><button class="sv-block-action">&#128172;</button></div></div>
        <div class="sv-block" data-block-id="v1-block-2"><h2 data-editable-target="true">Follow-Up Email to Kim</h2><div class="sv-block-actions"><button class="sv-block-action">&#128172;</button></div></div>
        <div class="sv-block" data-block-id="v1-block-3"><div><div><strong>To:</strong> kim@example.com</div><div><strong>Subject:</strong> Checking in</div></div><div class="sv-block-actions"><button class="sv-block-action">&#128172;</button></div></div>
        <div class="sv-block" data-block-id="v1-block-4"><p data-editable-target="true">Hey Kim,</p><div class="sv-block-actions"><button class="sv-block-action">&#128172;</button></div></div>
      </div><!-- SV:CONTENT_END --></div>`,
      'utf-8',
    );

    appendHistory(TEST_DIR, {
      id: 'hist-dirty-v1',
      taskId: 'dirty-email-task',
      title: 'Dirty email history',
      type: 'email',
      versions: 1,
      feedbackCount: 0,
      createdAt: '2026-03-23T10:00:00Z',
      updatedAt: '2026-03-23T10:00:00Z',
      filePath: 'dirty-v1.html',
      kept: false,
    });

    const html = await render(
      '# Wednesday Follow-Ups\n\n## Follow-Up Email to Kim\n\nTo: kim@example.com\nSubject: Checking in\n\nHey Kim,',
      {
        type: 'email',
        basePath: TEST_DIR,
        taskId: 'dirty-email-task',
        version: 2,
      },
    );

    const historicalSection = (html.split('data-version="1"')[1] || '').slice(0, 2000);
    expect(historicalSection).toContain('Follow-Up Email to Kim');
    expect(historicalSection).not.toContain('');
    expect(historicalSection).not.toContain('class="sv-block-actions"');
  });

  it('filters leaked UI copy labels out of legacy historical message artifacts', async () => {
    const viewsDir = join(TEST_DIR, '.superview', 'views');
    mkdirSync(viewsDir, { recursive: true });
    writeFileSync(
      join(viewsDir, 'legacy-message-v1.html'),
      `<!DOCTYPE html><div id="sv-content-area"><!-- SV:CONTENT_START --><div class="sv-message">
        <section class="sv-message-section">
          <div class="sv-message-section-header">
            <div class="sv-message-section-top">
              <div class="sv-message-section-eyebrow">Message draft</div>
              <button class="sv-btn sv-inline-copy-btn sv-message-section-copy">Copy draft</button>
            </div>
          </div>
          <div class="sv-message-section-card"><div class="sv-message-section-body"><div class="sv-block" data-block-id="v1-block-0"><p data-editable-target="true">Hey Kim,</p></div></div></div>
        </section>
      </div><!-- SV:CONTENT_END --></div>`,
      'utf-8',
    );

    appendHistory(TEST_DIR, {
      id: 'hist-legacy-message-v1',
      taskId: 'legacy-message-task',
      title: 'Legacy message history',
      type: 'message',
      versions: 1,
      feedbackCount: 0,
      createdAt: '2026-03-23T10:00:00Z',
      updatedAt: '2026-03-23T10:00:00Z',
      filePath: 'legacy-message-v1.html',
      kept: false,
    });

    const html = await render('# Telegram to Kim — Final\n\nHey Kim,', {
      type: 'message',
      basePath: TEST_DIR,
      taskId: 'legacy-message-task',
      version: 2,
    });

    const historicalSection = (html.split('data-version="1"')[1] || '').slice(0, 3000);
    expect(historicalSection).not.toContain('<h2 class="sv-message-section-title">Copy draft</h2>');
    expect(historicalSection).not.toContain('Copy draft</button>');
  });
});
