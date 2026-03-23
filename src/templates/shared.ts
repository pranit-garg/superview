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

export function blockActions(id: string): string {
  return `<div class="sv-block-actions">
  <button class="sv-block-action" onclick="openBlockComment('${id}')" title="Comment">&#128172;</button>
</div>`;
}
