import type { FeedbackItem, FeedbackFile, ReviewSyncState } from '../types.js';
import {
  deleteReviewItem,
  exportReviewBundle,
  getLatestReviewTaskId,
  importReviewBundle,
  readReviewBundle,
  readReviewBundleFromHtml,
  readReviewBundleFromPath,
  renameReviewBundleTitle,
  resolveReviewItem,
  summarizeReview,
  summarizeReviewBundle,
  upsertReviewItem,
  writeReviewBundle,
} from './review.js';

export function readFeedback(basePath: string, taskId: string): FeedbackFile | null {
  return readReviewBundle(basePath, taskId);
}

export function writeFeedback(
  basePath: string,
  taskId: string,
  file: Partial<FeedbackFile> & { taskId: string; items?: FeedbackItem[]; exportedAt?: string },
): void {
  writeReviewBundle(basePath, {
    ...(file as FeedbackFile),
    taskId,
    syncState: 'synced',
  });
}

export function addFeedbackItem(
  basePath: string,
  taskId: string,
  item: FeedbackItem,
  options: {
    title?: string;
    currentVersion?: number;
    syncState?: ReviewSyncState;
  } = {},
): void {
  upsertReviewItem(basePath, taskId, item, options);
}

export function deleteFeedbackItem(basePath: string, taskId: string, itemId: string): void {
  deleteReviewItem(basePath, taskId, itemId);
}

export function getUnresolvedFeedback(basePath: string, taskId: string): FeedbackItem[] {
  const file = readReviewBundle(basePath, taskId);
  if (!file) return [];
  return file.items.filter((item) => item.resolved === false);
}

export function getUnresolvedCommentCount(basePath: string, taskId: string): number {
  const file = readReviewBundle(basePath, taskId);
  if (!file) return 0;
  return file.items.filter((item) => {
    return (item.type === 'block_comment' || item.type === 'text_selection') && !item.resolved;
  }).length;
}

export function getUnresolvedCommentCountsByVersion(basePath: string, taskId: string): Map<number, number> {
  const file = readReviewBundle(basePath, taskId);
  const counts = new Map<number, number>();
  if (!file) return counts;

  for (const item of file.items) {
    if ((item.type !== 'block_comment' && item.type !== 'text_selection') || item.resolved) continue;
    counts.set(item.version, (counts.get(item.version) || 0) + 1);
  }

  return counts;
}

export function resolveFeedbackItem(basePath: string, taskId: string, itemId: string): void {
  resolveReviewItem(basePath, taskId, itemId);
}

export function summarizeFeedback(basePath: string, taskId: string): string {
  return summarizeReview(basePath, taskId);
}

export {
  exportReviewBundle,
  getLatestReviewTaskId,
  importReviewBundle,
  readReviewBundle,
  readReviewBundleFromHtml,
  readReviewBundleFromPath,
  renameReviewBundleTitle,
  summarizeReviewBundle,
};
