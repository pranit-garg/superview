import type { FeedbackItem, FeedbackFile } from '../types.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SUPERVIEW_DIR = '.superview';
const FEEDBACK_DIR = 'feedback';

function feedbackDir(basePath: string): string {
  const dir = join(basePath, SUPERVIEW_DIR, FEEDBACK_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function feedbackPath(basePath: string, taskId: string): string {
  return join(feedbackDir(basePath), `${taskId}.json`);
}

export function readFeedback(basePath: string, taskId: string): FeedbackFile | null {
  const filePath = feedbackPath(basePath, taskId);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as FeedbackFile;
  } catch {
    return null;
  }
}

export function writeFeedback(basePath: string, taskId: string, file: FeedbackFile): void {
  feedbackDir(basePath);
  const filePath = feedbackPath(basePath, taskId);
  writeFileSync(filePath, JSON.stringify(file, null, 2), 'utf-8');
}

export function addFeedbackItem(basePath: string, taskId: string, item: FeedbackItem): void {
  let file = readFeedback(basePath, taskId);
  if (!file) {
    file = {
      taskId,
      items: [],
      exportedAt: new Date().toISOString(),
    };
  }
  file.items.push(item);
  file.exportedAt = new Date().toISOString();
  writeFeedback(basePath, taskId, file);
}

export function getUnresolvedFeedback(basePath: string, taskId: string): FeedbackItem[] {
  const file = readFeedback(basePath, taskId);
  if (!file) return [];
  return file.items.filter((item) => item.resolved === false);
}

export function resolveFeedbackItem(basePath: string, taskId: string, itemId: string): void {
  const file = readFeedback(basePath, taskId);
  if (!file) return;
  const item = file.items.find((i) => i.id === itemId);
  if (item) {
    item.resolved = true;
    file.exportedAt = new Date().toISOString();
    writeFeedback(basePath, taskId, file);
  }
}

export function summarizeFeedback(basePath: string, taskId: string): string {
  const file = readFeedback(basePath, taskId);
  if (!file || file.items.length === 0) {
    return `No feedback found for task: ${taskId}`;
  }

  const comments = file.items.filter((i) => i.type === 'block_comment' || i.type === 'text_selection');
  const reactions = file.items.filter((i) => i.type === 'reaction');
  const unresolved = comments.filter((i) => !i.resolved);
  const resolved = comments.filter((i) => i.resolved);

  const lines: string[] = [];
  lines.push(`Task: ${taskId} (${comments.length} comments, ${reactions.length} reactions)`);
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

  if (reactions.length > 0) {
    lines.push('REACTIONS:');
    for (const item of reactions) {
      lines.push(`  [${item.blockId}] ${item.reaction || 'unknown'}`);
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

  return lines.join('\n').trimEnd();
}
