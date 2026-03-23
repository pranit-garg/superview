import type { ContentMetadata } from '../types.js';
import { escapeHtml, renderMarkdown, blockActions } from './shared.js';

export function render(content: string, metadata: ContentMetadata): string {
  const meta = { ...metadata };

  // Auto-extract metadata from content lines
  let bodyContent = content;
  if (!meta.to && !meta.from && !meta.subject) {
    const lines = content.split('\n');
    const headerLines: string[] = [];
    let i = 0;
    for (; i < lines.length; i++) {
      const line = lines[i];
      const toMatch = line.match(/^To:\s*(.+)$/i);
      const fromMatch = line.match(/^From:\s*(.+)$/i);
      const subjectMatch = line.match(/^Subject:\s*(.+)$/i);
      const ccMatch = line.match(/^Cc?:\s*(.+)$/i);
      if (toMatch) { meta.to = toMatch[1].trim(); headerLines.push(line); }
      else if (fromMatch) { meta.from = fromMatch[1].trim(); headerLines.push(line); }
      else if (subjectMatch) { meta.subject = subjectMatch[1].trim(); headerLines.push(line); }
      else if (ccMatch) { meta.cc = ccMatch[1].trim(); headerLines.push(line); }
      else break;
    }
    if (headerLines.length > 0) {
      bodyContent = lines.slice(i).join('\n').trim();
    }
  }

  const to = meta.to || '';
  const from = meta.from || '';
  const subject = meta.subject || '';
  const cc = meta.cc || '';

  const headerFields: string[] = [];
  if (from) headerFields.push(`<div style="margin-bottom:0.25rem"><strong style="color:var(--sv-muted);font-size:0.8rem;display:inline-block;width:60px">From:</strong> ${escapeHtml(from)}</div>`);
  if (to) headerFields.push(`<div style="margin-bottom:0.25rem"><strong style="color:var(--sv-muted);font-size:0.8rem;display:inline-block;width:60px">To:</strong> ${escapeHtml(to)}</div>`);
  if (cc) headerFields.push(`<div style="margin-bottom:0.25rem"><strong style="color:var(--sv-muted);font-size:0.8rem;display:inline-block;width:60px">Cc:</strong> ${escapeHtml(cc)}</div>`);
  if (subject) headerFields.push(`<div style="margin-bottom:0.25rem"><strong style="color:var(--sv-muted);font-size:0.8rem;display:inline-block;width:60px">Subject:</strong> <strong>${escapeHtml(subject)}</strong></div>`);

  const headerHtml = headerFields.length > 0 ? `
    <div class="sv-block" data-block-id="block-0" style="padding:0.75rem 1rem;border-bottom:1px solid var(--sv-border);font-size:0.9rem">
      ${headerFields.join('')}
      ${blockActions('block-0')}
    </div>` : '';

  const paragraphs = bodyContent.split(/\n\n+/).filter(p => p.trim());
  const bodyBlocks = paragraphs.map((para, i) => {
    const blockId = `block-${i + 1}`;
    return `<div class="sv-block" data-block-id="${blockId}" style="padding:0.75rem 1rem">
      <p style="margin:0;line-height:1.65">${renderMarkdown(para.trim()).replace(/\n/g, '<br>')}</p>
      ${blockActions(blockId)}
    </div>`;
  }).join('');

  return `<div class="sv-email" style="border-left:4px solid var(--sv-interactive);background:var(--sv-surface);border-radius:0 8px 8px 0;box-shadow:var(--sv-card-shadow);overflow:hidden">
  ${headerHtml}
  ${bodyBlocks}
</div>`;
}
