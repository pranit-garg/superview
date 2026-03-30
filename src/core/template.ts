import type {
  ThemeMode,
  VersionData,
  HistoryEntry,
  FeedbackItem,
  HistoryTaskGroup,
  HistoryDataPayload,
} from '../types.js';
import { groupHistoryByTask } from './history.js';
import { getThemeCSS, getThemeScript, getThemeToggleScript } from './theme.js';

const GRAIN_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='grain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23grain)'/%3E%3C/svg%3E")`;

export interface TemplateOptions {
  title: string;
  theme: ThemeMode;
  contentHtml: string;
  typeLabel: string;
  versions?: VersionData[];
  diffHtml?: string;
  history?: HistoryEntry[];
  noSidebar?: boolean;
  withFonts?: boolean;
  taskId?: string;
  feedbackEnabled?: boolean;
  attribution?: boolean;
  todayPagePath?: string;
  commentMode?: boolean;
  feedbackItems?: FeedbackItem[];
  dashboardMode?: boolean;
  basePath?: string;
  historyData?: HistoryDataPayload | null;
  canonicalContentManaged?: boolean;
}

function getFontLinks(): string {
  return `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
  `;
}

export function buildHtml(options: TemplateOptions): string {
  const {
    title,
    theme,
    contentHtml,
    typeLabel,
    versions = [],
    diffHtml,
    history = [],
    noSidebar = false,
    withFonts = false,
    taskId = '',
    feedbackEnabled = true,
    attribution = true,
    commentMode = false,
    feedbackItems = [],
    dashboardMode = false,
    basePath = '',
    historyData = null,
    canonicalContentManaged = false,
  } = options;

  const currentVersion = versions.length > 0 ? versions[versions.length - 1].version : 1;

  // Previous versions (all except the latest) in reverse order (most recent first)
  const previousVersions = versions.length > 1
    ? versions.slice(0, -1).reverse()
    : [];

  const versionAccordionsHtml = previousVersions.length > 0 ? `
    <div class="sv-version-accordions">
      <div class="sv-version-accordions-header">
        <span class="sv-version-accordions-title">Previous versions</span>
        ${diffHtml ? `<button class="sv-diff-toggle" onclick="toggleDiff()">Show diff</button>` : ''}
      </div>
      ${previousVersions.map(v => {
        const date = new Date(v.renderedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `
        <div class="sv-accordion" data-version="${v.version}">
          <div class="sv-accordion-row">
            <button class="sv-accordion-header" onclick="toggleAccordion(this)">
              <svg class="sv-accordion-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="sv-accordion-header-text">
                <strong>v${v.version}</strong>
                <span class="sv-accordion-meta">${escapeHtml(date)}${v.feedbackCount > 0 ? ` &middot; ${v.feedbackCount} comment${v.feedbackCount !== 1 ? 's' : ''}` : ''}</span>
              </span>
            </button>
            <button class="sv-accordion-copy" onclick="copyVersionContent(this, event)" title="Copy text">Copy</button>
          </div>
          <div class="sv-accordion-content">
            <div class="sv-accordion-content-inner">
              ${v.content}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  ` : '';

  const sidebarHtml = !noSidebar ? buildSidebar(history, taskId, currentVersion) : '';
  const hasSidebar = !noSidebar;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | Superview</title>
  <script>${getThemeScript(theme)}</script>
  ${withFonts ? getFontLinks() : ''}
  <script src="_history-data.js${basePath ? `?base=${encodeURIComponent(basePath)}` : ''}"></script>
  <style>
    ${getThemeCSS()}

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      background: var(--sv-bg);
      color: var(--sv-text);
      font-family: ${withFonts ? "'DM Sans', " : ''}system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.5;
      transition: background-color 0.3s ease, color 0.3s ease;
    }

    body::after {
      content: '';
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 9999;
      opacity: 0.15;
      mix-blend-mode: overlay;
      background-image: ${GRAIN_SVG};
      background-repeat: repeat;
    }

    ::selection {
      background: var(--sv-selection);
    }

    h1, h2, h3, h4, h5, h6 {
      font-family: ${withFonts ? "'Crimson Pro', " : ''}Georgia, 'Times New Roman', serif;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    code, pre, .sv-code {
      font-family: ${withFonts ? "'JetBrains Mono', " : ''}ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
    }

    a { color: var(--sv-interactive); text-decoration: none; }
    a:hover { text-decoration: none; }

    /* Layout */
    .sv-layout {
      display: flex;
      min-height: 100vh;
    }

    /* Sidebar */
    .sv-sidebar {
      width: 260px;
      background: var(--sv-surface);
      border-right: 1px solid var(--sv-border);
      padding: 4rem 1rem 1rem;
      overflow-y: auto;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      z-index: 100;
      transition: transform 0.3s ease;
    }

    .sv-sidebar-hidden { transform: translateX(-100%); }

    .sv-sidebar-search-wrap {
      position: relative;
      margin-bottom: 0.75rem;
    }
    .sv-sidebar-scope {
      display: none;
      grid-template-columns: 1fr 1fr;
      gap: 0.35rem;
      margin-bottom: 0.85rem;
    }
    .sv-sidebar-scope-btn {
      border: 1px solid var(--sv-border);
      border-radius: 8px;
      background: var(--sv-bg);
      color: var(--sv-muted);
      padding: 0.45rem 0.55rem;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      cursor: pointer;
      transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
    }
    .sv-sidebar-scope-btn:hover {
      border-color: var(--sv-interactive);
      color: var(--sv-text);
    }
    .sv-sidebar-scope-btn.active {
      background: var(--sv-selection);
      border-color: var(--sv-interactive);
      color: var(--sv-interactive);
    }
    .sv-sidebar-search {
      width: 100%;
      padding: 0.5rem 3rem 0.5rem 0.75rem;
      border: 1px solid var(--sv-border);
      border-radius: 6px;
      background: var(--sv-bg);
      color: var(--sv-text);
      font-size: 0.875rem;
      outline: none;
    }
    .sv-sidebar-search:focus { border-color: var(--sv-interactive); }
    .sv-sidebar-search::placeholder { color: var(--sv-muted); }
    .sv-sidebar-search-hint {
      position: absolute;
      right: 0.5rem;
      top: 50%;
      transform: translateY(-50%);
      font-size: 0.7rem;
      padding: 0.1rem 0.4rem;
      background: rgba(128, 128, 128, 0.12);
      border: 1px solid var(--sv-border);
      border-radius: 4px;
      color: var(--sv-muted);
      pointer-events: none;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .sv-sidebar-group { margin-bottom: 1.5rem; }
    .sv-sidebar-group-title {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--sv-muted);
      margin-bottom: 0.5rem;
    }

    .sv-sidebar-item {
      display: flex;
      align-items: flex-start;
      gap: 0.6rem;
      padding: 0.5rem 0.65rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85rem;
      color: var(--sv-text);
      text-decoration: none;
      transition: background 0.15s, border-color 0.15s, transform 0.1s;
      border-left: 2px solid transparent;
    }
    .sv-sidebar-item:hover {
      background: var(--sv-bg);
      text-decoration: none;
      transform: translateX(2px);
    }
    .sv-sidebar-item.active { background: var(--sv-bg); font-weight: 500; }
    .sv-sidebar-item-icon {
      flex-shrink: 0;
      line-height: 1.2;
      margin-top: 0.05rem;
    }
    .sv-sidebar-item-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.22rem;
    }

    .sv-sidebar-today {
      font-weight: 600;
      margin-bottom: 0.75rem;
      color: var(--sv-interactive);
      border-left: 2px solid var(--sv-interactive);
    }
    .sv-sidebar-today:hover {
      background: var(--sv-selection);
    }

    .sv-sidebar-item-meta {
      font-size: 0.75rem;
      color: var(--sv-muted);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.22rem 0.35rem;
      min-width: 0;
    }
    .sv-sidebar-item-time {
      white-space: nowrap;
    }

    .sv-sidebar-badge {
      background: var(--sv-interactive);
      color: #fff;
      font-size: 0.65rem;
      padding: 0.1rem 0.35rem;
      border-radius: 10px;
      font-weight: 600;
    }

    .sv-sidebar-header {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--sv-text);
      padding-bottom: 0.75rem;
      margin-bottom: 0.75rem;
      border-bottom: 2px solid var(--sv-interactive);
    }

    .sv-sidebar-item.current {
      background: var(--sv-selection);
      font-weight: 600;
      border-left: 2px solid var(--sv-interactive);
      color: var(--sv-interactive);
    }

    .sv-sidebar-task-group { margin-bottom: 0.45rem; }
    .sv-sidebar-task-head {
      display: flex;
      align-items: flex-start;
      gap: 0.4rem;
    }
    .sv-sidebar-parent {
      flex: 1;
      min-width: 0;
    }
    .sv-sidebar-item-title,
    .sv-sidebar-subitem-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .sv-sidebar-task-toggle {
      width: 1.35rem;
      height: 1.35rem;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: var(--sv-muted);
      cursor: pointer;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
      margin-top: 0.22rem;
    }
    .sv-sidebar-task-toggle:hover {
      background: var(--sv-bg);
      color: var(--sv-interactive);
    }
    .sv-sidebar-task-toggle.hidden {
      visibility: hidden;
      pointer-events: none;
    }
    .sv-sidebar-task-toggle-icon {
      display: inline-block;
      font-size: 0.65rem;
      transition: transform 0.15s ease;
    }
    .sv-sidebar-task-group:not(.expanded) .sv-sidebar-task-toggle-icon {
      transform: rotate(-90deg);
    }
    .sv-sidebar-task-children {
      display: flex;
      flex-direction: column;
      gap: 0.14rem;
      margin: 0.16rem 0 0.35rem 1.95rem;
      padding-left: 0;
      border-left: none;
    }
    .sv-sidebar-task-group:not(.expanded) .sv-sidebar-task-children {
      display: none;
    }
    .sv-sidebar-subitem {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.78rem;
      color: var(--sv-muted);
      text-decoration: none;
      padding: 0.3rem 0.5rem;
      border-radius: 6px;
      border-left: 2px solid transparent;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }
    .sv-sidebar-subitem-label {
      font-weight: 600;
      min-width: 1.7rem;
    }
    .sv-sidebar-subitem:hover {
      background: var(--sv-bg);
      color: var(--sv-text);
      text-decoration: none;
    }
    .sv-sidebar-subitem.current {
      background: var(--sv-selection);
      color: var(--sv-interactive);
      border-left-color: var(--sv-interactive);
      font-weight: 600;
    }
    .sv-sidebar-subitem-meta {
      margin-left: auto;
      white-space: nowrap;
      font-size: 0.72rem;
      color: var(--sv-muted);
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }
    .sv-sidebar-subitem-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.3rem;
      padding: 0.05rem 0.3rem;
      border-radius: 999px;
      background: rgba(212, 152, 40, 0.18);
      color: var(--sv-gold);
      font-size: 0.62rem;
      font-weight: 700;
    }

    .sv-sidebar-feedback-badge {
      background: var(--sv-gold);
      color: #fff;
      font-size: 0.6rem;
      padding: 0.05rem 0.3rem;
      border-radius: 10px;
      font-weight: 600;
      margin-left: 0.25rem;
    }
    .sv-sidebar-source-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      padding: 0.08rem 0.35rem;
      border: 1px solid var(--sv-border);
      border-radius: 999px;
      font-size: 0.62rem;
      font-weight: 700;
      color: var(--sv-muted);
      background: rgba(255,255,255,0.03);
      min-width: 0;
      max-width: 6.75rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sv-sidebar-empty {
      padding: 1.5rem 0.5rem;
      text-align: center;
      color: var(--sv-muted);
      font-size: 0.85rem;
    }

    .sv-sidebar-footer {
      margin-top: auto;
      padding: 1.25rem 0.5rem 0.5rem;
      border-top: 1px solid var(--sv-border);
      display: flex;
      justify-content: center;
      align-items: center;
    }

    /* Main content */
    .sv-main {
      flex: 1;
      display: flex;
      justify-content: center;
      padding: 2rem;
      transition: margin-left 0.3s ease, margin-right 0.3s ease;
      ${hasSidebar ? 'margin-left: 260px;' : ''}
    }

    .sv-content {
      max-width: 720px;
      width: 100%;
    }

    /* Header area */
    .sv-header {
      margin-bottom: 2.5rem;
    }

    .sv-type-label {
      display: inline-block;
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--sv-muted);
      padding: 0.25rem 0.6rem;
      border: 1px solid var(--sv-border);
      border-radius: 4px;
      margin-bottom: 0.75rem;
    }

    .sv-title {
      font-size: 1.75rem;
      margin-bottom: 0.5rem;
    }
    .sv-title.sv-renameable,
    .sv-sidebar-parent.current .sv-sidebar-item-title {
      cursor: text;
    }
    .sv-inline-rename-input {
      width: min(100%, 32rem);
      padding: 0.18rem 0.35rem;
      border: 1px solid var(--sv-interactive);
      border-radius: 6px;
      background: var(--sv-surface);
      color: var(--sv-text);
      font: inherit;
      outline: none;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--sv-interactive) 16%, transparent);
    }

    .sv-toolbar {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
      margin-top: 0.25rem;
    }

    .sv-btn {
      padding: 0.4rem 0.85rem;
      font-size: 0.8rem;
      font-weight: 500;
      border: 1px solid var(--sv-border);
      border-radius: 8px;
      background: var(--sv-surface);
      color: var(--sv-text);
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.76, 0, 0.24, 1);
    }
    .sv-btn:hover {
      border-color: var(--sv-interactive);
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      transform: translateY(-1px);
    }
    .sv-btn:active {
      transform: translateY(0);
      box-shadow: none;
    }
    .sv-btn.active { background: var(--sv-interactive); color: #fff; border-color: var(--sv-interactive); }
    .sv-toolbar-status {
      font-size: 0.78rem;
      color: var(--sv-muted);
      min-height: 1rem;
    }
    .sv-toolbar-status.connected {
      color: var(--sv-interactive);
    }
    .sv-toolbar-status.unsynced {
      color: var(--sv-gold);
    }

    /* Version accordions */
    .sv-version-accordions {
      margin-top: 2rem;
      border-top: 1px solid var(--sv-border);
      padding-top: 1.5rem;
    }
    .sv-version-accordions-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }
    .sv-version-accordions-title {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--sv-muted);
    }

    .sv-accordion {
      border: 1px solid var(--sv-border);
      border-radius: 8px;
      background: var(--sv-surface);
      margin-bottom: 0.5rem;
      transition: box-shadow 0.15s;
    }
    .sv-accordion:hover { box-shadow: var(--sv-card-shadow); }

    .sv-accordion-row {
      display: flex;
      align-items: center;
    }
    .sv-accordion-copy {
      margin-left: auto;
      margin-right: 0.75rem;
      padding: 0.2rem 0.6rem;
      font-size: 0.75rem;
      background: none;
      border: 1px solid var(--sv-border);
      border-radius: 6px;
      color: var(--sv-muted);
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
      flex-shrink: 0;
    }
    .sv-accordion-copy:hover { border-color: var(--sv-interactive); color: var(--sv-interactive); }

    .sv-accordion-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex: 1;
      width: 100%;
      padding: 0.75rem 1rem;
      background: none;
      border: none;
      color: var(--sv-text);
      cursor: pointer;
      font-size: 0.85rem;
      text-align: left;
    }
    .sv-accordion-header:hover { background: var(--sv-bg); border-radius: 8px; }

    .sv-accordion-chevron {
      flex-shrink: 0;
      color: var(--sv-muted);
      transition: transform 0.3s ease;
    }
    .sv-accordion.expanded .sv-accordion-chevron {
      transform: rotate(90deg);
    }

    .sv-accordion-header-text {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
    }
    .sv-accordion-meta {
      font-size: 0.75rem;
      color: var(--sv-muted);
      font-weight: 400;
    }

    .sv-accordion-content {
      max-height: 0;
      opacity: 0;
      overflow: hidden;
      transition: max-height 0.3s ease, opacity 0.3s ease;
    }
    .sv-accordion.expanded .sv-accordion-content {
      max-height: 5000px;
      opacity: 1;
    }
    .sv-accordion-content-inner {
      padding: 0.5rem 1rem 1rem;
    }
    .sv-version-unavailable {
      padding: 1rem 1.1rem;
      border: 1px dashed var(--sv-border);
      border-radius: 12px;
      background: color-mix(in srgb, var(--sv-surface) 70%, transparent);
      color: var(--sv-muted);
      font-size: 0.92rem;
    }

    .sv-diff-toggle {
      padding: 0.3rem 0.65rem;
      font-size: 0.8rem;
      border: 1px solid var(--sv-border);
      border-radius: 6px;
      background: transparent;
      color: var(--sv-muted);
      cursor: pointer;
    }
    .sv-diff-toggle:hover { border-color: var(--sv-gold); color: var(--sv-text); }
    .sv-diff-toggle.active { background: var(--sv-gold); color: #fff; border-color: var(--sv-gold); }

    /* Content blocks */
    .sv-block {
      position: relative;
      padding: 0.75rem 0.75rem;
      border-left: 3px solid transparent;
      transition: border-color 0.2s, background 0.2s;
      border-radius: 4px;
    }

    .sv-block:hover {
      border-left-color: var(--sv-interactive);
      cursor: text;
      background: rgba(128, 128, 128, 0.02);
    }

    .sv-block:hover .sv-block-actions,
    .sv-block:focus-within .sv-block-actions {
      opacity: 1;
    }

    .sv-block-actions {
      position: absolute;
      right: -2.5rem;
      top: 0.5rem;
      display: flex;
      flex-direction: row;
      gap: 0.35rem;
      opacity: 0;
      transition: opacity 0.15s;
      z-index: 2;
    }

    .sv-block-action {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--sv-border);
      border-radius: 6px;
      background: var(--sv-surface);
      color: var(--sv-muted);
      cursor: pointer;
      font-size: 0.75rem;
      transition: all 0.15s;
    }
    .sv-block-action:hover { border-color: var(--sv-interactive); color: var(--sv-interactive); }

    .sv-block[contenteditable="true"] {
      outline: 2px solid var(--sv-interactive);
      border-radius: 6px;
      cursor: text;
    }
    .sv-block[contenteditable="true"]:focus {
      outline: 2px solid var(--sv-gold);
    }
    .sv-block-edit-actions {
      display: none;
      gap: 0.35rem;
      margin-top: 0.5rem;
      align-items: center;
      justify-content: flex-end;
    }
    .sv-block[contenteditable="true"] ~ .sv-block-edit-actions,
    .sv-block-edit-actions.visible {
      display: flex;
    }
    .sv-block-edit-btn {
      font-size: 0.75rem;
      padding: 0.25rem 0.6rem;
      border: 1px solid var(--sv-border);
      border-radius: 6px;
      background: var(--sv-surface);
      color: var(--sv-muted);
      cursor: pointer;
      font-family: inherit;
    }
    .sv-block-edit-btn:hover { border-color: var(--sv-interactive); color: var(--sv-interactive); }
    .sv-block-edit-btn.primary { background: var(--sv-interactive); color: #fff; border-color: var(--sv-interactive); }
    .sv-block-edit-status {
      margin-right: auto;
      font-size: 0.72rem;
      color: var(--sv-muted);
    }
    .sv-block-edit-status[data-state="saving"] { color: var(--sv-interactive); }
    .sv-block-edit-status[data-state="error"] { color: var(--sv-danger); }
    .sv-block-edit-textarea {
      width: 100%;
      min-height: 140px;
      padding: 0.8rem 0.9rem;
      border: 1px solid var(--sv-border);
      border-radius: 10px;
      background: var(--sv-surface);
      color: var(--sv-text);
      font-size: 0.9rem;
      line-height: 1.6;
      font-family: inherit;
      resize: vertical;
      outline: none;
      white-space: pre-wrap;
    }
    .sv-block-edit-textarea:focus {
      border-color: var(--sv-interactive);
    }
    .sv-block-edit-hint {
      margin-top: 0.45rem;
      font-size: 0.72rem;
      color: var(--sv-muted);
    }

    .sv-message-section {
      margin-bottom: 1.85rem;
    }
    .sv-message-section-header {
      display: flex;
      flex-direction: column;
      gap: 0.38rem;
      margin-bottom: 0.78rem;
    }
    .sv-message-section-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.8rem;
    }
    .sv-message-section-eyebrow {
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--sv-muted);
    }
    .sv-message-section-title {
      font-size: 1.15rem;
      line-height: 1.28;
      margin: 0;
    }
    .sv-message-section-copy {
      flex-shrink: 0;
    }
    .sv-message-section-card {
      background: var(--sv-surface);
      border: 1px solid var(--sv-border);
      border-radius: 16px;
      box-shadow: var(--sv-card-shadow);
      overflow: hidden;
    }
    .sv-message-section-card--draft {
      border-top: 3px solid var(--sv-interactive);
    }
    .sv-message-section-card--notes {
      background: color-mix(in srgb, var(--sv-surface) 86%, var(--sv-bg) 14%);
    }
    .sv-message-section-body {
      padding: 1rem 1.15rem 1.1rem;
    }
    .sv-message-section-card .sv-block {
      padding: 0;
      border-left: none;
      border-radius: 0;
      background: transparent;
    }
    .sv-message-section-card .sv-block + .sv-block {
      margin-top: 0.9rem;
    }
    .sv-message-section-card .sv-block:hover {
      border-left-color: transparent;
      background: transparent;
    }
    .sv-message-section-card .sv-block-actions {
      right: 0;
      top: 0;
    }
    .sv-message-section-card .sv-comment-badge {
      right: 0;
      top: 0;
    }
    .sv-message-section-card .sv-block.has-comment {
      box-shadow: inset 3px 0 0 var(--sv-interactive);
      padding-left: 0.75rem;
      margin-left: -0.75rem;
    }
    .sv-redundant-lead-heading {
      display: none !important;
    }
    .sv-onboard-toast {
      position: fixed;
      right: 1.25rem;
      bottom: 5.25rem;
      max-width: 280px;
      padding: 0.8rem 0.95rem;
      border: 1px solid var(--sv-border);
      border-radius: 12px;
      background: var(--sv-surface);
      color: var(--sv-text);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.14);
      font-size: 0.82rem;
      line-height: 1.45;
      z-index: 1200;
    }
    .sv-onboard-toast strong {
      display: block;
      margin-bottom: 0.2rem;
      font-size: 0.78rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--sv-muted);
    }

    /* Feedback panel */
    .sv-feedback-input {
      display: none;
      margin-top: 0.5rem;
    }
    .sv-feedback-input.open { display: block; }

    .sv-feedback-textarea {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid var(--sv-border);
      border-radius: 6px;
      background: var(--sv-surface);
      color: var(--sv-text);
      font-size: 0.85rem;
      font-family: inherit;
      resize: vertical;
      min-height: 60px;
      outline: none;
    }
    .sv-feedback-textarea:focus { border-color: var(--sv-interactive); }

    .sv-feedback-submit {
      margin-top: 0.35rem;
      padding: 0.3rem 0.75rem;
      background: var(--sv-interactive);
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 0.8rem;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .sv-feedback-submit:hover { opacity: 0.85; }

    /* Text selection toolbar */
    .sv-selection-toolbar {
      display: none;
      position: absolute;
      background: color-mix(in srgb, var(--sv-surface) 92%, var(--sv-bg) 8%);
      color: var(--sv-text);
      padding: 0.3rem;
      border-radius: 10px;
      border: 1px solid var(--sv-border);
      font-size: 0.8rem;
      z-index: 500;
      box-shadow: 0 10px 28px rgba(0,0,0,0.18);
      align-items: center;
      gap: 0.25rem;
    }
    .sv-selection-toolbar.visible { display: flex; }
    .sv-selection-toolbar-btn {
      border: 1px solid var(--sv-border);
      background: transparent;
      color: var(--sv-text);
      border-radius: 8px;
      padding: 0.3rem 0.65rem;
      font-size: 0.76rem;
      font-weight: 600;
      cursor: pointer;
      transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
    }
    .sv-selection-toolbar-btn:hover {
      border-color: var(--sv-interactive);
      color: var(--sv-interactive);
    }
    .sv-selection-toolbar-btn.primary {
      background: var(--sv-interactive);
      border-color: var(--sv-interactive);
      color: #fff;
    }
    .sv-selection-toolbar-btn.primary:hover {
      opacity: 0.92;
      color: #fff;
    }

    /* Comment panel (right sidebar) */
    .sv-comment-panel {
      width: 300px;
      background: var(--sv-surface);
      border-left: 1px solid var(--sv-border);
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      z-index: 100;
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.3s ease;
      overflow: hidden;
    }
    .sv-comment-panel.open { transform: translateX(0); }

    .sv-comment-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 1rem 1rem;
      border-bottom: 1px solid var(--sv-border);
      flex-shrink: 0;
    }
    .sv-comment-panel-header-title {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--sv-text);
      letter-spacing: -0.01em;
    }
    .sv-comment-panel-close {
      background: none;
      border: 1px solid var(--sv-border);
      border-radius: 6px;
      color: var(--sv-muted);
      cursor: pointer;
      font-size: 1rem;
      padding: 0.15rem 0.45rem;
      line-height: 1;
      transition: border-color 0.15s, color 0.15s;
    }
    .sv-comment-panel-close:hover {
      color: var(--sv-text);
      border-color: var(--sv-text);
    }

    .sv-comment-panel-toggle-resolved {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.5rem 1rem;
      border-bottom: 1px solid var(--sv-border);
      font-size: 0.75rem;
      color: var(--sv-muted);
      flex-shrink: 0;
    }
    .sv-comment-panel-toggle-resolved input { cursor: pointer; }
    .sv-comment-panel-toggle-resolved label { cursor: pointer; }

    .sv-review-panel-tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.35rem;
      padding: 0.65rem 1rem;
      border-bottom: 1px solid var(--sv-border);
      flex-shrink: 0;
    }
    .sv-review-panel-tab {
      border: 1px solid var(--sv-border);
      border-radius: 8px;
      background: var(--sv-bg);
      color: var(--sv-muted);
      font-size: 0.76rem;
      font-weight: 600;
      padding: 0.45rem 0.55rem;
      cursor: pointer;
      transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
    }
    .sv-review-panel-tab.active {
      border-color: var(--sv-interactive);
      background: var(--sv-selection);
      color: var(--sv-interactive);
    }
    .sv-review-panel-section {
      display: none;
      flex: 1;
      min-height: 0;
    }
    .sv-review-panel-section.active {
      display: flex;
      flex-direction: column;
    }

    .sv-comment-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem 0;
    }

    .sv-comment-item {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--sv-border);
      cursor: pointer;
      transition: background 0.15s;
    }
    .sv-comment-item:hover { background: var(--sv-bg); }
    .sv-comment-item.resolved { opacity: 0.5; }
    .sv-comment-item.resolved .sv-comment-item-text { text-decoration: line-through; }

    .sv-comment-item-block {
      font-size: 0.7rem;
      color: var(--sv-muted);
      text-transform: uppercase;
      letter-spacing: 0.03em;
      margin-bottom: 0.25rem;
    }
    .sv-comment-block-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      background: var(--sv-interactive);
      color: #fff;
      font-size: 0.6rem;
      font-weight: 700;
      border-radius: 50%;
      margin-right: 0.3rem;
      flex-shrink: 0;
      vertical-align: middle;
    }
    .sv-comment-item-quote {
      font-size: 0.8rem;
      color: var(--sv-text);
      font-style: italic;
      padding: 0.4rem 0.75rem;
      border-left: 3px solid var(--sv-gold);
      margin-bottom: 0.5rem;
      background: rgba(212, 152, 40, 0.08);
      border-radius: 0 6px 6px 0;
      line-height: 1.4;
    }
    .sv-comment-item-text {
      font-size: 0.85rem;
      color: var(--sv-text);
      margin-bottom: 0.25rem;
      white-space: pre-wrap;
    }
    .sv-comment-item-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.7rem;
      color: var(--sv-muted);
    }
    .sv-comment-resolve-btn {
      background: none;
      border: 1px solid var(--sv-border);
      border-radius: 6px;
      padding: 0.15rem 0.5rem;
      font-size: 0.7rem;
      color: var(--sv-muted);
      cursor: pointer;
      transition: all 0.15s;
    }
    .sv-comment-resolve-btn:hover { border-color: var(--sv-interactive); color: var(--sv-interactive); }

    .sv-review-empty-state {
      padding: 1rem;
      text-align: center;
      color: var(--sv-muted);
      font-size: 0.84rem;
      line-height: 1.5;
    }
    .sv-edit-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem 0;
    }
    .sv-edit-item {
      padding: 0.8rem 1rem;
      border-bottom: 1px solid var(--sv-border);
    }
    .sv-edit-item-label {
      font-size: 0.72rem;
      font-weight: 500;
      color: var(--sv-muted);
      margin-bottom: 0.3rem;
    }
    .sv-edit-item-text {
      font-size: 0.84rem;
      color: var(--sv-text);
      white-space: pre-wrap;
      line-height: 1.5;
    }
    .sv-edit-item-meta {
      margin-top: 0.35rem;
      font-size: 0.72rem;
      color: var(--sv-muted);
    }

    /* Block with comments indicator */
    .sv-block.has-comment {
      border-left: 3px solid var(--sv-interactive);
    }

    /* Persistent text highlight for text-selection comments */
    .sv-persistent-highlight {
      background: var(--sv-selection);
      border-bottom: 2px solid var(--sv-gold);
      cursor: pointer;
      border-radius: 2px;
    }
    .sv-persistent-highlight:hover { opacity: 0.8; }

    /* Comment badge in right margin */
    .sv-comment-badge {
      position: absolute;
      right: -2.5rem;
      top: 0.15rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      height: 22px;
      padding: 0 0.35rem;
      background: var(--sv-gold);
      color: #fff;
      font-size: 0.6rem;
      font-weight: 700;
      border-radius: 999px;
      cursor: pointer;
      z-index: 10;
      transition: transform 0.15s, box-shadow 0.15s;
      box-shadow: 0 6px 16px rgba(0,0,0,0.16);
    }
    .sv-comment-badge:hover { transform: scale(1.15); }

    /* Block-level add-comment button */
    .sv-block-comment-btn {
      position: absolute;
      right: -2.5rem;
      top: 0.75rem;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--sv-border);
      border-radius: 50%;
      background: var(--sv-surface);
      color: var(--sv-muted);
      cursor: pointer;
      font-size: 0.85rem;
      opacity: 0;
      transition: opacity 0.15s, border-color 0.15s;
    }
    .sv-block:hover .sv-block-comment-btn { opacity: 1; }
    .sv-block-comment-btn:hover { border-color: var(--sv-interactive); color: var(--sv-interactive); }

    .sv-inline-review-card {
      position: absolute;
      width: min(360px, calc(100vw - 2rem));
      background: color-mix(in srgb, var(--sv-surface) 94%, var(--sv-bg) 6%);
      border: 1px solid var(--sv-border);
      border-radius: 16px;
      box-shadow: 0 18px 40px rgba(0,0,0,0.22);
      padding: 0.9rem 0.95rem;
      z-index: 450;
    }
    .sv-inline-review-card[hidden] {
      display: none;
    }
    .sv-inline-review-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }
    .sv-inline-review-card-eyebrow {
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--sv-muted);
      margin-bottom: 0.2rem;
    }
    .sv-inline-review-card-label {
      font-size: 0.86rem;
      font-weight: 600;
      line-height: 1.35;
      color: var(--sv-text);
    }
    .sv-inline-review-card-close {
      border: 1px solid var(--sv-border);
      background: transparent;
      color: var(--sv-muted);
      border-radius: 8px;
      width: 28px;
      height: 28px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .sv-inline-review-card-close:hover {
      border-color: var(--sv-interactive);
      color: var(--sv-interactive);
    }
    .sv-inline-review-card-quote {
      font-size: 0.8rem;
      color: var(--sv-text);
      font-style: italic;
      padding: 0.45rem 0.75rem;
      border-left: 3px solid var(--sv-gold);
      margin-bottom: 0.75rem;
      background: rgba(212, 152, 40, 0.08);
      border-radius: 0 8px 8px 0;
      line-height: 1.45;
      white-space: pre-wrap;
    }
    .sv-inline-review-thread {
      max-height: 220px;
      overflow-y: auto;
      margin-bottom: 0.7rem;
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
    }
    .sv-inline-review-thread:empty {
      display: none;
    }
    .sv-inline-review-thread-item {
      padding: 0.55rem 0.65rem;
      border: 1px solid var(--sv-border);
      border-radius: 10px;
      background: var(--sv-bg);
    }
    .sv-inline-review-thread-item.resolved {
      opacity: 0.64;
    }
    .sv-inline-review-thread-item-text {
      font-size: 0.84rem;
      line-height: 1.5;
      color: var(--sv-text);
      white-space: pre-wrap;
    }
    .sv-inline-review-thread-item-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-top: 0.4rem;
      font-size: 0.7rem;
      color: var(--sv-muted);
    }
    .sv-inline-review-textarea {
      width: 100%;
      min-height: 92px;
      padding: 0.7rem 0.8rem;
      border: 1px solid var(--sv-border);
      border-radius: 10px;
      background: var(--sv-surface);
      color: var(--sv-text);
      font-size: 0.85rem;
      line-height: 1.5;
      font-family: inherit;
      resize: vertical;
      outline: none;
    }
    .sv-inline-review-textarea:focus {
      border-color: var(--sv-interactive);
    }
    .sv-inline-review-card-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-top: 0.65rem;
    }
    .sv-inline-review-hint {
      font-size: 0.72rem;
      color: var(--sv-muted);
      line-height: 1.4;
    }
    .sv-inline-review-actions {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .sv-inline-review-btn {
      border: 1px solid var(--sv-border);
      background: transparent;
      color: var(--sv-muted);
      border-radius: 8px;
      padding: 0.42rem 0.75rem;
      font-size: 0.76rem;
      font-weight: 600;
      cursor: pointer;
    }
    .sv-inline-review-btn.primary {
      background: var(--sv-interactive);
      border-color: var(--sv-interactive);
      color: #fff;
    }
    .sv-inline-review-btn:hover {
      border-color: var(--sv-interactive);
      color: var(--sv-interactive);
    }
    .sv-inline-review-btn.primary:hover {
      color: #fff;
      opacity: 0.92;
    }
    .sv-inline-review-anchor-active {
      background: rgba(212, 152, 40, 0.08);
      outline: 2px solid color-mix(in srgb, var(--sv-gold) 70%, transparent);
      border-radius: 8px;
    }

    /* When comment panel is open, adjust main content */
    body.sv-comment-panel-open .sv-main {
      margin-right: 300px;
    }

    /* Feedback highlights */
    .sv-text-highlight {
      background: var(--sv-selection);
      border-bottom: 2px solid var(--sv-interactive);
      cursor: pointer;
    }

    /* Comment markers */
    .sv-comment-marker {
      display: inline-block;
      background: var(--sv-gold);
      color: #fff;
      font-size: 0.6rem;
      width: 16px;
      height: 16px;
      line-height: 16px;
      text-align: center;
      border-radius: 50%;
      margin-left: 0.25rem;
      vertical-align: super;
      cursor: pointer;
    }

    /* Previous feedback banner */
    .sv-feedback-banner {
      padding: 0.75rem 1rem;
      background: var(--sv-surface);
      border: 1px solid var(--sv-gold);
      border-radius: 8px;
      margin-bottom: 1.5rem;
      font-size: 0.85rem;
    }
    .sv-feedback-banner-title {
      font-weight: 600;
      color: var(--sv-gold);
      margin-bottom: 0.25rem;
    }

    /* Diff styling */
    .sv-diff-add {
      background: rgba(42, 112, 71, 0.15);
      text-decoration: none;
    }
    html.night .sv-diff-add {
      background: rgba(212, 152, 40, 0.15);
    }
    .sv-diff-remove {
      background: rgba(106, 107, 94, 0.1);
      text-decoration: line-through;
      color: var(--sv-muted);
    }
    .sv-diff-container { display: none; }
    .sv-diff-container.visible { display: block; }

    /* Copy button */
    .sv-copy-btn {
      position: relative;
    }

    /* Footer */
    .sv-footer {
      margin-top: 4rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--sv-border);
      font-size: 0.75rem;
      color: var(--sv-muted);
      text-align: center;
      letter-spacing: 0.03em;
    }
    .sv-footer a {
      color: var(--sv-muted);
      font-weight: 500;
      transition: color 0.2s;
    }
    .sv-footer a:hover {
      color: var(--sv-interactive);
      text-decoration: none;
    }

    /* Pill toggle switch */
    .sv-toggle-switch {
      position: relative;
      width: 52px;
      height: 28px;
      border-radius: 14px;
      border: 1.5px solid rgba(42, 112, 71, 0.5);
      background: rgba(254, 254, 254, 0.8);
      cursor: pointer;
      transition: border-color 0.3s, background 0.3s;
      padding: 0;
      outline: none;
    }
    html.night .sv-toggle-switch {
      border-color: rgba(212, 152, 40, 0.5);
      background: rgba(20, 18, 30, 0.8);
    }
    .sv-toggle-knob {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #FEFEFE;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: left 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55), background 0.3s, box-shadow 0.3s;
      box-shadow: 0 0 8px rgba(184, 137, 42, 0.2);
    }
    html.night .sv-toggle-knob {
      left: calc(100% - 23px);
      background: #14121E;
      box-shadow: 0 0 8px rgba(212, 152, 40, 0.3);
    }
    .sv-toggle-sun { display: block; }
    .sv-toggle-moon { display: none; }
    html.night .sv-toggle-sun { display: none; }
    html.night .sv-toggle-moon { display: block; }

    /* Small variant for toolbar */
    .sv-toggle-sm {
      width: 44px;
      height: 24px;
      border-radius: 12px;
    }
    .sv-toggle-sm .sv-toggle-knob {
      width: 16px;
      height: 16px;
      top: 2.5px;
      left: 2.5px;
    }
    html.night .sv-toggle-sm .sv-toggle-knob {
      left: calc(100% - 19px);
    }
    .sv-toggle-sm .sv-toggle-sun { width: 10px; height: 10px; }
    .sv-toggle-sm .sv-toggle-moon { width: 9px; height: 9px; }
    .sv-toolbar-theme {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }
    .sv-theme-label {
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--sv-text);
    }

    /* Back button */
    .sv-back-btn {
      display: inline-block;
      font-size: 0.8rem;
      color: var(--sv-muted);
      text-decoration: none;
      margin-bottom: 0.75rem;
      transition: color 0.15s;
    }
    .sv-back-btn:hover { color: var(--sv-interactive); text-decoration: none; }

    /* Hamburger toggle */
    .sv-hamburger {
      display: flex;
      position: fixed;
      top: 1rem;
      left: 1rem;
      z-index: 200;
      width: 40px;
      height: 40px;
      border: 1px solid var(--sv-border);
      border-radius: 6px;
      background: var(--sv-surface);
      cursor: pointer;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      color: var(--sv-text);
      transition: border-color 0.15s;
    }
    .sv-hamburger:hover { border-color: var(--sv-interactive); }

    /* Desktop: sidebar hidden state */
    body.sv-sidebar-collapsed .sv-sidebar { transform: translateX(-100%); }
    body.sv-sidebar-collapsed .sv-main { margin-left: 0 !important; }

    /* Responsive */
    @media (max-width: 1199px) {
      .sv-sidebar { transform: translateX(-100%); }
      .sv-sidebar.open { transform: translateX(0); }
      .sv-main { margin-left: 0 !important; }
      .sv-block-actions { right: -0.5rem; }
      body.sv-comment-panel-open .sv-main { margin-right: 0; }
      .sv-block-comment-btn { right: -0.5rem; }
      .sv-comment-badge { right: -0.5rem; }
      .sv-inline-review-card {
        width: min(360px, calc(100vw - 1.5rem));
      }
    }

    @media (max-width: 767px) {
      .sv-main { padding: 1rem; }
      .sv-title { font-size: 1.35rem; }
      .sv-block-actions {
        position: static;
        opacity: 1;
        flex-direction: row;
        margin-top: 0.5rem;
      }
      /* Comment panel becomes bottom sheet on mobile */
      .sv-comment-panel {
        width: 100%;
        height: 60vh;
        top: auto;
        bottom: 0;
        left: 0;
        right: 0;
        border-left: none;
        border-top: 1px solid var(--sv-border);
        border-radius: 12px 12px 0 0;
        transform: translateY(100%);
      }
      .sv-comment-panel.open { transform: translateY(0); }
      .sv-block-comment-btn {
        position: static;
        opacity: 1;
      }
      .sv-comment-badge {
        position: static;
        margin-left: 0.25rem;
      }
      .sv-inline-review-card {
        position: fixed;
        left: 0.75rem !important;
        right: 0.75rem;
        top: auto !important;
        bottom: 0.75rem;
        width: auto !important;
        max-height: 52vh;
        overflow-y: auto;
      }
      .sv-inline-review-card-actions {
        flex-direction: column;
        align-items: stretch;
      }
      .sv-inline-review-actions {
        justify-content: stretch;
      }
      .sv-inline-review-btn {
        flex: 1;
      }
    }

    /* Floating feedback pill */
    .sv-feedback-pill {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      z-index: 200;
      border-radius: 24px;
      padding: 0.5rem 1.25rem;
      background: var(--sv-interactive);
      color: #fff;
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      cursor: pointer;
      border: none;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .sv-feedback-pill:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    }
    .sv-feedback-pill:active {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    body.sv-comment-panel-open .sv-feedback-pill {
      display: none;
    }

    /* Today page cards */
    .sv-today-card {
      display: block;
      background: var(--sv-surface);
      border: 1px solid var(--sv-border);
      border-radius: 10px;
      padding: 1rem 1.25rem;
      transition: box-shadow 0.2s, border-color 0.2s, transform 0.15s;
      cursor: pointer;
      border-left: 3px solid transparent;
      color: inherit;
      text-decoration: none;
    }
    .sv-today-card:hover {
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
      border-left-color: var(--sv-interactive);
      transform: translateY(-1px);
    }
    .sv-today-card-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.35rem;
    }
    .sv-today-card-icon { font-size: 1.1rem; }
    .sv-today-card-title {
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--sv-text);
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sv-today-card-title:hover { text-decoration: none; }
    .sv-today-card-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .sv-today-card-type {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--sv-muted);
      padding: 0.15rem 0.4rem;
      border: 1px solid var(--sv-border);
      border-radius: 6px;
    }
    .sv-today-card-badge {
      font-size: 0.6rem;
      padding: 0.1rem 0.35rem;
      border-radius: 10px;
      font-weight: 600;
      color: #fff;
    }
    .sv-today-card-badge-version { background: var(--sv-interactive); }
    .sv-today-card-badge-comment { background: var(--sv-gold); }
    .sv-today-card-time {
      font-size: 0.75rem;
      color: var(--sv-muted);
      margin-left: auto;
    }
    .sv-today-card-preview {
      font-size: 0.8rem;
      color: var(--sv-muted);
      margin-top: 0.5rem;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .sv-today-section-title {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--sv-muted);
      margin-bottom: 0.75rem;
    }

    /* Content fade-in */
    @keyframes sv-fadein {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    #sv-content-area { animation: sv-fadein 0.2s ease both; }

    /* Onboarding pulse */
    @keyframes sv-pulse {
      0%, 100% { border-color: var(--sv-interactive); }
      50% { border-color: var(--sv-gold); }
    }
    .sv-block.sv-onboard-pulse {
      border-left-color: var(--sv-interactive);
      animation: sv-pulse 1.5s ease infinite;
    }
    .sv-onboard-tooltip {
      position: absolute;
      top: -2.5rem;
      left: 0.75rem;
      background: var(--sv-text);
      color: var(--sv-bg);
      font-size: 0.8rem;
      padding: 0.35rem 0.75rem;
      border-radius: 6px;
      white-space: nowrap;
      z-index: 300;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }

    /* Variation tab panels */
    .sv-variations-container { position: relative; }
    .sv-variation-panels { position: relative; }
    .sv-variation-panel { display: none; }
    .sv-variation-panel.active { display: block; }
    .sv-variation-tab-bar {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--sv-border);
    }
    .sv-variation-tab {
      padding: 0.5rem 1.25rem;
      font-size: 0.85rem;
      border-radius: 8px;
      border: 1px solid var(--sv-border);
      background: transparent;
      color: var(--sv-text);
      cursor: pointer;
      transition: all 0.2s;
      font-weight: 500;
    }
    .sv-variation-tab:hover { border-color: var(--sv-interactive); }
    .sv-variation-tab.active { background: var(--sv-interactive); color: #fff; border-color: var(--sv-interactive); font-weight: 600; }
    .sv-variation-tab .sv-star { color: var(--sv-gold); margin-right: 0.25rem; }

    /* Image gallery */
    .sv-image-grid {
      display: grid;
      gap: 4px;
      border-radius: 12px;
      overflow: hidden;
      margin-top: 0.75rem;
    }
    .sv-image-grid.sv-grid-1 { grid-template-columns: 1fr; }
    .sv-image-grid.sv-grid-2 { grid-template-columns: 1fr 1fr; }
    .sv-image-grid.sv-grid-3 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
    .sv-image-grid.sv-grid-3 .sv-image-item:first-child { grid-row: 1 / 3; }
    .sv-image-grid.sv-grid-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
    .sv-image-item {
      position: relative;
      overflow: hidden;
      cursor: pointer;
      aspect-ratio: 16/9;
    }
    .sv-image-grid.sv-grid-1 .sv-image-item { aspect-ratio: 16/9; max-height: 300px; }
    .sv-image-grid.sv-grid-2 .sv-image-item { aspect-ratio: 1; }
    .sv-image-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.2s;
    }
    .sv-image-item:hover img { transform: scale(1.03); }

    /* Lightbox */
    .sv-lightbox {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.85);
      z-index: 2000;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .sv-lightbox.open { display: flex; }
    .sv-lightbox img {
      max-width: 90vw;
      max-height: 90vh;
      object-fit: contain;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    .sv-lightbox-close {
      position: absolute;
      top: 1rem;
      right: 1rem;
      background: rgba(255,255,255,0.2);
      border: none;
      color: #fff;
      font-size: 1.5rem;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Overall notes area */
    .sv-notes-divider {
      border-top: 1px solid var(--sv-border);
      margin: 0;
      padding: 0.75rem;
      flex-shrink: 0;
    }
    .sv-notes-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--sv-muted);
      margin-bottom: 0.35rem;
    }
    .sv-notes-textarea {
      width: 100%;
      padding: 0.6rem 0.75rem;
      border: 1px solid var(--sv-border);
      border-radius: 8px;
      background: var(--sv-surface);
      color: var(--sv-text);
      font-size: 0.85rem;
      font-family: inherit;
      resize: vertical;
      min-height: 60px;
      outline: none;
    }
    .sv-notes-textarea:focus { border-color: var(--sv-interactive); }
    .sv-notes-actions {
      margin-top: 0.5rem;
    }
    .sv-notes-saved {
      font-size: 0.7rem;
      color: var(--sv-muted);
      min-height: 1em;
      text-align: center;
      margin-bottom: 0.35rem;
    }
    .sv-notes-save-btn {
      background: var(--sv-interactive);
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 0.45rem 1.5rem;
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.15s;
      width: 100%;
    }
    .sv-notes-save-btn:hover { opacity: 0.9; }

    /* Keyboard shortcut hints */
    .sv-kbd {
      display: inline-block;
      padding: 0.1rem 0.35rem;
      font-size: 0.7rem;
      font-family: inherit;
      background: rgba(128, 128, 128, 0.15);
      border: 1px solid var(--sv-border);
      border-radius: 3px;
      color: var(--sv-muted);
    }

    /* Command-K palette */
    .sv-cmdk-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 20vh;
      animation: sv-cmdk-fade 0.15s ease;
    }
    @keyframes sv-cmdk-fade {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .sv-cmdk-modal {
      width: 100%;
      max-width: 500px;
      background: var(--sv-surface);
      border: 1px solid var(--sv-border);
      border-radius: 12px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.2);
      overflow: hidden;
    }
    .sv-cmdk-input {
      width: 100%;
      padding: 0.85rem 1rem;
      font-size: 1rem;
      font-family: inherit;
      border: none;
      border-bottom: 1px solid var(--sv-border);
      background: transparent;
      color: var(--sv-text);
      outline: none;
    }
    .sv-cmdk-input::placeholder { color: var(--sv-muted); }
    .sv-cmdk-results {
      max-height: 320px;
      overflow-y: auto;
      padding: 0.5rem 0;
    }
    .sv-cmdk-group-title {
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--sv-muted);
      padding: 0.5rem 1rem 0.25rem;
    }
    .sv-cmdk-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 1rem;
      cursor: pointer;
      font-size: 0.875rem;
      color: var(--sv-text);
      transition: background 0.1s;
    }
    .sv-cmdk-item:hover, .sv-cmdk-item.active {
      background: var(--sv-bg);
    }
    .sv-cmdk-item.active {
      background: var(--sv-interactive);
      color: #fff;
    }
    .sv-cmdk-item-icon {
      font-size: 1rem;
      width: 1.5rem;
      text-align: center;
      flex-shrink: 0;
    }
    .sv-cmdk-item-text {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sv-cmdk-item-subtitle {
      font-size: 0.75rem;
      color: var(--sv-muted);
    }
    .sv-cmdk-item.active .sv-cmdk-item-subtitle { color: rgba(255,255,255,0.7); }
    .sv-cmdk-kbd {
      font-size: 0.7rem;
      padding: 0.1rem 0.35rem;
      background: rgba(128,128,128,0.15);
      border: 1px solid var(--sv-border);
      border-radius: 3px;
      color: var(--sv-muted);
      margin-left: auto;
      flex-shrink: 0;
    }
    .sv-cmdk-item.active .sv-cmdk-kbd { background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.3); color: rgba(255,255,255,0.7); }
    .sv-cmdk-empty {
      padding: 1.5rem 1rem;
      text-align: center;
      color: var(--sv-muted);
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  ${hasSidebar ? `
    <button class="sv-hamburger" onclick="toggleSidebar()" aria-label="Toggle sidebar">&#9776;</button>
  ` : ''}

  <div class="sv-layout">
    ${sidebarHtml}

    <main class="sv-main">
      <div class="sv-content">
        ${dashboardMode ? '' : `<a class="sv-back-btn" href="#" onclick="history.back(); return false;" id="sv-back-btn">&larr; Back to history</a>`}
        <div class="sv-header">
          <span class="sv-type-label">${escapeHtml(typeLabel)}${versions.length > 1 ? ` &middot; v${currentVersion}` : ''}</span>
          <h1 class="sv-title sv-renameable" id="sv-page-title" title="Double-click to rename">${escapeHtml(title)}</h1>
          ${dashboardMode ? '' : `<div class="sv-toolbar">
            <button class="sv-btn sv-copy-btn" onclick="copyContent(this)">Copy main text</button>
            ${feedbackEnabled ? `<button class="sv-btn" onclick="exportFeedback()">Export review</button>` : ''}
            ${feedbackEnabled ? `<button class="sv-btn" id="sv-import-review-btn" onclick="importReviewBundle()">Import review</button>` : ''}
            ${feedbackEnabled ? `<button class="sv-btn" id="sv-connect-folder-btn" onclick="connectReviewFolder()">Connect folder</button>` : ''}
            ${feedbackEnabled ? `<button class="sv-btn" onclick="openCommentPanel()">Review <span class="sv-kbd">C</span></button>` : ''}
            ${feedbackEnabled ? `<span class="sv-toolbar-status" id="sv-review-status" aria-live="polite"></span>` : ''}
          </div>`}
        </div>

        <div id="sv-content-area">
          <!-- SV:CONTENT_START -->${contentHtml}<!-- SV:CONTENT_END -->
        </div>

        ${diffHtml ? `<div class="sv-diff-container" id="sv-diff-area">${diffHtml}</div>` : ''}

        ${versionAccordionsHtml}

        ${attribution ? `
          <footer class="sv-footer">
            Built by <a href="https://x.com/Pranit" target="_blank" rel="noopener">Pranit</a>
          </footer>
        ` : ''}
      </div>
    </main>
  </div>

  ${feedbackEnabled ? `<div class="sv-selection-toolbar" id="sv-selection-toolbar">
    <button class="sv-selection-toolbar-btn primary" type="button" onclick="commentOnSelection(event)">Comment</button>
    <button class="sv-selection-toolbar-btn" type="button" onclick="copySelectionText(event)">Copy</button>
    <button class="sv-selection-toolbar-btn" type="button" onclick="dismissSelectionToolbar(event)">Cancel</button>
  </div>` : ''}
  ${feedbackEnabled ? `<input type="file" id="sv-import-review-input" accept="application/json" style="display:none" onchange="handleImportedReviewFile(event)">` : ''}

  ${feedbackEnabled ? `
  <!-- Comment Panel (right sidebar) -->
  <aside class="sv-comment-panel" id="sv-comment-panel">
    <div class="sv-comment-panel-header">
      <span class="sv-comment-panel-header-title" id="sv-comment-count">Review</span>
      <button class="sv-comment-panel-close" onclick="closeCommentPanel()" aria-label="Close review">&times;</button>
    </div>
    <div class="sv-review-panel-tabs">
      <button class="sv-review-panel-tab active" id="sv-review-tab-comments" onclick="switchReviewPanelTab('comments')">Comments</button>
      <button class="sv-review-panel-tab" id="sv-review-tab-notes" onclick="switchReviewPanelTab('notes')">Notes</button>
      <button class="sv-review-panel-tab" id="sv-review-tab-edits" onclick="switchReviewPanelTab('edits')">Edits</button>
    </div>
    <div class="sv-review-panel-section active" id="sv-review-section-comments">
      <div class="sv-comment-panel-toggle-resolved">
        <input type="checkbox" id="sv-show-resolved" onchange="toggleResolvedVisibility()">
        <label for="sv-show-resolved">Show resolved</label>
      </div>
      <div class="sv-review-empty-state" id="sv-review-comment-hint">Use + Comment on a block, or select text to leave an inline comment.</div>
      <div class="sv-comment-list" id="sv-comment-list"></div>
    </div>
    <div class="sv-review-panel-section" id="sv-review-section-notes">
      <div class="sv-notes-divider" style="border-top:none;padding-top:1rem">
        <div class="sv-notes-label">Overall Notes</div>
        <textarea class="sv-notes-textarea" id="sv-notes-textarea" placeholder="Capture overall notes about this page..." rows="6"></textarea>
        <div class="sv-notes-actions">
          <span class="sv-notes-saved" id="sv-notes-saved"></span>
          <button class="sv-notes-save-btn" onclick="saveNotes()">Save</button>
        </div>
      </div>
    </div>
    <div class="sv-review-panel-section" id="sv-review-section-edits">
      <div class="sv-edit-list" id="sv-edit-list"></div>
    </div>
  </aside>

  <div class="sv-inline-review-card" id="sv-inline-review-card" hidden>
    <div class="sv-inline-review-card-header">
      <div>
        <div class="sv-inline-review-card-eyebrow" id="sv-inline-review-eyebrow">Inline comment</div>
        <div class="sv-inline-review-card-label" id="sv-inline-review-label">Comment on this block</div>
      </div>
      <button class="sv-inline-review-card-close" type="button" onclick="closeInlineReviewCard()" aria-label="Close inline comment">&times;</button>
    </div>
    <div class="sv-inline-review-card-quote" id="sv-inline-review-quote" hidden></div>
    <div class="sv-inline-review-thread" id="sv-inline-review-thread"></div>
    <textarea class="sv-inline-review-textarea" id="sv-inline-review-textarea" rows="4" placeholder="Add a comment..."></textarea>
    <div class="sv-inline-review-card-actions">
      <span class="sv-inline-review-hint" id="sv-inline-review-hint">Enter for newline · Cmd/Ctrl+Enter to save</span>
      <div class="sv-inline-review-actions">
        <button class="sv-inline-review-btn" type="button" onclick="closeInlineReviewCard()">Cancel</button>
        <button class="sv-inline-review-btn primary" type="button" id="sv-inline-review-submit" onclick="submitInlineReviewComment()">Save comment</button>
      </div>
    </div>
  </div>

  <button class="sv-feedback-pill" id="sv-feedback-pill" onclick="openCommentPanel()">Review</button>
  ` : ''}

  <!-- Command-K Palette -->
  <div class="sv-cmdk-overlay" id="sv-cmdk" style="display:none" onclick="closeCmdK(event)">
    <div class="sv-cmdk-modal" onclick="event.stopPropagation()">
      <input class="sv-cmdk-input" id="sv-cmdk-input" placeholder="Search or jump to..." autocomplete="off">
      <div class="sv-cmdk-results" id="sv-cmdk-results"></div>
    </div>
  </div>

  <script>
    // History data for dynamic sidebar
    window.__svEmbeddedHistory = ${JSON.stringify(history)};
    window.__svEmbeddedHistoryData = ${JSON.stringify(historyData)};
    if ((!window.__svHistoryData || window.__svHistoryData.formatVersion !== 2) && window.__svEmbeddedHistoryData && window.__svEmbeddedHistoryData.formatVersion === 2) {
      window.__svHistoryData = window.__svEmbeddedHistoryData;
    }
    if (!Array.isArray(window.__svHistory) || window.__svHistory.length === 0) {
      if (window.__svHistoryData && Array.isArray(window.__svHistoryData.localHistory)) {
        window.__svHistory = window.__svHistoryData.localHistory;
      } else {
        window.__svHistory = window.__svEmbeddedHistory;
      }
    }
    if (!Array.isArray(window.__svLatestHistory) || window.__svLatestHistory.length === 0) {
      window.__svLatestHistory = window.__svHistory;
    }
    window.__svBasePath = ${JSON.stringify(basePath)};
    window.__svServedMode = false;
    window.__svRuntimeVersion = 6;
    window.__svCanonicalContentManaged = ${canonicalContentManaged ? 'true' : 'false'};
    window.__svTaskId = '${taskId}';
    window.__svClientId = window.__svClientId || ('sv-client-' + Math.random().toString(36).slice(2, 10));
    window.__svCurrentVersion = ${currentVersion};
    window.__svFeedbackEnabled = ${feedbackEnabled ? 'true' : 'false'};

    ${getThemeToggleScript()}

    // Sidebar toggle (works on both desktop and mobile)
    function toggleSidebar() {
      var sidebar = document.querySelector('.sv-sidebar');
      if (!sidebar) return;
      var isDesktop = window.innerWidth > 1199;
      if (isDesktop) {
        sidebar.classList.remove('open');
        document.body.classList.toggle('sv-sidebar-collapsed');
      } else {
        if (!sidebar.classList.contains('open')) {
          closeCommentPanel();
        }
        document.body.classList.remove('sv-sidebar-collapsed');
        sidebar.classList.toggle('open');
      }
    }

    // Version state
    var currentVersion = ${currentVersion};

    // Accordion toggle
    function toggleAccordion(headerEl) {
      var accordion = headerEl.closest('.sv-accordion');
      if (!accordion) return;
      accordion.classList.toggle('expanded');
    }

    // Diff toggle
    function toggleDiff() {
      var diff = document.getElementById('sv-diff-area');
      var content = document.getElementById('sv-content-area');
      var btn = document.querySelector('.sv-diff-toggle');
      if (!diff) return;
      var showing = diff.classList.contains('visible');
      diff.classList.toggle('visible');
      content.style.display = showing ? '' : 'none';
      btn.classList.toggle('active');
      btn.textContent = showing ? 'Show diff' : 'Hide diff';
    }

    // Copy content
    function decodeCopyText(value) {
      if (!value) return '';
      try { return decodeURIComponent(value); } catch { return value; }
    }

    function getFallbackCopyText(node) {
      if (!node) return '';
      var editableTarget = node.matches && node.matches('[data-editable-target="true"]')
        ? node
        : (node.querySelector ? node.querySelector('[data-editable-target="true"]') : null);
      if (editableTarget) {
        return decodeCopyText(editableTarget.getAttribute('data-sv-edit-source') || '') || editableTarget.innerText || editableTarget.textContent || '';
      }
      return (node.innerText || node.textContent || '').trim();
    }

    function collectCopyPayloads(node) {
      if (!node) return [];
      var primary = node.querySelector && node.querySelector('[data-sv-primary-copy="true"][data-sv-copy-text]');
      if (primary) {
        return [decodeCopyText(primary.getAttribute('data-sv-copy-text'))];
      }
      if (node.getAttribute && node.getAttribute('data-sv-copy-text')) {
        return [decodeCopyText(node.getAttribute('data-sv-copy-text'))];
      }
      if (!node.querySelectorAll) return [];
      var payloads = [];
      node.querySelectorAll('[data-sv-copy-text]').forEach(function(candidate) {
        var ancestor = candidate.parentElement && candidate.parentElement.closest('[data-sv-copy-text]');
        if (ancestor && ancestor !== node && node.contains(ancestor)) return;
        var text = decodeCopyText(candidate.getAttribute('data-sv-copy-text') || '').trim();
        if (!text) return;
        payloads.push(text);
      });
      return payloads;
    }

    function getCopyTextFromNode(node) {
      var payloads = collectCopyPayloads(node);
      if (payloads.length > 0) return payloads.join('\\n\\n');
      return getFallbackCopyText(node);
    }

    function flashCopiedState(btn, successText) {
      var originalHtml = btn.innerHTML;
      var originalText = btn.textContent;
      if (typeof successText === 'string') {
        btn.textContent = successText;
      } else {
        btn.innerHTML = '\u2713';
      }
      btn.classList.add('copied');
      setTimeout(function() {
        if (typeof successText === 'string') {
          btn.textContent = originalText || '';
        } else {
          btn.innerHTML = originalHtml;
        }
        btn.classList.remove('copied');
      }, 1500);
    }

    function fallbackCopyText(text) {
      try {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        var copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        return copied;
      } catch (err) {
        return false;
      }
    }

    function copyTextValue(text, btn, successText) {
      if (!text) return Promise.resolve(false);
      var normalized = String(text || '').replace(/\\r\\n?/g, '\\n').trim();
      var copyPromise = (navigator.clipboard && typeof navigator.clipboard.writeText === 'function')
        ? navigator.clipboard.writeText(normalized).then(function() { return true; }).catch(function() { return fallbackCopyText(normalized); })
        : Promise.resolve(fallbackCopyText(normalized));
      return copyPromise.then(function(copied) {
        if (copied && btn) {
          flashCopiedState(btn, successText);
        } else if (!copied) {
          showToast('Copy failed. Use Cmd/Ctrl+C.');
        }
        return copied;
      });
    }

    function copyPayload(btn, e) {
      if (e) e.stopPropagation();
      var text = decodeCopyText(btn && btn.getAttribute ? (btn.getAttribute('data-sv-copy-text') || '') : '');
      if (!text && btn) {
        text = getCopyTextFromNode(btn.closest('[data-sv-copy-text]'));
      }
      copyTextValue(text, btn, 'Copied');
    }

    function copyContent(btn) {
      var area = document.getElementById('sv-content-area');
      var activePanel = area.querySelector('.sv-variation-panel.active');
      var source = activePanel || area;
      var text = getCopyTextFromNode(source);
      copyTextValue(text, btn);
    }

    function copyBlock(btn, e) {
      if (e) e.stopPropagation();
      var block = btn && btn.closest ? btn.closest('.sv-block, .sv-variation-tab') : null;
      if (!block) return;
      var text = getCopyTextFromNode(block);
      copyTextValue(text, btn, 'Copied');
    }

    // Copy version content from accordion
    function copyVersionContent(btn, e) {
      e.stopPropagation();
      var accordion = btn.closest('.sv-accordion');
      if (!accordion) return;
      var inner = accordion.querySelector('.sv-accordion-content-inner');
      if (!inner) return;
      var text = getCopyTextFromNode(inner);
      copyTextValue((text || '').trim(), btn, '\u2713');
    }

    // Shared page state
    var feedbackEnabled = window.__svFeedbackEnabled === true;
    var storageNamespace = String(window.__svBasePath || location.pathname || '${escapeJsString(taskId)}') + '::${escapeJsString(taskId)}';
    var feedbackStorageKey = 'sv-feedback-' + storageNamespace;
    var reviewStorageKey = 'sv-review-' + storageNamespace;
    var legacyFeedbackStorageKey = 'sv-feedback-${taskId}';
    var legacyReviewStorageKey = 'sv-review-${taskId}';
    var notesStorageKey = 'sv-notes-${taskId}';
    var commentModeEnabled = ${commentMode ? 'true' : 'false'};
    var persistedFeedbackItems = ${JSON.stringify(feedbackItems)};
    var persistedReviewBundle = null;
    var feedbackItems;
    var reviewPersistenceMode = 'export';
    var reviewDirectoryHandle = null;
    var reviewChannel = null;
    var currentReviewUpdatedAt = null;
    var filesystemReviewSupported = typeof window.showDirectoryPicker === 'function'
      && typeof window.indexedDB !== 'undefined'
      && (window.isSecureContext || location.protocol === 'file:');

    function getItemTimestamp(item) {
      if (!item) return 0;
      return new Date(item.editedAt || item.createdAt || 0).getTime();
    }

    function shouldPreferItem(nextItem, existingItem) {
      if (!existingItem) return true;
      if (getItemTimestamp(nextItem) !== getItemTimestamp(existingItem)) {
        return getItemTimestamp(nextItem) >= getItemTimestamp(existingItem);
      }
      return String(nextItem.id || '') >= String(existingItem.id || '');
    }

    function mergeFeedbackItems(primaryItems, secondaryItems) {
      var byId = {};
      (primaryItems || []).forEach(function(item) {
        if (item && item.id && shouldPreferItem(item, byId[item.id])) byId[item.id] = item;
      });
      (secondaryItems || []).forEach(function(item) {
        if (item && item.id && shouldPreferItem(item, byId[item.id])) byId[item.id] = item;
      });
      return Object.keys(byId).map(function(id) { return byId[id]; }).sort(function(a, b) {
        return getItemTimestamp(a) - getItemTimestamp(b);
      });
    }

    function getCurrentPageTitle() {
      return ((document.getElementById('sv-page-title') || {}).textContent || '${escapeJsString(title)}').replace(/\\s+/g, ' ').trim() || '${escapeJsString(title)}';
    }

    function getCurrentNotesText() {
      var notesItem = null;
      for (var i = 0; i < feedbackItems.length; i++) {
        if (feedbackItems[i].type === 'general_notes') {
          if (!notesItem || shouldPreferItem(feedbackItems[i], notesItem)) {
            notesItem = feedbackItems[i];
          }
        }
      }
      return notesItem && notesItem.text ? notesItem.text : '';
    }

    function buildReviewBundle(syncState) {
      var updatedAt = new Date().toISOString();
      currentReviewUpdatedAt = updatedAt;
      return {
        reviewId: 'review-${taskId}',
        taskId: '${taskId}',
        title: getCurrentPageTitle(),
        basePath: window.__svBasePath || '',
        currentVersion: currentVersion,
        updatedAt: updatedAt,
        exportedAt: updatedAt,
        syncState: syncState || (reviewPersistenceMode === 'export' ? 'export_required' : reviewPersistenceMode),
        reviewSchemaVersion: 1,
        notes: getCurrentNotesText(),
        items: feedbackItems.slice(),
        sourceArtifacts: {
          href: location.href,
          pathname: location.pathname || '',
        },
      };
    }

    try {
      persistedReviewBundle = JSON.parse(localStorage.getItem(reviewStorageKey) || localStorage.getItem(legacyReviewStorageKey) || 'null');
      feedbackItems = mergeFeedbackItems(persistedFeedbackItems, (persistedReviewBundle && Array.isArray(persistedReviewBundle.items)) ? persistedReviewBundle.items : []);
      feedbackItems = mergeFeedbackItems(
        feedbackItems,
        JSON.parse(localStorage.getItem(feedbackStorageKey) || localStorage.getItem(legacyFeedbackStorageKey) || '[]')
      );
    } catch(e) {
      console.warn('Superview: corrupted feedback data, resetting.', e);
      feedbackItems = persistedFeedbackItems.slice();
      localStorage.removeItem(feedbackStorageKey);
      localStorage.removeItem(reviewStorageKey);
      localStorage.removeItem(legacyFeedbackStorageKey);
      localStorage.removeItem(legacyReviewStorageKey);
      persistedReviewBundle = null;
    }
    localStorage.setItem(feedbackStorageKey, JSON.stringify(feedbackItems));
    localStorage.setItem(reviewStorageKey, JSON.stringify(buildReviewBundle((persistedReviewBundle && persistedReviewBundle.syncState) || 'export_required')));
    localStorage.removeItem(legacyFeedbackStorageKey);
    localStorage.removeItem(legacyReviewStorageKey);

    function persistFeedback() {
      if (!feedbackEnabled) return;
      localStorage.setItem(feedbackStorageKey, JSON.stringify(feedbackItems));
      localStorage.setItem(reviewStorageKey, JSON.stringify(buildReviewBundle(reviewPersistenceMode === 'export' ? 'export_required' : reviewPersistenceMode)));
    }

    function upsertFeedbackItem(item) {
      var existingIdx = -1;
      for (var i = 0; i < feedbackItems.length; i++) {
        if (feedbackItems[i].id === item.id) {
          existingIdx = i;
          break;
        }
      }
      if (existingIdx >= 0) {
        feedbackItems[existingIdx] = item;
      } else {
        feedbackItems.push(item);
      }
      feedbackItems.sort(function(a, b) {
        return getItemTimestamp(a) - getItemTimestamp(b);
      });
      persistFeedback();
    }

    function saveFeedback(item) {
      upsertFeedbackItem(item);
      persistReviewBundle().then(function() {
        if (reviewPersistenceMode === 'served') tryServerSync(item);
      });
    }

    function showToast(msg) {
      var t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);background:var(--sv-text);color:var(--sv-bg);padding:0.5rem 1.25rem;border-radius:8px;font-size:0.85rem;z-index:9000;opacity:0;transition:opacity 0.2s;box-shadow:0 4px 12px rgba(0,0,0,0.2)';
      document.body.appendChild(t);
      requestAnimationFrame(function() { t.style.opacity = '1'; });
      setTimeout(function() { t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 200); }, 2000);
    }

    var defaultServerBase = 'http://localhost:3847';
    var serverAvailabilityPromise = null;
    var servedMode = window.__svServedMode === true;
    var allowServerProbe = location.protocol === 'file:' || servedMode;
    var serverBase = '';
    try {
      if (servedMode && location.protocol.indexOf('http') === 0) {
        localStorage.setItem('sv:lastServerBase', location.origin);
      } else if (location.protocol === 'file:') {
        serverBase = localStorage.getItem('sv:lastServerBase') || defaultServerBase;
      }
    } catch (err) {
      serverBase = location.protocol === 'file:' ? defaultServerBase : '';
    }

    function persistServerBase(base) {
      if (!base) return;
      try {
        localStorage.setItem('sv:lastServerBase', base);
      } catch (err) {}
    }

    function probeServerBase(base) {
      return fetch((base || '') + '/health', { cache: 'no-store' })
        .then(function(res) {
          if (!res.ok) return false;
          return res.json().then(function(data) {
            var isHealthy = Boolean(data && data.status === 'ok');
            if (isHealthy) {
              serverBase = base || '';
              if (base) persistServerBase(base);
            }
            return isHealthy;
          }).catch(function() { return false; });
        })
        .catch(function() { return false; });
    }

    function checkServerAvailability(forceRefresh) {
      if (!allowServerProbe) return Promise.resolve(false);
      if (forceRefresh) serverAvailabilityPromise = null;
      if (serverAvailabilityPromise) return serverAvailabilityPromise;
      var candidates = location.protocol.indexOf('http') === 0
        ? ['']
        : [serverBase, defaultServerBase].filter(function(base, index, list) {
            return Boolean(base) && list.indexOf(base) === index;
          });
      function tryCandidate(index) {
        if (index >= candidates.length) return Promise.resolve(false);
        return probeServerBase(candidates[index]).then(function(available) {
          if (available) return true;
          return tryCandidate(index + 1);
        });
      }
      serverAvailabilityPromise = tryCandidate(0);
      return serverAvailabilityPromise;
    }

    function getReviewHandleStorageKey() {
      return (window.__svBasePath || '${escapeJsString(taskId)}') + '::${escapeJsString(taskId)}';
    }

    function updateReviewStatus(message, className) {
      var status = document.getElementById('sv-review-status');
      if (!status) return;
      status.textContent = message || '';
      status.title = message || '';
      status.classList.remove('connected', 'unsynced');
      if (className) status.classList.add(className);
      var connectBtn = document.getElementById('sv-connect-folder-btn');
      if (!connectBtn) return;
      if (reviewPersistenceMode === 'filesystem') {
        connectBtn.textContent = 'Change folder';
      } else if (reviewPersistenceMode === 'served') {
        connectBtn.textContent = filesystemReviewSupported ? 'Connect folder' : 'Live sync';
      } else if (filesystemReviewSupported) {
        connectBtn.textContent = 'Connect folder';
      } else {
        connectBtn.textContent = 'Export only';
      }
      connectBtn.disabled = !filesystemReviewSupported && reviewPersistenceMode !== 'served';
    }

    function broadcastReviewUpdate(bundle) {
      if (!reviewChannel || !bundle) return;
      try {
        reviewChannel.postMessage({ type: 'review-updated', bundle: bundle });
      } catch (err) {}
    }

    function openReviewHandleDb() {
      return new Promise(function(resolve, reject) {
        if (!window.indexedDB) {
          reject(new Error('IndexedDB unavailable'));
          return;
        }
        var request = window.indexedDB.open('superview-review-handles', 1);
        request.onupgradeneeded = function() {
          if (!request.result.objectStoreNames.contains('handles')) {
            request.result.createObjectStore('handles');
          }
        };
        request.onsuccess = function() { resolve(request.result); };
        request.onerror = function() { reject(request.error || new Error('Failed to open review handle store')); };
      });
    }

    function saveStoredDirectoryHandle(key, handle) {
      return openReviewHandleDb().then(function(db) {
        return new Promise(function(resolve, reject) {
          var tx = db.transaction('handles', 'readwrite');
          tx.objectStore('handles').put(handle, key);
          tx.oncomplete = function() { resolve(handle); };
          tx.onerror = function() { reject(tx.error || new Error('Failed to store review folder')); };
        });
      });
    }

    function readStoredDirectoryHandle(key) {
      return openReviewHandleDb().then(function(db) {
        return new Promise(function(resolve, reject) {
          var tx = db.transaction('handles', 'readonly');
          var request = tx.objectStore('handles').get(key);
          request.onsuccess = function() { resolve(request.result || null); };
          request.onerror = function() { reject(request.error || new Error('Failed to read stored review folder')); };
        });
      }).catch(function() { return null; });
    }

    function ensureHandlePermission(handle, readWrite) {
      if (!handle || typeof handle.queryPermission !== 'function') return Promise.resolve(false);
      var options = { mode: readWrite ? 'readwrite' : 'read' };
      return handle.queryPermission(options).then(function(result) {
        if (result === 'granted') return true;
        if (typeof handle.requestPermission !== 'function') return false;
        return handle.requestPermission(options).then(function(nextResult) { return nextResult === 'granted'; }).catch(function() { return false; });
      }).catch(function() { return false; });
    }

    function getMaybeSuperviewChild(baseHandle, name) {
      return baseHandle.getDirectoryHandle(name).catch(function() { return null; });
    }

    function hasSuperviewShape(baseHandle) {
      return Promise.all([
        baseHandle.getFileHandle('history.jsonl').then(function() { return true; }).catch(function() { return false; }),
        getMaybeSuperviewChild(baseHandle, 'views').then(function(dir) { return Boolean(dir); }),
        getMaybeSuperviewChild(baseHandle, 'feedback').then(function(dir) { return Boolean(dir); }),
      ]).then(function(flags) {
        return flags.some(Boolean);
      }).catch(function() {
        return false;
      });
    }

    function resolveSuperviewDirectoryHandle(baseHandle) {
      return hasSuperviewShape(baseHandle).then(function(alreadySuperview) {
        if (alreadySuperview) return baseHandle;
        return baseHandle.getDirectoryHandle('.superview', { create: true });
      });
    }

    function readJsonFromDirectory(dirHandle, fileName) {
      return dirHandle.getFileHandle(fileName).then(function(fileHandle) {
        return fileHandle.getFile().then(function(file) {
          return file.text().then(function(text) { return JSON.parse(text); });
        });
      });
    }

    function writeJsonToDirectory(dirHandle, fileName, data) {
      return dirHandle.getFileHandle(fileName, { create: true }).then(function(fileHandle) {
        return fileHandle.createWritable().then(function(writable) {
          return writable.write(JSON.stringify(data, null, 2)).then(function() {
            return writable.close();
          });
        });
      });
    }

    function writeTextToDirectory(dirHandle, fileName, text) {
      return dirHandle.getFileHandle(fileName, { create: true }).then(function(fileHandle) {
        return fileHandle.createWritable().then(function(writable) {
          return writable.write(text).then(function() { return writable.close(); });
        });
      });
    }

    function loadReviewBundleFromDirectory(superviewHandle) {
      return superviewHandle.getDirectoryHandle('reviews').then(function(reviewsDir) {
        return readJsonFromDirectory(reviewsDir, '${escapeJsString(taskId)}.json');
      }).catch(function() {
        return superviewHandle.getDirectoryHandle('feedback').then(function(feedbackDir) {
          return readJsonFromDirectory(feedbackDir, '${escapeJsString(taskId)}.json').then(function(file) {
            return {
              reviewId: 'review-${taskId}',
              taskId: '${taskId}',
              title: getCurrentPageTitle(),
              basePath: window.__svBasePath || '',
              currentVersion: currentVersion,
              updatedAt: (file && file.exportedAt) || new Date().toISOString(),
              syncState: 'filesystem',
              notes: '',
              items: (file && Array.isArray(file.items)) ? file.items : [],
              sourceArtifacts: {
                href: location.href,
                pathname: location.pathname || '',
              },
            };
          });
        }).catch(function() { return null; });
      });
    }

    function writeFilesystemReviewBundle(bundle, options) {
      if (!reviewDirectoryHandle || !bundle) return Promise.resolve(bundle);
      var nextBundle = Object.assign({}, bundle, {
        syncState: 'filesystem',
      });
      return resolveSuperviewDirectoryHandle(reviewDirectoryHandle).then(function(superviewHandle) {
        return Promise.all([
          superviewHandle.getDirectoryHandle('reviews', { create: true }).then(function(reviewsDir) {
            return writeJsonToDirectory(reviewsDir, '${escapeJsString(taskId)}.json', nextBundle);
          }),
          superviewHandle.getDirectoryHandle('feedback', { create: true }).then(function(feedbackDir) {
            return writeJsonToDirectory(feedbackDir, '${escapeJsString(taskId)}.json', {
              taskId: nextBundle.taskId,
              items: nextBundle.items,
              exportedAt: nextBundle.updatedAt,
            });
          }),
        ]).then(function() {
          if (options && options.renameTitle) {
            return superviewHandle.getFileHandle('history.jsonl').then(function(fileHandle) {
              return fileHandle.getFile().then(function(file) {
                return file.text().then(function(raw) {
                  var changed = false;
                  var rewritten = raw.split('\\n').map(function(line) {
                    var trimmed = line.trim();
                    if (!trimmed) return line;
                    try {
                      var parsed = JSON.parse(trimmed);
                      if (parsed.taskId !== '${taskId}') return line;
                      parsed.title = options.renameTitle;
                      changed = true;
                      return JSON.stringify(parsed);
                    } catch (err) {
                      return line;
                    }
                  }).join('\\n');
                  if (!changed) return null;
                  return writeTextToDirectory(superviewHandle, 'history.jsonl', rewritten);
                });
              });
            }).catch(function() { return null; });
          }
          return null;
        }).then(function() { return nextBundle; });
      });
    }

    function persistReviewBundle(options) {
      if (!feedbackEnabled) return Promise.resolve(null);
      var bundle = buildReviewBundle(reviewPersistenceMode === 'export' ? 'export_required' : reviewPersistenceMode);
      currentReviewUpdatedAt = bundle.updatedAt || currentReviewUpdatedAt;
      localStorage.setItem(reviewStorageKey, JSON.stringify(bundle));
      if (reviewPersistenceMode === 'filesystem' && reviewDirectoryHandle) {
        return writeFilesystemReviewBundle(bundle, options || {}).then(function(savedBundle) {
          currentReviewUpdatedAt = savedBundle.updatedAt || currentReviewUpdatedAt;
          localStorage.setItem(reviewStorageKey, JSON.stringify(savedBundle));
          updateReviewStatus('Saved to folder', 'connected');
          broadcastReviewUpdate(savedBundle);
          return savedBundle;
        }).catch(function(err) {
          console.warn('[superview] filesystem review save failed:', err);
          updateReviewStatus('Review saved in this browser. Export to share.', 'unsynced');
          return bundle;
        });
      }
      if (reviewPersistenceMode === 'served') {
        updateReviewStatus('Live sync active', 'connected');
      } else {
        updateReviewStatus('Review saved in this browser. Export to share.', 'unsynced');
      }
      broadcastReviewUpdate(bundle);
      return Promise.resolve(bundle);
    }

    function applyReviewBundle(bundle, options) {
      if (!bundle) return;
      currentReviewUpdatedAt = bundle.updatedAt || currentReviewUpdatedAt;
      feedbackItems = mergeFeedbackItems(feedbackItems, Array.isArray(bundle.items) ? bundle.items : []);
      persistFeedback();
      if (bundle.title && bundle.title !== getCurrentPageTitle()) {
        applyTaskRename('${taskId}', bundle.basePath || window.__svBasePath || '', bundle.title);
      }
      var notesTextarea = document.getElementById('sv-notes-textarea');
      if (notesTextarea && typeof bundle.notes === 'string') {
        notesTextarea.value = bundle.notes;
      }
      renderCommentList();
      renderEditList();
      updateBlockHighlights();
      applySavedEdits();
      if (activeInlineReview) {
        renderInlineReviewCard();
        positionInlineReviewCard();
      }
      if (!(options && options.silent)) {
        updateReviewStatus(reviewPersistenceMode === 'filesystem' ? 'Folder connected' : 'Review loaded', reviewPersistenceMode === 'filesystem' ? 'connected' : '');
      }
    }

    function handleReviewBroadcast(event) {
      if (!event || !event.data || event.data.type !== 'review-updated' || !event.data.bundle) return;
      var bundle = event.data.bundle;
      if (bundle.taskId !== '${taskId}') return;
      if (currentReviewUpdatedAt && bundle.updatedAt && new Date(bundle.updatedAt).getTime() < new Date(currentReviewUpdatedAt).getTime()) {
        return;
      }
      currentReviewUpdatedAt = bundle.updatedAt || currentReviewUpdatedAt;
      applyReviewBundle(bundle, { silent: true });
    }

    function initializeReviewChannel() {
      if (typeof window.BroadcastChannel !== 'function') return;
      try {
        reviewChannel = new BroadcastChannel('superview-review-${taskId}');
        reviewChannel.addEventListener('message', handleReviewBroadcast);
      } catch (err) {
        reviewChannel = null;
      }
    }

    function connectReviewFolder() {
      if (!filesystemReviewSupported) {
        showToast('Folder access is unavailable here. Use Export review.');
        return Promise.resolve(null);
      }
      return window.showDirectoryPicker({ mode: 'readwrite' }).then(function(handle) {
        return ensureHandlePermission(handle, true).then(function(granted) {
          if (!granted) throw new Error('Folder permission denied');
          reviewDirectoryHandle = handle;
          reviewPersistenceMode = 'filesystem';
          updateReviewStatus('Folder connected', 'connected');
          return saveStoredDirectoryHandle(getReviewHandleStorageKey(), handle).catch(function() { return handle; }).then(function() {
            return resolveSuperviewDirectoryHandle(handle).then(function(superviewHandle) {
              return loadReviewBundleFromDirectory(superviewHandle).then(function(bundle) {
                if (bundle) applyReviewBundle(bundle, { silent: true });
                return persistReviewBundle();
              });
            });
          });
        });
      }).catch(function(err) {
        if (err && err.name === 'AbortError') return null;
        showToast(err && err.message ? err.message : 'Failed to connect folder');
        return null;
      });
    }

    function restoreReviewFolder() {
      if (!filesystemReviewSupported) return Promise.resolve(false);
      return readStoredDirectoryHandle(getReviewHandleStorageKey()).then(function(handle) {
        if (!handle) return false;
        return ensureHandlePermission(handle, true).then(function(granted) {
          if (!granted) return false;
          reviewDirectoryHandle = handle;
          reviewPersistenceMode = 'filesystem';
          return resolveSuperviewDirectoryHandle(handle).then(function(superviewHandle) {
            return loadReviewBundleFromDirectory(superviewHandle).then(function(bundle) {
              if (bundle) {
                currentReviewUpdatedAt = bundle.updatedAt || currentReviewUpdatedAt;
                applyReviewBundle(bundle, { silent: true });
              }
              updateReviewStatus('Folder connected', 'connected');
              return true;
            });
          });
        });
      }).catch(function() { return false; });
    }

    function importReviewBundle() {
      var input = document.getElementById('sv-import-review-input');
      if (!input) return;
      input.value = '';
      input.click();
    }

    function handleImportedReviewFile(event) {
      var input = event && event.target;
      var file = input && input.files && input.files[0];
      if (!file) return;
      file.text().then(function(text) {
        var bundle = JSON.parse(text);
        if (!bundle || !Array.isArray(bundle.items)) throw new Error('Invalid review bundle');
        if (bundle.taskId && bundle.taskId !== '${taskId}') {
          throw new Error('This review belongs to a different task');
        }
        if (bundle.title && bundle.title !== getCurrentPageTitle()) {
          applyTaskRename('${taskId}', bundle.basePath || window.__svBasePath || '', bundle.title);
        }
        applyReviewBundle(bundle, { silent: true });
        return persistReviewBundle();
      }).then(function() {
        showToast('Review imported');
      }).catch(function(err) {
        showToast(err && err.message ? err.message : 'Import failed');
      });
    }

    function initializeReviewPersistence() {
      initializeReviewChannel();
      if (persistedReviewBundle) {
        applyReviewBundle(persistedReviewBundle, { silent: true });
      }
      return restoreReviewFolder().then(function(restored) {
        if (restored) return true;
        return checkServerAvailability().then(function(available) {
          reviewPersistenceMode = available ? 'served' : 'export';
          if (reviewPersistenceMode === 'served') {
            updateReviewStatus('Live sync active', 'connected');
          } else if (filesystemReviewSupported) {
            updateReviewStatus('Connect a folder, or export review and run superview import-review.', 'unsynced');
          } else {
            updateReviewStatus('Review stays in this browser until you export it and run superview import-review.', 'unsynced');
          }
          return available;
        });
      });
    }

    function tryServerSync(item) {
      if (reviewPersistenceMode !== 'served') return Promise.resolve();
      checkServerAvailability().then(function(available) {
        if (!available) return;
        return fetch(serverBase + '/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: '${taskId}', item: item, basePath: window.__svBasePath || '' })
        });
      }).catch(function() {
        checkServerAvailability(true);
      });
    }

    function tryServerDelete(itemId) {
      if (reviewPersistenceMode !== 'served') return Promise.resolve();
      checkServerAvailability().then(function(available) {
        if (!available) return;
        return fetch(serverBase + '/feedback/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: '${taskId}', itemId: itemId, basePath: window.__svBasePath || '' })
        });
      }).catch(function() {
        checkServerAvailability(true);
      });
    }

    function renameHistoryPayloadEntries(payload, taskId, basePath, newTitle) {
      if (!payload) return;
      ['localHistory', 'workspaceHistory'].forEach(function(key) {
        var entries = payload[key];
        if (!Array.isArray(entries)) return;
        entries.forEach(function(entry) {
          if (!entry || entry.taskId !== taskId) return;
          if (basePath && entry.basePath && entry.basePath !== basePath) return;
          entry.title = newTitle;
        });
      });
    }

    function applyTaskRename(taskId, basePath, newTitle) {
      var normalizedBasePath = basePath || window.__svBasePath || '';
      renameHistoryPayloadEntries(window.__svHistoryData, taskId, normalizedBasePath, newTitle);
      renameHistoryPayloadEntries(window.__svEmbeddedHistoryData, taskId, normalizedBasePath, newTitle);
      [window.__svHistory, window.__svLatestHistory, window.__svEmbeddedHistory].forEach(function(entries) {
        if (!Array.isArray(entries)) return;
        entries.forEach(function(entry) {
          if (!entry || entry.taskId !== taskId) return;
          if (normalizedBasePath && entry.basePath && entry.basePath !== normalizedBasePath) return;
          entry.title = newTitle;
        });
      });

      if (taskId === (window.__svTaskId || '') && normalizedBasePath === (window.__svBasePath || normalizedBasePath)) {
        var pageTitle = document.getElementById('sv-page-title');
        if (pageTitle) pageTitle.textContent = newTitle;
        document.title = newTitle + ' | Superview';
      }

      rerenderSidebar();
    }

    function persistTaskRename(taskId, basePath, newTitle) {
      if (reviewPersistenceMode !== 'served') {
        return persistReviewBundle({ renameTitle: newTitle }).then(function() {
          return { ok: true };
        });
      }
      return checkServerAvailability().then(function(available) {
        if (!available) throw new Error('Rename requires the Superview server');
        return fetch(serverBase + '/rename-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: taskId,
            title: newTitle,
            basePath: basePath || window.__svBasePath || ''
          })
        });
      }).then(function(res) {
        if (!res || !res.ok) {
          return Promise.resolve(res && res.json ? res.json().catch(function() { return {}; }) : {}).then(function(data) {
            throw new Error(data && data.error ? data.error : 'Rename failed');
          });
        }
        return res.json();
      });
    }

    function startTaskRename(titleEl, taskId, basePath) {
      if (!titleEl || !taskId) return;
      if (titleEl.querySelector('input')) return;
      var currentName = (titleEl.textContent || '').trim();
      if (!currentName) return;

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'sv-inline-rename-input';
      input.value = currentName;
      input.style.width = Math.max(titleEl.offsetWidth || 0, 220) + 'px';

      titleEl.textContent = '';
      titleEl.appendChild(input);
      input.focus();
      input.select();

      var finished = false;
      function finish(save) {
        if (finished) return;
        finished = true;
        var nextName = save ? (input.value || '').trim() : currentName;
        titleEl.textContent = nextName || currentName;
        if (!save || !nextName || nextName === currentName) return;
        persistTaskRename(taskId, basePath, nextName).then(function() {
          var renameItem = {
            type: 'tab_rename',
            id: 'rename-' + Date.now(),
            blockId: 'general',
            version: currentVersion,
            text: nextName,
            createdAt: new Date().toISOString(),
            resolved: false,
          };
          upsertFeedbackItem(renameItem);
          return persistReviewBundle().then(function() {
            if (reviewPersistenceMode === 'served') {
              tryServerSync(renameItem);
            }
            applyTaskRename(taskId, basePath, nextName);
            showToast('Renamed');
          });
        }).catch(function(err) {
          titleEl.textContent = currentName;
          showToast(err && err.message ? err.message : 'Rename failed');
        });
      }

      input.addEventListener('blur', function() { finish(true); });
      input.addEventListener('click', function(ev) { ev.stopPropagation(); });
      input.addEventListener('dblclick', function(ev) { ev.stopPropagation(); });
      input.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          finish(true);
        }
        if (ev.key === 'Escape') {
          ev.preventDefault();
          finish(false);
        }
      });
    }

    function exportFeedback() {
      var data = buildReviewBundle(reviewPersistenceMode === 'export' ? 'exported' : reviewPersistenceMode);
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'review-${taskId}.json';
      a.click();
    }

    // Review state
    var commentPanel = document.getElementById('sv-comment-panel');
    var commentList = document.getElementById('sv-comment-list');
    var commentCount = document.getElementById('sv-comment-count');
    var inlineReviewCard = document.getElementById('sv-inline-review-card');
    var inlineReviewTextarea = document.getElementById('sv-inline-review-textarea');
    var inlineReviewThread = document.getElementById('sv-inline-review-thread');
    var inlineReviewLabel = document.getElementById('sv-inline-review-label');
    var inlineReviewEyebrow = document.getElementById('sv-inline-review-eyebrow');
    var inlineReviewQuote = document.getElementById('sv-inline-review-quote');
    var inlineReviewSubmit = document.getElementById('sv-inline-review-submit');
    var reviewCommentHint = document.getElementById('sv-review-comment-hint');
    var editList = document.getElementById('sv-edit-list');
    var reviewPanelTab = 'comments';
    var activeInlineReview = null;
    var activeEditedCommentId = null;
    var showResolved = false;

    function getVersionComments() {
      return feedbackItems.filter(function(item) {
        return (item.type === 'block_comment' || item.type === 'text_selection') && item.version === currentVersion;
      });
    }

    function getVersionEdits() {
      return feedbackItems.filter(function(item) {
        return (item.type === 'content_edit' || item.type === 'tab_rename') && item.version === currentVersion;
      }).sort(function(a, b) {
        return getItemTimestamp(b) - getItemTimestamp(a);
      });
    }

    function getBlockElement(blockId) {
      if (!blockId) return null;
      var block = document.querySelector('.sv-block[data-block-id="' + blockId + '"]');
      if (block) return block;
      var tab = document.querySelector('.sv-variation-tab[data-block-id="' + blockId + '"]');
      if (tab) return tab;
      return null;
    }

    function getEditableTarget(block) {
      if (!block) return null;
      return block.querySelector('[data-editable-target="true"]');
    }

    function getEditableSourceText(target) {
      if (!target) return '';
      return decodeCopyText(target.getAttribute('data-sv-edit-source') || '') || target.textContent || '';
    }

    function setEditableSourceText(target, text) {
      if (!target) return;
      target.setAttribute('data-sv-edit-source', encodeURIComponent(text || ''));
    }

    function renderMarkdownClient(text) {
      var html = escapeHtmlInline(text || '');
      html = html.replace(/\\\`([^\\\`]+)\\\`/g, '<code style="background:var(--sv-border);padding:0.1rem 0.35rem;border-radius:3px;font-size:0.85em">$1</code>');
      html = html.replace(/\\!\\[([^\\]]*)\\]\\(([^)]+)\\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px;margin:0.5rem 0">');
      html = html.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
      html = html.replace(/\\n/g, '<br>');
      return html;
    }

    function renderEditableTargetContent(target, text) {
      if (!target) return;
      var format = target.getAttribute('data-sv-edit-format') || 'markdown';
      var nextText = text || '';
      setEditableSourceText(target, nextText);
      target.innerHTML = format === 'plain'
        ? escapeHtmlInline(nextText).replace(/\\n/g, '<br>')
        : renderMarkdownClient(nextText);
    }

    function canEditBlock(block) {
      if (!block) return false;
      if (block.closest('.sv-accordion-content')) return false;
      if (block.closest('.sv-variation-panel') && block.closest('.sv-variation-panels')) return false;
      return Boolean(getEditableTarget(block));
    }

    function applySavedEdits() {
      var latestEditsByBlock = {};
      feedbackItems.forEach(function(item) {
        if (item.type !== 'content_edit' || item.version !== currentVersion) return;
        var existing = latestEditsByBlock[item.blockId];
        if (!existing || new Date(item.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
          latestEditsByBlock[item.blockId] = item;
        }
      });
      Object.keys(latestEditsByBlock).forEach(function(blockId) {
        var block = document.querySelector('.sv-block[data-block-id="' + blockId + '"]');
        if (!block || block.closest('.sv-accordion-content')) return;
        var editableTarget = getEditableTarget(block);
        if (!editableTarget) return;
        renderEditableTargetContent(editableTarget, latestEditsByBlock[blockId].text || '');
      });
    }

    function getCleanBlockLabel(blockId) {
      if (!blockId || blockId === 'general') return 'General note';
      if (blockId.indexOf('variation-tab-') !== -1) {
        var variationTab = getBlockElement(blockId);
        return variationTab ? ('Variation: ' + (variationTab.textContent || '').trim()) : 'Variation tab';
      }
      var blockEl = getBlockElement(blockId);
      if (!blockEl) return blockId;
      var contentEl = getEditableTarget(blockEl) || blockEl;
      var text = (contentEl.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!text) return blockId;
      return text.length > 60 ? text.slice(0, 60) + '...' : text;
    }

    function getBlockNumber(blockId) {
      if (!blockId) return '';
      var match = blockId.match(/block-(\d+)$/);
      if (!match) return '';
      return String(parseInt(match[1], 10) + 1);
    }

    function activateBlockContext(target) {
      if (!target) return;
      if (target.classList && target.classList.contains('sv-variation-tab')) {
        target.click();
      }
      var accordion = target.closest('.sv-accordion');
      if (accordion) accordion.classList.add('expanded');
      var panel = target.closest('.sv-variation-panel');
      if (panel) {
        var panels = Array.prototype.slice.call(panel.parentNode.querySelectorAll('.sv-variation-panel'));
        var panelIndex = panels.indexOf(panel);
        var tabBar = panel.parentNode.previousElementSibling;
        if (tabBar) {
          var tabs = tabBar.querySelectorAll('.sv-variation-tab');
          tabs.forEach(function(tab, idx) {
            tab.classList.toggle('active', idx === panelIndex);
          });
        }
        panels.forEach(function(entry, idx) {
          entry.classList.toggle('active', idx === panelIndex);
        });
      }
    }

    function clearActiveAnchorState() {
      document.querySelectorAll('.sv-inline-review-anchor-active').forEach(function(node) {
        node.classList.remove('sv-inline-review-anchor-active');
      });
    }

    function focusAnchorBlock(blockId) {
      var block = getBlockElement(blockId);
      if (!block) return null;
      activateBlockContext(block);
      clearActiveAnchorState();
      block.classList.add('sv-inline-review-anchor-active');
      return block;
    }

    function positionInlineReviewCard() {
      if (!inlineReviewCard || inlineReviewCard.hidden || !activeInlineReview) return;
      var block = getBlockElement(activeInlineReview.blockId);
      if (!block) return;
      var rect = block.getBoundingClientRect();
      var scrollY = window.scrollY || window.pageYOffset || 0;
      var scrollX = window.scrollX || window.pageXOffset || 0;
      var cardWidth = Math.min(360, window.innerWidth - 32);
      var top = rect.top + scrollY - 8;
      var left = rect.right + scrollX + 20;
      if (left + cardWidth > scrollX + window.innerWidth - 16) {
        left = Math.max(scrollX + 16, rect.left + scrollX);
        top = rect.bottom + scrollY + 12;
      }
      inlineReviewCard.style.width = cardWidth + 'px';
      inlineReviewCard.style.left = left + 'px';
      inlineReviewCard.style.top = top + 'px';
    }

    function getAnchorThreadItems(blockId) {
      return getVersionComments().filter(function(item) {
        return item.blockId === blockId;
      }).sort(function(a, b) {
        return getItemTimestamp(a) - getItemTimestamp(b);
      });
    }

    function openInlineReviewCard(blockId, anchor, options) {
      if (!feedbackEnabled || !inlineReviewCard) return;
      var block = focusAnchorBlock(blockId);
      if (!block) return;
      if (window.innerWidth <= 767 && commentPanel && commentPanel.classList.contains('open')) {
        closeCommentPanel();
      }
      activeEditedCommentId = options && options.editCommentId ? options.editCommentId : null;
      activeInlineReview = {
        blockId: blockId,
        anchor: anchor || null,
      };
      renderInlineReviewCard();
      inlineReviewCard.hidden = false;
      positionInlineReviewCard();
      if (options && options.scroll !== false) {
        block.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (inlineReviewTextarea) {
        setTimeout(function() { inlineReviewTextarea.focus(); }, 40);
      }
    }

    function closeInlineReviewCard() {
      activeInlineReview = null;
      activeEditedCommentId = null;
      if (inlineReviewCard) inlineReviewCard.hidden = true;
      clearActiveAnchorState();
      if (inlineReviewTextarea) inlineReviewTextarea.value = '';
    }

    function renderInlineReviewCard() {
      if (!inlineReviewCard || !activeInlineReview) return;
      var blockId = activeInlineReview.blockId;
      var threadItems = getAnchorThreadItems(blockId);
      if (inlineReviewEyebrow) {
        inlineReviewEyebrow.textContent = activeEditedCommentId ? 'Edit comment' : 'Inline comment';
      }
      if (inlineReviewLabel) {
        inlineReviewLabel.textContent = getCleanBlockLabel(blockId);
      }
      if (inlineReviewQuote) {
        if (activeInlineReview.anchor && activeInlineReview.anchor.selectedText) {
          inlineReviewQuote.hidden = false;
          inlineReviewQuote.textContent = '"' + activeInlineReview.anchor.selectedText + '"';
        } else {
          inlineReviewQuote.hidden = true;
          inlineReviewQuote.textContent = '';
        }
      }
      if (inlineReviewThread) {
        inlineReviewThread.innerHTML = threadItems.map(function(item) {
          var meta = getTimeAgo(item.createdAt);
          var resolveLabel = item.resolved ? 'Reopen' : 'Resolve';
          var quote = item.type === 'text_selection' && item.anchor && item.anchor.selectedText
            ? '<div class="sv-comment-item-quote">"' + escapeHtmlInline(item.anchor.selectedText) + '"</div>'
            : '';
          return '<div class="sv-inline-review-thread-item' + (item.resolved ? ' resolved' : '') + '">'
            + quote
            + '<div class="sv-inline-review-thread-item-text">' + escapeHtmlInline(item.text || '') + '</div>'
            + '<div class="sv-inline-review-thread-item-meta"><span>' + meta + '</span><span style="display:flex;gap:0.25rem">'
            + "<button class=\\"sv-comment-resolve-btn\\" onclick=\\"editComment(event, '" + item.id + "')\\">Edit</button>"
            + "<button class=\\"sv-comment-resolve-btn\\" onclick=\\"toggleCommentResolved(event, '" + item.id + "')\\">" + resolveLabel + "</button>"
            + "<button class=\\"sv-comment-resolve-btn sv-comment-delete-btn\\" onclick=\\"deleteComment(event, '" + item.id + "')\\">Delete</button>"
            + '</span></div>'
            + '</div>';
        }).join('');
      }
      if (inlineReviewTextarea) {
        if (activeEditedCommentId) {
          var existing = feedbackItems.find(function(item) { return item.id === activeEditedCommentId; });
          inlineReviewTextarea.value = existing ? (existing.text || '') : '';
        } else {
          inlineReviewTextarea.value = '';
        }
      }
      if (inlineReviewSubmit) {
        inlineReviewSubmit.textContent = activeEditedCommentId ? 'Save changes' : 'Save comment';
      }
    }

    function openCommentPanel() {
      if (!feedbackEnabled || !commentPanel) return;
      var sidebar = document.querySelector('.sv-sidebar');
      if (sidebar && window.innerWidth <= 1199) {
        sidebar.classList.remove('open');
      }
      commentPanel.classList.add('open');
      document.body.classList.add('sv-comment-panel-open');
      renderCommentList();
      renderEditList();
    }

    function closeCommentPanel() {
      if (!commentPanel) return;
      commentPanel.classList.remove('open');
      document.body.classList.remove('sv-comment-panel-open');
    }

    function switchReviewPanelTab(nextTab) {
      reviewPanelTab = nextTab || 'comments';
      ['comments', 'notes', 'edits'].forEach(function(tab) {
        var btn = document.getElementById('sv-review-tab-' + tab);
        var section = document.getElementById('sv-review-section-' + tab);
        if (btn) btn.classList.toggle('active', tab === reviewPanelTab);
        if (section) section.classList.toggle('active', tab === reviewPanelTab);
      });
      if (reviewPanelTab === 'comments') renderCommentList();
      if (reviewPanelTab === 'edits') renderEditList();
    }

    function toggleResolvedVisibility() {
      var resolvedToggle = document.getElementById('sv-show-resolved');
      showResolved = Boolean(resolvedToggle && resolvedToggle.checked);
      renderCommentList();
    }

    function renderCommentList() {
      if (!feedbackEnabled || !commentList || !commentCount) return;
      var comments = getVersionComments();
      var unresolvedCount = comments.filter(function(c) { return !c.resolved; }).length;
      commentCount.textContent = 'Review · ' + unresolvedCount + ' open';
      var pill = document.getElementById('sv-feedback-pill');
      if (pill) {
        pill.textContent = unresolvedCount > 0 ? 'Review (' + unresolvedCount + ')' : 'Review';
      }
      if (reviewCommentHint) {
        reviewCommentHint.style.display = comments.length === 0 ? '' : 'none';
      }

      var visible = showResolved ? comments : comments.filter(function(c) { return !c.resolved; });
      if (visible.length === 0) {
        commentList.innerHTML = '<div class="sv-review-empty-state">No comments yet.</div>';
        return;
      }
      commentList.innerHTML = visible.map(function(c) {
        var resolvedClass = c.resolved ? ' resolved' : '';
        var quoteHtml = '';
        if (c.anchor && c.anchor.selectedText) {
          var truncated = c.anchor.selectedText.length > 100 ? c.anchor.selectedText.slice(0, 100) + '...' : c.anchor.selectedText;
          quoteHtml = '<div class="sv-comment-item-quote">"' + escapeHtmlInline(truncated) + '"</div>';
        }
        var blockLabel = getCleanBlockLabel(c.blockId);
        var blockNumber = getBlockNumber(c.blockId);
        var labelHtml = '<div class="sv-comment-item-block">' + (blockNumber ? '<span class="sv-comment-block-num">' + blockNumber + '</span> ' : '') + escapeHtmlInline(blockLabel) + '</div>';
        var timeAgo = getTimeAgo(c.createdAt);
        var resolveBtn = c.resolved
          ? "<button class=\\"sv-comment-resolve-btn\\" onclick=\\"toggleCommentResolved(event, '" + c.id + "')\\">Reopen</button>"
          : "<button class=\\"sv-comment-resolve-btn\\" onclick=\\"toggleCommentResolved(event, '" + c.id + "')\\">Resolve</button>";
        var editBtn = "<button class=\\"sv-comment-resolve-btn\\" onclick=\\"editComment(event, '" + c.id + "')\\">Edit</button>";
        var deleteBtn = "<button class=\\"sv-comment-resolve-btn sv-comment-delete-btn\\" onclick=\\"deleteComment(event, '" + c.id + "')\\">Delete</button>";
        return "<div class=\\"sv-comment-item" + resolvedClass + "\\" data-comment-id=\\"" + c.id + "\\" onclick=\\"scrollToCommentBlock('" + c.blockId + "', '" + c.id + "')\\">"
          + labelHtml
          + quoteHtml
          + '<div class="sv-comment-item-text">' + escapeHtmlInline(c.text || '') + '</div>'
          + '<div class="sv-comment-item-meta"><span>' + timeAgo + '</span><span style="display:flex;gap:0.25rem">' + editBtn + resolveBtn + deleteBtn + '</span></div>'
          + '</div>';
      }).join('');
    }

    function renderEditList() {
      if (!editList) return;
      var items = getVersionEdits();
      if (items.length === 0) {
        editList.innerHTML = '<div class="sv-review-empty-state">No edit or rename history for this version yet.</div>';
        return;
      }
      editList.innerHTML = items.map(function(item) {
        var label = item.type === 'tab_rename' ? 'Title rename' : getCleanBlockLabel(item.blockId);
        var body = item.type === 'tab_rename'
          ? 'Renamed to: ' + (item.text || '')
          : (item.text || '');
        return '<div class="sv-edit-item">'
          + '<div class="sv-edit-item-label">' + escapeHtmlInline(label) + '</div>'
          + '<div class="sv-edit-item-text">' + escapeHtmlInline(body) + '</div>'
          + '<div class="sv-edit-item-meta">' + getTimeAgo(item.createdAt) + '</div>'
          + '</div>';
      }).join('');
    }

    function escapeHtmlInline(s) {
      var d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    function getTimeAgo(iso) {
      var diff = Date.now() - new Date(iso).getTime();
      var mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return mins + ' min ago';
      var hrs = Math.floor(mins / 60);
      if (hrs < 24) return hrs + 'h ago';
      return Math.floor(hrs / 24) + 'd ago';
    }

    function submitInlineReviewComment() {
      if (!feedbackEnabled || !inlineReviewTextarea || !activeInlineReview) return;
      var text = inlineReviewTextarea.value.replace(/\\r\\n?/g, '\\n').trim();
      if (!text) return;

      if (activeEditedCommentId) {
        var editedItem = null;
        for (var i = 0; i < feedbackItems.length; i++) {
          if (feedbackItems[i].id === activeEditedCommentId) {
            feedbackItems[i].text = text;
            feedbackItems[i].editedAt = new Date().toISOString();
            editedItem = feedbackItems[i];
            break;
          }
        }
        persistFeedback();
        persistReviewBundle().then(function() {
          if (editedItem && reviewPersistenceMode === 'served') tryServerSync(editedItem);
          activeEditedCommentId = null;
          renderInlineReviewCard();
          renderCommentList();
          updateBlockHighlights();
          showToast('Comment updated');
        });
        return;
      }

      var item = {
        type: activeInlineReview.anchor ? 'text_selection' : 'block_comment',
        id: 'fb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        blockId: activeInlineReview.blockId || 'general',
        version: currentVersion,
        text: text,
        createdAt: new Date().toISOString(),
        resolved: false
      };
      if (activeInlineReview.anchor) {
        item.anchor = activeInlineReview.anchor;
      }
      saveFeedback(item);
      inlineReviewTextarea.value = '';
      renderInlineReviewCard();
      renderCommentList();
      updateBlockHighlights();
      showToast(reviewPersistenceMode === 'served' || reviewPersistenceMode === 'filesystem' ? 'Comment saved' : 'Saved in this browser');
    }

    function toggleCommentResolved(e, id) {
      e.stopPropagation();
      var updatedItem = null;
      for (var i = 0; i < feedbackItems.length; i++) {
        if (feedbackItems[i].id === id) {
          feedbackItems[i].resolved = !feedbackItems[i].resolved;
          feedbackItems[i].editedAt = new Date().toISOString();
          updatedItem = feedbackItems[i];
          break;
        }
      }
      persistFeedback();
      persistReviewBundle().then(function() {
        if (updatedItem && reviewPersistenceMode === 'served') tryServerSync(updatedItem);
      });
      renderInlineReviewCard();
      renderCommentList();
      updateBlockHighlights();
    }

    function resolveComment(e, id) {
      toggleCommentResolved(e, id);
    }

    function editComment(e, id) {
      e.stopPropagation();
      var item = null;
      for (var i = 0; i < feedbackItems.length; i++) {
        if (feedbackItems[i].id === id) { item = feedbackItems[i]; break; }
      }
      if (!item) return;
      openInlineReviewCard(item.blockId, item.anchor || null, { editCommentId: id, scroll: false });
    }

    function deleteComment(e, id) {
      if (!confirm('Delete this comment?')) return;
      e.stopPropagation();
      feedbackItems = feedbackItems.filter(function(f) { return f.id !== id; });
      persistFeedback();
      persistReviewBundle().then(function() {
        if (reviewPersistenceMode === 'served') tryServerDelete(id);
      });
      if (activeEditedCommentId === id) {
        activeEditedCommentId = null;
      }
      renderInlineReviewCard();
      renderCommentList();
      updateBlockHighlights();
    }

    function scrollToCommentBlock(blockId, commentId) {
      var block = getBlockElement(blockId);
      if (block) {
        focusAnchorBlock(blockId);
        block.scrollIntoView({ behavior: 'smooth', block: 'center' });
        block.style.background = 'rgba(212, 152, 40, 0.12)';
        block.style.outline = '2px solid var(--sv-gold)';
        block.style.borderRadius = '6px';
        openInlineReviewCard(blockId, null, commentId ? { editCommentId: null, scroll: false } : { scroll: false });
        setTimeout(function() {
          block.style.background = '';
          block.style.outline = '';
          block.style.borderRadius = '';
          positionInlineReviewCard();
        }, 2000);
      }
    }

    function clearPersistentHighlights() {
      document.querySelectorAll('.sv-persistent-highlight').forEach(function(mark) {
        var parent = mark.parentNode;
        if (!parent) return;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize();
      });
    }

    function findTextRange(root, startOffset, endOffset) {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      var currentOffset = 0;
      var startNode = null;
      var startNodeOffset = 0;
      var endNode = null;
      var endNodeOffset = 0;
      while (walker.nextNode()) {
        var node = walker.currentNode;
        var textLength = node.textContent ? node.textContent.length : 0;
        if (!startNode && currentOffset + textLength >= startOffset) {
          startNode = node;
          startNodeOffset = Math.max(0, startOffset - currentOffset);
        }
        if (currentOffset + textLength >= endOffset) {
          endNode = node;
          endNodeOffset = Math.max(0, endOffset - currentOffset);
          break;
        }
        currentOffset += textLength;
      }
      if (!startNode || !endNode) return null;
      return {
        startNode: startNode,
        startNodeOffset: startNodeOffset,
        endNode: endNode,
        endNodeOffset: endNodeOffset,
      };
    }

    function resolveAnchorOffsets(fullText, anchor) {
      if (!anchor || !anchor.selectedText) return null;
      var start = typeof anchor.startOffset === 'number' ? anchor.startOffset : -1;
      var end = typeof anchor.endOffset === 'number' ? anchor.endOffset : -1;
      if (start >= 0 && end >= start && fullText.slice(start, end) === anchor.selectedText) {
        return { start: start, end: end };
      }
      start = fullText.indexOf(anchor.selectedText);
      if (start === -1 && anchor.prefix) {
        var prefixIndex = fullText.indexOf(anchor.prefix + anchor.selectedText);
        if (prefixIndex !== -1) start = prefixIndex + anchor.prefix.length;
      }
      if (start === -1 && anchor.suffix) {
        var suffixIndex = fullText.indexOf(anchor.selectedText + anchor.suffix);
        if (suffixIndex !== -1) start = suffixIndex;
      }
      if (start === -1) return null;
      return { start: start, end: start + anchor.selectedText.length };
    }

    function applyPersistentHighlights() {
      clearPersistentHighlights();
      feedbackItems.forEach(function(item) {
        if (item.type !== 'text_selection' || item.resolved || !item.anchor) return;
        var block = getBlockElement(item.blockId);
        if (!block || !block.classList.contains('sv-block')) return;
        var target = getEditableTarget(block) || block;
        var fullText = target.textContent || '';
        var offsets = resolveAnchorOffsets(fullText, item.anchor);
        if (!offsets || offsets.end <= offsets.start) return;
        var rangeData = findTextRange(target, offsets.start, offsets.end);
        if (!rangeData) return;
        try {
          var range = document.createRange();
          range.setStart(rangeData.startNode, rangeData.startNodeOffset);
          range.setEnd(rangeData.endNode, rangeData.endNodeOffset);
          var highlight = document.createElement('span');
          highlight.className = 'sv-persistent-highlight';
          highlight.dataset.commentId = item.id;
          highlight.onclick = function(e) {
            e.stopPropagation();
            openInlineReviewCard(item.blockId, item.anchor, { scroll: false });
          };
          var contents = range.extractContents();
          highlight.appendChild(contents);
          range.insertNode(highlight);
        } catch (err) {
          console.warn('[superview] highlight render failed:', err);
        }
      });
    }

    function updateBlockHighlights() {
      document.querySelectorAll('.sv-block').forEach(function(block) {
        block.classList.remove('has-comment');
        var existing = block.querySelector('.sv-comment-badge');
        if (existing) existing.remove();
      });
      var commentsByBlock = {};
      feedbackItems.forEach(function(f) {
        if ((f.type === 'block_comment' || f.type === 'text_selection') && !f.resolved && f.version === currentVersion) {
          if (!commentsByBlock[f.blockId]) commentsByBlock[f.blockId] = 0;
          commentsByBlock[f.blockId]++;
        }
      });
      Object.keys(commentsByBlock).forEach(function(blockId) {
        var block = document.querySelector('.sv-block[data-block-id="' + blockId + '"]');
        if (block) {
          block.classList.add('has-comment');
          var badge = document.createElement('span');
          badge.className = 'sv-comment-badge';
          badge.textContent = commentsByBlock[blockId];
          badge.onclick = function(e) {
            e.stopPropagation();
            openInlineReviewCard(blockId, null, { scroll: false });
          };
          block.appendChild(badge);
        }
      });
      applyPersistentHighlights();
    }

    function openBlockComment(blockId) {
      openInlineReviewCard(blockId, null, { scroll: false });
    }

    var selToolbar = document.getElementById('sv-selection-toolbar');
    var pendingSelection = null;

    function updateSelectionToolbar(triggerTarget) {
      if (!feedbackEnabled || !selToolbar) return;
      if (triggerTarget && triggerTarget.closest && triggerTarget.closest('.sv-comment-panel')) return;
      if (triggerTarget && triggerTarget.closest && triggerTarget.closest('.sv-inline-review-card')) return;
      if (triggerTarget && triggerTarget.closest && triggerTarget.closest('.sv-block-actions')) return;
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        selToolbar.classList.remove('visible');
        return;
      }
      var range = sel.getRangeAt(0);
      var startNode = range.startContainer;
      var startEl = startNode.nodeType === 3 ? startNode.parentElement : startNode;
      if (!startEl) { selToolbar.classList.remove('visible'); return; }
      var block = startEl.closest('.sv-block');
      if (!block) { selToolbar.classList.remove('visible'); return; }
      if (block.closest('.sv-accordion-content')) { selToolbar.classList.remove('visible'); return; }
      var rect = range.getBoundingClientRect();
      selToolbar.style.left = (rect.left + rect.width / 2 - 88) + 'px';
      selToolbar.style.top = (rect.top - 35 + window.scrollY) + 'px';
      selToolbar.classList.add('visible');
      var text = sel.toString();
      // Get clean text from content paragraph only (exclude block actions)
      var contentEl = getEditableTarget(block) || block.querySelector('.sv-block-content') || block;
      var fullText = contentEl.textContent || '';
      // Use lastIndexOf if selection is in the second half, otherwise indexOf
      var idx = fullText.indexOf(text);
      if (idx === -1) {
        // Fallback: try with trimmed text
        idx = fullText.indexOf(text.trim());
      }
      if (idx === -1) idx = 0;
      pendingSelection = {
        blockId: block.dataset.blockId,
        prefix: fullText.slice(Math.max(0, idx - 30), idx),
        selectedText: text,
        suffix: fullText.slice(idx + text.length, idx + text.length + 30),
        startOffset: idx,
        endOffset: idx + text.length
      };
    }

    document.addEventListener('mouseup', function(e) {
      updateSelectionToolbar(e.target);
    });

    document.addEventListener('selectionchange', function() {
      if (!feedbackEnabled || !selToolbar) return;
      var active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
      updateSelectionToolbar(active);
    });

    function dismissSelectionToolbar(e) {
      if (e) e.stopPropagation();
      if (selToolbar) selToolbar.classList.remove('visible');
      pendingSelection = null;
      var sel = window.getSelection();
      if (sel) sel.removeAllRanges();
    }

    function copySelectionText(e) {
      if (e) e.stopPropagation();
      if (!pendingSelection || !pendingSelection.selectedText) return;
      copyTextValue(pendingSelection.selectedText.trim());
      dismissSelectionToolbar();
    }

    function commentOnSelection(e) {
      if (e) e.stopPropagation();
      if (!feedbackEnabled || !selToolbar || !pendingSelection) return;
      selToolbar.classList.remove('visible');
      openInlineReviewCard(pendingSelection.blockId, pendingSelection, { scroll: false });
      pendingSelection = null;
      window.getSelection().removeAllRanges();
    }

    function findBlockEditTextarea(block) {
      return block ? block.querySelector('.sv-block-edit-textarea') : null;
    }

    var blockEditTimers = {};
    var blockEditState = {};
    var BLOCK_EDIT_AUTOSAVE_MS = 800;

    function getBlockEditState(blockId) {
      if (!blockEditState[blockId]) {
        blockEditState[blockId] = {
          inFlight: false,
          closeAfterSave: false,
        };
      }
      return blockEditState[blockId];
    }

    function clearBlockEditTimer(blockId) {
      if (blockEditTimers[blockId]) {
        clearTimeout(blockEditTimers[blockId]);
        delete blockEditTimers[blockId];
      }
    }

    function normalizeBlockEditText(text) {
      return String(text || '').replace(/\\r\\n?/g, '\\n');
    }

    function updateBlockEditTextareaRows(textarea) {
      if (!textarea) return;
      var lines = normalizeBlockEditText(textarea.value).split('\\n').length;
      textarea.rows = Math.max(4, Math.min(18, lines + 1));
    }

    function setBlockEditStatus(blockId, text, stateName) {
      var block = document.querySelector('.sv-block[data-block-id="' + blockId + '"]');
      if (!block) return;
      var statusEl = block.querySelector('.sv-block-edit-status');
      if (!statusEl) return;
      statusEl.textContent = text || '';
      if (stateName) {
        statusEl.setAttribute('data-state', stateName);
      } else {
        statusEl.removeAttribute('data-state');
      }
    }

    function closeBlockEdit(blockId) {
      var block = document.querySelector('.sv-block[data-block-id="' + blockId + '"]');
      if (!block) return;
      var editableTarget = getEditableTarget(block);
      if (editableTarget) {
        editableTarget.style.display = '';
      }
      var textarea = findBlockEditTextarea(block);
      if (textarea) textarea.remove();
      var hint = block.querySelector('.sv-block-edit-hint');
      if (hint) hint.remove();
      var actions = block.querySelector('.sv-block-edit-actions');
      if (actions) actions.remove();
      clearBlockEditTimer(blockId);
      delete blockEditState[blockId];
    }

    function scheduleBlockAutosave(blockId, delay) {
      clearBlockEditTimer(blockId);
      blockEditTimers[blockId] = setTimeout(function() {
        saveBlockEdit(blockId, { autosave: true });
      }, typeof delay === 'number' ? delay : BLOCK_EDIT_AUTOSAVE_MS);
    }

    function finalizeBlockEditSave(blockId, savedText, editItem, options) {
      var block = document.querySelector('.sv-block[data-block-id="' + blockId + '"]');
      if (!block) return;
      var editableTarget = getEditableTarget(block);
      var textarea = findBlockEditTextarea(block);
      if (!editableTarget || !textarea) return;
      var state = getBlockEditState(blockId);
      var normalizedSavedText = normalizeBlockEditText(savedText);
      renderEditableTargetContent(editableTarget, normalizedSavedText);
      editableTarget.dataset.originalText = normalizedSavedText;
      textarea.dataset.lastSavedText = normalizedSavedText;
      upsertFeedbackItem(editItem);
      renderCommentList();
      renderEditList();
      updateBlockHighlights();
      editableTarget.style.outline = '2px solid var(--sv-interactive)';
      setTimeout(function() { editableTarget.style.outline = ''; }, 1000);

      state.inFlight = false;
      var latestText = normalizeBlockEditText(textarea.value);
      if (latestText !== normalizedSavedText) {
        setBlockEditStatus(blockId, 'Saving…', 'saving');
        scheduleBlockAutosave(blockId, 120);
        return;
      }

      setBlockEditStatus(blockId, options && options.savedLabel ? options.savedLabel : 'Saved', '');
      if (state.closeAfterSave) {
        closeBlockEdit(blockId);
      }
    }

    function makeBlockEditable(blockId) {
      var block = document.querySelector('.sv-block[data-block-id="' + blockId + '"]');
      if (!block) return;
      if (!canEditBlock(block)) return;
      var editableTarget = getEditableTarget(block);
      if (!editableTarget) return;
      if (findBlockEditTextarea(block)) {
        var existingTextarea = findBlockEditTextarea(block);
        if (existingTextarea) existingTextarea.focus();
        return;
      }
      editableTarget.dataset.originalText = getEditableSourceText(editableTarget) || editableTarget.textContent || '';
      editableTarget.style.display = 'none';
      var textarea = document.createElement('textarea');
      textarea.className = 'sv-block-edit-textarea';
      textarea.value = editableTarget.dataset.originalText || '';
      textarea.dataset.editItemId = 'edit-' + currentVersion + '-' + blockId;
      textarea.dataset.lastSavedText = editableTarget.dataset.originalText || '';
      updateBlockEditTextareaRows(textarea);
      textarea.setAttribute('spellcheck', 'true');
      var hint = document.createElement('div');
      hint.className = 'sv-block-edit-hint';
      hint.textContent = 'Autosaves after you pause. Enter adds a line break. Cmd/Ctrl+Enter saves now.';
      var existing = block.querySelector('.sv-block-edit-actions');
      if (existing) { existing.classList.add('visible'); return; }
      block.appendChild(textarea);
      block.appendChild(hint);
      var actions = document.createElement('div');
      actions.className = 'sv-block-edit-actions visible';
      actions.innerHTML = "<span class=\\"sv-block-edit-status\\">Autosave on</span>"
        + "<button class=\\"sv-block-edit-btn\\" onclick=\\"cancelBlockEdit('" + blockId + "')\\">Cancel</button>"
        + "<button class=\\"sv-block-edit-btn primary\\" onclick=\\"finishBlockEdit('" + blockId + "')\\">Done</button>";
      block.appendChild(actions);
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      textarea.addEventListener('input', function() {
        updateBlockEditTextareaRows(textarea);
        setBlockEditStatus(blockId, 'Unsaved changes', '');
        scheduleBlockAutosave(blockId, BLOCK_EDIT_AUTOSAVE_MS);
      });
      textarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          saveBlockEdit(blockId, { force: true });
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          cancelBlockEdit(blockId);
        }
      });
      textarea.addEventListener('blur', function() {
        scheduleBlockAutosave(blockId, 180);
      });
    }

    function saveBlockEdit(blockId, options) {
      var block = document.querySelector('.sv-block[data-block-id="' + blockId + '"]');
      if (!block) return;
      var editableTarget = getEditableTarget(block);
      if (!editableTarget) return;
      var textarea = findBlockEditTextarea(block);
      if (!textarea) return;
      var state = getBlockEditState(blockId);
      var newText = normalizeBlockEditText(textarea.value);
      var originalText = normalizeBlockEditText(editableTarget.dataset.originalText || '');
      if (!options || !options.force) {
        if (newText === originalText) {
          setBlockEditStatus(blockId, 'Saved', '');
          if (options && options.closeAfterSave) {
            closeBlockEdit(blockId);
          }
          return;
        }
      }
      if (state.inFlight) {
        state.closeAfterSave = state.closeAfterSave || Boolean(options && options.closeAfterSave);
        setBlockEditStatus(blockId, 'Saving…', 'saving');
        return;
      }
      clearBlockEditTimer(blockId);
      state.inFlight = true;
      state.closeAfterSave = Boolean(options && options.closeAfterSave);
      setBlockEditStatus(blockId, 'Saving…', 'saving');
      var editItem = {
        type: 'content_edit',
        id: textarea.dataset.editItemId || ('edit-' + currentVersion + '-' + blockId),
        blockId: blockId,
        version: currentVersion,
        text: newText,
        createdAt: new Date().toISOString(),
        resolved: false
      };
      if (reviewPersistenceMode === 'served') {
        checkServerAvailability().then(function(available) {
          if (!available) throw new Error('Server unavailable');
          return fetch(serverBase + '/save-content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId: window.__svTaskId,
              blockId: blockId,
              version: currentVersion,
              itemId: editItem.id,
              newText: newText,
              basePath: window.__svBasePath || '',
              clientId: window.__svClientId || ''
            })
          });
        }).then(function(res) {
          if (!res) throw new Error('Save failed');
          return res.json().catch(function() { return {}; }).then(function(data) {
            if (!res.ok) {
              throw new Error(data && data.error ? data.error : 'Save failed');
            }
            return data;
          });
        }).then(function(data) {
          var savedText = data && typeof data.savedText === 'string' ? data.savedText : newText;
          persistReviewBundle();
          finalizeBlockEditSave(blockId, savedText, data && data.item ? data.item : editItem, {
            savedLabel: 'Saved to Superview',
          });
        }).catch(function(err) {
          state.inFlight = false;
          console.error('Save failed:', err);
          setBlockEditStatus(blockId, err && err.message ? err.message : 'Save failed', 'error');
          showToast(err && err.message ? err.message : 'Save failed');
        });
        return;
      }
      upsertFeedbackItem(editItem);
      persistReviewBundle().then(function() {
        finalizeBlockEditSave(blockId, newText, editItem, {
          savedLabel: reviewPersistenceMode === 'filesystem' ? 'Saved to folder' : 'Saved in this browser',
        });
      }).catch(function(err) {
        state.inFlight = false;
        console.error('Save failed:', err);
        setBlockEditStatus(blockId, err && err.message ? err.message : 'Save failed', 'error');
        showToast(err && err.message ? err.message : 'Save failed');
      });
    }

    function finishBlockEdit(blockId) {
      saveBlockEdit(blockId, { force: true, closeAfterSave: true });
    }

    function cancelBlockEdit(blockId) {
      var block = document.querySelector('.sv-block[data-block-id="' + blockId + '"]');
      if (!block) return;
      var state = getBlockEditState(blockId);
      if (state.inFlight) {
        setBlockEditStatus(blockId, 'Saving…', 'saving');
        showToast('Waiting for the current save to finish');
        return;
      }
      var editableTarget = getEditableTarget(block);
      if (!editableTarget) return;
      renderEditableTargetContent(editableTarget, editableTarget.dataset.originalText || editableTarget.textContent);
      closeBlockEdit(blockId);
    }

    // Init block actions and comment badges for dynamically loaded content
    function initBlockActions() {
      updateBlockHighlights();
      renderCommentList();

      // Add edit buttons and double-click editing to all blocks
      document.querySelectorAll('.sv-block').forEach(function(block) {
        if (!canEditBlock(block)) return;
        // Pencil button in actions
        var existingActions = block.querySelector('.sv-block-actions');
        if (existingActions && !existingActions.querySelector('.sv-block-action[title="Edit"]')) {
          var editBtn = document.createElement('button');
          editBtn.className = 'sv-block-action';
          editBtn.title = 'Edit';
          editBtn.innerHTML = '&#9998;';
          editBtn.onclick = function(e) {
            e.stopPropagation();
            makeBlockEditable(block.dataset.blockId);
          };
          existingActions.insertBefore(editBtn, existingActions.firstChild);
        }
        // Double-click anywhere in the block to edit
        block.addEventListener('dblclick', function(e) {
          if (e.target.closest('.sv-block-actions') || e.target.closest('.sv-block-edit-actions')) return;
          if (findBlockEditTextarea(block)) return;
          makeBlockEditable(block.dataset.blockId);
        });
      });
    }

    // Init on load
    initializeReviewPersistence();
    applySavedEdits();
    collapseRedundantLeadHeadings();
    initBlockActions();
    updateBlockHighlights();
    renderCommentList();
    renderEditList();

    if (inlineReviewTextarea) {
      inlineReviewTextarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          submitInlineReviewComment();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeInlineReviewCard();
        }
      });
    }
    window.addEventListener('beforeunload', function(e) {
      var hasPendingEdits = Array.prototype.some.call(document.querySelectorAll('.sv-block-edit-textarea'), function(textarea) {
        var block = textarea.closest('.sv-block');
        if (!block) return false;
        var blockId = block.dataset.blockId || '';
        var state = blockEditState[blockId];
        if (state && state.inFlight) return true;
        var editableTarget = getEditableTarget(block);
        var savedText = normalizeBlockEditText(editableTarget && editableTarget.dataset ? (editableTarget.dataset.originalText || '') : '');
        var currentText = normalizeBlockEditText(textarea.value || '');
        return currentText !== savedText;
      });
      if (!hasPendingEdits) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    });
    document.addEventListener('mousedown', function(e) {
      if (inlineReviewCard && !inlineReviewCard.hidden && !inlineReviewCard.contains(e.target) && !e.target.closest('.sv-comment-badge') && !e.target.closest('.sv-block-actions') && !e.target.closest('.sv-persistent-highlight')) {
        closeInlineReviewCard();
      }
      if (selToolbar && selToolbar.classList.contains('visible') && !selToolbar.contains(e.target)) {
        selToolbar.classList.remove('visible');
      }
    });
    window.addEventListener('resize', positionInlineReviewCard);
    window.addEventListener('scroll', positionInlineReviewCard, { passive: true });

    function collapseRedundantLeadHeadings() {
      var pageTitle = ((document.getElementById('sv-page-title') || {}).textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      if (!pageTitle) return;
      document.querySelectorAll('.sv-document, .sv-article').forEach(function(root) {
        var leadBlock = root.querySelector('.sv-block');
        if (!leadBlock) return;
        var leadHeading = leadBlock.querySelector('h1, h2');
        if (!leadHeading) return;
        var leadText = (leadHeading.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        if (leadText && leadText === pageTitle) {
          leadBlock.classList.add('sv-redundant-lead-heading');
        }
      });
    }

    function toggleTaskGroup(toggleBtn, event) {
      if (event) event.stopPropagation();
      var taskGroup = toggleBtn && toggleBtn.closest('.sv-sidebar-task-group');
      if (!taskGroup || taskGroup.classList.contains('single')) return;
      taskGroup.classList.toggle('expanded');
    }

    function formatSidebarTime(iso) {
      return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    function deriveSourceLabel(basePath) {
      if (!basePath) return 'This folder';
      var parts = String(basePath).split(/[\\\\/]/).filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : String(basePath);
    }

    function resolveClientViewPath(basePath, relativeViewPath) {
      if (!basePath || !relativeViewPath) return relativeViewPath || '';
      var normalizedBasePath = String(basePath).replace(/\\\\/g, '/').replace(/[\\/]+$/, '');
      return normalizedBasePath + '/.superview/views/' + relativeViewPath;
    }

    function normalizeHistoryEntries(rawEntries, fallbackBasePath) {
      return (rawEntries || []).filter(function(item) {
        return item && item.taskId;
      }).map(function(item) {
        var basePath = item.basePath || fallbackBasePath || window.__svBasePath || '';
        var relativeViewPath = item.relativeViewPath || item.filePath || '';
        if (relativeViewPath) {
          relativeViewPath = relativeViewPath.split(/[\\\\/]/).pop();
        }
        var viewPath = item.viewPath || resolveClientViewPath(basePath, relativeViewPath);
        return {
          id: item.id,
          groupId: item.groupId || [basePath, item.taskId].join('::'),
          taskId: item.taskId,
          basePath: basePath,
          sourceLabel: item.sourceLabel || deriveSourceLabel(basePath),
          title: item.title || 'Untitled',
          type: item.type || 'generic',
          versions: item.versions || 1,
          feedbackCount: item.feedbackCount || 0,
          updatedAt: item.updatedAt,
          createdAt: item.createdAt,
          kept: item.kept === true,
          preview: item.preview || '',
          versionLabel: 'v' + (item.versions || 1),
          relativeViewPath: relativeViewPath || '',
          viewPath: viewPath || '',
        };
      }).sort(function(a, b) {
        var versionDelta = (b.versions || 0) - (a.versions || 0);
        if (a.groupId === b.groupId && versionDelta !== 0) return versionDelta;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    }

    function getHistoryPayload() {
      var payload = window.__svHistoryData;
      if (payload && payload.formatVersion === 2) {
        return payload;
      }
      if (window.__svEmbeddedHistoryData && window.__svEmbeddedHistoryData.formatVersion === 2) {
        return window.__svEmbeddedHistoryData;
      }
      var fallbackEntries = normalizeHistoryEntries(
        window.__svLatestHistory || window.__svHistory || window.__svEmbeddedHistory || [],
        window.__svBasePath || ''
      );
      return {
        formatVersion: 2,
        basePath: window.__svBasePath || '',
        workspaceRoot: null,
        localHistory: fallbackEntries,
        workspaceHistory: fallbackEntries.slice(),
      };
    }

    function hasWorkspaceHistory(payload) {
      if (!payload || !payload.workspaceRoot) return false;
      return (payload.workspaceHistory || []).some(function(entry) {
        return entry && entry.basePath && entry.basePath !== (payload.basePath || '');
      });
    }

    function getHistoryScope(payload) {
      if (!hasWorkspaceHistory(payload)) return 'local';
      try {
        var storedScope = localStorage.getItem('sv-history-scope');
        if (storedScope === 'workspace') return 'workspace';
      } catch (err) {
        // Ignore storage failures
      }
      return 'local';
    }

    function setHistoryScope(nextScope) {
      var payload = getHistoryPayload();
      var scope = nextScope === 'workspace' && hasWorkspaceHistory(payload) ? 'workspace' : 'local';
      window.__svHistoryScope = scope;
      try {
        localStorage.setItem('sv-history-scope', scope);
      } catch (err) {
        // Ignore storage failures
      }
      rerenderSidebar();
    }

    function groupHistoryEntries(entries) {
      var groups = {};
      var now = new Date();
      var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      var yesterdayStart = todayStart - 86400000;
      entries.forEach(function(entry) {
        var time = new Date(entry.updatedAt).getTime();
        var label = time >= todayStart ? 'Today' : time >= yesterdayStart ? 'Yesterday' :
          new Date(entry.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (!groups[label]) groups[label] = [];
        groups[label].push(entry);
      });
      return groups;
    }

    function groupTaskHistoryEntries(entries) {
      var taskGroups = [];
      var byGroupId = {};
      (entries || []).forEach(function(entry) {
        if (!entry || !entry.taskId) return;
        var groupId = entry.groupId || [entry.basePath || '', entry.taskId].join('::');
        var taskGroup = byGroupId[groupId];
        if (!taskGroup) {
          taskGroup = {
            groupId: groupId,
            taskId: entry.taskId,
            basePath: entry.basePath || '',
            sourceLabel: entry.sourceLabel || deriveSourceLabel(entry.basePath),
            title: entry.title || 'Untitled',
            type: entry.type || 'generic',
            latestEntry: entry,
            entries: [],
            feedbackCount: entry.feedbackCount || 0
          };
          byGroupId[groupId] = taskGroup;
          taskGroups.push(taskGroup);
        }
        taskGroup.entries.push(entry);
      });

      taskGroups.forEach(function(taskGroup) {
        var latestByVersion = {};
        taskGroup.entries
          .slice()
          .sort(function(a, b) {
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          })
          .forEach(function(entry) {
            var version = entry.versions || 1;
            if (!latestByVersion[version]) {
              latestByVersion[version] = entry;
            }
          });
        taskGroup.entries = Object.keys(latestByVersion).map(function(version) {
          return latestByVersion[version];
        }).sort(function(a, b) {
          var versionDelta = (b.versions || 0) - (a.versions || 0);
          if (versionDelta !== 0) return versionDelta;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        taskGroup.latestEntry = taskGroup.entries[0];
      });

      return taskGroups;
    }

    function currentViewName() {
      var path = location.pathname || '';
      var fileName = path.split('/').pop() || '';
      if ((!fileName || fileName === '/') && location.protocol === 'file:') {
        fileName = location.href.split(/[\\\\/]/).pop() || '';
      }
      fileName = (fileName || '').split('?')[0].split('#')[0];
      return fileName || '_latest.html';
    }

    function isCurrentHistoryIteration(item) {
      if (!item || item.taskId !== (window.__svTaskId || '')) return false;
      if ((item.basePath || '') !== (window.__svBasePath || '')) return false;
      return item.versions === (window.__svCurrentVersion || 1);
    }

    function matchesSidebarGroup(taskGroup, words) {
      var latestEntry = taskGroup.latestEntry || {};
      if (!words || words.length === 0) {
        return { parentMatch: true, entries: taskGroup.entries.slice() };
      }
      var parentHaystack = [
        taskGroup.title,
        taskGroup.type,
        latestEntry.preview || '',
        taskGroup.sourceLabel || '',
        'v' + (latestEntry.versions || 1),
        formatSidebarTime(latestEntry.updatedAt || ''),
        new Date(latestEntry.updatedAt || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      ].join(' ').toLowerCase();
      var parentMatch = words.every(function(word) { return parentHaystack.includes(word); });
      if (parentMatch) {
        return { parentMatch: true, entries: taskGroup.entries.slice() };
      }
      var matchingEntries = taskGroup.entries.filter(function(entry) {
        var entryHaystack = [
          taskGroup.title,
          entry.type,
          entry.preview || '',
          entry.sourceLabel || '',
          'v' + (entry.versions || 1),
          formatSidebarTime(entry.updatedAt),
          new Date(entry.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        ].join(' ').toLowerCase();
        return words.every(function(word) { return entryHaystack.includes(word); });
      });
      return { parentMatch: false, entries: matchingEntries };
    }

    function getHistoryHref(item) {
      if (!item || !item.relativeViewPath || isCurrentHistoryIteration(item)) return '#';
      var currentBasePath = window.__svBasePath || '';
      var currentScope = window.__svHistoryScope || 'local';
      var isServedViewRoute = location.protocol.indexOf('http') === 0 && location.pathname === '/_view';
      if (location.protocol.indexOf('http') === 0) {
        if (isServedViewRoute || currentScope === 'workspace' || (item.basePath && item.basePath !== currentBasePath)) {
          return '/_view?base=' + encodeURIComponent(item.basePath || currentBasePath) + '&file=' + encodeURIComponent(item.relativeViewPath);
        }
        return item.relativeViewPath;
      }
      if (item.basePath && item.basePath !== currentBasePath) {
        return 'file://' + encodeURI(item.viewPath || resolveClientViewPath(item.basePath, item.relativeViewPath));
      }
      return item.relativeViewPath;
    }

    function renderHistoryScopeToggle() {
      var toggleEl = document.getElementById('sv-sidebar-scope');
      if (!toggleEl) return;
      var payload = getHistoryPayload();
      if (!hasWorkspaceHistory(payload)) {
        toggleEl.innerHTML = '';
        toggleEl.style.display = 'none';
        return;
      }
      toggleEl.style.display = 'grid';
      var activeScope = window.__svHistoryScope || getHistoryScope(payload);
      toggleEl.innerHTML =
        "<button class=\\"sv-sidebar-scope-btn" + (activeScope === 'local' ? ' active' : '') + "\\" type=\\"button\\" onclick=\\"setHistoryScope('local')\\">This Folder</button>"
        + "<button class=\\"sv-sidebar-scope-btn" + (activeScope === 'workspace' ? ' active' : '') + "\\" type=\\"button\\" onclick=\\"setHistoryScope('workspace')\\">All Vibecoding</button>";
    }

    function getActiveHistoryEntries() {
      var payload = getHistoryPayload();
      window.__svHistoryPayload = payload;
      var scope = getHistoryScope(payload);
      window.__svHistoryScope = scope;
      var sourceEntries = scope === 'workspace' ? payload.workspaceHistory : payload.localHistory;
      return normalizeHistoryEntries(sourceEntries, payload.basePath || window.__svBasePath || '');
    }

    function rerenderSidebar() {
      var searchField = document.getElementById('sv-sidebar-search');
      renderHistoryScopeToggle();
      window.__svSidebarEntries = getActiveHistoryEntries();
      renderSidebarEntries(window.__svSidebarEntries || [], searchField ? (searchField.value || '') : '');
    }

    function renderSidebarEntries(entries, query) {
      var container = document.getElementById('sv-sidebar-items');
      if (!container) return;
      var taskId = window.__svTaskId || '';
      var currentBasePath = window.__svBasePath || '';
      var currentScope = window.__svHistoryScope || 'local';
      var typeIcons = {
        email: '\\u2709', tweet: '\\uD83D\\uDCAC', thread: '\\uD83E\\uDDF5',
        message: '\\uD83D\\uDCE8', linkedin: '\\uD83D\\uDCBC', document: '\\uD83D\\uDCC4',
        code: '\\u2328', table: '\\uD83D\\uDCCA', generic: '\\uD83D\\uDCC3'
      };
      function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
      function renderIteration(taskGroup, item) {
        var isCurrent = isCurrentHistoryIteration(item);
        var cls = 'sv-sidebar-subitem' + (isCurrent ? ' current' : '');
        var href = getHistoryHref(item);
        var badges = '';
        if (item.kept) {
          badges += ' <span class="sv-sidebar-subitem-badge">Kept</span>';
        }
        return '<a class="' + cls + '" href="' + esc(href) + '" title="' + esc(taskGroup.title + ' ' + item.versionLabel) + '">'
          + '<span class="sv-sidebar-subitem-label">' + esc(item.versionLabel) + '</span>'
          + '<span class="sv-sidebar-subitem-meta">' + formatSidebarTime(item.updatedAt) + badges + '</span></a>';
      }
      function renderTaskGroup(taskGroup, matchInfo) {
        var latestEntry = taskGroup.latestEntry;
        var groupIsCurrent = taskGroup.taskId === taskId && taskGroup.basePath === currentBasePath;
        var latestIsCurrent = isCurrentHistoryIteration(latestEntry);
        var latestHref = getHistoryHref(latestEntry);
        var olderEntries = taskGroup.entries.slice(1);
        var childEntries = matchInfo && !matchInfo.parentMatch
          ? matchInfo.entries.filter(function(entry) { return entry.versions !== latestEntry.versions; })
          : olderEntries;
        var expanded = childEntries.length > 0 && (!query || groupIsCurrent || (matchInfo && !matchInfo.parentMatch));
        var groupClass = 'sv-sidebar-task-group'
          + (groupIsCurrent ? ' current-group' : '')
          + (olderEntries.length > 0 ? '' : ' single')
          + (expanded ? ' expanded' : '');
        var meta = [];
        if (currentScope === 'workspace') {
          meta.push('<span class="sv-sidebar-source-badge">' + esc(taskGroup.sourceLabel || latestEntry.sourceLabel || deriveSourceLabel(taskGroup.basePath)) + '</span>');
        }
        meta.push('<span class="sv-sidebar-item-time">' + formatSidebarTime(latestEntry.updatedAt) + '</span>');
        if (latestEntry.versions > 1) meta.push('<span class="sv-sidebar-badge">' + latestEntry.versions + 'v</span>');
        if ((taskGroup.feedbackCount || 0) > 0) meta.push('<span class="sv-sidebar-feedback-badge">' + taskGroup.feedbackCount + '</span>');
        return '<div class="' + groupClass + '" data-task-id="' + esc(taskGroup.taskId) + '" data-base-path="' + esc(taskGroup.basePath || '') + '">'
          + '<div class="sv-sidebar-task-head">'
          + '<a class="sv-sidebar-item sv-sidebar-parent' + (latestIsCurrent ? ' current' : '') + '" href="' + esc(latestHref) + '" title="' + esc(taskGroup.title) + '">'
          + '<span class="sv-sidebar-item-icon">' + (typeIcons[latestEntry.type] || '\\uD83D\\uDCC3') + '</span>'
          + '<span class="sv-sidebar-item-body">'
          + '<span class="sv-sidebar-item-title">' + esc(taskGroup.title) + '</span>'
          + '<span class="sv-sidebar-item-meta">' + meta.join('') + '</span>'
          + '</span></a>'
          + (olderEntries.length > 0
            ? '<button class="sv-sidebar-task-toggle" onclick="toggleTaskGroup(this, event)" aria-label="Toggle versions"><span class="sv-sidebar-task-toggle-icon">▾</span></button>'
            : '')
          + '</div>'
          + (childEntries.length > 0
            ? '<div class="sv-sidebar-task-children">' + childEntries.map(function(entry) { return renderIteration(taskGroup, entry); }).join('') + '</div>'
            : '')
          + '</div>';
      }
      var words = (query || '').toLowerCase().trim().split(/\\s+/).filter(Boolean);
      var taskGroups = groupTaskHistoryEntries(entries);
      var filteredGroups = taskGroups.map(function(taskGroup) {
        return {
          taskGroup: taskGroup,
          matchInfo: matchesSidebarGroup(taskGroup, words)
        };
      }).filter(function(result) {
        return result.matchInfo.parentMatch || result.matchInfo.entries.length > 0;
      });
      if (filteredGroups.length === 0) {
        container.innerHTML = '<div class="sv-sidebar-empty">No matching history items</div>';
        return;
      }
      var active = filteredGroups.filter(function(result) { return (result.taskGroup.feedbackCount || 0) > 0; });
      var rest = filteredGroups.filter(function(result) { return (result.taskGroup.feedbackCount || 0) === 0; });
      var grouped = groupHistoryEntries(rest.map(function(result) { return result.taskGroup.latestEntry; }));
      var byGroupId = {};
      rest.forEach(function(result) {
        byGroupId[result.taskGroup.groupId] = result;
      });
      var html = '';
      if (active.length > 0) {
        html += '<div class="sv-sidebar-group"><div class="sv-sidebar-group-title">Active</div>'
          + active.map(function(result) { return renderTaskGroup(result.taskGroup, result.matchInfo); }).join('') + '</div>';
      }
      Object.keys(grouped).forEach(function(label) {
        html += '<div class="sv-sidebar-group"><div class="sv-sidebar-group-title">' + esc(label) + '</div>'
          + grouped[label].map(function(entry) {
            var result = byGroupId[entry.groupId || [entry.basePath || '', entry.taskId].join('::')];
            return result ? renderTaskGroup(result.taskGroup, result.matchInfo) : '';
          }).join('') + '</div>';
      });
      container.innerHTML = html;
    }

    // Rebuild sidebar from shared history data (loaded via _history-data.js)
    (function() {
      rerenderSidebar();
    })();

    // Hide back button if no history to go back to
    if (window.history.length <= 1) {
      var backBtn = document.getElementById('sv-back-btn');
      if (backBtn) backBtn.style.display = 'none';
    }

    // Sidebar search (filters full history dataset, not rendered DOM only)
    var searchInput = document.getElementById('sv-sidebar-search');
    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        renderSidebarEntries(window.__svSidebarEntries || [], e.target.value || '');
      });
    }

    // Command-K palette
    var cmdkOverlay = document.getElementById('sv-cmdk');
    var cmdkInput = document.getElementById('sv-cmdk-input');
    var cmdkResults = document.getElementById('sv-cmdk-results');
    var cmdkActiveIndex = -1;
    var cmdkItems = [];

    var cmdkActions = [
      { title: 'Toggle theme', icon: '\u25D1', shortcut: 'T', action: function() { toggleTheme(); } },
      { title: 'Copy main text', icon: '\uD83D\uDCCB', shortcut: '', action: function() {
        var copyBtn = document.querySelector('.sv-copy-btn');
        if (copyBtn) copyContent(copyBtn);
      } }
    ];
    if (feedbackEnabled) {
      cmdkActions.push({ title: 'Open review', icon: '\uD83D\uDCAC', shortcut: 'C', action: function() { openCommentPanel(); } });
      cmdkActions.push({ title: 'Export review', icon: '\uD83D\uDCE4', shortcut: '', action: function() { exportFeedback(); } });
      cmdkActions.push({ title: 'Import review', icon: '\uD83D\uDCC2', shortcut: '', action: function() { importReviewBundle(); } });
      if (filesystemReviewSupported) {
        cmdkActions.push({ title: 'Connect folder', icon: '\uD83D\uDCC1', shortcut: '', action: function() { connectReviewFolder(); } });
      }
    }
    // Note: diff action is added dynamically in searchCmdK instead of mutating cmdkActions


    function openCmdK() {
      cmdkOverlay.style.display = '';
      cmdkInput.value = '';
      cmdkActiveIndex = -1;
      searchCmdK('');
      setTimeout(function() { cmdkInput.focus(); }, 50);
    }

    function closeCmdK(e) {
      if (e && e.target !== cmdkOverlay) return;
      cmdkOverlay.style.display = 'none';
      cmdkInput.value = '';
    }

    function searchCmdK(query) {
      var q = query.toLowerCase().trim();
      var words = q ? q.split(/\\s+/) : [];
      var results = [];

      // Match actions
      var allActions = cmdkActions.slice();
      if (document.querySelector('.sv-diff-toggle')) {
        allActions.push({ title: 'Toggle diff', icon: '\u2194', shortcut: 'D', action: function() { toggleDiff(); } });
      }
      var matchedActions = allActions.filter(function(a) {
        if (!q) return true;
        var t = a.title.toLowerCase();
        return words.every(function(w) { return t.includes(w); });
      });
      if (matchedActions.length > 0) {
        results.push({ type: 'group', label: 'Actions' });
        matchedActions.forEach(function(a) {
          results.push({ type: 'action', title: a.title, icon: a.icon, shortcut: a.shortcut, action: a.action });
        });
      }

      var historyResults = (window.__svSidebarEntries || []).filter(function(item) {
        if (!item || isCurrentHistoryIteration(item)) return false;
        if (!q) return true;
        var haystack = [
          item.title,
          item.type,
          item.preview,
          item.sourceLabel || '',
          item.versionLabel || '',
          formatSidebarTime(item.updatedAt)
        ].join(' ').toLowerCase();
        return words.every(function(word) { return haystack.includes(word); });
      }).slice(0, 8).map(function(item) {
        var subtitle = item.type + ' · ' + (item.versionLabel || ('v' + item.versions));
        subtitle += ' · ' + formatSidebarTime(item.updatedAt);
        if ((window.__svHistoryScope || 'local') === 'workspace' && item.sourceLabel) {
          subtitle = item.sourceLabel + ' · ' + subtitle;
        }
        if ((item.feedbackCount || 0) > 0) subtitle += ' · ' + item.feedbackCount + ' comments';
        return {
          type: 'history',
          title: item.title + ((window.__svHistoryScope || 'local') === 'workspace' && item.sourceLabel ? ' · ' + item.sourceLabel : '') + ' · ' + (item.versionLabel || ('v' + item.versions)),
          subtitle: subtitle,
          href: getHistoryHref(item),
          icon: item.type === 'email' ? '\u2709'
            : item.type === 'tweet' ? '\uD83D\uDCAC'
            : item.type === 'thread' ? '\uD83E\uDDF5'
            : item.type === 'message' ? '\uD83D\uDCE8'
            : item.type === 'linkedin' ? '\uD83D\uDCBC'
            : item.type === 'document' ? '\uD83D\uDCC4'
            : item.type === 'code' ? '\u2328'
            : item.type === 'table' ? '\uD83D\uDCCA'
            : '\uD83D\uDCC3'
        };
      });
      if (historyResults.length > 0) {
        results.push({ type: 'group', label: 'History' });
        historyResults.slice(0, 8).forEach(function(h) { results.push(h); });
      }

      cmdkItems = results.filter(function(r) { return r.type !== 'group'; });
      cmdkActiveIndex = cmdkItems.length > 0 ? 0 : -1;
      renderCmdKResults(results);
    }

    function renderCmdKResults(results) {
      if (results.length === 0) {
        cmdkResults.innerHTML = '<div class="sv-cmdk-empty">No results found</div>';
        return;
      }
      var itemIdx = 0;
      cmdkResults.innerHTML = results.map(function(r) {
        if (r.type === 'group') {
          return '<div class="sv-cmdk-group-title">' + r.label + '</div>';
        }
        var activeClass = itemIdx === cmdkActiveIndex ? ' active' : '';
        var shortcutHtml = r.shortcut ? '<span class="sv-cmdk-kbd">' + r.shortcut + '</span>' : '';
        var subtitleHtml = r.type === 'history'
          ? '<div class="sv-cmdk-item-subtitle">' + escapeHtmlInline(r.subtitle || 'History') + '</div>'
          : '';
        var html = '<div class="sv-cmdk-item' + activeClass + '" data-cmdk-index="' + itemIdx + '">'
          + '<span class="sv-cmdk-item-icon">' + (r.icon || '') + '</span>'
          + '<div class="sv-cmdk-item-text">' + escapeHtmlInline(r.title) + subtitleHtml + '</div>'
          + shortcutHtml
          + '</div>';
        itemIdx++;
        return html;
      }).join('');

      // Click handlers
      cmdkResults.querySelectorAll('.sv-cmdk-item').forEach(function(el) {
        el.addEventListener('click', function() {
          var idx = parseInt(el.dataset.cmdkIndex);
          cmdkActiveIndex = idx;
          selectCmdKItem();
        });
        el.addEventListener('mouseenter', function() {
          cmdkActiveIndex = parseInt(el.dataset.cmdkIndex);
          cmdkResults.querySelectorAll('.sv-cmdk-item').forEach(function(e, i) {
            e.classList.toggle('active', i === cmdkActiveIndex);
          });
        });
      });
    }

    function navigateCmdK(dir) {
      if (cmdkItems.length === 0) return;
      cmdkActiveIndex = (cmdkActiveIndex + dir + cmdkItems.length) % cmdkItems.length;
      cmdkResults.querySelectorAll('.sv-cmdk-item').forEach(function(el, i) {
        el.classList.toggle('active', i === cmdkActiveIndex);
        if (i === cmdkActiveIndex) el.scrollIntoView({ block: 'nearest' });
      });
    }

    function selectCmdKItem() {
      if (cmdkActiveIndex < 0 || cmdkActiveIndex >= cmdkItems.length) return;
      var item = cmdkItems[cmdkActiveIndex];
      cmdkOverlay.style.display = 'none';
      if (item.action) {
        item.action();
      } else if (item.href) {
        window.location.href = item.href;
      }
    }

    if (cmdkInput) {
      cmdkInput.addEventListener('input', function() {
        searchCmdK(cmdkInput.value);
      });

      cmdkInput.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); navigateCmdK(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); navigateCmdK(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); selectCmdKItem(); }
        else if (e.key === 'Escape') { cmdkOverlay.style.display = 'none'; }
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
      // Cmd+K / Ctrl+K opens palette from anywhere
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (cmdkOverlay.style.display === 'none') openCmdK();
        else cmdkOverlay.style.display = 'none';
        return;
      }
      // Cmd+Shift+M / Ctrl+Shift+M toggles comment panel
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'm' || e.key === 'M')) {
        if (!feedbackEnabled || !commentPanel) return;
        e.preventDefault();
        if (commentPanel.classList.contains('open')) closeCommentPanel();
        else openCommentPanel();
        return;
      }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        if (e.key === 'Escape') {
          if (cmdkOverlay.style.display !== 'none') {
            cmdkOverlay.style.display = 'none';
          } else {
            e.target.blur();
            closeCommentPanel();
            closeInlineReviewCard();
          }
        }
        return;
      }
      // N/P to navigate comments when panel is open
      if (feedbackEnabled && commentPanel && commentPanel.classList.contains('open')) {
        if (e.key === 'n' || e.key === 'N') {
          var items = commentList.querySelectorAll('.sv-comment-item');
          if (items.length > 0) {
            var current = commentList.querySelector('.sv-comment-item.active-nav');
            var idx = 0;
            if (current) { current.classList.remove('active-nav'); idx = (Array.from(items).indexOf(current) + 1) % items.length; }
            items[idx].classList.add('active-nav');
            items[idx].scrollIntoView({ block: 'nearest' });
            items[idx].click();
          }
          return;
        }
        if (e.key === 'p' || e.key === 'P') {
          var items = commentList.querySelectorAll('.sv-comment-item');
          if (items.length > 0) {
            var current = commentList.querySelector('.sv-comment-item.active-nav');
            var idx = items.length - 1;
            if (current) { current.classList.remove('active-nav'); idx = (Array.from(items).indexOf(current) - 1 + items.length) % items.length; }
            items[idx].classList.add('active-nav');
            items[idx].scrollIntoView({ block: 'nearest' });
            items[idx].click();
          }
          return;
        }
      }
      switch(e.key) {
        case 't': case 'T': toggleTheme(); break;
        case 'c': case 'C':
          if (!feedbackEnabled || !commentPanel) break;
          if (commentPanel.classList.contains('open')) closeCommentPanel();
          else openCommentPanel();
          break;
        case 'd': case 'D':
          var diff = document.querySelector('.sv-diff-toggle');
          if (diff) diff.click();
          break;
        case 'Escape':
          cmdkOverlay.style.display = 'none';
          if (selToolbar) selToolbar.classList.remove('visible');
          closeCommentPanel();
          closeInlineReviewCard();
          break;
      }
      if (e.key >= '1' && e.key <= '9') {
        var v = parseInt(e.key);
        var accordion = document.querySelector('.sv-accordion[data-version="' + v + '"]');
        if (accordion) {
          accordion.classList.toggle('expanded');
          accordion.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    });

    // General notes save
    (function() {
      var notesTextarea = document.getElementById('sv-notes-textarea');
      if (!notesTextarea) return;
      // Load from feedback items first (server-persisted), then localStorage fallback
      var noteItem = null;
      for (var i = 0; i < feedbackItems.length; i++) {
        if (feedbackItems[i].id === 'notes-general') { noteItem = feedbackItems[i]; break; }
      }
      if (noteItem && noteItem.text) {
        notesTextarea.value = noteItem.text;
        localStorage.setItem(notesStorageKey, noteItem.text);
      } else {
        var saved = localStorage.getItem(notesStorageKey);
        if (saved) notesTextarea.value = saved;
      }
      var debounceTimer = null;
      notesTextarea.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() {
          saveNotes();
        }, 800);
      });
      notesTextarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          saveNotes();
        }
      });
    })();
    function saveNotes() {
      var ta = document.getElementById('sv-notes-textarea');
      var indicator = document.getElementById('sv-notes-saved');
      if (!ta) return;
      // Save to localStorage
      localStorage.setItem(notesStorageKey, ta.value);
      // Also save as a feedback item for server persistence
      var noteItem = {
        type: 'general_notes',
        id: 'notes-general',
        blockId: 'general',
        version: currentVersion,
        text: ta.value,
        createdAt: new Date().toISOString(),
        resolved: false
      };
      upsertFeedbackItem(noteItem);
      persistReviewBundle().then(function() {
        if (reviewPersistenceMode === 'served') tryServerSync(noteItem);
      });
      var now = new Date();
      if (indicator) indicator.textContent = 'Saved ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    // Onboarding hint on first visit
    (function() {
      if (!feedbackEnabled) return;
      if (localStorage.getItem('sv-onboarded')) return;
      var toast = document.createElement('div');
      toast.className = 'sv-onboard-toast';
      toast.innerHTML = '<strong>Review</strong>Use + Comment on a block, or select text to leave an inline comment. Enter adds a line break, Cmd/Ctrl+Enter saves.';
      document.body.appendChild(toast);
      function dismiss() {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
        localStorage.setItem('sv-onboarded', '1');
        document.removeEventListener('click', dismiss);
      }
      setTimeout(function() {
        document.addEventListener('click', dismiss);
      }, 0);
    })();
    // Image lightbox
    function openLightbox(src) {
      var lb = document.getElementById('sv-lightbox');
      var img = document.getElementById('sv-lightbox-img');
      img.src = src;
      lb.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function closeLightbox() {
      var lb = document.getElementById('sv-lightbox');
      lb.classList.remove('open');
      document.body.style.overflow = '';
    }
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeLightbox();
    });

    // Variation tab switching
    (function() {
      var tabBars = document.querySelectorAll('.sv-variation-tab-bar');
      tabBars.forEach(function(bar) {
        var tabs = bar.querySelectorAll('.sv-variation-tab');
        var panelContainer = bar.nextElementSibling;
        if (!panelContainer || !panelContainer.classList.contains('sv-variation-panels')) return;
        var panels = panelContainer.querySelectorAll('.sv-variation-panel');

        tabs.forEach(function(tab, idx) {
          tab.addEventListener('click', function() {
            tabs.forEach(function(t) { t.classList.remove('active'); });
            panels.forEach(function(p) { p.classList.remove('active'); });
            tab.classList.add('active');
            if (panels[idx]) panels[idx].classList.add('active');
          });
          // Double-click to edit tab name
          tab.addEventListener('dblclick', function(e) {
            e.stopPropagation();
            if (tab.querySelector('input')) return; // already editing
            var star = tab.querySelector('.sv-star');
            var currentName = tab.textContent.trim();
            var input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.style.cssText = 'background:transparent;border:1px solid var(--sv-gold);border-radius:4px;color:inherit;font:inherit;font-size:inherit;padding:0.1rem 0.3rem;width:' + Math.max(currentName.length * 8, 60) + 'px;outline:none;';
            // Clear tab content, preserve star if exists
            while (tab.firstChild) tab.removeChild(tab.firstChild);
            if (star) tab.appendChild(star);
            tab.appendChild(input);
            input.focus();
            input.select();
            function finishEdit() {
              var newName = input.value.trim() || currentName;
              while (tab.firstChild) tab.removeChild(tab.firstChild);
              if (star) tab.appendChild(star);
              tab.appendChild(document.createTextNode(newName));
              // Save as feedback
              if (feedbackEnabled) {
                saveFeedback({
                  type: 'tab_rename',
                  id: 'tab-rename-' + idx + '-' + Date.now(),
                  blockId: tab.dataset.blockId || ('variation-tab-' + idx),
                  version: currentVersion,
                  text: newName,
                  createdAt: new Date().toISOString(),
                  resolved: false
                });
              }
            }
            input.addEventListener('blur', finishEdit);
            input.addEventListener('keydown', function(ev) {
              if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
              if (ev.key === 'Escape') { input.value = currentName; input.blur(); }
            });
            // Prevent tab click from firing
            input.addEventListener('click', function(ev) { ev.stopPropagation(); });
          });
        });
      });
    })();

    document.addEventListener('dblclick', function(e) {
      var pageTitle = e.target.closest('#sv-page-title');
      if (pageTitle) {
        e.preventDefault();
        e.stopPropagation();
        startTaskRename(pageTitle, window.__svTaskId || '', window.__svBasePath || '');
        return;
      }

      var sidebarTitle = e.target.closest('.sv-sidebar-parent .sv-sidebar-item-title');
      if (!sidebarTitle) return;
      var parentLink = sidebarTitle.closest('.sv-sidebar-parent');
      if (!parentLink || parentLink.getAttribute('href') !== '#') return;
      var taskGroup = sidebarTitle.closest('.sv-sidebar-task-group');
      if (!taskGroup) return;
      e.preventDefault();
      e.stopPropagation();
      startTaskRename(sidebarTitle, taskGroup.dataset.taskId || '', taskGroup.dataset.basePath || window.__svBasePath || '');
    });

    // Auto-refresh when new content is rendered
    (function() {
      // Only connect SSE if served via HTTP (not file://)
      if (location.protocol === 'file:') return;
      var es;
      var reconnectDelay = 1000;
      function connectSSE() {
        checkServerAvailability().then(function(available) {
          if (!available) return;
          es = new EventSource('/events');
          es.addEventListener('message', function(e) {
            try {
              var data = JSON.parse(e.data);
              if (data.type === 'new_render') {
                location.reload();
              } else if (data.type === 'content_saved') {
                if (data.clientId && data.clientId === (window.__svClientId || '')) return;
                location.reload();
              } else if (data.type === 'task_rename' && data.taskId && data.title) {
                applyTaskRename(data.taskId, data.basePath || '', data.title);
              }
            } catch (err) { console.warn('[superview] SSE parse error:', err); }
          });
          es.addEventListener('open', function() { reconnectDelay = 1000; });
          es.addEventListener('error', function() {
            if (es) es.close();
            checkServerAvailability(true).then(function(availableAgain) {
              if (!availableAgain) return;
              setTimeout(connectSSE, reconnectDelay);
              reconnectDelay = Math.min(reconnectDelay * 2, 30000);
            });
          });
        });
      }
      connectSSE();
      window.addEventListener('beforeunload', function() { if (es) es.close(); });
    })();

    if (commentModeEnabled && feedbackEnabled) {
      openCommentPanel();
    }
  </script>

  <div class="sv-lightbox" id="sv-lightbox" onclick="closeLightbox()">
    <button class="sv-lightbox-close" onclick="closeLightbox()">&times;</button>
    <img id="sv-lightbox-img" src="" alt="">
  </div>
</body>
</html>`;
}

function buildSidebar(history: HistoryEntry[], currentTaskId: string, currentVersion: number): string {
  const taskGroups = groupHistoryByTask(history);
  const activeGroups = taskGroups.filter((group) => (group.feedbackCount || 0) > 0);
  const historyGroups = taskGroups.filter((group) => (group.feedbackCount || 0) === 0);
  const groupedByDate = groupTaskGroupsByDate(historyGroups);

  const activeSectionHtml = activeGroups.length > 0 ? `
    <div class="sv-sidebar-group">
      <div class="sv-sidebar-group-title">Active</div>
      ${activeGroups.map((group) => renderSidebarTaskGroup(group, currentTaskId, currentVersion)).join('')}
    </div>
  ` : '';

  const historyGroupsHtml = Object.entries(groupedByDate).map(([label, groups]) => `
    <div class="sv-sidebar-group">
      <div class="sv-sidebar-group-title">${escapeHtml(label)}</div>
      ${groups.map((group) => renderSidebarTaskGroup(group, currentTaskId, currentVersion)).join('')}
    </div>
  `).join('');

  return `
    <nav class="sv-sidebar">
      <div class="sv-sidebar-header">Superview</div>
      <a class="sv-sidebar-item sv-sidebar-today" href="${escapeHtml(toViewHref('_today.html'))}">
        <span>\uD83D\uDCC5</span> <span>Today</span>
      </a>
      <div class="sv-sidebar-search-wrap">
        <input type="text" class="sv-sidebar-search" id="sv-sidebar-search" placeholder="Search...">
        <span class="sv-sidebar-search-hint">\u2318K</span>
      </div>
      <div class="sv-sidebar-scope" id="sv-sidebar-scope"></div>
      <div id="sv-sidebar-items">
      ${history.length === 0 ? `
        <div class="sv-sidebar-empty">Your renders will appear here</div>
      ` : `${activeSectionHtml}${historyGroupsHtml}`}
      </div>
      <div class="sv-sidebar-footer">
        <button id="sv-theme-toggle" onclick="toggleTheme()" aria-label="Toggle theme" class="sv-toggle-switch">
          <span class="sv-toggle-knob" id="sv-toggle-knob">
            <svg class="sv-toggle-sun" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#B8892A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            <svg class="sv-toggle-moon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#D49828" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </span>
        </button>
      </div>
    </nav>
  `;
}

function renderSidebarTaskGroup(taskGroup: HistoryTaskGroup, currentTaskId: string, currentVersion: number): string {
  const latestEntry = taskGroup.latestEntry;
  const latestIsCurrent = taskGroup.taskId === currentTaskId && latestEntry.versions === currentVersion;
  const latestHref = latestIsCurrent ? '#' : escapeHtml(toViewHref(latestEntry.filePath));
  const olderEntries = taskGroup.entries.slice(1);
  const expanded = olderEntries.length > 0 && taskGroup.taskId === currentTaskId;

  const childrenHtml = olderEntries.length > 0 ? `
    <div class="sv-sidebar-task-children">
      ${olderEntries.map((entry) => {
        const isCurrentIteration = taskGroup.taskId === currentTaskId && entry.versions === currentVersion;
        const href = isCurrentIteration ? '#' : escapeHtml(toViewHref(entry.filePath));
        const badge = entry.kept
          ? `<span class="sv-sidebar-subitem-badge">Kept</span>`
          : '';

        return `
          <a class="sv-sidebar-subitem${isCurrentIteration ? ' current' : ''}" href="${href}" title="${escapeHtml(taskGroup.title)} v${entry.versions}">
            <span class="sv-sidebar-subitem-label">v${entry.versions}</span>
            <span class="sv-sidebar-subitem-meta">${formatTime(entry.updatedAt)}${badge ? ` ${badge}` : ''}</span>
          </a>`;
      }).join('')}
    </div>
  ` : '';

  return `
    <div class="sv-sidebar-task-group${expanded ? ' expanded' : ''}${olderEntries.length === 0 ? ' single' : ''}" data-task-id="${escapeHtml(taskGroup.taskId)}">
      <div class="sv-sidebar-task-head">
        <a class="sv-sidebar-item sv-sidebar-parent${latestIsCurrent ? ' current' : ''}" href="${latestHref}" title="${escapeHtml(taskGroup.title)}">
          <span class="sv-sidebar-item-icon">${getTypeIcon(latestEntry.type)}</span>
          <span class="sv-sidebar-item-body">
            <span class="sv-sidebar-item-title">${escapeHtml(taskGroup.title)}</span>
            <span class="sv-sidebar-item-meta">
              <span class="sv-sidebar-item-time">${formatTime(latestEntry.updatedAt)}</span>
              ${latestEntry.versions > 1 ? `<span class="sv-sidebar-badge">${latestEntry.versions}v</span>` : ''}
              ${(taskGroup.feedbackCount || 0) > 0 ? `<span class="sv-sidebar-feedback-badge">${taskGroup.feedbackCount}</span>` : ''}
            </span>
          </span>
        </a>
        ${olderEntries.length > 0 ? `
        <button class="sv-sidebar-task-toggle" onclick="toggleTaskGroup(this, event)" aria-label="Toggle versions">
          <span class="sv-sidebar-task-toggle-icon">▾</span>
        </button>` : ''}
      </div>
      ${childrenHtml}
    </div>
  `;
}

function toViewHref(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function groupByDate(entries: HistoryEntry[]): Record<string, HistoryEntry[]> {
  const groups: Record<string, HistoryEntry[]> = {};
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;

  for (const entry of entries) {
    const entryDate = new Date(entry.updatedAt).getTime();
    let label: string;
    if (entryDate >= today) label = 'Today';
    else if (entryDate >= yesterday) label = 'Yesterday';
    else label = new Date(entry.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    if (!groups[label]) groups[label] = [];
    groups[label].push(entry);
  }
  return groups;
}

function groupTaskGroupsByDate(taskGroups: HistoryTaskGroup[]): Record<string, HistoryTaskGroup[]> {
  const groups: Record<string, HistoryTaskGroup[]> = {};
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;

  for (const taskGroup of taskGroups) {
    const entryDate = new Date(taskGroup.latestEntry.updatedAt).getTime();
    let label: string;
    if (entryDate >= today) label = 'Today';
    else if (entryDate >= yesterday) label = 'Yesterday';
    else label = new Date(taskGroup.latestEntry.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    if (!groups[label]) groups[label] = [];
    groups[label].push(taskGroup);
  }

  return groups;
}

function getTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    email: '\u2709',
    tweet: '\uD83D\uDCAC',
    thread: '\uD83E\uDDF5',
    message: '\uD83D\uDCE8',
    linkedin: '\uD83D\uDCBC',
    document: '\uD83D\uDCC4',
    code: '\u2328',
    table: '\uD83D\uDCCA',
    generic: '\uD83D\uDCC3',
  };
  return icons[type] || '\uD83D\uDCC3';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeJsString(str: string): string {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/<\/script/gi, '<\\/script');
}

export { escapeHtml };

export function buildTodayPage(
  todayHistory: HistoryEntry[],
  allHistory: HistoryEntry[] = [],
  options: { basePath?: string; historyData?: HistoryDataPayload | null } = {},
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const todayTaskGroups = groupHistoryByTask(todayHistory);
  const latestTodayEntries = todayTaskGroups.map((group) => group.latestEntry);

  const morning = latestTodayEntries.filter(e => new Date(e.updatedAt).getHours() < 12);
  const afternoon = latestTodayEntries.filter(e => { const h = new Date(e.updatedAt).getHours(); return h >= 12 && h < 17; });
  const evening = latestTodayEntries.filter(e => new Date(e.updatedAt).getHours() >= 17);

  function renderCard(item: HistoryEntry): string {
    const time = new Date(item.updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const icon = getTypeIcon(item.type);
    const versionBadge = item.versions > 1 ? `<span class="sv-today-card-badge sv-today-card-badge-version">${item.versions}v</span>` : '';
    const commentBadge = (item.feedbackCount || 0) > 0 ? `<span class="sv-today-card-badge sv-today-card-badge-comment">${item.feedbackCount} comments</span>` : '';
    const preview = item.preview ? `<div class="sv-today-card-preview">${escapeHtml(item.preview)}</div>` : '';
    const href = escapeHtml(toViewHref(item.filePath));

    return `
      <a class="sv-today-card" href="${href}">
        <div class="sv-today-card-header">
          <span class="sv-today-card-icon">${icon}</span>
          <span class="sv-today-card-title">${escapeHtml(item.title)}</span>
        </div>
        <div class="sv-today-card-meta">
          <span class="sv-today-card-type">${escapeHtml(item.type)}</span>
          ${versionBadge}
          ${commentBadge}
          <span class="sv-today-card-time">${time}</span>
        </div>
        ${preview}
      </a>`;
  }

  function renderSection(label: string, emoji: string, items: HistoryEntry[]): string {
    if (items.length === 0) return '';
    return `
      <div style="margin-bottom:2rem">
        <div class="sv-today-section-title">${emoji} ${escapeHtml(label)}</div>
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          ${items.map(renderCard).join('')}
        </div>
      </div>`;
  }

  const emptyState = latestTodayEntries.length === 0
    ? '<div style="text-align:center;padding:3rem 1rem;color:var(--sv-muted);font-size:0.95rem">Nothing rendered today yet. Pipe some content to get started.</div>'
    : '';

  const todayContentHtml = `
    <div style="margin-bottom:2rem">
      <div style="font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--sv-muted);margin-bottom:0.5rem">\uD83D\uDCC5 Today</div>
      <div style="font-size:0.85rem;color:var(--sv-muted)">${latestTodayEntries.length} task${latestTodayEntries.length !== 1 ? 's' : ''} rendered today</div>
    </div>
    ${emptyState}
    ${renderSection('Morning', '\u2600\uFE0F', morning)}
    ${renderSection('Afternoon', '\u2601\uFE0F', afternoon)}
    ${renderSection('Evening', '\uD83C\uDF19', evening)}
  `;

  return buildHtml({
    title: dateStr,
    theme: 'auto',
    contentHtml: todayContentHtml,
    typeLabel: 'Today',
    history: allHistory,
    noSidebar: false,
    taskId: '_today',
    feedbackEnabled: false,
    attribution: true,
    dashboardMode: true,
    basePath: options.basePath,
    historyData: options.historyData || null,
  });
}
