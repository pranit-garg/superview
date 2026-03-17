import type { ContentMetadata } from '../types.js';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function blockActions(id: string): string {
  return `<div class="sv-block-actions">
  <button class="sv-block-action" onclick="openBlockComment('${id}')" title="Comment">&#128172;</button>
  <button class="sv-block-action" onclick="react('${id}','thumbs_up')" title="Like">&#128077;</button>
  <button class="sv-block-action" onclick="react('${id}','thumbs_down')" title="Dislike">&#128078;</button>
</div>
<div class="sv-feedback-input" data-block="${id}">
  <textarea class="sv-feedback-textarea" placeholder="Add comment..."></textarea>
  <button class="sv-feedback-submit" onclick="submitBlockComment('${id}')">Submit</button>
</div>`;
}

export function render(content: string, metadata: ContentMetadata): string {
  const timestamp = metadata.timestamp || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const platform = metadata.platform || '';

  return `<div class="sv-message" style="display:flex;flex-direction:column;align-items:flex-end;max-width:550px">
  ${platform ? `<div style="font-size:0.7rem;color:var(--sv-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem;align-self:flex-start">${escapeHtml(platform)}</div>` : ''}
  <div class="sv-block" data-block-id="block-0" style="background:var(--sv-accent);color:#fff;padding:0.75rem 1rem;border-radius:18px 18px 4px 18px;max-width:85%;box-shadow:var(--sv-card-shadow);position:relative">
    <p style="margin:0;line-height:1.5;font-size:0.95rem">${escapeHtml(content.trim()).replace(/\n/g, '<br>')}</p>
    ${blockActions('block-0')}
  </div>
  <div style="font-size:0.7rem;color:var(--sv-muted);margin-top:0.35rem;padding-right:0.25rem">${escapeHtml(timestamp)}</div>
</div>`;
}
