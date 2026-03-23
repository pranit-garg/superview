import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { render as renderHtml } from './core/renderer.js';
import { ensureDir, appendHistory } from './core/history.js';
import type { RenderOptions, ContentType, HistoryEntry } from './types.js';

export type { RenderOptions, ContentType, HistoryEntry } from './types.js';
export type { ContentMetadata, ThemeMode, FeedbackItem, FeedbackFile } from './types.js';
export type { DiffSegment, VersionData, SuperviewConfig, TextAnchor } from './types.js';

export { render } from './core/renderer.js';
export { detectContentType } from './core/detector.js';
export { computeDiff, renderDiffHtml } from './core/diff.js';
export { readHistory, appendHistory, searchHistory } from './core/history.js';
export { readFeedback, addFeedbackItem, getUnresolvedFeedback, summarizeFeedback } from './core/feedback.js';
export { startServer, tryAutoStart, isServerRunning } from './core/server.js';
export { THEMES } from './core/theme.js';

/**
 * Render content to HTML and write to a file.
 * Returns the file path.
 */
export async function writeAndOpen(
  content: string,
  options: RenderOptions & { open?: boolean } = {}
): Promise<string> {
  const html = await renderHtml(content, options);

  const dir = ensureDir(options.out ? resolve(options.out, '..') : process.cwd());
  const viewsDir = join(dir, 'views');
  if (!existsSync(viewsDir)) mkdirSync(viewsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = options.title
    ? options.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
    : 'output';

  const outPath = options.out || join(viewsDir, `${timestamp}-${name}-temp.html`);
  writeFileSync(outPath, html, 'utf-8');

  // Record history
  const taskId = options.taskId || `sv-${Date.now()}`;
  const entry: HistoryEntry = {
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    taskId,
    title: options.title || name,
    type: options.type || 'generic',
    versions: options.version || 1,
    feedbackCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    filePath: outPath,
    kept: false,
  };
  appendHistory(process.cwd(), entry);

  // Open in browser
  if (options.open !== false && !options.noOpen) {
    const absPath = resolve(outPath);
    if (process.platform === 'darwin') {
      spawn('open', [absPath], { stdio: 'ignore', detached: true }).unref();
    } else if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', absPath], { stdio: 'ignore', detached: true }).unref();
    } else {
      spawn('xdg-open', [absPath], { stdio: 'ignore', detached: true }).unref();
    }
  }

  return outPath;
}
