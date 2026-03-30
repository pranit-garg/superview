import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTodayPage } from './template.js';
import {
  ensureDir,
  findWorkspaceBasePaths,
  getHistoryDataPayload,
  readHistory,
  readTodayHistory,
  renderHistoryDataScript,
} from './history.js';
import { syncReviewBundles } from './review.js';
import { rewriteAllViews } from './view-upgrade.js';

export function writeHistoryData(basePath: string): void {
  const dir = ensureDir(basePath);
  const viewsDir = join(dir, 'views');
  if (!existsSync(viewsDir)) mkdirSync(viewsDir, { recursive: true });
  const js = renderHistoryDataScript(basePath);
  writeFileSync(join(viewsDir, '_history-data.js'), js, 'utf-8');
}

export function writeTodayPage(basePath: string): void {
  const dir = ensureDir(basePath);
  const viewsDir = join(dir, 'views');
  if (!existsSync(viewsDir)) mkdirSync(viewsDir, { recursive: true });
  const html = buildTodayPage(readTodayHistory(basePath), readHistory(basePath), {
    basePath,
    historyData: getHistoryDataPayload(basePath),
  });
  writeFileSync(join(viewsDir, '_today.html'), html, 'utf-8');
}

export function syncBaseArtifacts(basePath: string): void {
  syncReviewBundles(basePath);
  writeHistoryData(basePath);
  writeTodayPage(basePath);
  rewriteAllViews(basePath);
}

export function syncWorkspaceArtifacts(basePath: string): void {
  for (const targetBasePath of findWorkspaceBasePaths(basePath)) {
    syncBaseArtifacts(targetBasePath);
  }
}
