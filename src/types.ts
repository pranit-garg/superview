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
}

export interface ContentMetadata {
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

export interface TextAnchor {
  blockId: string;
  prefix: string;
  selectedText: string;
  suffix: string;
  startOffset: number;
  endOffset: number;
}

export interface FeedbackItem {
  type: 'block_comment' | 'text_selection';
  id: string;
  blockId: string;
  version: number;
  text?: string;
  anchor?: TextAnchor;
  createdAt: string;
  resolved: boolean;
}

export interface FeedbackFile {
  taskId: string;
  items: FeedbackItem[];
  exportedAt: string;
}

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
