import type { ContentMetadata } from '../types.js';
import { renderStructuredMarkdown, copyDataAttributes } from './shared.js';

export function render(content: string, metadata: ContentMetadata): string {
  const blocks = renderStructuredMarkdown(content, metadata, {
    blockStyle: 'padding:0.5rem 0',
    paragraphStyle: 'margin:0;line-height:1.7;font-size:0.95rem',
    headingStyles: {
      h1: 'font-size:1.5rem;margin:0;line-height:1.3',
      h2: 'font-size:1.25rem;margin:0;line-height:1.35',
      h3: 'font-size:1.05rem;margin:0;line-height:1.4',
    },
    headingWrapperMargins: {
      h1: '1.5rem',
      h2: '1.25rem',
      h3: '1rem',
    },
    tableWrapperStyle: 'overflow-x:auto;padding-bottom:0.2rem',
    suppressLeadingHeadingText: metadata.title,
  });

  return `<div class="sv-document" ${copyDataAttributes(content.trim(), { primary: true })} style="background:var(--sv-surface);border-top:4px solid var(--sv-gold);border-radius:2px;box-shadow:var(--sv-card-shadow);max-width:680px;min-height:800px;padding:2.5rem 2rem">
  ${blocks}
</div>`;
}
