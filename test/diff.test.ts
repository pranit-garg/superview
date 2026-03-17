import { describe, it, expect } from 'vitest';
import { computeDiff, renderDiffHtml } from '../src/core/diff.js';

describe('computeDiff', () => {
  it('returns equal segments for identical text', () => {
    const segments = computeDiff('hello world', 'hello world');
    expect(segments).toEqual([{ type: 'equal', text: 'hello world' }]);
  });

  it('detects added words', () => {
    const segments = computeDiff('hello world', 'hello beautiful world');
    const types = segments.map(s => s.type);
    expect(types).toContain('add');
    const added = segments.filter(s => s.type === 'add');
    expect(added.some(s => s.text.includes('beautiful'))).toBe(true);
  });

  it('detects removed words', () => {
    const segments = computeDiff('hello beautiful world', 'hello world');
    const removed = segments.filter(s => s.type === 'remove');
    expect(removed.some(s => s.text.includes('beautiful'))).toBe(true);
  });

  it('handles empty inputs', () => {
    expect(computeDiff('', '')).toEqual([]);
    const segments = computeDiff('', 'hello');
    expect(segments.length).toBeGreaterThan(0);
    expect(segments[0].type).toBe('add');
  });

  it('handles complete replacement', () => {
    const segments = computeDiff('foo bar', 'baz qux');
    const types = new Set(segments.map(s => s.type));
    expect(types.has('remove')).toBe(true);
    expect(types.has('add')).toBe(true);
  });
});

describe('renderDiffHtml', () => {
  it('wraps added text in sv-diff-add span', () => {
    const html = renderDiffHtml([{ type: 'add', text: 'new' }]);
    expect(html).toContain('sv-diff-add');
    expect(html).toContain('new');
  });

  it('wraps removed text in sv-diff-remove span', () => {
    const html = renderDiffHtml([{ type: 'remove', text: 'old' }]);
    expect(html).toContain('sv-diff-remove');
    expect(html).toContain('old');
  });

  it('renders equal text without wrapping', () => {
    const html = renderDiffHtml([{ type: 'equal', text: 'same' }]);
    expect(html).toBe('same');
  });

  it('escapes HTML in diff output', () => {
    const html = renderDiffHtml([{ type: 'add', text: '<script>alert(1)</script>' }]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
