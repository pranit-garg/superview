import type { ContentMetadata, ContentType, FeedbackItem, TaskContentManifest } from '../types.js';
import {
  extractLeadingHeaderFields,
  parseHeaderField,
  parseStructuredMarkdownBlocks,
  scopedBlockId,
  serializeStructuredMarkdownBlocks,
} from '../templates/shared.js';
import { buildSectionModels, UNTITLED_MESSAGE_SENTINEL, type SectionModel } from '../templates/message.js';
import { isProfileContent, parseSections } from '../templates/linkedin.js';

export class ContentSaveError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = 'ContentSaveError';
    this.status = status;
  }
}

function normalizeEditableText(text: string): string {
  return String(text || '').replace(/\r\n?/g, '\n').replace(/\u00A0/g, ' ').trim();
}

function normalizeComparableText(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function versionedMetadata(manifest: TaskContentManifest): ContentMetadata {
  return {
    ...(manifest.metadata || {}),
    blockIdPrefix: `v${manifest.currentVersion}-`,
  };
}

function splitLeadingHeaderLines(content: string): { headerLines: string[]; body: string } {
  const lines = content.split('\n');
  const headerLines: string[] = [];
  let index = 0;
  while (index < lines.length) {
    if (!parseHeaderField(lines[index])) break;
    headerLines.push(lines[index]);
    index += 1;
  }
  while (index < lines.length && lines[index].trim() === '') {
    index += 1;
  }
  return {
    headerLines,
    body: lines.slice(index).join('\n').trim(),
  };
}

function updateStructuredMarkdownContent(
  body: string,
  metadata: ContentMetadata,
  targetBlockId: string,
  newText: string,
  startIndex = 0,
  suppressLeadingHeadingText?: string,
): { content: string; savedText: string } | null {
  const blocks = parseStructuredMarkdownBlocks(body);
  let visibleIndex = startIndex;
  let hasRenderedContent = false;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (
      block.kind === 'heading'
      && !hasRenderedContent
      && suppressLeadingHeadingText
      && normalizeComparableText(block.text || '') === normalizeComparableText(suppressLeadingHeadingText)
    ) {
      continue;
    }
    const blockId = scopedBlockId(metadata, `block-${visibleIndex}`);
    visibleIndex += 1;
    hasRenderedContent = true;
    if (blockId !== targetBlockId) continue;
    if (!block.editable) {
      throw new ContentSaveError('This block cannot be edited safely yet.');
    }
    const savedText = normalizeEditableText(newText);
    blocks[index] = {
      ...block,
      text: savedText,
    };
    return {
      content: serializeStructuredMarkdownBlocks(blocks),
      savedText,
    };
  }

  return null;
}

function applyStructuredMarkdownEdit(
  content: string,
  manifest: TaskContentManifest,
  blockId: string,
  newText: string,
): { content: string; savedText: string } | null {
  const metadata = versionedMetadata(manifest);
  return updateStructuredMarkdownContent(
    content,
    metadata,
    blockId,
    newText,
    0,
    manifest.metadata?.title || manifest.title,
  );
}

function applyEmailEdit(
  content: string,
  manifest: TaskContentManifest,
  blockId: string,
  newText: string,
): { content: string; savedText: string } | null {
  const { headerLines, body } = splitLeadingHeaderLines(content);
  const metadata = versionedMetadata(manifest);
  const result = updateStructuredMarkdownContent(body, metadata, blockId, newText, headerLines.length > 0 ? 1 : 0);
  if (!result) return null;
  const nextContent = [headerLines.join('\n'), result.content].filter(Boolean).join('\n\n').trim();
  return {
    content: nextContent,
    savedText: result.savedText,
  };
}

function serializeMessageSections(sections: SectionModel[]): string {
  return sections
    .map((section) => {
      const body = section.body.trim();
      const title = section.title === UNTITLED_MESSAGE_SENTINEL ? '' : (section.title || '');
      if (!body && !title) return '';
      if (!title) return body;
      return `# ${title}\n\n${body}`.trim();
    })
    .filter(Boolean)
    .join('\n\n---\n\n')
    .trim();
}

function applyMessageEdit(
  content: string,
  manifest: TaskContentManifest,
  blockId: string,
  newText: string,
): { content: string; savedText: string } | null {
  const metadata = versionedMetadata(manifest);
  const sections = buildSectionModels(content);
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const sectionMetadata: ContentMetadata = {
      ...metadata,
      blockIdPrefix: `${metadata.blockIdPrefix || ''}section-${sectionIndex}-`,
    };
    const result = updateStructuredMarkdownContent(sections[sectionIndex].body, sectionMetadata, blockId, newText, 0);
    if (!result) continue;
    sections[sectionIndex] = {
      ...sections[sectionIndex],
      body: result.content,
      copyText: result.savedText,
    };
    return {
      content: serializeMessageSections(sections),
      savedText: result.savedText,
    };
  }
  return null;
}

function parseParagraphBlocks(content: string): string[] {
  return content.split(/\n\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function applyLinkedinEdit(
  content: string,
  manifest: TaskContentManifest,
  blockId: string,
  newText: string,
): { content: string; savedText: string } | null {
  const metadata = versionedMetadata(manifest);
  if (isProfileContent(content)) {
    const sections = parseSections(content);
    for (let index = 0; index < sections.length; index += 1) {
      const candidateId = scopedBlockId(metadata, `section-${index}`);
      if (candidateId !== blockId) continue;
      const savedText = normalizeEditableText(newText);
      sections[index] = {
        ...sections[index],
        content: savedText,
      };
      return {
        content: sections.map((section) => `## ${section.name}\n${section.content.trim()}`).join('\n\n').trim(),
        savedText,
      };
    }
    return null;
  }

  const paragraphs = parseParagraphBlocks(content);
  for (let index = 0; index < paragraphs.length; index += 1) {
    const candidateId = scopedBlockId(metadata, `block-${index}`);
    if (candidateId !== blockId) continue;
    const savedText = normalizeEditableText(newText);
    paragraphs[index] = savedText;
    return {
      content: paragraphs.join('\n\n').trim(),
      savedText,
    };
  }
  return null;
}

function parseThreadSegments(content: string): { segments: string[]; separator: string } {
  let segments = content.split(/\n---\n/).filter((segment) => segment.trim());
  let separator = '\n---\n';

  if (segments.length <= 1) {
    segments = content.split(/\n(?=(?:(?:Tweet|Post)\s+\d+[:.]\s*|\d+\s*[-:./)]\s))/i).filter((segment) => segment.trim());
    separator = '\n\n';
  }

  if (segments.length <= 1) {
    segments = content.split(/\n\n+/).filter((segment) => segment.trim());
    separator = '\n\n';
  }

  return {
    separator,
    segments: segments.map((segment) => segment.trim().replace(/^(?:(?:Tweet|Post)\s+\d+[:.]\s*|\d+\s*[-:./)]\s*)/i, '')),
  };
}

function applyThreadEdit(
  content: string,
  manifest: TaskContentManifest,
  blockId: string,
  newText: string,
): { content: string; savedText: string } | null {
  const metadata = versionedMetadata(manifest);
  const { segments, separator } = parseThreadSegments(content);
  for (let index = 0; index < segments.length; index += 1) {
    const candidateId = scopedBlockId(metadata, `block-${index}`);
    if (candidateId !== blockId) continue;
    const savedText = normalizeEditableText(newText);
    segments[index] = savedText;
    return {
      content: segments.join(separator).trim(),
      savedText,
    };
  }
  return null;
}

function isTweetVariationSet(content: string, metadata: ContentMetadata): boolean {
  if (metadata.variantOf) return false;
  const sections = content.split(/\n---\n/).map((segment) => segment.trim()).filter(Boolean);
  if (sections.length < 2) return false;
  let variationCount = 0;
  for (const section of sections) {
    const headerMatch = section.match(/^##\s+(.+)$/m);
    if (!headerMatch) continue;
    const headerText = headerMatch[1].trim();
    if (/variant/i.test(headerText) || /(?<!NOT[\s-])RECOMMENDED/i.test(headerText)) {
      variationCount += 1;
    }
  }
  return variationCount >= 2;
}

function parseTweetBlocks(content: string): { segments: string[]; separator: string } {
  const trimmed = content.trim();
  const segments = trimmed.split(/(?<=[.!?])\s+|\n+/).filter((segment) => segment.trim());
  if (segments.length <= 1) {
    return { segments: [trimmed], separator: '\n\n' };
  }
  return {
    segments,
    separator: trimmed.includes('\n') ? '\n\n' : ' ',
  };
}

function applyTweetEdit(
  content: string,
  manifest: TaskContentManifest,
  blockId: string,
  newText: string,
): { content: string; savedText: string } | null {
  const metadata = versionedMetadata(manifest);
  if (isTweetVariationSet(content, metadata) || blockId.includes('var-')) {
    throw new ContentSaveError('Inline variation tabs are not editable yet.');
  }
  const { segments, separator } = parseTweetBlocks(content);
  for (let index = 0; index < segments.length; index += 1) {
    const candidateId = scopedBlockId(metadata, `block-${index}`);
    if (candidateId !== blockId) continue;
    const savedText = normalizeEditableText(newText);
    segments[index] = savedText;
    return {
      content: segments.join(separator).trim(),
      savedText,
    };
  }
  return null;
}

export function applyCanonicalContentEdit(
  manifest: TaskContentManifest,
  content: string,
  blockId: string,
  newText: string,
): { content: string; savedText: string } {
  const normalizedText = normalizeEditableText(newText);
  let result: { content: string; savedText: string } | null = null;

  switch (manifest.type as ContentType) {
    case 'generic':
    case 'document':
      result = applyStructuredMarkdownEdit(content, manifest, blockId, normalizedText);
      break;
    case 'email':
      result = applyEmailEdit(content, manifest, blockId, normalizedText);
      break;
    case 'message':
      result = applyMessageEdit(content, manifest, blockId, normalizedText);
      break;
    case 'linkedin':
      result = applyLinkedinEdit(content, manifest, blockId, normalizedText);
      break;
    case 'thread':
      result = applyThreadEdit(content, manifest, blockId, normalizedText);
      break;
    case 'tweet':
      result = applyTweetEdit(content, manifest, blockId, normalizedText);
      break;
    case 'code':
    case 'table':
      throw new ContentSaveError('This content type does not support inline editing yet.');
  }

  if (!result) {
    throw new ContentSaveError('Could not map that edit back to the source content.');
  }

  return {
    content: result.content,
    savedText: result.savedText,
  };
}

export function applyLegacyContentEdits(
  manifest: TaskContentManifest,
  content: string,
  feedbackItems: FeedbackItem[],
): string {
  const latestByBlock = new Map<string, FeedbackItem>();
  feedbackItems
    .filter((item) => item.type === 'content_edit' && item.version === manifest.currentVersion)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .forEach((item) => {
      latestByBlock.set(item.blockId, item);
    });

  let nextContent = content;
  for (const item of latestByBlock.values()) {
    try {
      nextContent = applyCanonicalContentEdit(manifest, nextContent, item.blockId, item.text || '').content;
    } catch {
      // Ignore legacy edits that no longer map cleanly.
    }
  }
  return nextContent;
}
