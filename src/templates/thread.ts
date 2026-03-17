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

  // Split by --- separators, double newlines, or numbered patterns like "1/" "2/"
  let segments = content.split(/\n---\n/).filter(s => s.trim());
  if (segments.length <= 1) {
    segments = content.split(/\n\n+/).filter(s => s.trim());
  }

  // Clean numbered prefixes like "1/ " or "1. "
  segments = segments.map(s => s.trim().replace(/^\d+[/.]\s*/, ''));

  const total = segments.length;
  const initial = handle.replace('@', '').charAt(0).toUpperCase();

  const cards = segments.map((seg, i) => {
    const blockId = `block-${i}`;
    const charCount = seg.length;
    let badgeColor = 'var(--sv-muted)';
    let badgeBg = 'var(--sv-surface)';
    if (charCount > 280) {
      badgeColor = '#fff';
      badgeBg = 'var(--sv-accent)';
    } else if (charCount > 240) {
      badgeColor = '#fff';
      badgeBg = 'var(--sv-gold)';
    }

    const isLast = i === total - 1;
    const connectorStyle = !isLast ? 'border-left:2px solid var(--sv-border);margin-left:19px;padding-left:29px;padding-bottom:0;min-height:24px' : '';

    return `<div style="position:relative">
  <div class="sv-block" data-block-id="${blockId}" style="background:var(--sv-surface);border:1px solid var(--sv-border);border-radius:16px;padding:1rem;box-shadow:var(--sv-card-shadow)">
    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">
      <div style="width:32px;height:32px;border-radius:50%;background:var(--sv-accent);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:0.8rem;flex-shrink:0">${initial}</div>
      <div style="font-weight:600;font-size:0.85rem">${escapeHtml(handle.replace('@', ''))}</div>
      <span style="color:var(--sv-muted);font-size:0.8rem">${escapeHtml(handle)}</span>
      <span style="color:var(--sv-muted);font-size:0.75rem;margin-left:auto">${i + 1}/${total}</span>
    </div>
    <div style="font-size:0.95rem;line-height:1.5;padding-left:0">
      <p style="margin:0">${escapeHtml(seg).replace(/\n/g, '<br>')}</p>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:0.5rem">
      <span style="font-size:0.7rem;font-weight:600;padding:0.1rem 0.4rem;border-radius:10px;background:${badgeBg};color:${badgeColor};border:1px solid var(--sv-border)">${charCount}</span>
    </div>
    ${blockActions(blockId)}
  </div>
  ${!isLast ? `<div style="${connectorStyle}"></div>` : ''}
</div>`;
  }).join('');

  return `<div class="sv-thread" style="max-width:550px;display:flex;flex-direction:column;gap:0">
  ${cards}
</div>`;
}
