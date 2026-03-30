export type ContentType =
  | 'email'
  | 'tweet'
  | 'thread'
  | 'message'
  | 'linkedin'
  | 'document'
  | 'code'
  | 'table'
  | 'generic';

export type ThemeMode = 'day' | 'night' | 'auto';

export interface RenderOptions {
  type?: ContentType;
  title?: string;
  theme?: ThemeMode;
  noOpen?: boolean;
  noSidebar?: boolean;
  withFonts?: boolean;
  out?: string;
  taskId?: string;
  version?: number;
  previousContent?: string;
  metadata?: ContentMetadata;
  images?: string[];
  basePath?: string;
  commentMode?: boolean;
}

export interface ContentMetadata {
  title?: string;
  to?: string;
  from?: string;
  subject?: string;
  cc?: string;
  handle?: string;
  avatar?: string;
  timestamp?: string;
  platform?: string;
  language?: string;
  filename?: string;
  columns?: string[];
  images?: string[];
  currentContent?: string;
  variantOf?: string;
  variantName?: string;
  blockIdPrefix?: string;
  interactive?: boolean;
}

export interface HistoryEntry {
  id: string;
  taskId: string;
  title: string;
  type: ContentType;
  versions: number;
  feedbackCount: number;
  createdAt: string;
  updatedAt: string;
  filePath: string;
  kept: boolean;
  variantOf?: string;
  preview?: string;
}

export interface HistoryTaskGroup {
  taskId: string;
  title: string;
  type: ContentType;
  latestEntry: HistoryEntry;
  entries: HistoryEntry[];
  feedbackCount: number;
}

export type HistoryScope = 'local' | 'workspace';

export interface HistoryClientEntry extends HistoryEntry {
  groupId: string;
  basePath: string;
  sourceLabel: string;
  relativeViewPath: string;
  viewPath: string;
}

export interface HistoryDataPayload {
  formatVersion: 2;
  basePath: string;
  workspaceRoot: string | null;
  localHistory: HistoryClientEntry[];
  workspaceHistory: HistoryClientEntry[];
}

export interface TaskContentManifest {
  taskId: string;
  type: ContentType;
  title: string;
  metadata: ContentMetadata;
  basePath: string;
  currentVersion: number;
  latestViewFile: string | null;
  updatedAt: string;
  contentSchemaVersion: number;
  sourcePath?: string | null;
  sourceKind?: string | null;
  sourceLastSyncedAt?: string | null;
}

export interface CanonicalContentSnapshot {
  taskId: string;
  title: string;
  basePath: string;
  currentVersion: number;
  updatedAt: string;
  content: string;
  contentPath: string;
  contentSource: 'superview-canonical';
  sourcePath?: string | null;
  sourceKind?: string | null;
  sourceLastSyncedAt?: string | null;
}

export type ReviewSyncState =
  | 'synced'
  | 'dirty'
  | 'legacy'
  | 'imported'
  | 'filesystem'
  | 'served'
  | 'export_required'
  | 'exported';

export interface ReviewBundle {
  reviewId: string;
  taskId: string;
  title: string;
  basePath: string;
  currentVersion: number;
  updatedAt: string;
  exportedAt: string;
  syncState: ReviewSyncState;
  reviewSchemaVersion: number;
  items: FeedbackItem[];
  notes?: string;
  sourceArtifacts?: {
    href?: string;
    pathname?: string;
  };
}

export interface TextAnchor {
  blockId: string;
  prefix: string;
  selectedText: string;
  suffix: string;
  startOffset: number;
  endOffset: number;
}

interface BaseFeedbackItem {
  id: string;
  blockId: string;
  version: number;
  createdAt: string;
  resolved: boolean;
  editedAt?: string;
}

export interface BlockCommentFeedbackItem extends BaseFeedbackItem {
  type: 'block_comment';
  text: string;
}

export interface TextSelectionFeedbackItem extends BaseFeedbackItem {
  type: 'text_selection';
  text: string;
  anchor: TextAnchor;
}

export interface ContentEditFeedbackItem extends BaseFeedbackItem {
  type: 'content_edit';
  text: string;
}

export interface GeneralNotesFeedbackItem extends BaseFeedbackItem {
  type: 'general_notes';
  text: string;
}

export interface TabRenameFeedbackItem extends BaseFeedbackItem {
  type: 'tab_rename';
  text: string;
}

export type FeedbackItem =
  | BlockCommentFeedbackItem
  | TextSelectionFeedbackItem
  | ContentEditFeedbackItem
  | GeneralNotesFeedbackItem
  | TabRenameFeedbackItem;

export interface FeedbackFile extends ReviewBundle {}

export interface SuperviewConfig {
  theme?: ThemeMode;
  port?: number;
  attribution?: boolean;
}

export interface DiffSegment {
  type: 'equal' | 'add' | 'remove';
  text: string;
}

export interface VersionData {
  version: number;
  content: string;
  renderedAt: string;
  feedbackCount: number;
}
