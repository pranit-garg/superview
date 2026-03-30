import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { ContentMetadata, ContentType, ThemeMode, VersionData, HistoryEntry } from '../types.js';
import { computeDiff, renderDiffHtml } from './diff.js';
import { getUnresolvedCommentCountsByVersion, readFeedback } from './feedback.js';
import { getHistoryDataPayload, getHistoryForTask, readHistory, resolveHistoryViewPath } from './history.js';
import { buildHtml } from './template.js';
import { applyLegacyContentEdits } from './editable-content.js';
import { render as renderCode } from '../templates/code.js';
import { render as renderDocument } from '../templates/document.js';
import { render as renderEmail } from '../templates/email.js';
import { render as renderGeneric } from '../templates/generic.js';
import { render as renderLinkedin } from '../templates/linkedin.js';
import { render as renderMessage } from '../templates/message.js';
import { render as renderTable } from '../templates/table.js';
import { render as renderThread } from '../templates/thread.js';
import { render as renderTweet } from '../templates/tweet.js';
import { containsArtifactNoise, extractContentArea, htmlToPlainText, sanitizeRenderedContentHtml } from './content-artifacts.js';
import { readTaskManifest } from './task-content.js';

const LEGACY_MARKERS = [
  'window.__svEmbeddedHistoryData',
  'window.__svBasePath',
  'window.__svRuntimeVersion = 6',
  'id="sv-sidebar-scope"',
  'id="sv-page-title"',
];

const STALE_PAGE_PATTERNS = [
  /window\.open\(item\.href,\s*'_blank'\)/,
  /sv-sidebar-today" href="_today\.html" target="_blank"/,
  /class="sv-block"[^>]*>\s*<p[^>]*>\s*\s*<\/p>/,
];

const contentRenderers: Record<ContentType, (content: string, metadata: ContentMetadata) => string> = {
  email: renderEmail,
  tweet: renderTweet,
  thread: renderThread,
  message: renderMessage,
  linkedin: renderLinkedin,
  document: renderDocument,
  code: renderCode,
  table: renderTable,
  generic: renderGeneric,
};

const TYPE_LABELS: Record<ContentType, string> = {
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

export function isLegacyViewHtml(rawHtml: string): boolean {
  if (LEGACY_MARKERS.some((marker) => !rawHtml.includes(marker))) {
    return true;
  }
  return STALE_PAGE_PATTERNS.some((pattern) => pattern.test(rawHtml));
}

export function detectThemeMode(rawHtml: string): ThemeMode {
  const htmlClassMatch = rawHtml.match(/<html[^>]*class="([^"]+)"/i);
  if (!htmlClassMatch) return 'auto';
  if (htmlClassMatch[1].includes('day')) return 'day';
  if (htmlClassMatch[1].includes('night')) return 'night';
  return 'auto';
}

function renderUnavailableVersion(version: number): string {
  return `<div class="sv-version-missing">Version v${version} is unavailable.</div>`;
}

function renderContentHtml(type: ContentType, content: string, version: number, metadata: ContentMetadata = {}): string {
  const renderer = contentRenderers[type] || renderGeneric;
  return renderer(content, {
    ...metadata,
    blockIdPrefix: `v${version}-`,
  });
}

function readCanonicalTaskContent(basePath: string, taskId: string): string | null {
  const filePath = join(basePath, '.superview', 'content', `${taskId}.txt`);
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function readVersionArtifactHtml(
  basePath: string,
  filePath: string,
  version: number,
  type: ContentType,
  metadata: ContentMetadata,
): string {
  const resolvedFilePath = resolveHistoryViewPath(basePath, filePath);
  if (!resolvedFilePath || !existsSync(resolvedFilePath)) {
    return renderUnavailableVersion(version);
  }
  try {
    const html = readFileSync(resolvedFilePath, 'utf-8');
    const contentHtml = extractContentArea(html);
    if (!contentHtml) return renderUnavailableVersion(version);
    const sanitizedHtml = sanitizeRenderedContentHtml(contentHtml);
    if (isLegacyViewHtml(html) || containsArtifactNoise(sanitizedHtml)) {
      return renderContentHtml(type, htmlToPlainText(sanitizedHtml), version, {
        ...metadata,
        interactive: false,
      });
    }
    return sanitizedHtml;
  } catch {
    return renderUnavailableVersion(version);
  }
}

function buildVersionHistoryFromArtifacts(
  basePath: string,
  taskId: string,
  currentVersion: number,
  currentContentHtml: string,
  type: ContentType,
  metadata: ContentMetadata,
): VersionData[] {
  const versionFeedbackCounts = getUnresolvedCommentCountsByVersion(basePath, taskId);
  const taskHistory = getHistoryForTask(basePath, taskId)
    .filter((entry) => (entry.versions || 0) <= currentVersion)
    .slice()
    .sort((a, b) => {
      const versionDelta = (b.versions || 0) - (a.versions || 0);
      if (versionDelta !== 0) return versionDelta;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  const latestByVersion = new Map<number, HistoryEntry>();
  for (const entry of taskHistory) {
    const version = entry.versions || 1;
    if (!latestByVersion.has(version)) {
      latestByVersion.set(version, entry);
    }
  }

  const dedupedHistory = Array.from(latestByVersion.values()).sort((a, b) => {
    const versionDelta = (a.versions || 0) - (b.versions || 0);
    if (versionDelta !== 0) return versionDelta;
    return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  });

  return dedupedHistory.map((entry) => ({
    version: entry.versions,
    content: entry.versions === currentVersion
      ? currentContentHtml
      : readVersionArtifactHtml(basePath, entry.filePath, entry.versions, type, metadata),
    renderedAt: entry.updatedAt,
    feedbackCount: versionFeedbackCounts.get(entry.versions) || 0,
  }));
}

function buildDiffHtml(versions: VersionData[]): string | undefined {
  if (versions.length < 2) return undefined;
  const previousText = htmlToPlainText(versions[versions.length - 2].content);
  const currentText = htmlToPlainText(versions[versions.length - 1].content);
  if (!previousText || !currentText || previousText === currentText) return undefined;
  return renderDiffHtml(computeDiff(previousText, currentText));
}

function resolveCurrentEntry(history: HistoryEntry[], filePath: string): HistoryEntry | null {
  const fileName = basename(filePath);
  if (fileName === '_latest.html') {
    return history[0] || null;
  }
  return history.find((entry) => basename(entry.filePath) === fileName) || null;
}

export function upgradeViewHtml(basePath: string, filePath: string, rawHtml: string): string | null {
  const history = readHistory(basePath);
  const currentEntry = resolveCurrentEntry(history, filePath);
  if (!currentEntry) return null;

  const extractedContentHtml = extractContentArea(rawHtml);
  if (!extractedContentHtml) return null;

  const latestVersion = history
    .filter((entry) => entry.taskId === currentEntry.taskId)
    .reduce((max, entry) => Math.max(max, entry.versions || 1), 1);
  const feedbackItems = readFeedback(basePath, currentEntry.taskId)?.items || [];
  const manifest = readTaskManifest(basePath, currentEntry.taskId);
  const renderMetadata: ContentMetadata = {
    ...(manifest?.metadata || {}),
    title: currentEntry.title,
  };
  const canonicalContent = currentEntry.versions === latestVersion
    ? readCanonicalTaskContent(basePath, currentEntry.taskId)
    : null;
  const materializedContent = canonicalContent && manifest
    ? applyLegacyContentEdits(manifest, canonicalContent, feedbackItems)
    : canonicalContent;
  const renderedContentHtml = renderContentHtml(
    currentEntry.type,
    materializedContent || htmlToPlainText(extractedContentHtml),
    currentEntry.versions || 1,
    renderMetadata,
  );

  const versions = buildVersionHistoryFromArtifacts(
    basePath,
    currentEntry.taskId,
    currentEntry.versions || 1,
    renderedContentHtml,
    currentEntry.type,
    renderMetadata,
  );

  return buildHtml({
    title: currentEntry.title,
    theme: detectThemeMode(rawHtml),
    contentHtml: renderedContentHtml,
    typeLabel: TYPE_LABELS[currentEntry.type] || 'Article',
    versions: versions.length > 1 ? versions : undefined,
    diffHtml: buildDiffHtml(versions),
    history,
    taskId: currentEntry.taskId,
    feedbackEnabled: true,
    feedbackItems,
    withFonts: rawHtml.includes('fonts.googleapis.com'),
    basePath,
    historyData: getHistoryDataPayload(basePath),
    canonicalContentManaged: true,
  });
}

export function rewriteLegacyViews(basePath: string): number {
  return rewriteViews(basePath, (rawHtml) => isLegacyViewHtml(rawHtml));
}

export function rewriteAllViews(basePath: string): number {
  return rewriteViews(basePath, () => true);
}

function rewriteViews(basePath: string, shouldRewrite: (rawHtml: string, filePath: string) => boolean): number {
  const viewsDir = join(basePath, '.superview', 'views');
  if (!existsSync(viewsDir)) return 0;

  let rewritten = 0;
  for (const fileName of readdirSync(viewsDir)) {
    if (!fileName.endsWith('.html')) continue;
    if (fileName === '_today.html' || fileName === '_history.html') continue;

    const filePath = join(viewsDir, fileName);
    let rawHtml: string;
    try {
      rawHtml = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }
    if (!shouldRewrite(rawHtml, filePath)) continue;

    const upgradedHtml = upgradeViewHtml(basePath, filePath, rawHtml);
    if (!upgradedHtml || upgradedHtml === rawHtml) continue;

    writeFileSync(filePath, upgradedHtml, 'utf-8');
    rewritten += 1;
  }

  return rewritten;
}

export function rewriteTaskViews(basePath: string, taskId: string): number {
  const viewsDir = join(basePath, '.superview', 'views');
  if (!existsSync(viewsDir)) return 0;

  const history = readHistory(basePath);
  const taskEntries = history.filter((entry) => entry.taskId === taskId);
  if (taskEntries.length === 0) return 0;

  const filesToRewrite = new Set<string>();
  taskEntries.forEach((entry) => {
    filesToRewrite.add(join(viewsDir, basename(entry.filePath)));
  });

  if (history[0]?.taskId === taskId) {
    filesToRewrite.add(join(viewsDir, '_latest.html'));
  }

  let rewritten = 0;
  for (const filePath of filesToRewrite) {
    if (!existsSync(filePath)) continue;

    let rawHtml: string;
    try {
      rawHtml = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const upgradedHtml = upgradeViewHtml(basePath, filePath, rawHtml);
    if (!upgradedHtml || upgradedHtml === rawHtml) continue;

    writeFileSync(filePath, upgradedHtml, 'utf-8');
    rewritten += 1;
  }

  return rewritten;
}
