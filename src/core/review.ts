import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import type { FeedbackFile, FeedbackItem, HistoryEntry, ReviewBundle, ReviewSyncState } from '../types.js';
import { applyLegacyContentEdits } from './editable-content.js';
import {
  ensureTaskContentManifest,
  readCanonicalContentSnapshot,
  readTaskContent,
  readTaskManifest,
  renameTaskContentManifest,
  upsertTaskContentManifest,
} from './task-content.js';

const SUPERVIEW_DIR = process.env.SUPERVIEW_DIR || '.superview';
const REVIEW_DIR = 'reviews';
const LEGACY_FEEDBACK_DIR = 'feedback';
const REVIEW_SCHEMA_VERSION = 1;
const HISTORY_FILE = 'history.jsonl';

function ensureDir(dir: string): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function reviewDir(basePath: string): string {
  return join(basePath, SUPERVIEW_DIR, REVIEW_DIR);
}

function historyPath(basePath: string): string {
  return join(basePath, SUPERVIEW_DIR, HISTORY_FILE);
}

function legacyFeedbackDir(basePath: string): string {
  return join(basePath, SUPERVIEW_DIR, LEGACY_FEEDBACK_DIR);
}

function ensureReviewDir(basePath: string): string {
  return ensureDir(reviewDir(basePath));
}

function ensureLegacyFeedbackDir(basePath: string): string {
  return ensureDir(legacyFeedbackDir(basePath));
}

function readHistoryEntries(basePath: string): HistoryEntry[] {
  const filePath = historyPath(basePath);
  if (!existsSync(filePath)) return [];
  const entries: HistoryEntry[] = [];
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as HistoryEntry);
    } catch {
      // Skip malformed history lines.
    }
  }
  return entries;
}

function writeHistoryEntries(basePath: string, entries: HistoryEntry[]): void {
  const filePath = historyPath(basePath);
  if (!existsSync(filePath) && entries.length === 0) return;
  ensureDir(basePath);
  const serialized = entries.map((entry) => JSON.stringify(entry)).join('\n');
  writeFileSync(filePath, serialized ? `${serialized}\n` : '', 'utf-8');
}

function renameHistoryTaskTitles(basePath: string, taskId: string, title: string): void {
  const entries = readHistoryEntries(basePath);
  let changed = false;
  const updated = entries.map((entry) => {
    if (entry.taskId !== taskId || entry.title === title) return entry;
    changed = true;
    return { ...entry, title };
  });
  if (changed) writeHistoryEntries(basePath, updated);
}

function updateHistoryTaskVersion(
  basePath: string,
  taskId: string,
  version: number,
  updates: { preview?: string; updatedAt?: string; filePath?: string; title?: string },
): void {
  const entries = readHistoryEntries(basePath);
  let changed = false;
  const updated = entries.map((entry) => {
    if (entry.taskId !== taskId || (entry.versions || 1) !== version) return entry;
    changed = true;
    return {
      ...entry,
      preview: updates.preview ?? entry.preview,
      updatedAt: updates.updatedAt ?? entry.updatedAt,
      filePath: updates.filePath ?? entry.filePath,
      title: updates.title ?? entry.title,
    };
  });
  if (changed) writeHistoryEntries(basePath, updated);
}

function getLatestHistoryEntry(basePath: string, taskId: string): HistoryEntry | null {
  return readHistoryEntries(basePath)
    .filter((entry) => entry.taskId === taskId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] || null;
}

function buildReviewPreview(content: string): string {
  return (content || '').replace(/[#*_\-\n]+/g, ' ').trim().slice(0, 120);
}

export function buildReviewMachinePayload(basePath: string, bundle: ReviewBundle): Record<string, unknown> {
  const snapshot = readCanonicalContentSnapshot(basePath, bundle.taskId);
  const comments = bundle.items.filter((item) => item.type === 'block_comment' || item.type === 'text_selection');
  const unresolved = comments.filter((item) => !item.resolved);
  const resolved = comments.filter((item) => item.resolved);
  const contentEdits = bundle.items.filter((item) => item.type === 'content_edit');
  const renameRequests = bundle.items.filter((item) => item.type === 'tab_rename');
  const notesItems = bundle.items.filter((item) => item.type === 'general_notes');

  return {
    ...bundle,
    unresolvedCount: unresolved.length,
    resolvedCount: resolved.length,
    notes: bundle.notes || notesItems[notesItems.length - 1]?.text || '',
    comments: comments.map((item) => ({
      id: item.id,
      blockId: item.blockId,
      version: item.version,
      text: item.text || '',
      anchor: item.type === 'text_selection' ? item.anchor || null : null,
      createdAt: item.createdAt,
      editedAt: item.editedAt || null,
      resolved: item.resolved,
    })),
    unresolvedComments: unresolved.map((item) => ({
      id: item.id,
      blockId: item.blockId,
      version: item.version,
      text: item.text || '',
      anchor: item.type === 'text_selection' ? item.anchor || null : null,
      createdAt: item.createdAt,
      editedAt: item.editedAt || null,
    })),
    resolvedComments: resolved.map((item) => ({
      id: item.id,
      blockId: item.blockId,
      version: item.version,
      text: item.text || '',
      anchor: item.type === 'text_selection' ? item.anchor || null : null,
      createdAt: item.createdAt,
      editedAt: item.editedAt || null,
    })),
    contentEdits: contentEdits.map((item) => ({
      id: item.id,
      blockId: item.blockId,
      version: item.version,
      text: item.text || '',
      createdAt: item.createdAt,
      editedAt: item.editedAt || null,
    })),
    renameRequests: renameRequests.map((item) => ({
      id: item.id,
      blockId: item.blockId,
      version: item.version,
      text: item.text || '',
      createdAt: item.createdAt,
      editedAt: item.editedAt || null,
    })),
    content: snapshot?.content || '',
    contentUpdatedAt: snapshot?.updatedAt || null,
    contentSource: snapshot?.contentSource || null,
    contentPath: snapshot?.contentPath || null,
    contentRef: snapshot ? {
      source: snapshot.contentSource,
      path: snapshot.contentPath,
      updatedAt: snapshot.updatedAt,
      currentVersion: snapshot.currentVersion,
    } : null,
    sourcePath: snapshot?.sourcePath || null,
    sourceKind: snapshot?.sourceKind || null,
    sourceLastSyncedAt: snapshot?.sourceLastSyncedAt || null,
  };
}

export function reviewPath(basePath: string, taskId: string): string {
  return join(reviewDir(basePath), `${taskId}.json`);
}

export function legacyFeedbackPath(basePath: string, taskId: string): string {
  return join(legacyFeedbackDir(basePath), `${taskId}.json`);
}

function nowIso(): string {
  return new Date().toISOString();
}

function cloneItems(items: FeedbackItem[]): FeedbackItem[] {
  return JSON.parse(JSON.stringify(items)) as FeedbackItem[];
}

function normalizeNotes(items: FeedbackItem[]): string | undefined {
  const notes = items
    .filter((item) => item.type === 'general_notes')
    .map((item) => item.text.trim())
    .filter(Boolean);
  if (notes.length === 0) return undefined;
  return notes[notes.length - 1];
}

function highestItemVersion(items: FeedbackItem[]): number {
  let highest = 1;
  for (const item of items) {
    if (Number.isFinite(item.version) && item.version > highest) {
      highest = item.version;
    }
  }
  return highest;
}

function normalizeBundle(
  bundle: Partial<ReviewBundle> & { taskId: string; items?: FeedbackItem[]; updatedAt?: string; exportedAt?: string },
  defaults: { basePath?: string; title?: string; currentVersion?: number; syncState?: ReviewSyncState } = {},
): ReviewBundle {
  const items = cloneItems(bundle.items || []);
  const manifest = defaults.basePath ? readTaskManifest(defaults.basePath, bundle.taskId) : null;
  const title = bundle.title?.trim() || defaults.title?.trim() || manifest?.title || manifest?.metadata?.title || bundle.taskId;
  const currentVersion = bundle.currentVersion
    || defaults.currentVersion
    || manifest?.currentVersion
    || highestItemVersion(items);
  const basePath = resolve(bundle.basePath || defaults.basePath || process.cwd());
  const updatedAt = bundle.updatedAt || bundle.exportedAt || nowIso();
  const exportedAt = bundle.exportedAt || updatedAt;
  const notes = bundle.notes?.trim() || normalizeNotes(items);

  return {
    reviewId: bundle.reviewId || `review-${bundle.taskId}`,
    taskId: bundle.taskId,
    title,
    basePath,
    currentVersion,
    updatedAt,
    exportedAt,
    syncState: bundle.syncState || defaults.syncState || 'synced',
    reviewSchemaVersion: bundle.reviewSchemaVersion || REVIEW_SCHEMA_VERSION,
    items,
    ...(notes ? { notes } : {}),
    ...(bundle.sourceArtifacts ? { sourceArtifacts: bundle.sourceArtifacts } : {}),
  };
}

function parseJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function materializeReviewBundle(basePath: string, bundle: ReviewBundle): ReviewBundle {
  const targetBasePath = resolve(basePath);
  const latestHistoryEntry = getLatestHistoryEntry(targetBasePath, bundle.taskId);
  const existingManifest = readTaskManifest(targetBasePath, bundle.taskId);
  const title = bundle.title?.trim()
    || existingManifest?.title
    || existingManifest?.metadata?.title
    || latestHistoryEntry?.title
    || bundle.taskId;

  if (title) {
    renameHistoryTaskTitles(targetBasePath, bundle.taskId, title);
    if (existingManifest && existingManifest.title !== title) {
      renameTaskContentManifest(targetBasePath, bundle.taskId, title);
    }
  }

  let manifest = readTaskManifest(targetBasePath, bundle.taskId);
  if (!manifest && latestHistoryEntry) {
    manifest = ensureTaskContentManifest(targetBasePath, bundle.taskId, {
      type: latestHistoryEntry.type,
      title,
      metadata: { title },
      currentVersion: bundle.currentVersion || latestHistoryEntry.versions || 1,
      latestViewFile: latestHistoryEntry.filePath,
    });
  }

  const canonicalContent = readTaskContent(targetBasePath, bundle.taskId);
  if (manifest && canonicalContent !== null) {
    const materializedContent = applyLegacyContentEdits(manifest, canonicalContent, bundle.items);
    const latestViewFile = manifest.latestViewFile || latestHistoryEntry?.filePath || null;
    manifest = upsertTaskContentManifest(targetBasePath, bundle.taskId, materializedContent, {
      type: manifest.type,
      title,
      metadata: {
        ...(manifest.metadata || {}),
        title,
      },
      currentVersion: Math.max(manifest.currentVersion || 1, bundle.currentVersion || 1),
      latestViewFile,
      updatedAt: bundle.updatedAt,
    });
    updateHistoryTaskVersion(targetBasePath, bundle.taskId, manifest.currentVersion || bundle.currentVersion || 1, {
      preview: buildReviewPreview(materializedContent),
      updatedAt: bundle.updatedAt,
      filePath: latestViewFile || latestHistoryEntry?.filePath,
      title,
    });
    return normalizeBundle({
      ...bundle,
      title,
      basePath: targetBasePath,
      currentVersion: manifest.currentVersion || bundle.currentVersion || 1,
      updatedAt: bundle.updatedAt || nowIso(),
      exportedAt: bundle.exportedAt || bundle.updatedAt || nowIso(),
      syncState: 'synced',
    }, {
      basePath: targetBasePath,
      title,
      currentVersion: manifest.currentVersion || bundle.currentVersion || 1,
      syncState: 'synced',
    });
  }

  return normalizeBundle({
    ...bundle,
    title,
    basePath: targetBasePath,
    updatedAt: bundle.updatedAt || nowIso(),
    exportedAt: bundle.exportedAt || bundle.updatedAt || nowIso(),
    syncState: 'synced',
  }, {
    basePath: targetBasePath,
    title,
    currentVersion: bundle.currentVersion || latestHistoryEntry?.versions || 1,
    syncState: 'synced',
  });
}

function reviewFileToBundle(
  filePath: string,
  defaults: { basePath?: string; title?: string; syncState?: ReviewSyncState } = {},
): ReviewBundle | null {
  const parsed = parseJsonFile<ReviewBundle | FeedbackFile | Partial<ReviewBundle>>(filePath);
  if (!parsed || typeof parsed !== 'object' || !('taskId' in parsed) || !parsed.taskId) {
    return null;
  }
  const bundle = normalizeBundle(
    {
      ...parsed,
      taskId: parsed.taskId,
      items: Array.isArray((parsed as ReviewBundle).items) ? (parsed as ReviewBundle).items : [],
    },
    {
      basePath: defaults.basePath,
      title: defaults.title,
      syncState: defaults.syncState,
    },
  );
  return bundle;
}

function writeLegacyMirror(basePath: string, bundle: ReviewBundle): void {
  ensureLegacyFeedbackDir(basePath);
  writeFileSync(legacyFeedbackPath(basePath, bundle.taskId), JSON.stringify(bundle, null, 2), 'utf-8');
}

export function writeReviewBundle(basePath: string, bundle: ReviewBundle, options: { mirrorLegacy?: boolean } = {}): ReviewBundle {
  ensureReviewDir(basePath);
  const normalized = normalizeBundle(bundle, { basePath, title: bundle.title, currentVersion: bundle.currentVersion, syncState: bundle.syncState });
  writeFileSync(reviewPath(basePath, normalized.taskId), JSON.stringify(normalized, null, 2), 'utf-8');
  if (options.mirrorLegacy !== false) {
    writeLegacyMirror(basePath, normalized);
  }
  return normalized;
}

export function readReviewBundle(basePath: string, taskId: string): ReviewBundle | null {
  const canonical = reviewFileToBundle(reviewPath(basePath, taskId), { basePath });
  if (canonical) return canonical;

  const legacy = reviewFileToBundle(legacyFeedbackPath(basePath, taskId), {
    basePath,
    syncState: 'legacy',
  });
  return legacy;
}

export function readReviewBundleFromPath(filePath: string): ReviewBundle | null {
  const resolvedPath = resolve(filePath);
  const parsed = parseJsonFile<ReviewBundle | FeedbackFile | Partial<ReviewBundle>>(resolvedPath);
  if (parsed && typeof parsed === 'object' && 'taskId' in parsed && parsed.taskId) {
    return normalizeBundle(
      {
        ...parsed,
        taskId: parsed.taskId,
        items: Array.isArray((parsed as ReviewBundle).items) ? (parsed as ReviewBundle).items : [],
      },
      {
        basePath: inferBasePathFromPath(resolvedPath) || (parsed as Partial<ReviewBundle>).basePath || process.cwd(),
        syncState: (parsed as Partial<ReviewBundle>).syncState as ReviewSyncState | undefined,
      },
    );
  }
  if (resolvedPath.endsWith('.html')) {
    const taskId = extractTaskIdFromHtml(resolvedPath);
    if (!taskId) return null;
    const basePath = inferBasePathFromPath(resolvedPath);
    if (!basePath) return null;
    return readReviewBundle(basePath, taskId);
  }
  return null;
}

export function readReviewBundleFromHtml(basePath: string, htmlPath: string): ReviewBundle | null {
  const taskId = extractTaskIdFromHtml(htmlPath);
  if (!taskId) return null;
  return readReviewBundle(basePath, taskId);
}

export function upsertReviewItem(
  basePath: string,
  taskId: string,
  item: FeedbackItem,
  options: {
    title?: string;
    currentVersion?: number;
    syncState?: ReviewSyncState;
  } = {},
): ReviewBundle {
  const existing = readReviewBundle(basePath, taskId);
  const nextItems = existing?.items ? existing.items.slice() : [];
  const existingIndex = nextItems.findIndex((entry) => entry.id === item.id);
  if (existingIndex >= 0) {
    nextItems[existingIndex] = item;
  } else {
    nextItems.push(item);
  }
  const notes = normalizeNotes(nextItems);
  const updatedAt = nowIso();
  const bundle = normalizeBundle(
    {
      reviewId: existing?.reviewId || `review-${taskId}`,
      taskId,
      title: options.title || existing?.title || taskId,
      basePath: existing?.basePath || basePath,
      currentVersion: Math.max(existing?.currentVersion || 1, options.currentVersion || item.version || 1),
      updatedAt,
      exportedAt: updatedAt,
      syncState: options.syncState || 'synced',
      reviewSchemaVersion: existing?.reviewSchemaVersion || REVIEW_SCHEMA_VERSION,
      items: nextItems,
      ...(notes ? { notes } : {}),
    },
    {
      basePath,
      title: options.title || existing?.title,
      currentVersion: options.currentVersion,
      syncState: options.syncState || 'synced',
    },
  );
  return writeReviewBundle(basePath, bundle);
}

export function deleteReviewItem(basePath: string, taskId: string, itemId: string): ReviewBundle | null {
  const existing = readReviewBundle(basePath, taskId);
  if (!existing) return null;
  const nextItems = existing.items.filter((item) => item.id !== itemId);
  if (nextItems.length === existing.items.length) return existing;
  const updatedAt = nowIso();
  return writeReviewBundle(basePath, normalizeBundle({
    ...existing,
    items: nextItems,
    updatedAt,
    exportedAt: updatedAt,
    notes: normalizeNotes(nextItems),
    syncState: 'synced',
  }, {
    basePath,
    title: existing.title,
    currentVersion: existing.currentVersion,
    syncState: 'synced',
  }));
}

export function resolveReviewItem(basePath: string, taskId: string, itemId: string): ReviewBundle | null {
  const existing = readReviewBundle(basePath, taskId);
  if (!existing) return null;
  const nextItems = existing.items.map((item) => item.id === itemId ? { ...item, resolved: true, editedAt: nowIso() } : item);
  if (!nextItems.some((item) => item.id === itemId)) return existing;
  const updatedAt = nowIso();
  return writeReviewBundle(basePath, normalizeBundle({
    ...existing,
    items: nextItems,
    updatedAt,
    exportedAt: updatedAt,
    notes: normalizeNotes(nextItems),
    syncState: 'synced',
  }, {
    basePath,
    title: existing.title,
    currentVersion: existing.currentVersion,
    syncState: 'synced',
  }));
}

export function renameReviewBundleTitle(basePath: string, taskId: string, title: string): ReviewBundle | null {
  const existing = readReviewBundle(basePath, taskId);
  const updatedAt = nowIso();
  const bundle = existing
      ? normalizeBundle({
        ...existing,
        title: title.trim() || existing.title,
        updatedAt,
        exportedAt: updatedAt,
        syncState: 'synced',
      }, {
        basePath,
        title,
        currentVersion: existing.currentVersion,
        syncState: 'synced',
      })
    : normalizeBundle({
        reviewId: `review-${taskId}`,
        taskId,
        title: title.trim() || taskId,
        basePath,
        currentVersion: 1,
        updatedAt,
        exportedAt: updatedAt,
        syncState: 'synced',
        reviewSchemaVersion: REVIEW_SCHEMA_VERSION,
        items: [],
      }, {
        basePath,
        title,
        currentVersion: 1,
        syncState: 'synced',
      });
  return writeReviewBundle(basePath, bundle);
}

export function listReviewBundles(basePath: string): ReviewBundle[] {
  const bundles = new Map<string, ReviewBundle>();
  const scan = (dir: string, syncState: ReviewSyncState, titleFromPath?: string): void => {
    if (!existsSync(dir)) return;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const bundle = reviewFileToBundle(join(dir, file), {
        basePath,
        syncState,
        title: titleFromPath,
      });
      if (!bundle) continue;
      const existing = bundles.get(bundle.taskId);
      if (syncState === 'legacy' && existing) continue;
      if (!existing || new Date(bundle.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
        bundles.set(bundle.taskId, bundle);
      }
    }
  };

  scan(reviewDir(basePath), 'synced');
  scan(legacyFeedbackDir(basePath), 'legacy');

  return Array.from(bundles.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getLatestReviewTaskId(basePath: string): string | null {
  return listReviewBundles(basePath)[0]?.taskId || null;
}

export function summarizeReviewBundle(bundle: ReviewBundle | null, taskId?: string): string {
  if (!bundle) {
    return `No feedback found for task: ${taskId || ''}`.trim();
  }

  const comments = bundle.items.filter((item) => item.type === 'block_comment' || item.type === 'text_selection');
  const unresolved = comments.filter((item) => !item.resolved);
  const resolved = comments.filter((item) => item.resolved);
  const edits = bundle.items.filter((item) => item.type === 'content_edit');
  const renames = bundle.items.filter((item) => item.type === 'tab_rename');
  const lines: string[] = [];
  lines.push(`Task: ${bundle.taskId} (${comments.length} comments)`);
  lines.push(`Title: ${bundle.title}`);
  lines.push(`Updated: ${bundle.updatedAt}`);
  if (bundle.notes) {
    lines.push(`Notes: ${bundle.notes}`);
  }
  lines.push('');

  if (unresolved.length > 0) {
    lines.push('UNRESOLVED:');
    for (const item of unresolved) {
      if (item.type === 'text_selection' && item.anchor?.selectedText) {
        lines.push(`  [${item.blockId}] (text: "${item.anchor.selectedText}") "${item.text || ''}"`);
      } else {
        lines.push(`  [${item.blockId}] "${item.text || ''}"`);
      }
    }
    lines.push('');
  }

  if (resolved.length > 0) {
    lines.push('RESOLVED:');
    for (const item of resolved) {
      lines.push(`  [${item.blockId}] "${item.text || ''}" (resolved)`);
    }
    lines.push('');
  }

  if (edits.length > 0) {
    lines.push('EDITS:');
    for (const item of edits) {
      lines.push(`  [${item.blockId}] "${item.text || ''}"`);
    }
    lines.push('');
  }

  if (renames.length > 0) {
    lines.push('RENAMES:');
    for (const item of renames) {
      lines.push(`  [${item.blockId}] "${item.text || ''}"`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

export function summarizeReview(basePath: string, taskId: string): string {
  return summarizeReviewBundle(readReviewBundle(basePath, taskId), taskId);
}

export function exportReviewBundle(bundle: ReviewBundle): FeedbackFile {
  return bundle;
}

export function importReviewBundle(basePath: string, bundle: ReviewBundle, options: { mirrorLegacy?: boolean } = {}): ReviewBundle {
  const imported = writeReviewBundle(basePath, {
    ...bundle,
    basePath: resolve(bundle.basePath || basePath),
    updatedAt: bundle.updatedAt || nowIso(),
    exportedAt: bundle.exportedAt || bundle.updatedAt || nowIso(),
    syncState: bundle.syncState === 'synced' ? 'synced' : 'imported',
  }, options);
  const materialized = materializeReviewBundle(basePath, imported);
  return writeReviewBundle(basePath, materialized, options);
}

export function migrateLegacyReviewBundles(basePath: string): ReviewBundle[] {
  const migrated: ReviewBundle[] = [];
  if (!existsSync(legacyFeedbackDir(basePath))) return migrated;
  for (const file of readdirSync(legacyFeedbackDir(basePath))) {
    if (!file.endsWith('.json')) continue;
    const taskId = basename(file, '.json');
    const existing = readReviewBundle(basePath, taskId);
    const bundle = existing
      ? normalizeBundle({
          ...existing,
          syncState: 'synced',
        }, {
          basePath,
          title: existing.title,
          currentVersion: existing.currentVersion,
          syncState: 'synced',
        })
      : reviewFileToBundle(join(legacyFeedbackDir(basePath), file), {
          basePath,
          syncState: 'synced',
        });
    if (!bundle) continue;
    migrated.push(writeReviewBundle(basePath, bundle));
  }
  return migrated;
}

export function syncReviewBundles(basePath: string): ReviewBundle[] {
  const migrated = migrateLegacyReviewBundles(basePath);
  const bundles = listReviewBundles(basePath);
  const synced = bundles.map((bundle) => {
    const nextBundle = bundle.syncState === 'synced'
      ? normalizeBundle({
        ...bundle,
        syncState: 'synced',
      }, {
        basePath,
        title: bundle.title,
        currentVersion: bundle.currentVersion,
        syncState: 'synced',
      })
      : materializeReviewBundle(basePath, bundle);
    return writeReviewBundle(basePath, nextBundle);
  });
  return migrated.length > 0 ? migrated : synced;
}

function inferBasePathFromPath(filePath: string): string | null {
  const resolved = resolve(filePath);
  const parts = resolved.split(sep);
  const index = parts.lastIndexOf(SUPERVIEW_DIR);
  if (index <= 0) return null;
  const base = parts.slice(0, index).join(sep);
  return base || sep;
}

function extractTaskIdFromHtml(htmlPath: string): string | null {
  if (!existsSync(htmlPath)) return null;
  try {
    const raw = readFileSync(htmlPath, 'utf-8');
    const match = raw.match(/window\.__svTaskId\s*=\s*['"]([^'"]+)['"]/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}
