import type { ContentMetadata } from '../types.js';
import { escapeHtml, renderMarkdown, plainText, blockActions } from './shared.js';

function renderImageGrid(images: string[]): string {
  if (!images || images.length === 0) return '';
  const count = Math.min(images.length, 4);
  const gridClass = 'sv-grid-' + count;
  const items = images.slice(0, 4).map(src =>
    `<div class="sv-image-item" onclick="openLightbox('${escapeHtml(src)}')"><img src="${escapeHtml(src)}" alt="" loading="lazy"></div>`
  ).join('');
  return `<div class="sv-image-grid ${gridClass}" style="margin-top:0.75rem;border-radius:12px;overflow:hidden">${items}</div>`;
}

export function render(content: string, metadata: ContentMetadata): string {
  // Priority 1: explicit separators
  let segments = content.split(/\n---\n/).filter(s => s.trim());

  // Priority 2: numbered patterns (split before each numbered line)
  if (segments.length <= 1) {
    segments = content.split(/\n(?=(?:(?:Tweet|Post)\s+\d+[:.]\s*|\d+[/.]\s))/i).filter(s => s.trim());
  }

  // Priority 3: double-newline fallback
  if (segments.length <= 1) {
    segments = content.split(/\n\n+/).filter(s => s.trim());
  }

  // Clean numbered prefixes like "1/ ", "1. ", or "Tweet 1:"
  segments = segments.map(s => s.trim().replace(/^(?:(?:Tweet|Post)\s+\d+[:.]\s*|\d+[/.]\s*)/i, ''));

  const total = segments.length;
  const images = (metadata as any).images as string[] | undefined;

  const cards = segments.map((seg, i) => {
    const blockId = `block-${i}`;
    const charCount = plainText(seg).length;
    let badgeColor = 'var(--sv-muted)';
    let badgeBg = 'var(--sv-surface)';
    if (charCount > 280) {
      badgeColor = '#fff';
      badgeBg = 'var(--sv-danger)';
    } else if (charCount > 240) {
      badgeColor = '#fff';
      badgeBg = 'var(--sv-gold)';
    }

    const isLast = i === total - 1;
    const connectorStyle = !isLast ? 'border-left:2px solid var(--sv-border);margin-left:19px;padding-left:29px;padding-bottom:0;min-height:24px' : '';
    const imageHtml = (i === 0 && images) ? renderImageGrid(images) : '';

    return `<div style="position:relative">
  <div class="sv-block" data-block-id="${blockId}" style="background:var(--sv-surface);border:1px solid var(--sv-border);border-radius:12px;padding:1.25rem 1.5rem;box-shadow:var(--sv-card-shadow)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem">
      <span style="color:var(--sv-muted);font-size:0.75rem;font-weight:600">${i + 1}/${total}</span>
    </div>
    <div style="font-size:0.95rem;line-height:1.6">
      <p style="margin:0">${renderMarkdown(seg).replace(/\n/g, '<br>')}</p>
    </div>
    ${imageHtml}
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
