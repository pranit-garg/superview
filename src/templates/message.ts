import type { ContentMetadata } from '../types.js';
import {
  escapeHtml,
  renderStructuredMarkdown,
  splitTopLevelSections,
  extractLeadingHeaderFields,
  copyDataAttributes,
} from './shared.js';

type SectionKind = 'message' | 'email' | 'notes' | 'context';
export const UNTITLED_MESSAGE_SENTINEL = '__sv_message_draft__';

export interface SectionModel {
  title: string | null;
  body: string;
  kind: SectionKind;
  copyText: string;
}

function isRuleLine(line: string): boolean {
  return /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

function trimStructuralSeparators(body: string): string {
  const lines = body.split('\n');
  while (lines.length > 0 && (lines[0].trim() === '' || isRuleLine(lines[0]))) {
    lines.shift();
  }
  while (lines.length > 0 && (lines[lines.length - 1].trim() === '' || isRuleLine(lines[lines.length - 1]))) {
    lines.pop();
  }
  return lines.join('\n').trim();
}

function trimTrailingTimestamps(lines: string[]): string[] {
  const copy = lines.slice();
  while (copy.length > 0 && /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(copy[copy.length - 1].trim())) {
    copy.pop();
  }
  return copy;
}

function stripLegacyUiNoise(lines: string[]): string[] {
  const noisePattern = /^(context|reference notes|message draft|telegram draft|whatsapp draft|dm draft|email draft)$/i;
  return lines.filter((line) => !noisePattern.test(line.trim()));
}

function detectLegacySections(content: string): Array<{ title: string | null; body: string }> | null {
  const lines = stripLegacyUiNoise(content.split('\n').map((line) => line.trimEnd()));
  const firstMeaningful = lines.find((line) => line.trim());
  if (!firstMeaningful) return null;
  const titleIndex = lines.findIndex((line) => line.trim() === firstMeaningful);
  const draftMarkerIndex = lines.findIndex((line, index) =>
    index > titleIndex && /^(?:polished|revised|final|original)?\s*draft$/i.test(line.trim()),
  );

  if (titleIndex !== 0 || draftMarkerIndex < 0) {
    return null;
  }

  const notesIndex = lines.findIndex((line, index) =>
    index > draftMarkerIndex && /^(changes from original|notes|reference notes?)$/i.test(line.trim()),
  );

  const bodyLines = lines
    .slice(draftMarkerIndex + 1, notesIndex >= 0 ? notesIndex : undefined)
    .filter((line) => line.trim());
  if (bodyLines.length === 0) return null;

  const sections: Array<{ title: string | null; body: string }> = [
    {
      title: firstMeaningful,
      body: bodyLines.join('\n').trim(),
    },
  ];

  if (notesIndex >= 0) {
    const noteLines = trimTrailingTimestamps(lines.slice(notesIndex + 1)).filter((line) => line.trim());
    if (noteLines.length > 0) {
      sections.push({
        title: lines[notesIndex].trim() || 'Notes',
        body: noteLines.join('\n').trim(),
      });
    }
  }

  return sections;
}

function detectLooseLegacySections(content: string): Array<{ title: string | null; body: string }> | null {
  if (/^\s*#\s+/m.test(content)) return null;
  const lines = trimTrailingTimestamps(
    stripLegacyUiNoise(content.split('\n').map((line) => line.trim())).filter(Boolean),
  );
  if (lines.length === 0) return null;

  const notesIndex = lines.findIndex((line) => /^(changes from original|notes|reference notes?)$/i.test(line));
  const bodyLines = (notesIndex >= 0 ? lines.slice(0, notesIndex) : lines.slice()).filter(Boolean);
  if (bodyLines.length === 0) return null;

  let title: string | null = null;
  if (
    bodyLines[0]
    && bodyLines[0].length < 90
    && !/[.!?]$/.test(bodyLines[0])
    && /^[A-Z]/.test(bodyLines[0])
    && (
      /[—–:-]/.test(bodyLines[0])
      || /\b(telegram|whats?app|email|dm|draft|final|revised|polished|message)\b/i.test(bodyLines[0])
    )
  ) {
    title = bodyLines.shift() || null;
  }
  if (!title) {
    title = UNTITLED_MESSAGE_SENTINEL;
  }

  const sections: Array<{ title: string | null; body: string }> = [
    {
      title,
      body: bodyLines.join('\n').trim(),
    },
  ];

  if (notesIndex >= 0) {
    const noteLines = lines.slice(notesIndex + 1).filter(Boolean);
    if (noteLines.length > 0) {
      sections.push({
        title: lines[notesIndex],
        body: noteLines.join('\n').trim(),
      });
    }
  }

  return sections;
}

function classifySection(title: string | null, body: string): SectionKind {
  const lowerTitle = (title || '').toLowerCase();
  const { fields } = extractLeadingHeaderFields(body);

  if (title === UNTITLED_MESSAGE_SENTINEL) {
    return 'message';
  }

  if (
    fields.length > 0
    || /\bemail\b/.test(lowerTitle)
    || /\bsubject\b/i.test(body)
  ) {
    return 'email';
  }

  if (
    /\b(sequence|sequencing|plan|notes?|reference|next steps?|follow-?up|context|brief|changes from original)\b/.test(lowerTitle)
  ) {
    return 'notes';
  }

  if (!title && body.trim().length > 0) {
    return 'context';
  }

  return 'message';
}

export function buildSectionModels(content: string): SectionModel[] {
  const normalizedSections = detectLegacySections(content.trim())
    || detectLooseLegacySections(content.trim())
    || splitTopLevelSections(content.trim());
  return normalizedSections
    .filter((section) => ('heading' in section ? section.heading : section.title) || section.body)
    .map((section) => {
      const title = 'heading' in section ? section.heading : section.title;
      const body = trimStructuralSeparators(section.body.trim());
      const kind = classifySection(title, body);
      const { fields, body: emailBody } = extractLeadingHeaderFields(body);
      const copyText = kind === 'email'
        ? [
            fields.map((field) => `${field.label}: ${field.value}`).join('\n'),
            trimStructuralSeparators(emailBody),
          ].filter(Boolean).join('\n\n').trim()
        : trimStructuralSeparators(body);

      return {
        title,
        body,
        kind,
        copyText,
      };
    });
}

function sectionEyebrow(kind: SectionKind, title: string | null, platform: string): string {
  if (kind === 'message') {
    if (title && /\btelegram\b/i.test(title)) return 'Telegram draft';
    if (title && /\bwhats?app\b/i.test(title)) return 'WhatsApp draft';
    if (title && /\bdm\b/i.test(title)) return 'DM draft';
    if (platform) return `${platform} draft`;
    return 'Message draft';
  }
  if (kind === 'email') return 'Email draft';
  if (kind === 'notes') return 'Reference notes';
  return 'Context';
}

function renderSectionHeader(section: SectionModel, platform: string, withCopyButton: boolean): string {
  const eyebrow = sectionEyebrow(section.kind, section.title, platform);
  const buttonLabel = section.kind === 'email' ? 'Copy email' : 'Copy draft';
  const visibleTitle = section.title === UNTITLED_MESSAGE_SENTINEL ? '' : (section.title || '');

  return `<div class="sv-message-section-header">
    <div class="sv-message-section-top">
      <div class="sv-message-section-eyebrow">${escapeHtml(eyebrow)}</div>
      ${withCopyButton ? `<button class="sv-btn sv-inline-copy-btn sv-message-section-copy" type="button" ${copyDataAttributes(section.copyText)} onclick="copyPayload(this, event)">${buttonLabel}</button>` : ''}
    </div>
    ${visibleTitle ? `<h2 class="sv-message-section-title">${escapeHtml(visibleTitle)}</h2>` : ''}
  </div>`;
}

function renderMessageBody(content: string, metadata: ContentMetadata): string {
  return renderStructuredMarkdown(content, metadata, {
    blockStyle: 'padding:0.35rem 0',
    paragraphStyle: 'margin:0;line-height:1.75;font-size:1rem',
    listStyle: 'margin:0;padding-left:1.4rem;line-height:1.75',
    orderedListStyle: 'margin:0;padding-left:1.45rem;line-height:1.75',
    blockquoteStyle: 'margin:0;padding:0.65rem 0.9rem;border-left:3px solid var(--sv-interactive);border-radius:0 10px 10px 0;background:color-mix(in srgb, var(--sv-selection) 60%, transparent 40%);color:var(--sv-text);font-style:italic;line-height:1.7',
    metadataBlockStyle: 'padding:0.85rem 1rem;border:1px solid var(--sv-border);border-radius:12px;background:color-mix(in srgb, var(--sv-surface) 90%, var(--sv-bg) 10%)',
    hrStyle: 'border:none;border-top:1px solid var(--sv-border);margin:0.35rem 0',
    tableWrapperStyle: 'overflow-x:auto;padding-bottom:0.1rem',
  });
}

function renderEmailSection(section: SectionModel, metadata: ContentMetadata, sectionIndex: number, isPrimary: boolean, platform: string): string {
  const sectionMetadata = {
    ...metadata,
    blockIdPrefix: `${metadata.blockIdPrefix || ''}section-${sectionIndex}-`,
  };
  const { fields, body } = extractLeadingHeaderFields(section.body);
  const headerHtml = fields.length > 0
    ? `<div style="padding:0.9rem 1rem;border-bottom:1px solid var(--sv-border);display:flex;flex-direction:column;gap:0.35rem">
        ${fields.map((field) => `<div style="font-size:0.92rem;line-height:1.55"><strong style="display:inline-block;min-width:66px;color:var(--sv-muted);font-size:0.76rem;text-transform:uppercase;letter-spacing:0.04em">${escapeHtml(field.label)}:</strong> ${escapeHtml(field.value)}</div>`).join('')}
      </div>`
    : '';
  const bodyBlocks = renderMessageBody(body, sectionMetadata);

  return `<section class="sv-message-section sv-message-section--email">
    ${renderSectionHeader(section, platform, true)}
    <div class="sv-message-section-card sv-message-section-card--email" ${copyDataAttributes(section.copyText, { primary: isPrimary })}>
      ${headerHtml}
      <div class="sv-message-section-body">${bodyBlocks}</div>
    </div>
  </section>`;
}

function renderDraftSection(section: SectionModel, metadata: ContentMetadata, sectionIndex: number, isPrimary: boolean, platform: string): string {
  const sectionMetadata = {
    ...metadata,
    blockIdPrefix: `${metadata.blockIdPrefix || ''}section-${sectionIndex}-`,
  };
  const bodyBlocks = renderMessageBody(section.body, sectionMetadata);
  const cardClass = section.kind === 'notes' || section.kind === 'context'
    ? 'sv-message-section-card sv-message-section-card--notes'
    : 'sv-message-section-card sv-message-section-card--draft';
  const withCopyButton = section.kind === 'message';

  return `<section class="sv-message-section sv-message-section--${section.kind}">
    ${renderSectionHeader(section, platform, withCopyButton)}
    <div class="${cardClass}" ${copyDataAttributes(section.copyText, { primary: isPrimary })}>
      <div class="sv-message-section-body">
      ${bodyBlocks}
      </div>
    </div>
  </section>`;
}

export function render(content: string, metadata: ContentMetadata): string {
  const sections = buildSectionModels(content);
  const platform = metadata.platform || '';
  let primaryAssigned = false;

  const sectionHtml = sections.map((section, index) => {
    const isPrimary = !primaryAssigned && (section.kind === 'message' || section.kind === 'email');
    if (isPrimary) primaryAssigned = true;
    if (section.kind === 'email') {
      return renderEmailSection(section, metadata, index, isPrimary, platform);
    }
    return renderDraftSection(section, metadata, index, isPrimary, platform);
  }).join('');

  return `<div class="sv-message" style="max-width:760px">
  ${sectionHtml}
</div>`;
}
