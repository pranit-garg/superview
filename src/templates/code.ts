import type { ContentMetadata } from '../types.js';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function blockActions(id: string): string {
  return `<div class="sv-block-actions">
  <button class="sv-block-action" onclick="openBlockComment('${id}')" title="Comment">&#128172;</button>
  <button class="sv-block-action" onclick="react('${id}','thumbs_up')" title="Like">&#128077;</button>
  <button class="sv-block-action" onclick="react('${id}','thumbs_down')" title="Dislike">&#128078;</button>
</div>
<div class="sv-feedback-input" data-block="${id}">
  <textarea class="sv-feedback-textarea" placeholder="Add comment..."></textarea>
  <button class="sv-feedback-submit" onclick="submitBlockComment('${id}')">Submit</button>
</div>`;
}

function highlightSyntax(escaped: string): string {
  // Comments (// and # style, already escaped)
  let result = escaped.replace(/(\/\/[^\n]*)/g, '<span style="color:#6a9955">$1</span>');
  result = result.replace(/(^|\n)(#[^\n]*)/g, '$1<span style="color:#6a9955">$2</span>');

  // Strings (double and single quoted)
  result = result.replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)/g, '<span style="color:#ce9178">$1</span>');
  result = result.replace(/('(?:[^'\\]|\\.)*?')/g, '<span style="color:#ce9178">$1</span>');

  // Numbers
  result = result.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#b5cea8">$1</span>');

  // Keywords
  const keywords = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'from', 'default', 'new', 'this', 'async', 'await', 'try', 'catch', 'throw', 'switch', 'case', 'break', 'continue', 'type', 'interface', 'extends', 'implements', 'public', 'private', 'protected', 'static', 'void', 'null', 'undefined', 'true', 'false', 'def', 'self', 'print', 'in', 'not', 'and', 'or', 'None', 'True', 'False', 'fn', 'pub', 'use', 'mod', 'struct', 'enum', 'impl', 'trait', 'mut', 'match'];
  const kwPattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
  result = result.replace(kwPattern, '<span style="color:#569cd6">$1</span>');

  return result;
}

export function render(content: string, metadata: ContentMetadata): string {
  const language = metadata.language || '';
  const filename = metadata.filename || '';

  // Strip leading/trailing ``` fences if present
  let code = content.trim();
  if (code.startsWith('```')) {
    const firstNewline = code.indexOf('\n');
    code = code.slice(firstNewline + 1);
  }
  if (code.endsWith('```')) {
    code = code.slice(0, -3);
  }
  code = code.trimEnd();

  const lines = code.split('\n');
  const lineNumWidth = String(lines.length).length;

  const codeLines = lines.map((line, i) => {
    const num = String(i + 1).padStart(lineNumWidth, ' ');
    const escaped = escapeHtml(line);
    const highlighted = highlightSyntax(escaped);
    return `<div style="display:flex"><span style="color:#858585;user-select:none;text-align:right;min-width:${lineNumWidth + 1}ch;padding-right:1.5ch;flex-shrink:0">${num}</span><span style="flex:1;white-space:pre-wrap;word-break:break-all">${highlighted}</span></div>`;
  }).join('');

  const labelHtml = (language || filename) ? `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 1rem;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.75rem">
    <span style="color:#858585">${escapeHtml(filename || language)}</span>
    ${language && filename ? `<span style="color:#858585">${escapeHtml(language)}</span>` : ''}
  </div>` : '';

  return `<div class="sv-code" style="background:#1e1e1e;color:#d4d4d4;border-radius:8px;overflow:hidden;box-shadow:var(--sv-card-shadow)">
  ${labelHtml}
  <div class="sv-block" data-block-id="block-0" style="padding:1rem;font-size:0.85rem;line-height:1.6;overflow-x:auto">
    <pre style="margin:0;font-family:inherit">${codeLines}</pre>
    ${blockActions('block-0')}
  </div>
</div>`;
}
