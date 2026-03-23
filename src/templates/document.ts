import type { ContentMetadata } from '../types.js';
import { escapeHtml, renderMarkdown, blockActions } from './shared.js';

function parseMarkdownLine(line: string): { tag: string; content: string } | null {
  const h3 = line.match(/^###\s+(.+)/);
  if (h3) return { tag: 'h3', content: h3[1] };
  const h2 = line.match(/^##\s+(.+)/);
  if (h2) return { tag: 'h2', content: h2[1] };
  const h1 = line.match(/^#\s+(.+)/);
  if (h1) return { tag: 'h1', content: h1[1] };
  return null;
}

export function render(content: string, metadata: ContentMetadata): string {
  const lines = content.split('\n');
  const blocks: string[] = [];
  let blockIdx = 0;
  let currentPara: string[] = [];

  function flushPara() {
    if (currentPara.length === 0) return;
    const text = currentPara.join('\n').trim();
    if (!text) { currentPara = []; return; }
    const blockId = `block-${blockIdx++}`;
    blocks.push(`<div class="sv-block" data-block-id="${blockId}" style="padding:0.5rem 0">
      <p style="margin:0;line-height:1.7;font-size:0.95rem">${renderMarkdown(text).replace(/\n/g, '<br>')}</p>
      ${blockActions(blockId)}
    </div>`);
    currentPara = [];
  }

  for (const line of lines) {
    const heading = parseMarkdownLine(line);
    if (heading) {
      flushPara();
      const blockId = `block-${blockIdx++}`;
      const sizes: Record<string, string> = { h1: '1.5rem', h2: '1.25rem', h3: '1.05rem' };
      const margins: Record<string, string> = { h1: '1.5rem', h2: '1.25rem', h3: '1rem' };
      blocks.push(`<div class="sv-block" data-block-id="${blockId}" style="padding:0.5rem 0;margin-top:${margins[heading.tag]}">
        <${heading.tag} style="font-size:${sizes[heading.tag]};margin:0;line-height:1.3">${renderMarkdown(heading.content)}</${heading.tag}>
        ${blockActions(blockId)}
      </div>`);
    } else if (line.trim() === '') {
      flushPara();
    } else {
      currentPara.push(line);
    }
  }
  flushPara();

  return `<div class="sv-document" style="background:var(--sv-surface);border-top:4px solid var(--sv-gold);border-radius:2px;box-shadow:var(--sv-card-shadow);max-width:680px;min-height:800px;padding:2.5rem 2rem">
  ${blocks.join('\n')}
</div>`;
}
