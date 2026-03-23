import type { ContentMetadata } from '../types.js';
import { escapeHtml, renderMarkdown, plainText, blockActions } from './shared.js';

interface Variation {
  name: string;
  content: string;
  recommended: boolean;
}

interface VariationResult {
  variations: Variation[];
  craftNotes: string | null;
}

function detectVariations(content: string): VariationResult | null {
  // Split content on --- separators
  const sections = content.split(/\n---\n/).map(s => s.trim()).filter(s => s);

  // Known metadata section indicators (these are NOT variations)
  const metadataPattern = /\b(validation|fact[- ]?check|status|next\s+steps?|source|reference|attachment|visual|results|bitcointalk|voice|craft\s+notes?|notes)\b/i;

  const variations: Variation[] = [];
  let craftNoteSections: string[] = [];
  let foundFirstVariation = false;
  let doneCollectingVariations = false;

  for (const section of sections) {
    if (doneCollectingVariations) {
      craftNoteSections.push(section);
      continue;
    }

    // Find the first ## header in this section
    const headerMatch = section.match(/^##\s+(.+)$/m);
    if (!headerMatch) {
      // No header at all - if we already have variations, this is metadata
      if (foundFirstVariation) {
        doneCollectingVariations = true;
        craftNoteSections.push(section);
      }
      continue;
    }

    const headerText = headerMatch[1].trim();

    // Check if this is explicitly a variation
    const isExplicitVariation = /variant/i.test(headerText) || /(?<!NOT[\s-])RECOMMENDED/i.test(headerText);
    // Check if this is a metadata section
    const isMetadata = metadataPattern.test(headerText);

    if (isMetadata) {
      // Hit metadata section - stop collecting variations
      doneCollectingVariations = true;
      craftNoteSections.push(section);
      continue;
    }

    // A section is a variation if:
    // 1. It explicitly says "Variant" or "RECOMMENDED", OR
    // 2. We already found the first variation and this isn't metadata
    if (!isExplicitVariation && !foundFirstVariation) {
      // Haven't found first variation yet, skip preamble
      continue;
    }

    foundFirstVariation = true;

    // Extract variation name and recommended status
    const recommended = /(?<!NOT[\s-])RECOMMENDED/i.test(headerText);

    // Clean the name: strip emoji, "RECOMMENDED:", brackets, "Variant" suffix
    let name = headerText;
    // Remove emoji characters (all common emoji ranges including ⭐ U+2B50)
    name = name.replace(/\p{Extended_Pictographic}/gu, '');
    name = name.replace(/[\u{200D}\u{FE0E}\u{FE0F}\u{20E3}]/gu, '');
    // Remove [RECOMMENDED] or RECOMMENDED:
    name = name.replace(/\[RECOMMENDED\]\s*/i, '');
    name = name.replace(/RECOMMENDED:\s*/i, '');
    // Remove "Variant" suffix and version/revision tags
    name = name.replace(/\s*Variant\s*$/i, '');
    name = name.replace(/\s*\(Revised\)\s*$/i, '');
    name = name.trim();

    // Extract content (everything after the header line)
    const headerLineEnd = section.indexOf('\n', section.indexOf(headerMatch[0]));
    let body = headerLineEnd >= 0 ? section.slice(headerLineEnd + 1).trim() : '';

    // Strip trailing craft note blockquotes (lines starting with "> " at the end)
    const lines = body.split('\n');
    while (lines.length > 0 && /^>\s/.test(lines[lines.length - 1])) {
      lines.pop();
    }
    body = lines.join('\n').trim();

    if (body) {
      variations.push({ name, content: body, recommended });
    }
  }

  if (variations.length < 2) return null;

  const craftNotes = craftNoteSections.length > 0 ? craftNoteSections.join('\n\n---\n\n') : null;

  return { variations, craftNotes };
}

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
  const images = (metadata as any).images as string[] | undefined;
  // Skip in-page variation detection if this is a file-linked variant
  if ((metadata as any).variantOf) {
    return renderSingleTweet(content, images);
  }
  const result = detectVariations(content);
  if (result && result.variations.length >= 2) {
    return renderVariations(result, images);
  }
  return renderSingleTweet(content, images);
}

function renderSingleTweet(content: string, images?: string[]): string {
  const charCount = plainText(content).length;

  // Long-form tweets (X Premium allows up to 25,000 chars)
  // Only flag as over-limit for short tweets near 280
  const isLongForm = charCount > 500;
  const limit = isLongForm ? 25000 : 280;
  const warnAt = isLongForm ? 24000 : 240;

  let badgeColor = 'var(--sv-muted)';
  let badgeBg = 'var(--sv-surface)';
  const overLimit = charCount > limit;
  if (overLimit) {
    badgeColor = '#fff';
    badgeBg = 'var(--sv-danger)';
  } else if (charCount > warnAt) {
    badgeColor = '#fff';
    badgeBg = 'var(--sv-gold)';
  }

  // Never color text red — use the badge for limit warnings
  const textStyle = '';

  const sentences = content.trim().split(/(?<=[.!?])\s+|\n+/).filter(s => s.trim());
  const useBlocks = sentences.length > 1;

  let contentBlocks: string;
  if (useBlocks) {
    contentBlocks = sentences.map((sentence, i) => {
      const blockId = `block-${i}`;
      return `<div class="sv-block" data-block-id="${blockId}">
    <p style="margin:0;font-size:1.05rem;line-height:1.6;${textStyle}">${renderMarkdown(sentence.trim())}</p>
    ${blockActions(blockId)}
  </div>`;
    }).join('');
  } else {
    contentBlocks = `<div class="sv-block" data-block-id="block-0">
    <p style="margin:0;font-size:1.05rem;line-height:1.6;${textStyle}">${renderMarkdown(content.trim()).replace(/\n/g, '<br>')}</p>
    ${blockActions('block-0')}
  </div>`;
  }

  const imageHtml = renderImageGrid(images || []);

  return `<div class="sv-tweet" style="background:var(--sv-surface);border:1px solid var(--sv-border);border-radius:12px;padding:1.5rem 1.75rem;max-width:600px;box-shadow:var(--sv-card-shadow)">
  ${contentBlocks}
  ${imageHtml}
  <div style="text-align:right;margin-top:0.75rem">
    <span style="font-size:0.85rem;font-weight:600;padding:0.2rem 0.6rem;border-radius:10px;background:${badgeBg};color:${badgeColor};border:1px solid var(--sv-border)">${charCount.toLocaleString()}${isLongForm ? '' : '/280'}</span>
  </div>
</div>`;
}

function renderVariations(result: VariationResult, images?: string[]): string {
  const { variations, craftNotes } = result;

  // Build tab bar
  const tabs = variations.map((v, i) => {
    const activeClass = i === 0 ? ' active' : '';
    const star = v.recommended ? '<span class="sv-star">&#9733;</span>' : '';
    return `<button class="sv-variation-tab${activeClass}" data-idx="${i}">${star}${escapeHtml(v.name)}</button>`;
  }).join('');

  // Build panels - each is a full tweet card
  const panels = variations.map((v, i) => {
    const activeClass = i === 0 ? ' active' : '';
    const tweetHtml = renderSingleTweet(v.content, images);
    return `<div class="sv-variation-panel${activeClass}" data-panel="${i}">${tweetHtml}</div>`;
  }).join('');

  // Craft notes accordion (if any)
  const craftNotesHtml = craftNotes ? `
    <details class="sv-craft-notes" style="margin-top:1rem;border:1px solid var(--sv-border);border-radius:8px;background:var(--sv-surface)">
      <summary style="padding:0.75rem 1rem;cursor:pointer;font-size:0.85rem;font-weight:600;color:var(--sv-muted)">Reference &amp; Notes</summary>
      <div style="padding:0 1rem 1rem;font-size:0.9rem;line-height:1.6;color:var(--sv-muted)">${renderMarkdown(craftNotes)}</div>
    </details>` : '';

  return `<div class="sv-variations-container">
  <div class="sv-variation-tab-bar">${tabs}</div>
  <div class="sv-variation-panels">${panels}</div>
  ${craftNotesHtml}
</div>`;
}
