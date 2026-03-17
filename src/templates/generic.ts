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

function parseInlineMarkdown(text: string): string {
  let result = escapeHtml(text);
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code style="background:var(--sv-border);padding:0.1rem 0.35rem;border-radius:3px;font-size:0.85em">$1</code>');
  return result;
}

export function render(content: string, metadata: ContentMetadata): string {
  const lines = content.split('\n');
  const blocks: string[] = [];
  let blockIdx = 0;
  let currentPara: string[] = [];
  let inList = false;
  let listItems: string[] = [];
  let inBlockquote = false;
  let bqLines: string[] = [];

  function flushPara() {
    if (currentPara.length === 0) return;
    const text = currentPara.join('\n').trim();
    if (!text) { currentPara = []; return; }
    const blockId = `block-${blockIdx++}`;
    blocks.push(`<div class="sv-block" data-block-id="${blockId}" style="padding:0.5rem 0">
      <p style="margin:0;line-height:1.7">${parseInlineMarkdown(text)}</p>
      ${blockActions(blockId)}
    </div>`);
    currentPara = [];
  }

  function flushList() {
    if (listItems.length === 0) return;
    const blockId = `block-${blockIdx++}`;
    const items = listItems.map(li => `<li style="margin-bottom:0.25rem">${parseInlineMarkdown(li)}</li>`).join('');
    blocks.push(`<div class="sv-block" data-block-id="${blockId}" style="padding:0.5rem 0">
      <ul style="margin:0;padding-left:1.5rem;line-height:1.7">${items}</ul>
      ${blockActions(blockId)}
    </div>`);
    listItems = [];
    inList = false;
  }

  function flushBlockquote() {
    if (bqLines.length === 0) return;
    const blockId = `block-${blockIdx++}`;
    const text = bqLines.join('<br>');
    blocks.push(`<div class="sv-block" data-block-id="${blockId}" style="padding:0.5rem 0">
      <blockquote style="margin:0;padding:0.5rem 1rem;border-left:3px solid var(--sv-accent);color:var(--sv-muted);font-style:italic;line-height:1.7">${text}</blockquote>
      ${blockActions(blockId)}
    </div>`);
    bqLines = [];
    inBlockquote = false;
  }

  for (const line of lines) {
    // Headers
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = !h3 ? line.match(/^##\s+(.+)/) : null;
    const h1 = !h3 && !h2 ? line.match(/^#\s+(.+)/) : null;
    const heading = h3 || h2 || h1;

    if (heading) {
      flushPara();
      flushList();
      flushBlockquote();
      const tag = h3 ? 'h3' : h2 ? 'h2' : 'h1';
      const sizes: Record<string, string> = { h1: '1.5rem', h2: '1.25rem', h3: '1.05rem' };
      const blockId = `block-${blockIdx++}`;
      blocks.push(`<div class="sv-block" data-block-id="${blockId}" style="padding:0.5rem 0;margin-top:1.25rem">
        <${tag} style="font-size:${sizes[tag]};margin:0;line-height:1.3">${parseInlineMarkdown(heading[1])}</${tag}>
        ${blockActions(blockId)}
      </div>`);
      continue;
    }

    // List items
    const listMatch = line.match(/^[-*]\s+(.+)/);
    if (listMatch) {
      flushPara();
      flushBlockquote();
      inList = true;
      listItems.push(listMatch[1]);
      continue;
    } else if (inList) {
      flushList();
    }

    // Blockquote
    const bqMatch = line.match(/^>\s?(.*)/);
    if (bqMatch) {
      flushPara();
      flushList();
      inBlockquote = true;
      bqLines.push(parseInlineMarkdown(bqMatch[1]));
      continue;
    } else if (inBlockquote) {
      flushBlockquote();
    }

    // Empty line
    if (line.trim() === '') {
      flushPara();
      continue;
    }

    currentPara.push(line);
  }

  flushPara();
  flushList();
  flushBlockquote();

  return `<div class="sv-article" style="max-width:640px;line-height:1.7;font-size:0.95rem">
  ${blocks.join('\n')}
</div>`;
}
