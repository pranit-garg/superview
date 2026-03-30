import type { ContentMetadata } from '../types.js';
import { renderStructuredMarkdown, copyDataAttributes } from './shared.js';


export function render(content: string, metadata: ContentMetadata): string {
  const blocks = renderStructuredMarkdown(content, metadata, {
    blockStyle: 'padding:0.5rem 0',
    paragraphStyle: 'margin:0;line-height:1.7',
    tableWrapperStyle: 'overflow-x:auto;padding-bottom:0.2rem',
    suppressLeadingHeadingText: metadata.title,
  });

  return `<div class="sv-article" ${copyDataAttributes(content.trim(), { primary: true })} style="max-width:640px;line-height:1.7;font-size:0.95rem">
  ${blocks}
</div>`;
}
