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

function parsePipeTable(content: string): { headers: string[]; rows: string[][] } | null {
  const lines = content.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return null;

  const parseLine = (line: string): string[] =>
    line.split('|').map(c => c.trim()).filter((_, i, arr) => {
      // Remove empty first/last from leading/trailing pipes
      if (i === 0 && arr[0] === '') return false;
      if (i === arr.length - 1 && arr[arr.length - 1] === '') return false;
      return true;
    });

  const headers = parseLine(lines[0]);
  if (headers.length === 0) return null;

  // Check for separator line (---|----|---)
  let startRow = 1;
  if (lines[1] && /^[\s|:-]+$/.test(lines[1])) {
    startRow = 2;
  }

  const rows: string[][] = [];
  for (let i = startRow; i < lines.length; i++) {
    rows.push(parseLine(lines[i]));
  }

  return { headers, rows };
}

function parseJsonArray(content: string): { headers: string[]; rows: string[][] } | null {
  try {
    const data = JSON.parse(content.trim());
    if (!Array.isArray(data) || data.length === 0) return null;

    const first = data[0];
    if (typeof first !== 'object' || first === null) {
      // Array of arrays
      if (Array.isArray(first)) {
        const headers = data[0].map((_: unknown, i: number) => `Col ${i + 1}`);
        const rows = data.slice(1).map((row: unknown[]) => row.map(String));
        return { headers, rows };
      }
      return null;
    }

    const headers = Object.keys(first);
    const rows = data.map((item: Record<string, unknown>) =>
      headers.map(h => String(item[h] ?? ''))
    );
    return { headers, rows };
  } catch {
    return null;
  }
}

export function render(content: string, metadata: ContentMetadata): string {
  let tableData = parsePipeTable(content);
  if (!tableData) tableData = parseJsonArray(content);

  if (!tableData) {
    // Fallback: render as pre-formatted text
    return `<div class="sv-table sv-block" data-block-id="block-0" style="overflow-x:auto">
  <pre style="font-size:0.9rem;line-height:1.6;margin:0">${escapeHtml(content)}</pre>
  ${blockActions('block-0')}
</div>`;
  }

  const { headers, rows } = tableData;

  // Use metadata columns if provided
  const displayHeaders = metadata.columns && metadata.columns.length > 0 ? metadata.columns : headers;

  const headerCells = displayHeaders.map(h =>
    `<th style="position:sticky;top:0;background:var(--sv-surface);padding:0.625rem 0.75rem;text-align:left;font-weight:600;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.03em;color:var(--sv-muted);border-bottom:2px solid var(--sv-border);white-space:nowrap">${escapeHtml(h)}</th>`
  ).join('');

  const bodyRows = rows.map((row, i) => {
    const blockId = `block-${i}`;
    const bgColor = i % 2 === 1 ? 'background:var(--sv-bg)' : '';
    const cells = row.map(cell =>
      `<td style="padding:0.5rem 0.75rem;font-size:0.9rem;border-bottom:1px solid var(--sv-border)">${escapeHtml(cell)}</td>`
    ).join('');
    return `<tr class="sv-block" data-block-id="${blockId}" style="${bgColor}">
      ${cells}
    </tr>`;
  }).join('');

  // Block actions on the whole table
  return `<div class="sv-table" style="overflow-x:auto;border:1px solid var(--sv-border);border-radius:8px;box-shadow:var(--sv-card-shadow)">
  <div class="sv-block" data-block-id="block-table" style="padding:0">
    <table style="width:100%;border-collapse:collapse;min-width:400px">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    ${blockActions('block-table')}
  </div>
</div>`;
}
