import type { ContentMetadata } from '../types.js';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function blockActions(id: string): string {
  return `<div class="sv-block-actions">
  <button class="sv-block-action" onclick="openBlockComment('${id}')" title="Comment">&#128172;</button>
  <button class="sv-block-action" onclick="react(this,'${id}','thumbs_up')" title="Like">&#128077;</button>
  <button class="sv-block-action" onclick="react(this,'${id}','thumbs_down')" title="Dislike">&#128078;</button>
</div>
<div class="sv-feedback-input" data-block="${id}">
  <textarea class="sv-feedback-textarea" placeholder="Add comment..."></textarea>
  <button class="sv-feedback-submit" onclick="submitBlockComment('${id}')">Submit</button>
</div>`;
}

export function render(content: string, metadata: ContentMetadata): string {
  const to = metadata.to || '';
  const from = metadata.from || '';
  const subject = metadata.subject || '';
  const cc = metadata.cc || '';

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

  const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
  const bodyBlocks = paragraphs.map((para, i) => {
    const blockId = `block-${i + 1}`;
    return `<div class="sv-block" data-block-id="${blockId}" style="padding:0.75rem 1rem">
      <p style="margin:0;line-height:1.65">${escapeHtml(para.trim()).replace(/\n/g, '<br>')}</p>
      ${blockActions(blockId)}
    </div>`;
  }).join('');

  return `<div class="sv-email" style="border-left:4px solid var(--sv-accent);background:var(--sv-surface);border-radius:0 8px 8px 0;box-shadow:var(--sv-card-shadow);overflow:hidden">
  ${headerHtml}
  ${bodyBlocks}
</div>`;
}
