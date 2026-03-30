const CONTENT_START_MARKER = '<!-- SV:CONTENT_START -->';
const CONTENT_END_MARKER = '<!-- SV:CONTENT_END -->';

export function extractContentArea(rawHtml: string): string | null {
  const startMarkerIndex = rawHtml.indexOf(CONTENT_START_MARKER);
  const endMarkerIndex = rawHtml.indexOf(CONTENT_END_MARKER);
  if (startMarkerIndex >= 0 && endMarkerIndex > startMarkerIndex) {
    return rawHtml.slice(startMarkerIndex + CONTENT_START_MARKER.length, endMarkerIndex).trim();
  }

  const containerIndex = rawHtml.indexOf('<div id="sv-content-area">');
  if (containerIndex < 0) return null;

  const openTagEnd = rawHtml.indexOf('>', containerIndex);
  if (openTagEnd < 0) return null;

  const divTagRegex = /<\/?div\b[^>]*>/gi;
  divTagRegex.lastIndex = openTagEnd + 1;
  let depth = 1;
  let match: RegExpExecArray | null;

  while ((match = divTagRegex.exec(rawHtml))) {
    if (match[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) {
        return rawHtml.slice(openTagEnd + 1, match.index).trim();
      }
    } else if (!match[0].endsWith('/>')) {
      depth += 1;
    }
  }

  return null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, codePoint) => String.fromCharCode(Number(codePoint)));
}

export function sanitizeRenderedContentHtml(contentHtml: string): string {
  return contentHtml
    .replace(/<div class="sv-block-actions"[\s\S]*?<\/div>/gi, '')
    .replace(/<div class="sv-block-edit-actions"[\s\S]*?<\/div>/gi, '')
    .replace(/<button\b[^>]*class="[^"]*\bsv-inline-copy-btn\b[^"]*"[\s\S]*?<\/button>/gi, '')
    .replace(/<div class="sv-onboard-tooltip"[\s\S]*?<\/div>/gi, '')
    .replace(/\sdata-editable-target="true"/gi, '')
    .replace(/\scontenteditable="true"/gi, '')
    .replace(/\saria-describedby="[^"]*"/gi, '');
}

function isArtifactNoiseLine(line: string): boolean {
  const normalized = decodeHtmlEntities(line)
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return true;
  if (/^[💬✎×]+$/.test(normalized)) return true;
  if (normalized === 'Click any block to comment, or select text for inline notes.') return true;
  if (/^(copy (draft|email|text)|export feedback|comment(?:\s+c)?|leave feedback)$/i.test(normalized)) return true;

  return false;
}

export function containsArtifactNoise(contentHtml: string): boolean {
  return /(?:^|>|\s)(?:|💬|✎|×)(?:<|$)/.test(contentHtml)
    || contentHtml.includes('Click any block to comment, or select text for inline notes.');
}

export function htmlToPlainText(html: string): string {
  const sanitizedHtml = sanitizeRenderedContentHtml(html);
  const rawText = decodeHtmlEntities(
    sanitizedHtml
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<(br|hr)\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|blockquote|li|tr|h[1-6]|pre|ul|ol|table|thead|tbody|tfoot)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  );

  const filteredLines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !isArtifactNoiseLine(line));

  return filteredLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
