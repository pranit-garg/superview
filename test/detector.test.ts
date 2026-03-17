import { describe, it, expect } from 'vitest';
import { detectContentType } from '../src/core/detector.js';

describe('detectContentType', () => {
  it('detects email from headers', () => {
    expect(detectContentType('To: alice@example.com\nSubject: Hello\n\nBody here')).toBe('email');
    expect(detectContentType('From: bob@example.com\n\nMessage')).toBe('email');
    expect(detectContentType('Subject: Meeting tomorrow\n\nDetails...')).toBe('email');
  });

  it('detects code from syntax patterns', () => {
    expect(detectContentType('function foo() {\n  return 42;\n}')).toBe('code');
    expect(detectContentType('const x = { a: 1, b: 2 };')).toBe('code');
    expect(detectContentType('```js\nconsole.log("hi")\n```')).toBe('code');
  });

  it('detects table from pipe format', () => {
    expect(detectContentType('| Name | Age |\n|------|-----|\n| Alice | 30 |')).toBe('table');
  });

  it('detects tweet from short content', () => {
    expect(detectContentType('Just shipped a new feature!')).toBe('tweet');
  });

  it('detects thread from numbered sections', () => {
    expect(detectContentType('1/ First point\n\n2/ Second point\n\n3/ Third point')).toBe('thread');
  });

  it('detects document from headers and length', () => {
    const doc = '# Title\n\n' + 'Lorem ipsum. '.repeat(100) + '\n\n## Section 2\n\nMore content here.\n\n## Section 3\n\nEven more.';
    expect(detectContentType(doc)).toBe('document');
  });

  it('detects message from short conversational text', () => {
    expect(detectContentType('Hey, are you free tomorrow?')).toBe('message');
  });

  it('falls back to generic', () => {
    const long = 'This is a longer piece of content that does not match any specific pattern. '.repeat(20);
    expect(detectContentType(long)).toBe('generic');
  });
});
