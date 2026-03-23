import type { ContentMetadata } from '../types.js';
import { escapeHtml, renderMarkdown, blockActions } from './shared.js';

const LINKEDIN_SECTIONS = ['About', 'Experience', 'Education', 'Skills', 'Featured'] as const;

type LinkedInSection = typeof LINKEDIN_SECTIONS[number];

interface ParsedSection {
  name: LinkedInSection | string;
  content: string;
}

function isProfileContent(content: string): boolean {
  const headers = content.match(/^## .+$/gm) || [];
  const matchCount = headers.filter((h) => {
    const name = h.replace(/^## /, '').trim();
    return LINKEDIN_SECTIONS.some((s) => name.toLowerCase() === s.toLowerCase());
  }).length;
  return matchCount >= 2;
}

function parseSections(content: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const lines = content.split('\n');
  let currentSection: ParsedSection | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^## (.+)$/);
    if (headerMatch) {
      if (currentSection) {
        currentSection.content = currentSection.content.trim();
        sections.push(currentSection);
      }
      currentSection = { name: headerMatch[1].trim(), content: '' };
    } else if (currentSection) {
      currentSection.content += line + '\n';
    }
  }

  if (currentSection) {
    currentSection.content = currentSection.content.trim();
    sections.push(currentSection);
  }

  return sections;
}

function aboutCharCount(text: string): string {
  const len = text.length;
  const limit = 2600;
  const color = len > limit ? '#c0392b' : 'var(--sv-muted)';
  const preview = len > 300
    ? `<div style="margin-top:0.5rem;padding:0.5rem;background:rgba(0,0,0,0.03);border-radius:4px;font-size:0.8rem;color:var(--sv-muted)">
        <strong>Preview (first 300 chars):</strong> ${escapeHtml(text.slice(0, 300))}...
      </div>`
    : '';
  return `<div style="font-size:0.75rem;color:${color};margin-top:0.25rem">${len} / ${limit} characters</div>${preview}`;
}

function renderDiffSideBySide(current: string, proposed: string): string {
  const currentSections = parseSections(current);
  const proposedSections = parseSections(proposed);

  const allNames = new Set<string>();
  for (const s of currentSections) allNames.add(s.name);
  for (const s of proposedSections) allNames.add(s.name);

  const rows = Array.from(allNames).map((name) => {
    const cur = currentSections.find((s) => s.name === name);
    const prop = proposedSections.find((s) => s.name === name);
    const changed = cur?.content !== prop?.content;
    const highlight = changed ? 'background:rgba(42,112,71,0.06);' : '';
    return `<tr>
      <td style="padding:0.75rem;vertical-align:top;width:50%;border-bottom:1px solid var(--sv-border);${highlight}">
        <div style="font-weight:600;font-size:0.8rem;color:var(--sv-muted);margin-bottom:0.25rem">${escapeHtml(name)} (Current)</div>
        <div style="white-space:pre-line;font-size:0.875rem;line-height:1.5">${cur ? escapeHtml(cur.content) : '<em style="color:var(--sv-muted)">Not present</em>'}</div>
      </td>
      <td style="padding:0.75rem;vertical-align:top;width:50%;border-bottom:1px solid var(--sv-border);${highlight}">
        <div style="font-weight:600;font-size:0.8rem;color:var(--sv-muted);margin-bottom:0.25rem">${escapeHtml(name)} (Proposed)${changed ? ' <span style="color:#2A7047;font-weight:700">*</span>' : ''}</div>
        <div style="white-space:pre-line;font-size:0.875rem;line-height:1.5">${prop ? escapeHtml(prop.content) : '<em style="color:var(--sv-muted)">Not present</em>'}</div>
      </td>
    </tr>`;
  }).join('');

  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed">${rows}</table>`;
}

function renderProfileLayout(content: string, metadata: ContentMetadata): string {
  const sections = parseSections(content);

  const currentContent = (metadata as ContentMetadata & { currentContent?: string }).currentContent;
  const hasDiff = typeof currentContent === 'string' && currentContent.length > 0;

  const sectionCards = sections.map((section, i) => {
    const blockId = `section-${i}`;
    const isAbout = section.name.toLowerCase() === 'about';
    const charCount = isAbout ? aboutCharCount(section.content) : '';

    return `<div class="sv-block" data-block-id="${blockId}" style="padding:1rem;border-bottom:1px solid var(--sv-border)">
      <div style="font-weight:700;font-size:1rem;margin-bottom:0.5rem">${escapeHtml(section.name)}</div>
      <div style="white-space:pre-line;line-height:1.6;font-size:0.925rem">${renderMarkdown(section.content)}</div>
      ${charCount}
      ${blockActions(blockId)}
    </div>`;
  }).join('');

  const diffPanel = hasDiff
    ? `<div style="margin-top:1rem;border:1px solid var(--sv-border);border-radius:8px;overflow:hidden">
        <div style="padding:0.5rem 1rem;background:rgba(0,0,0,0.03);font-weight:600;font-size:0.85rem;border-bottom:1px solid var(--sv-border)">Current vs Proposed</div>
        ${renderDiffSideBySide(currentContent!, content)}
      </div>`
    : '';

  return `<div class="sv-linkedin-profile" style="background:var(--sv-surface);border:1px solid var(--sv-border);border-radius:12px;overflow:hidden;max-width:650px;box-shadow:var(--sv-card-shadow)">
  <div style="padding:1rem 1.25rem 0.75rem;border-bottom:1px solid var(--sv-border)">
    <div style="font-weight:700;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--sv-muted)">LinkedIn Profile Review</div>
  </div>
  ${sectionCards}
</div>
${diffPanel}`;
}

function renderPostLayout(content: string, metadata: ContentMetadata): string {
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
  const bodyBlocks = paragraphs.map((para, i) => {
    const blockId = `block-${i}`;
    return `<div class="sv-block" data-block-id="${blockId}">
      <div style="white-space:pre-line;line-height:1.6;font-size:0.95rem">${renderMarkdown(para.trim())}</div>
      ${blockActions(blockId)}
    </div>`;
  }).join('');

  return `<div class="sv-linkedin" style="background:var(--sv-surface);border:1px solid var(--sv-border);border-radius:12px;overflow:hidden;max-width:600px;box-shadow:var(--sv-card-shadow)">
  <div style="padding:1.5rem 1.75rem">
    ${bodyBlocks}
  </div>
</div>`;
}

export function render(content: string, metadata: ContentMetadata): string {
  if (isProfileContent(content)) {
    return renderProfileLayout(content, metadata);
  }
  return renderPostLayout(content, metadata);
}
