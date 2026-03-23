import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
import { readHistory } from './history.js';

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

export async function render(content: string, options: RenderOptions = {}): Promise<string> {
  const type = options.type || detectContentType(content);
  const title = options.title || generateTitle(content, type);
  const theme = options.theme || 'auto';
  const metadata: ContentMetadata = { ...(options.metadata || {}) };

  // Merge images from options into metadata
  if (options.images && options.images.length > 0) {
    metadata.images = options.images;
  }
  const version = options.version || 1;
  const taskId = options.taskId || generateTaskId();
  const basePath = options.basePath || process.cwd();

  // Get the content-type-specific renderer
  const getRenderer = templateRenderers[type];
  const templateRender = await getRenderer();
  const contentHtml = templateRender(content, metadata);

  // Build version data
  const versions: VersionData[] = [];
  if (version > 1 && options.previousContent) {
    // Previous version rendered with its own block wrappers for independent feedback
    const prevHtml = templateRender(options.previousContent, metadata);
    versions.push({
      version: version - 1,
      content: prevHtml,
      renderedAt: new Date().toISOString(),
      feedbackCount: 0,
    });
  }
  // Compute diff if we have previous content
  let diffHtml: string | undefined;
  if (options.previousContent) {
    const segments = computeDiff(options.previousContent, content);
    diffHtml = renderDiffHtml(segments);
  }

  // Best-effort: try to find previousContent from history if not provided
  if (!options.previousContent && !options.noSidebar) {
    try {
      const allHistory = readHistory(basePath);
      // Find entries with same title, sorted newest first
      const sameTitle = allHistory.filter(e =>
        e.title === title && e.taskId !== taskId
      );
      if (sameTitle.length > 0) {
        // Try to read the most recent previous entry's content file
        const prevEntry = sameTitle[0];
        const prevContentPath = join(basePath, '.superview', 'content', `${prevEntry.taskId}.txt`);
        if (existsSync(prevContentPath)) {
          const prevContent = readFileSync(prevContentPath, 'utf-8');
          if (prevContent !== content) {  // Only show if actually different
            const prevHtml = templateRender(prevContent, metadata);
            versions.push({
              version: version - 1,
              content: prevHtml,
              renderedAt: prevEntry.updatedAt || new Date().toISOString(),
              feedbackCount: 0,
            });
            // Also compute diff for later use
            const segments = computeDiff(prevContent, content);
            diffHtml = renderDiffHtml(segments);
          }
        }
      }
    } catch {
      // Best-effort, ignore failures
    }
  }

  // Latest version (renders fully at top, not inside an accordion)
  versions.push({
    version,
    content: contentHtml,
    renderedAt: new Date().toISOString(),
    feedbackCount: 0,
  });

  // Read history for sidebar
  let history: HistoryEntry[] = [];
  if (!options.noSidebar) {
    try {
      history = readHistory(basePath);
    } catch {
      // No history yet, that's fine
    }
  }

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
  };

  return buildHtml(templateOptions);
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
