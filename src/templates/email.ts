import type { ContentMetadata } from '../types.js';
import {
  escapeHtml,
  renderStructuredMarkdown,
  blockActions,
  scopedBlockId,
  extractLeadingHeaderFields,
  copyDataAttributes,
} from './shared.js';

export function render(content: string, metadata: ContentMetadata): string {
  const meta = { ...metadata };
  const parsedHeaders = extractLeadingHeaderFields(content);

  let bodyContent = parsedHeaders.fields.length > 0 ? parsedHeaders.body : content;
  for (const field of parsedHeaders.fields) {
    const lower = field.label.toLowerCase();
    if (lower === 'to' && !meta.to) meta.to = field.value;
    else if (lower === 'from' && !meta.from) meta.from = field.value;
    else if (lower === 'subject' && !meta.subject) meta.subject = field.value;
    else if (lower === 'cc' && !meta.cc) meta.cc = field.value;
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

  const canonicalCopyLines: string[] = [];
  if (from) canonicalCopyLines.push(`From: ${from}`);
  if (to) canonicalCopyLines.push(`To: ${to}`);
  if (cc) canonicalCopyLines.push(`Cc: ${cc}`);
  if (subject) canonicalCopyLines.push(`Subject: ${subject}`);
  const canonicalCopyText = [
    canonicalCopyLines.join('\n'),
    bodyContent.trim(),
  ].filter(Boolean).join('\n\n').trim();

  const headerBlockId = scopedBlockId(metadata, 'block-0');
  const headerHtml = headerFields.length > 0 ? `
    <div class="sv-block" data-block-id="${headerBlockId}" ${copyDataAttributes(canonicalCopyLines.join('\n'))} style="padding:0.75rem 1rem;border-bottom:1px solid var(--sv-border);font-size:0.9rem">
      ${headerFields.join('')}
      ${blockActions(headerBlockId, metadata)}
    </div>` : '';

  const bodyBlocks = renderStructuredMarkdown(bodyContent, {
    ...metadata,
    blockIdPrefix: metadata.blockIdPrefix,
  }, {
    startIndex: headerFields.length > 0 ? 1 : 0,
    blockStyle: 'padding:0.75rem 1rem',
    paragraphStyle: 'margin:0;line-height:1.7',
    metadataBlockStyle: 'padding:0.85rem 1rem;border:1px solid var(--sv-border);border-radius:10px;background:color-mix(in srgb, var(--sv-surface) 88%, var(--sv-bg) 12%)',
    hrStyle: 'border:none;border-top:1px solid var(--sv-border);margin:0.2rem 0',
    tableWrapperStyle: 'overflow-x:auto;padding-bottom:0.15rem',
  });

  return `<div class="sv-email" ${copyDataAttributes(canonicalCopyText || content.trim(), { primary: true })} style="border-left:4px solid var(--sv-interactive);background:var(--sv-surface);border-radius:0 8px 8px 0;box-shadow:var(--sv-card-shadow);overflow:hidden">
  ${headerHtml}
  ${bodyBlocks}
</div>`;
}
