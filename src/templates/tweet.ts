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
  const handle = metadata.handle || '@user';
  const charCount = content.length;

  let badgeColor = 'var(--sv-muted)';
  let badgeBg = 'var(--sv-surface)';
  if (charCount > 280) {
    badgeColor = '#fff';
    badgeBg = 'var(--sv-accent)';
  } else if (charCount > 240) {
    badgeColor = '#fff';
    badgeBg = 'var(--sv-gold)';
  }

  return `<div class="sv-tweet" style="background:var(--sv-surface);border:1px solid var(--sv-border);border-radius:16px;padding:1.25rem;max-width:550px;box-shadow:var(--sv-card-shadow)">
  <div style="display:flex;align-items:center;gap:0.625rem;margin-bottom:0.75rem">
    <div style="width:40px;height:40px;border-radius:50%;background:var(--sv-accent);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:1rem">${escapeHtml(handle.replace('@', '').charAt(0).toUpperCase())}</div>
    <div>
      <div style="font-weight:600;font-size:0.95rem">${escapeHtml(handle.replace('@', ''))}</div>
      <div style="color:var(--sv-muted);font-size:0.8rem">${escapeHtml(handle)}</div>
    </div>
  </div>
  <div class="sv-block" data-block-id="block-0" style="font-size:1.05rem;line-height:1.5;padding:0.5rem 0">
    <p style="margin:0">${escapeHtml(content.trim()).replace(/\n/g, '<br>')}</p>
    ${blockActions('block-0')}
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--sv-border)">
    <div style="display:flex;gap:1.5rem;color:var(--sv-muted);font-size:0.85rem">
      <span>&#128172; 0</span>
      <span>&#128257; 0</span>
      <span>&#10084;&#65039; 0</span>
    </div>
    <span style="font-size:0.75rem;font-weight:600;padding:0.15rem 0.5rem;border-radius:10px;background:${badgeBg};color:${badgeColor};border:1px solid var(--sv-border)">${charCount}/280</span>
  </div>
</div>`;
}
