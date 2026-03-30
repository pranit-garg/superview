import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { CanonicalContentSnapshot, ContentMetadata, ContentType, TaskContentManifest } from '../types.js';

const SUPERVIEW_DIR = process.env.SUPERVIEW_DIR || '.superview';
const CONTENT_SCHEMA_VERSION = 2;

function contentDir(basePath: string): string {
  return join(basePath, SUPERVIEW_DIR, 'content');
}

function ensureContentDir(basePath: string): string {
  const dir = contentDir(basePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function contentPath(basePath: string, taskId: string): string {
  return join(contentDir(basePath), `${taskId}.txt`);
}

function manifestPath(basePath: string, taskId: string): string {
  return join(contentDir(basePath), `${taskId}.json`);
}

export function taskContentPath(basePath: string, taskId: string): string {
  return contentPath(basePath, taskId);
}

function sanitizeMetadata(metadata?: ContentMetadata | null): ContentMetadata {
  const next = JSON.parse(JSON.stringify(metadata || {})) as ContentMetadata;
  delete next.blockIdPrefix;
  delete next.interactive;
  delete next.currentContent;
  return next;
}

export function readTaskContent(basePath: string, taskId: string): string | null {
  const filePath = contentPath(basePath, taskId);
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export function writeTaskContent(basePath: string, taskId: string, content: string): void {
  ensureContentDir(basePath);
  writeFileSync(contentPath(basePath, taskId), content, 'utf-8');
}

export function readTaskManifest(basePath: string, taskId: string): TaskContentManifest | null {
  const filePath = manifestPath(basePath, taskId);
  if (!existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as TaskContentManifest;
    return {
      ...parsed,
      metadata: sanitizeMetadata({
        ...(parsed.metadata || {}),
        title: parsed.title || parsed.metadata?.title,
      }),
      latestViewFile: parsed.latestViewFile || null,
      sourcePath: parsed.sourcePath ? resolve(parsed.sourcePath) : null,
      sourceKind: parsed.sourceKind || null,
      sourceLastSyncedAt: parsed.sourceLastSyncedAt || null,
    };
  } catch {
    return null;
  }
}

export function writeTaskManifest(basePath: string, manifest: TaskContentManifest): void {
  ensureContentDir(basePath);
  const nextManifest: TaskContentManifest = {
    ...manifest,
    metadata: sanitizeMetadata({
      ...(manifest.metadata || {}),
      title: manifest.title || manifest.metadata?.title,
    }),
    basePath: resolve(basePath),
    latestViewFile: manifest.latestViewFile ? basename(manifest.latestViewFile) : null,
    contentSchemaVersion: CONTENT_SCHEMA_VERSION,
    sourcePath: manifest.sourcePath ? resolve(manifest.sourcePath) : null,
    sourceKind: manifest.sourceKind || null,
    sourceLastSyncedAt: manifest.sourceLastSyncedAt || null,
  };
  writeFileSync(manifestPath(basePath, manifest.taskId), JSON.stringify(nextManifest, null, 2), 'utf-8');
}

export function upsertTaskContentManifest(
  basePath: string,
  taskId: string,
  content: string,
  options: {
    type: ContentType;
    title: string;
    metadata?: ContentMetadata;
    currentVersion: number;
    latestViewFile?: string | null;
    updatedAt?: string;
    sourcePath?: string | null;
    sourceKind?: string | null;
    sourceLastSyncedAt?: string | null;
  },
): TaskContentManifest {
  const existing = readTaskManifest(basePath, taskId);
  const updatedAt = options.updatedAt || new Date().toISOString();
  const mergedMetadata = sanitizeMetadata({
    ...(existing?.metadata || {}),
    ...(options.metadata || {}),
    title: options.title,
  });
  writeTaskContent(basePath, taskId, content);
  const manifest: TaskContentManifest = {
    taskId,
    type: options.type,
    title: options.title,
    metadata: mergedMetadata,
    basePath: resolve(basePath),
    currentVersion: options.currentVersion,
    latestViewFile: options.latestViewFile ? basename(options.latestViewFile) : (existing?.latestViewFile || null),
    updatedAt,
    contentSchemaVersion: CONTENT_SCHEMA_VERSION,
    sourcePath: options.sourcePath === undefined ? (existing?.sourcePath || null) : options.sourcePath,
    sourceKind: options.sourceKind === undefined ? (existing?.sourceKind || null) : options.sourceKind,
    sourceLastSyncedAt: options.sourceLastSyncedAt === undefined ? (existing?.sourceLastSyncedAt || null) : options.sourceLastSyncedAt,
  };
  writeTaskManifest(basePath, manifest);
  return manifest;
}

export function ensureTaskContentManifest(
  basePath: string,
  taskId: string,
  fallback: {
    type: ContentType;
    title: string;
    metadata?: ContentMetadata;
    currentVersion: number;
    latestViewFile?: string | null;
  },
): TaskContentManifest | null {
  const existing = readTaskManifest(basePath, taskId);
  const content = readTaskContent(basePath, taskId);
  if (!content) return existing;
  if (existing) return existing;
  return upsertTaskContentManifest(basePath, taskId, content, fallback);
}

export function renameTaskContentManifest(basePath: string, taskId: string, title: string): boolean {
  const manifest = readTaskManifest(basePath, taskId);
  if (!manifest) return false;
  writeTaskManifest(basePath, {
    ...manifest,
    title,
    metadata: {
      ...(manifest.metadata || {}),
      title,
    },
    updatedAt: new Date().toISOString(),
  });
  return true;
}

export function readCanonicalContentSnapshot(basePath: string, taskId: string): CanonicalContentSnapshot | null {
  const content = readTaskContent(basePath, taskId);
  if (content === null) return null;
  const manifest = readTaskManifest(basePath, taskId);
  const resolvedBasePath = resolve(basePath);
  return {
    taskId,
    title: manifest?.title || manifest?.metadata?.title || taskId,
    basePath: resolvedBasePath,
    currentVersion: manifest?.currentVersion || 1,
    updatedAt: manifest?.updatedAt || new Date().toISOString(),
    content,
    contentPath: taskContentPath(resolvedBasePath, taskId),
    contentSource: 'superview-canonical',
    sourcePath: manifest?.sourcePath || null,
    sourceKind: manifest?.sourceKind || null,
    sourceLastSyncedAt: manifest?.sourceLastSyncedAt || null,
  };
}
