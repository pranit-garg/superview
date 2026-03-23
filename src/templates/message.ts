import type { ContentMetadata } from '../types.js';
import { escapeHtml, renderMarkdown, blockActions } from './shared.js';

export function render(content: string, metadata: ContentMetadata): string {
  const timestamp = metadata.timestamp || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const platform = metadata.platform || '';

  return `<div class="sv-message" style="display:flex;flex-direction:column;align-items:flex-end;max-width:550px">
  ${platform ? `<div style="font-size:0.7rem;color:var(--sv-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem;align-self:flex-start">${escapeHtml(platform)}</div>` : ''}
  <div class="sv-block" data-block-id="block-0" style="background:var(--sv-interactive);color:#fff;padding:0.75rem 1rem;border-radius:18px 18px 4px 18px;max-width:85%;box-shadow:var(--sv-card-shadow);position:relative">
    <p style="margin:0;line-height:1.5;font-size:0.95rem">${renderMarkdown(content.trim()).replace(/\n/g, '<br>')}</p>
    ${blockActions('block-0')}
  </div>
  <div style="font-size:0.7rem;color:var(--sv-muted);margin-top:0.35rem;padding-right:0.25rem">${escapeHtml(timestamp)}</div>
</div>`;
}
