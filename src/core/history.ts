import type { HistoryClientEntry, HistoryDataPayload, HistoryEntry, HistoryTaskGroup } from '../types.js';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { getUnresolvedCommentCount } from './feedback.js';

const SUPERVIEW_DIR = process.env.SUPERVIEW_DIR || '.superview';
const HISTORY_FILE = 'history.jsonl';
const IGNORED_WORKSPACE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
]);

export function ensureDir(basePath: string): string {
  const dir = join(basePath, SUPERVIEW_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function appendHistory(basePath: string, entry: HistoryEntry): void {
  const dir = ensureDir(basePath);
  const filePath = join(dir, HISTORY_FILE);
  appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
}

export function buildHistoryPreview(content: string): string {
  return (content || '').replace(/[#*_\-\n]+/g, ' ').trim().slice(0, 120);
}

export function renameTask(basePath: string, taskId: string, newTitle: string): number {
  const filePath = join(basePath, SUPERVIEW_DIR, HISTORY_FILE);
  if (!existsSync(filePath)) {
    return 0;
  }

  const entries = readHistory(basePath);
  let renamedCount = 0;
  const updatedEntries = entries.map((entry) => {
    if (entry.taskId !== taskId) return entry;
    renamedCount += 1;
    return {
      ...entry,
      title: newTitle,
    };
  });

  if (renamedCount === 0) {
    return 0;
  }

  writeFileSync(
    filePath,
    updatedEntries.map((entry) => JSON.stringify(entry)).join('\n') + '\n',
    'utf-8',
  );

  return renamedCount;
}

export function updateTaskVersionHistory(basePath: string, taskId: string, version: number, updates: {
  preview?: string;
  updatedAt?: string;
  filePath?: string;
}): number {
  const filePath = join(basePath, SUPERVIEW_DIR, HISTORY_FILE);
  if (!existsSync(filePath)) {
    return 0;
  }

  const entries = readHistory(basePath);
  let updatedCount = 0;
  const nextEntries = entries.map((entry) => {
    if (entry.taskId !== taskId || (entry.versions || 1) !== version) {
      return entry;
    }
    updatedCount += 1;
    return {
      ...entry,
      preview: updates.preview ?? entry.preview,
      updatedAt: updates.updatedAt ?? entry.updatedAt,
      filePath: updates.filePath ?? entry.filePath,
    };
  });

  if (updatedCount === 0) {
    return 0;
  }

  writeFileSync(
    filePath,
    nextEntries.map((entry) => JSON.stringify(entry)).join('\n') + '\n',
    'utf-8',
  );

  return updatedCount;
}

export function readHistory(basePath: string): HistoryEntry[] {
  const filePath = join(basePath, SUPERVIEW_DIR, HISTORY_FILE);
  if (!existsSync(filePath)) {
    return [];
  }
  const raw = readFileSync(filePath, 'utf-8');
  const entries: HistoryEntry[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as HistoryEntry);
    } catch {
      // Skip malformed lines
    }
  }
  const commentCounts = new Map<string, number>();
  const enriched = entries.map((entry) => {
    if (!commentCounts.has(entry.taskId)) {
      commentCounts.set(entry.taskId, getUnresolvedCommentCount(basePath, entry.taskId));
    }
    return {
      ...entry,
      feedbackCount: commentCounts.get(entry.taskId) ?? 0,
    };
  });
  return enriched.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function resolveHistoryViewPath(basePath: string, filePath: string): string {
  if (isAbsolute(filePath)) return filePath;
  return join(resolve(basePath), SUPERVIEW_DIR, 'views', basename(filePath));
}

export function searchHistory(basePath: string, query: string): HistoryEntry[] {
  const entries = readHistory(basePath);
  const lower = query.toLowerCase();
  return entries.filter((e) => e.title.toLowerCase().includes(lower));
}

export function getHistoryForTask(basePath: string, taskId: string): HistoryEntry[] {
  const entries = readHistory(basePath);
  return entries.filter((e) => e.taskId === taskId);
}

export function groupHistoryByTask(entries: HistoryEntry[]): HistoryTaskGroup[] {
  const groups = new Map<string, HistoryTaskGroup>();

  for (const entry of entries) {
    const existing = groups.get(entry.taskId);
    if (existing) {
      existing.entries.push(entry);
      continue;
    }
    groups.set(entry.taskId, {
      taskId: entry.taskId,
      title: entry.title,
      type: entry.type,
      latestEntry: entry,
      entries: [entry],
      feedbackCount: entry.feedbackCount || 0,
    });
  }

  return Array.from(groups.values()).map((group) => {
    const latestByVersion = new Map<number, HistoryEntry>();
    const sortedEntries = group.entries
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    for (const entry of sortedEntries) {
      const version = entry.versions || 1;
      if (!latestByVersion.has(version)) {
        latestByVersion.set(version, entry);
      }
    }

    const dedupedEntries = Array.from(latestByVersion.values()).sort((a, b) => {
      const versionDelta = (b.versions || 0) - (a.versions || 0);
      if (versionDelta !== 0) return versionDelta;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return {
      ...group,
      latestEntry: dedupedEntries[0] || group.latestEntry,
      entries: dedupedEntries,
    };
  });
}

export function getTaskGroups(basePath: string): HistoryTaskGroup[] {
  return groupHistoryByTask(readHistory(basePath));
}

export function detectWorkspaceRoot(startPath: string): string | null {
  let current = resolve(startPath);
  while (true) {
    const hasAgents = existsSync(join(current, 'AGENTS.md'));
    const hasContext = existsSync(join(current, 'CONTEXT', 'current.md'));
    if (hasAgents && hasContext) return current;

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function findWorkspaceBasePaths(basePath: string): string[] {
  const workspaceRoot = detectWorkspaceRoot(basePath);
  if (!workspaceRoot) return [resolve(basePath)];

  const resolvedBasePath = resolve(basePath);
  const basePaths = new Set<string>();

  if (existsSync(join(workspaceRoot, SUPERVIEW_DIR, HISTORY_FILE))) {
    basePaths.add(resolve(workspaceRoot));
  }

  for (const entry of readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || IGNORED_WORKSPACE_DIRS.has(entry.name)) continue;
    const candidateBase = join(workspaceRoot, entry.name);
    if (existsSync(join(candidateBase, SUPERVIEW_DIR, HISTORY_FILE))) {
      basePaths.add(resolve(candidateBase));
    }
  }

  basePaths.add(resolvedBasePath);

  return Array.from(basePaths);
}

function sourceLabelForBasePath(basePath: string, workspaceRoot: string | null): string {
  if (!workspaceRoot) return basename(basePath) || basePath;
  if (resolve(basePath) === resolve(workspaceRoot)) return 'Vibecoding';
  return basename(basePath) || basePath;
}

function toClientEntries(entries: HistoryEntry[], basePath: string, workspaceRoot: string | null): HistoryClientEntry[] {
  const resolvedBasePath = resolve(basePath);
  const sourceLabel = sourceLabelForBasePath(resolvedBasePath, workspaceRoot);

  return entries.map((entry) => {
    const relativeViewPath = basename(entry.filePath);
    const viewPath = resolveHistoryViewPath(resolvedBasePath, entry.filePath);
    return {
      ...entry,
      groupId: `${resolvedBasePath}::${entry.taskId}`,
      basePath: resolvedBasePath,
      sourceLabel,
      relativeViewPath,
      viewPath,
    };
  });
}

export function readWorkspaceHistory(basePath: string): HistoryClientEntry[] {
  const workspaceRoot = detectWorkspaceRoot(basePath);
  const allEntries = findWorkspaceBasePaths(basePath).flatMap((candidateBasePath) =>
    toClientEntries(readHistory(candidateBasePath), candidateBasePath, workspaceRoot),
  );

  return allEntries.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getHistoryDataPayload(basePath: string): HistoryDataPayload {
  const workspaceRoot = detectWorkspaceRoot(basePath);
  const localHistory = toClientEntries(readHistory(basePath), basePath, workspaceRoot);
  const workspaceHistory = workspaceRoot
    ? readWorkspaceHistory(basePath)
    : localHistory.slice();

  return {
    formatVersion: 2,
    basePath: resolve(basePath),
    workspaceRoot,
    localHistory,
    workspaceHistory,
  };
}

export function renderHistoryDataScript(basePath: string): string {
  const payload = getHistoryDataPayload(basePath);
  return [
    `window.__svHistoryData = ${JSON.stringify(payload)};`,
    `window.__svHistory = window.__svHistoryData.workspaceHistory;`,
    `window.__svLatestHistory = window.__svHistory;`,
  ].join('\n');
}

export function readTodayHistory(basePath: string): HistoryEntry[] {
  const entries = readHistory(basePath);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return entries.filter((e) => new Date(e.updatedAt).getTime() >= todayStart);
}

export function getVariants(basePath: string, taskId: string): HistoryEntry[] {
  const entries = readHistory(basePath);
  return entries.filter((e) => e.variantOf === taskId || e.taskId === taskId);
}

export function getLatestTaskId(basePath: string): string | null {
  const entries = readHistory(basePath);
  if (entries.length === 0) return null;
  // readHistory already sorts by updatedAt desc, so first entry is latest
  return entries[0].taskId;
}
