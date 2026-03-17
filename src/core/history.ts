import type { HistoryEntry } from '../types.js';
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const SUPERVIEW_DIR = '.superview';
const HISTORY_FILE = 'history.jsonl';

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
  return entries.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
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

export function readTodayHistory(basePath: string): HistoryEntry[] {
  const entries = readHistory(basePath);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return entries.filter((e) => new Date(e.updatedAt).getTime() >= todayStart);
}
