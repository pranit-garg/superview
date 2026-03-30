import type { ContentMetadata } from '../types.js';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderMarkdown(s: string): string {
  let out = escapeHtml(s);
  // Inline code (before other formatting to protect content)
  out = out.replace(/`([^`]+)`/g, '<code style="background:var(--sv-border);padding:0.1rem 0.35rem;border-radius:3px;font-size:0.85em">$1</code>');
  // Images before links (![alt](src) contains [)
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px;margin:0.5rem 0">');
  // Links
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Bold
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic (after bold to avoid conflicts with **)
  out = out.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  // Blockquotes (lines starting with > )
  out = out.replace(/^&gt; (.+)$/gm, '<div style="border-left:3px solid var(--sv-border);padding-left:0.75rem;color:var(--sv-muted);font-style:italic;margin:0.5rem 0">$1</div>');
  return out;
}

interface StructuredMarkdownOptions {
  startIndex?: number;
  blockStyle?: string;
  paragraphStyle?: string;
  listStyle?: string;
  orderedListStyle?: string;
  blockquoteStyle?: string;
  metadataBlockStyle?: string;
  metadataRowStyle?: string;
  metadataLabelStyle?: string;
  headingWrapperMargins?: Partial<Record<'h1' | 'h2' | 'h3', string>>;
  headingStyles?: Partial<Record<'h1' | 'h2' | 'h3', string>>;
  hrStyle?: string;
  tableWrapperStyle?: string;
  tableStyle?: string;
  tableHeaderCellStyle?: string;
  tableCellStyle?: string;
  suppressLeadingHeadingText?: string;
}

export type StructuredMarkdownBlockKind =
  | 'heading'
  | 'paragraph'
  | 'unordered_list'
  | 'ordered_list'
  | 'blockquote'
  | 'metadata'
  | 'hr'
  | 'table';

export interface StructuredMarkdownBlock {
  kind: StructuredMarkdownBlockKind;
  editable: boolean;
  rawLines: string[];
  text?: string;
  level?: 1 | 2 | 3;
}

export interface HeaderField {
  label: string;
  value: string;
}

export interface MarkdownSection {
  heading: string | null;
  body: string;
}

export function parseHeaderField(line: string): HeaderField | null {
  const normalized = line
    .trim()
    .replace(/^\*\*(To|From|Subject|Cc|Bcc|Reply-To):\*\*\s*/i, '$1: ')
    .replace(/^\*\*(To|From|Subject|Cc|Bcc|Reply-To)\*\*:\s*/i, '$1: ');
  const match = normalized.match(/^(To|From|Subject|Cc|Bcc|Reply-To):\s*(.+)$/i);
  if (!match) return null;
  return {
    label: match[1].replace(/\b\w/g, (char) => char.toUpperCase()),
    value: match[2].trim(),
  };
}

export function extractLeadingHeaderFields(content: string): { fields: HeaderField[]; body: string } {
  const lines = content.split('\n');
  const fields: HeaderField[] = [];
  let index = 0;

  while (index < lines.length) {
    const parsed = parseHeaderField(lines[index]);
    if (!parsed) break;
    fields.push(parsed);
    index += 1;
  }

  while (index < lines.length && lines[index].trim() === '') {
    index += 1;
  }

  return {
    fields,
    body: lines.slice(index).join('\n').trim(),
  };
}

export function splitTopLevelSections(content: string): MarkdownSection[] {
  const lines = content.split('\n');
  const sections: MarkdownSection[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  function pushSection(): void {
    const body = currentLines.join('\n').trim();
    if (!body && !currentHeading) return;
    sections.push({
      heading: currentHeading,
      body,
    });
  }

  for (const line of lines) {
    const headingMatch = line.match(/^#\s+(.+)$/);
    if (headingMatch) {
      pushSection();
      currentHeading = headingMatch[1].trim();
      currentLines = [];
      continue;
    }
    currentLines.push(line);
  }

  pushSection();

  return sections.length > 0
    ? sections
    : [{ heading: null, body: content.trim() }];
}

export function encodeCopyText(text: string): string {
  return encodeURIComponent(text);
}

export function copyDataAttributes(text: string, options: { primary?: boolean } = {}): string {
  const attrs = [`data-sv-copy-text="${encodeCopyText(text)}"`];
  if (options.primary) {
    attrs.push('data-sv-primary-copy="true"');
  }
  return attrs.join(' ');
}

export function editableDataAttributes(
  text: string,
  options: { format?: 'markdown' | 'plain'; kind?: string } = {},
): string {
  const attrs = [
    'data-editable-target="true"',
    `data-sv-edit-source="${encodeCopyText(text)}"`,
    `data-sv-edit-format="${options.format || 'markdown'}"`,
  ];
  if (options.kind) {
    attrs.push(`data-sv-edit-kind="${escapeHtml(options.kind)}"`);
  }
  return attrs.join(' ');
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparatorLine(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

function isHorizontalRule(line: string): boolean {
  return /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

function normalizeComparableText(text: string): string {
  return plainText(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function parseStructuredMarkdownBlocks(content: string): StructuredMarkdownBlock[] {
  const lines = content.split('\n');
  const blocks: StructuredMarkdownBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let orderedListItems: string[] = [];
  let blockquoteLines: string[] = [];
  let metadataLines: string[] = [];
  let tableLines: string[] = [];

  function flushParagraph(): void {
    if (paragraphLines.length === 0) return;
    const text = paragraphLines.join('\n').trim();
    const rawLines = paragraphLines.slice();
    paragraphLines = [];
    if (!text) return;
    blocks.push({ kind: 'paragraph', editable: true, text, rawLines });
  }

  function flushList(): void {
    if (listItems.length === 0) return;
    blocks.push({
      kind: 'unordered_list',
      editable: false,
      rawLines: listItems.map((item) => `- ${item}`),
    });
    listItems = [];
  }

  function flushOrderedList(): void {
    if (orderedListItems.length === 0) return;
    blocks.push({
      kind: 'ordered_list',
      editable: false,
      rawLines: orderedListItems.map((item, index) => `${index + 1}. ${item}`),
    });
    orderedListItems = [];
  }

  function flushBlockquote(): void {
    if (blockquoteLines.length === 0) return;
    const text = blockquoteLines.join('\n').trim();
    const rawLines = blockquoteLines.map((line) => `> ${line}`);
    blockquoteLines = [];
    if (!text) return;
    blocks.push({ kind: 'blockquote', editable: true, text, rawLines });
  }

  function flushMetadata(): void {
    if (metadataLines.length === 0) return;
    blocks.push({ kind: 'metadata', editable: false, rawLines: metadataLines.slice() });
    metadataLines = [];
  }

  function flushTable(): void {
    if (tableLines.length === 0) return;
    blocks.push({ kind: 'table', editable: false, rawLines: tableLines.slice() });
    tableLines = [];
  }

  function flushAll(): void {
    flushParagraph();
    flushList();
    flushOrderedList();
    flushBlockquote();
    flushMetadata();
    flushTable();
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    const unorderedMatch = line.match(/^[-*+]\s+(.+)$/);
    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    const blockquoteMatch = line.match(/^>\s?(.*)$/);
    const headerField = parseHeaderField(line.trim());
    const tableLine = /^\s*\|.*\|\s*$/.test(line.trim());

    if (headingMatch) {
      flushAll();
      blocks.push({
        kind: 'heading',
        editable: true,
        text: headingMatch[2].trim(),
        level: Math.min(3, headingMatch[1].length) as 1 | 2 | 3,
        rawLines: [line],
      });
      continue;
    }

    if (isHorizontalRule(line)) {
      flushAll();
      blocks.push({ kind: 'hr', editable: false, rawLines: [line.trim() || '---'] });
      continue;
    }

    if (tableLine) {
      flushParagraph();
      flushList();
      flushOrderedList();
      flushBlockquote();
      flushMetadata();
      tableLines.push(line);
      continue;
    }
    flushTable();

    if (headerField) {
      flushParagraph();
      flushList();
      flushOrderedList();
      flushBlockquote();
      metadataLines.push(line.trim());
      continue;
    }
    flushMetadata();

    if (unorderedMatch) {
      flushParagraph();
      flushOrderedList();
      flushBlockquote();
      listItems.push(unorderedMatch[1]);
      continue;
    }
    flushList();

    if (orderedMatch) {
      flushParagraph();
      flushList();
      flushBlockquote();
      orderedListItems.push(orderedMatch[1]);
      continue;
    }
    flushOrderedList();

    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      flushOrderedList();
      blockquoteLines.push(blockquoteMatch[1]);
      continue;
    }
    flushBlockquote();

    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    paragraphLines.push(line);
  }

  flushAll();

  return blocks;
}

export function serializeStructuredMarkdownBlocks(blocks: StructuredMarkdownBlock[]): string {
  const renderedBlocks = blocks.map((block) => {
    switch (block.kind) {
      case 'heading':
        return `${'#'.repeat(block.level || 1)} ${(block.text || '').trim()}`.trimEnd();
      case 'paragraph':
        return (block.text || '').trim();
      case 'blockquote':
        return (block.text || '')
          .split('\n')
          .map((line) => `> ${line}`.trimEnd())
          .join('\n')
          .trim();
      default:
        return block.rawLines.join('\n').trim();
    }
  }).filter(Boolean);

  return renderedBlocks.join('\n\n').trim();
}

export function renderStructuredMarkdown(content: string, metadata: ContentMetadata, options: StructuredMarkdownOptions = {}): string {
  const blockStyle = options.blockStyle || 'padding:0.5rem 0';
  const paragraphStyle = options.paragraphStyle || 'margin:0;line-height:1.7';
  const listStyle = options.listStyle || 'margin:0;padding-left:1.5rem;line-height:1.7';
  const orderedListStyle = options.orderedListStyle || listStyle;
  const blockquoteStyle = options.blockquoteStyle || 'margin:0;padding:0.5rem 1rem;border-left:3px solid var(--sv-interactive);color:var(--sv-muted);font-style:italic;line-height:1.7';
  const metadataBlockStyle = options.metadataBlockStyle || 'padding:0.85rem 1rem;border:1px solid var(--sv-border);border-radius:10px;background:color-mix(in srgb, var(--sv-surface) 84%, var(--sv-bg) 16%)';
  const metadataRowStyle = options.metadataRowStyle || 'margin-bottom:0.35rem';
  const metadataLabelStyle = options.metadataLabelStyle || 'color:var(--sv-muted);font-size:0.78rem;display:inline-block;width:70px';
  const headingWrapperMargins = {
    h1: '1.5rem',
    h2: '1.25rem',
    h3: '1rem',
    ...(options.headingWrapperMargins || {}),
  };
  const headingStyles = {
    h1: 'font-size:1.5rem;margin:0;line-height:1.3',
    h2: 'font-size:1.25rem;margin:0;line-height:1.35',
    h3: 'font-size:1.05rem;margin:0;line-height:1.4',
    ...(options.headingStyles || {}),
  };
  const hrStyle = options.hrStyle || 'border:none;border-top:1px solid var(--sv-border);margin:0.25rem 0';
  const tableWrapperStyle = options.tableWrapperStyle || 'overflow-x:auto';
  const tableStyle = options.tableStyle || 'width:100%;border-collapse:collapse;font-size:0.92rem;line-height:1.6';
  const tableHeaderCellStyle = options.tableHeaderCellStyle || 'text-align:left;padding:0.55rem 0.65rem;border-bottom:1px solid var(--sv-border);color:var(--sv-muted);font-size:0.76rem;text-transform:uppercase;letter-spacing:0.04em';
  const tableCellStyle = options.tableCellStyle || 'padding:0.6rem 0.65rem;border-bottom:1px solid var(--sv-border);vertical-align:top';
  const suppressedHeading = normalizeComparableText(options.suppressLeadingHeadingText || '');

  const lines = content.split('\n');
  const blocks: string[] = [];
  let blockIndex = options.startIndex || 0;
  let hasRenderedContent = false;
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let orderedListItems: string[] = [];
  let blockquoteLines: string[] = [];
  let metadataLines: string[] = [];
  let tableLines: string[] = [];

  function nextBlockId(): string {
    return scopedBlockId(metadata, `block-${blockIndex++}`);
  }

  function pushBlock(innerHtml: string, includeActions = true, copyText = ''): void {
    const blockId = nextBlockId();
    const copyAttrs = copyText ? ` ${copyDataAttributes(copyText)}` : '';
    blocks.push(`<div class="sv-block" data-block-id="${blockId}"${copyAttrs} style="${blockStyle}">
      ${innerHtml}
      ${includeActions ? blockActions(blockId, metadata) : ''}
    </div>`);
    hasRenderedContent = true;
  }

  function flushParagraph(): void {
    if (paragraphLines.length === 0) return;
    const text = paragraphLines.join('\n').trim();
    paragraphLines = [];
    if (!text) return;
    pushBlock(`<p ${editableDataAttributes(text, { format: 'markdown', kind: 'paragraph' })} style="${paragraphStyle}">${renderMarkdown(text).replace(/\n/g, '<br>')}</p>`, true, text);
  }

  function flushList(): void {
    if (listItems.length === 0) return;
    const items = listItems.map((item) => `<li style="margin-bottom:0.25rem">${renderMarkdown(item)}</li>`).join('');
    pushBlock(`<ul style="${listStyle}">${items}</ul>`, false, listItems.map((item) => `- ${item}`).join('\n'));
    listItems = [];
  }

  function flushOrderedList(): void {
    if (orderedListItems.length === 0) return;
    const items = orderedListItems.map((item) => `<li style="margin-bottom:0.25rem">${renderMarkdown(item)}</li>`).join('');
    pushBlock(`<ol style="${orderedListStyle}">${items}</ol>`, false, orderedListItems.map((item, index) => `${index + 1}. ${item}`).join('\n'));
    orderedListItems = [];
  }

  function flushBlockquote(): void {
    if (blockquoteLines.length === 0) return;
    const quoteHtml = blockquoteLines.map((line) => renderMarkdown(line)).join('<br>');
    const quoteText = blockquoteLines.join('\n').trim();
    pushBlock(`<blockquote ${editableDataAttributes(quoteText, { format: 'markdown', kind: 'blockquote' })} style="${blockquoteStyle}">${quoteHtml}</blockquote>`, true, quoteText);
    blockquoteLines = [];
  }

  function flushMetadata(): void {
    if (metadataLines.length === 0) return;
    const fields = metadataLines
      .map(parseHeaderField)
      .filter((field): field is { label: string; value: string } => Boolean(field))
      .map((field) => `<div style="${metadataRowStyle}"><strong style="${metadataLabelStyle}">${escapeHtml(field.label)}:</strong> ${renderMarkdown(field.value)}</div>`)
      .join('');
    if (fields) {
      pushBlock(`<div style="${metadataBlockStyle}">${fields}</div>`, true, metadataLines.join('\n').trim());
    }
    metadataLines = [];
  }

  function flushTable(): void {
    if (tableLines.length === 0) return;
    const rows = tableLines.map(splitTableRow);
    const hasHeader = tableLines.length > 1 && isTableSeparatorLine(tableLines[1]);
    const headerCells = hasHeader ? rows[0] : null;
    const bodyRows = rows.filter((_, index) => !(hasHeader && index < 2));
    const theadHtml = headerCells
      ? `<thead><tr>${headerCells.map((cell) => `<th style="${tableHeaderCellStyle}">${renderMarkdown(cell)}</th>`).join('')}</tr></thead>`
      : '';
    const tbodyHtml = bodyRows.length > 0
      ? `<tbody>${bodyRows.map((row) => `<tr>${row.map((cell) => `<td style="${tableCellStyle}">${renderMarkdown(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`
      : '';
    pushBlock(`<div style="${tableWrapperStyle}"><table style="${tableStyle}">${theadHtml}${tbodyHtml}</table></div>`, false, tableLines.join('\n').trim());
    tableLines = [];
  }

  function flushAll(): void {
    flushParagraph();
    flushList();
    flushOrderedList();
    flushBlockquote();
    flushMetadata();
    flushTable();
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    const unorderedMatch = line.match(/^[-*+]\s+(.+)$/);
    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    const blockquoteMatch = line.match(/^>\s?(.*)$/);
    const headerField = parseHeaderField(line.trim());
    const tableLine = /^\s*\|.*\|\s*$/.test(line.trim());

    if (headingMatch) {
      flushAll();
      if (!hasRenderedContent && suppressedHeading && normalizeComparableText(headingMatch[2]) === suppressedHeading) {
        continue;
      }
      const tag = (`h${headingMatch[1].length}`) as 'h1' | 'h2' | 'h3';
      pushBlock(
        `<${tag} ${editableDataAttributes(headingMatch[2], { format: 'markdown', kind: tag })} style="${headingStyles[tag]}">${renderMarkdown(headingMatch[2])}</${tag}>`,
        true,
        headingMatch[2],
      );
      const latestBlock = blocks[blocks.length - 1];
      blocks[blocks.length - 1] = latestBlock.replace(`style="${blockStyle}"`, `style="${blockStyle};margin-top:${headingWrapperMargins[tag]}"`);
      continue;
    }

    if (isHorizontalRule(line)) {
      flushAll();
      pushBlock(`<hr style="${hrStyle}">`, false);
      continue;
    }

    if (tableLine) {
      flushParagraph();
      flushList();
      flushOrderedList();
      flushBlockquote();
      flushMetadata();
      tableLines.push(line);
      continue;
    }
    flushTable();

    if (headerField) {
      flushParagraph();
      flushList();
      flushOrderedList();
      flushBlockquote();
      metadataLines.push(line.trim());
      continue;
    }
    flushMetadata();

    if (unorderedMatch) {
      flushParagraph();
      flushOrderedList();
      flushBlockquote();
      listItems.push(unorderedMatch[1]);
      continue;
    }
    flushList();

    if (orderedMatch) {
      flushParagraph();
      flushList();
      flushBlockquote();
      orderedListItems.push(orderedMatch[1]);
      continue;
    }
    flushOrderedList();

    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      flushOrderedList();
      blockquoteLines.push(blockquoteMatch[1]);
      continue;
    }
    flushBlockquote();

    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    paragraphLines.push(line);
  }

  flushAll();

  return blocks.join('\n');
}

export function plainText(s: string): string {
  let out = s;
  // Remove images entirely
  out = out.replace(/!\[([^\]]*)\]\([^)]+\)/g, '');
  // Links -> keep text
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Remove bold markers
  out = out.replace(/\*\*/g, '');
  // Remove blockquote markers
  out = out.replace(/^> /gm, '');
  return out;
}

export function scopedBlockId(metadata: ContentMetadata, id: string): string {
  const prefix = metadata.blockIdPrefix?.trim();
  return prefix ? `${prefix}${id}` : id;
}

export function blockActions(id: string, metadata?: ContentMetadata): string {
  if (metadata?.interactive === false) return '';
  return `<div class="sv-block-actions">
  <button class="sv-block-action" onclick="copyBlock(this, event)" title="Copy block">&#128203;</button>
  <button class="sv-block-action" onclick="openBlockComment('${id}')" title="Comment">&#128172;</button>
</div>`;
}
