import { describe, it, expect } from 'vitest';
import { render } from '../src/core/renderer.js';

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
    expect(html).toContain('superview');
  });

  it('includes feedback system', async () => {
    const html = await render('Test', { type: 'generic' });
    expect(html).toContain('sv-selection-toolbar');
    expect(html).toContain('exportFeedback');
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

  it('renders email with header fields', async () => {
    const html = await render('To: alice@test.com\nSubject: Hi\n\nBody text', { type: 'email' });
    expect(html).toContain('Email');
  });

  it('renders code with syntax area', async () => {
    const html = await render('const x = 42;', { type: 'code' });
    expect(html).toContain('Code');
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
});
