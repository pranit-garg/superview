import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import type {
  ContentType,
  RenderOptions,
  VersionData,
  HistoryEntry,
  ContentMetadata,
} from '../types.js';
import { buildHtml, type TemplateOptions } from './template.js';
import { computeDiff, renderDiffHtml } from './diff.js';
import { detectContentType } from './detector.js';
import { getHistoryDataPayload, getHistoryForTask, readHistory } from './history.js';
import { getUnresolvedCommentCountsByVersion, readFeedback } from './feedback.js';
import { containsArtifactNoise, extractContentArea, htmlToPlainText, sanitizeRenderedContentHtml } from './content-artifacts.js';

// Template registry - lazy imports
type TemplateRenderer = (content: string, metadata: ContentMetadata) => string;

const templateRenderers: Record<ContentType, () => Promise<TemplateRenderer>> = {
  email: () => import('../templates/email.js').then(m => m.render),
  tweet: () => import('../templates/tweet.js').then(m => m.render),
  thread: () => import('../templates/thread.js').then(m => m.render),
  message: () => import('../templates/message.js').then(m => m.render),
  linkedin: () => import('../templates/linkedin.js').then(m => m.render),
  document: () => import('../templates/document.js').then(m => m.render),
  code: () => import('../templates/code.js').then(m => m.render),
  table: () => import('../templates/table.js').then(m => m.render),
  generic: () => import('../templates/generic.js').then(m => m.render),
};

const typeLabels: Record<ContentType, string> = {
  email: 'Email',
  tweet: 'Tweet',
  thread: 'Thread',
  message: 'Message',
  linkedin: 'LinkedIn',
  document: 'Document',
  code: 'Code',
  table: 'Data Table',
  generic: 'Article',
};

const SUPERVIEW_DIR = process.env.SUPERVIEW_DIR || '.superview';
export async function render(content: string, options: RenderOptions = {}): Promise<string> {
  const type = options.type || detectContentType(content);
  const title = options.title || generateTitle(content, type);
  const theme = options.theme || 'auto';
  const version = options.version || 1;
  const taskId = options.taskId || generateTaskId();
  const basePath = options.basePath || process.cwd();
  const metadata: ContentMetadata = {
    ...(options.metadata || {}),
    title,
    blockIdPrefix: options.metadata?.blockIdPrefix || `v${version}-`,
  };

  // Merge images from options into metadata
  if (options.images && options.images.length > 0) {
    metadata.images = options.images;
  }

  // Get the content-type-specific renderer
  const getRenderer = templateRenderers[type];
  const templateRender = await getRenderer();
  const contentHtml = templateRender(content, metadata);
  const versionFeedbackCounts = getUnresolvedCommentCountsByVersion(basePath, taskId);

  // Build version data from full task history, falling back to explicit previous content only
  const versions: VersionData[] = buildVersionHistory({
    basePath,
    taskId,
    currentVersion: version,
    currentContentHtml: contentHtml,
    currentRenderedAt: new Date().toISOString(),
    previousContent: options.previousContent,
    templateRender,
    metadata,
    versionFeedbackCounts,
  });
  // Compute diff if we have previous content
  let diffHtml: string | undefined;
  if (options.previousContent) {
    const segments = computeDiff(options.previousContent, content);
    diffHtml = renderDiffHtml(segments);
  }

  // Read history for sidebar
  let history: HistoryEntry[] = [];
  if (!options.noSidebar) {
    try {
      history = readHistory(basePath);
    } catch {
      // No history yet, that's fine
    }
  }

  const feedbackItems = readFeedback(basePath, taskId)?.items || [];

  const templateOptions: TemplateOptions = {
    title,
    theme,
    contentHtml,
    typeLabel: typeLabels[type],
    versions: versions.length > 1 ? versions : undefined,
    diffHtml,
    history,
    noSidebar: options.noSidebar,
    withFonts: options.withFonts,
    taskId,
    feedbackEnabled: true,
    attribution: true,
    todayPagePath: '_today.html',
    commentMode: options.commentMode,
    feedbackItems,
    basePath,
    historyData: getHistoryDataPayload(basePath),
    canonicalContentManaged: true,
  };

  return buildHtml(templateOptions);
}

function buildVersionHistory(options: {
  basePath: string;
  taskId: string;
  currentVersion: number;
  currentContentHtml: string;
  currentRenderedAt: string;
  previousContent?: string;
  templateRender: TemplateRenderer;
  metadata: ContentMetadata;
  versionFeedbackCounts: Map<number, number>;
}): VersionData[] {
  const {
    basePath,
    taskId,
    currentVersion,
    currentContentHtml,
    currentRenderedAt,
    previousContent,
    templateRender,
    metadata,
    versionFeedbackCounts,
  } = options;

  const historyEntries = getHistoryForTask(basePath, taskId)
    .filter((entry) => (entry.versions || 0) < currentVersion)
    .slice()
    .sort((a, b) => {
      const versionDelta = (a.versions || 0) - (b.versions || 0);
      if (versionDelta !== 0) return versionDelta;
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    });

  const latestByVersion = new Map<number, HistoryEntry>();
  for (const entry of historyEntries.slice().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())) {
    const version = entry.versions || 1;
    if (!latestByVersion.has(version)) {
      latestByVersion.set(version, entry);
    }
  }

  const uniqueHistoryEntries = Array.from(latestByVersion.values()).sort((a, b) => {
    const versionDelta = (a.versions || 0) - (b.versions || 0);
    if (versionDelta !== 0) return versionDelta;
    return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  });

  const versions: VersionData[] = uniqueHistoryEntries.map((entry) => ({
    version: entry.versions,
    content: readHistoricalVersionContent(basePath, entry.filePath, entry.versions, templateRender, metadata),
    renderedAt: entry.updatedAt,
    feedbackCount: versionFeedbackCounts.get(entry.versions) || 0,
  }));

  if (versions.length === 0 && currentVersion > 1 && previousContent) {
    const fallbackVersion = currentVersion - 1;
    versions.push({
      version: fallbackVersion,
      content: templateRender(previousContent, {
        ...metadata,
        blockIdPrefix: `v${fallbackVersion}-`,
        interactive: false,
      }),
      renderedAt: currentRenderedAt,
      feedbackCount: versionFeedbackCounts.get(fallbackVersion) || 0,
    });
  }

  versions.push({
    version: currentVersion,
    content: currentContentHtml,
    renderedAt: currentRenderedAt,
    feedbackCount: versionFeedbackCounts.get(currentVersion) || 0,
  });

  return versions;
}

function readHistoricalVersionContent(
  basePath: string,
  filePath: string,
  version: number,
  templateRender: TemplateRenderer,
  metadata: ContentMetadata,
): string {
  const resolvedPath = resolveHistoryArtifactPath(basePath, filePath);
  if (!resolvedPath || !existsSync(resolvedPath)) {
    return renderUnavailableVersion(version);
  }

  try {
    const html = readFileSync(resolvedPath, 'utf-8');
    const contentHtml = extractContentArea(html);
    if (!contentHtml) return renderUnavailableVersion(version);

    const sanitizedHtml = sanitizeRenderedContentHtml(contentHtml);
    if (containsArtifactNoise(sanitizedHtml)) {
      return templateRender(htmlToPlainText(sanitizedHtml), {
        ...metadata,
        blockIdPrefix: `v${version}-`,
        interactive: false,
      });
    }

    return sanitizedHtml;
  } catch {
    return renderUnavailableVersion(version);
  }
}

function resolveHistoryArtifactPath(basePath: string, filePath: string): string | null {
  if (!filePath) return null;
  if (isAbsolute(filePath)) return filePath;
  return join(basePath, SUPERVIEW_DIR, 'views', basename(filePath));
}

function renderUnavailableVersion(version: number): string {
  return `<div class="sv-version-unavailable">Historical preview unavailable for v${version}.</div>`;
}

function generateTitle(content: string, type: ContentType): string {
  const firstLine = content.split('\n')[0].trim();

  switch (type) {
    case 'email': {
      const subjectMatch = content.match(/^Subject:\s*(.+)$/m);
      if (subjectMatch) return subjectMatch[1].trim();
      break;
    }
    case 'tweet':
    case 'message':
      return firstLine.slice(0, 60) + (firstLine.length > 60 ? '...' : '');
    case 'document': {
      const headerMatch = content.match(/^#\s+(.+)$/m);
      if (headerMatch) return headerMatch[1].trim();
      break;
    }
  }

  // Default: first line truncated
  const clean = firstLine.replace(/^#+\s*/, '');
  return clean.slice(0, 80) + (clean.length > 80 ? '...' : '');
}

function generateTaskId(): string {
  const now = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `sv-${now}-${rand}`;
}
