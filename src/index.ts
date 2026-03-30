import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { render as renderHtml } from './core/renderer.js';
import { ensureDir, appendHistory, readHistory, buildHistoryPreview } from './core/history.js';
import { tryAutoStart } from './core/server.js';
import { syncWorkspaceArtifacts } from './core/sync.js';
import { upsertTaskContentManifest } from './core/task-content.js';
import type { RenderOptions, ContentType, HistoryEntry } from './types.js';

export type { RenderOptions, ContentType, HistoryEntry } from './types.js';
export type { ContentMetadata, ThemeMode, FeedbackItem, FeedbackFile, ReviewBundle, ReviewSyncState } from './types.js';
export type { DiffSegment, VersionData, SuperviewConfig, TextAnchor } from './types.js';

export { render } from './core/renderer.js';
export { detectContentType } from './core/detector.js';
export { computeDiff, renderDiffHtml } from './core/diff.js';
export { readHistory, appendHistory, searchHistory } from './core/history.js';
export {
  readFeedback,
  addFeedbackItem,
  deleteFeedbackItem,
  getLatestReviewTaskId,
  getUnresolvedFeedback,
  importReviewBundle,
  readReviewBundle,
  readReviewBundleFromPath,
  renameReviewBundleTitle,
  resolveFeedbackItem,
  summarizeFeedback,
  summarizeReviewBundle,
  writeFeedback,
} from './core/feedback.js';
export { migrateLegacyReviewBundles, syncReviewBundles, upsertReviewItem, writeReviewBundle } from './core/review.js';
export { startServer, tryAutoStart, isServerRunning } from './core/server.js';
export { THEMES } from './core/theme.js';
export { readCanonicalContentSnapshot } from './core/task-content.js';

/**
 * Render content to HTML and write to a file.
 * Returns the file path.
 */
export async function writeAndOpen(
  content: string,
  options: RenderOptions & { open?: boolean } = {}
): Promise<string> {
  const basePath = options.basePath || process.cwd();
  const dir = ensureDir(basePath);
  const viewsDir = join(dir, 'views');
  if (!existsSync(viewsDir)) mkdirSync(viewsDir, { recursive: true });
  const contentDir = join(dir, 'content');
  if (!existsSync(contentDir)) mkdirSync(contentDir, { recursive: true });

  const taskId = options.taskId || `sv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const contentPath = join(contentDir, `${taskId}.txt`);
  let previousContent = options.previousContent;
  if (!previousContent && existsSync(contentPath)) {
    const savedContent = readFileSync(contentPath, 'utf-8');
    if (savedContent !== content) previousContent = savedContent;
  }
  writeFileSync(contentPath, content, 'utf-8');

  let version = options.version || 1;
  if (!options.version && previousContent) {
    version = readHistory(basePath).filter((entry) => entry.taskId === taskId).length + 1;
  }

  const html = await renderHtml(content, {
    ...options,
    taskId,
    version,
    previousContent,
    basePath,
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = options.title
    ? options.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
    : 'output';

  const outPath = options.out || join(viewsDir, `${timestamp}-${name}-temp.html`);
  writeFileSync(outPath, html, 'utf-8');
  const latestPath = join(viewsDir, '_latest.html');
  const latestTmpPath = join(viewsDir, `_latest.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(latestTmpPath, html, 'utf-8');
  renameSync(latestTmpPath, latestPath);

  // Record history
  const entry: HistoryEntry = {
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    taskId,
    title: options.title || name,
    type: options.type || 'generic',
    versions: version,
    feedbackCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    filePath: basename(outPath),
    kept: false,
    preview: buildHistoryPreview(content),
  };
  appendHistory(basePath, entry);
  upsertTaskContentManifest(basePath, taskId, content, {
    type: entry.type,
    title: entry.title,
    metadata: options.metadata,
    currentVersion: version,
    latestViewFile: basename(outPath),
    updatedAt: entry.updatedAt,
  });
  syncSharedArtifacts(basePath);

  // Open in browser
  if (options.open !== false && !options.noOpen) {
    const serverStarted = await tryAutoStart(basePath);
    const target = serverStarted ? 'http://localhost:3847' : resolve(outPath);
    if (serverStarted) {
      try {
        const http = await import('node:http');
        const req = http.request(
          { hostname: '127.0.0.1', port: 3847, path: '/notify', method: 'POST', timeout: 1000 },
          () => {}
        );
        req.on('error', () => {});
        req.end();
      } catch {
        // Non-critical
      }
    }
    if (process.platform === 'darwin') {
      spawn('open', [target], { stdio: 'ignore', detached: true }).unref();
    } else if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', target], { stdio: 'ignore', detached: true }).unref();
    } else {
      spawn('xdg-open', [target], { stdio: 'ignore', detached: true }).unref();
    }
  }

  return outPath;
}

function syncSharedArtifacts(basePath: string): void {
  try {
    syncWorkspaceArtifacts(basePath);
  } catch {
    // Non-critical
  }
}
