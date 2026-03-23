import type { ThemeMode, VersionData, HistoryEntry } from '../types.js';
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
}

function getFontEmbed(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
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

  const sidebarHtml = !noSidebar ? buildSidebar(history, taskId) : '';
  const hasSidebar = !noSidebar;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | Superview</title>
  <script>${getThemeScript(theme)}</script>
  <script src="_history-data.js"></script>
  <style>
    ${withFonts ? getFontEmbed() : ''}
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
      align-items: center;
      gap: 0.5rem;
      padding: 0.45rem 0.6rem;
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
      margin-left: auto;
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

    .sv-sidebar-feedback-badge {
      background: var(--sv-gold);
      color: #fff;
      font-size: 0.6rem;
      padding: 0.05rem 0.3rem;
      border-radius: 10px;
      font-weight: 600;
      margin-left: 0.25rem;
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
    .sv-accordion.expanded .sv-accordion-chevron,
    .sv-accordion:hover .sv-accordion-chevron {
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
    .sv-accordion.expanded .sv-accordion-content,
    .sv-accordion:hover .sv-accordion-content {
      max-height: 5000px;
      opacity: 1;
    }
    .sv-accordion-content-inner {
      padding: 0.5rem 1rem 1rem;
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

    .sv-block:hover .sv-block-actions {
      opacity: 1;
    }

    .sv-block-actions {
      position: absolute;
      right: -2.5rem;
      top: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      opacity: 0;
      transition: opacity 0.15s;
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
      background: var(--sv-text);
      color: var(--sv-bg);
      padding: 0.3rem 0.6rem;
      border-radius: 6px;
      font-size: 0.8rem;
      cursor: pointer;
      z-index: 500;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .sv-selection-toolbar.visible { display: block; }

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

    .sv-comment-input-area {
      border-top: 1px solid var(--sv-border);
      padding: 0.85rem 1rem;
      flex-shrink: 0;
    }
    .sv-comment-input-area textarea {
      width: 100%;
      padding: 0.6rem 0.75rem;
      border: 1px solid var(--sv-border);
      border-radius: 8px;
      background: var(--sv-surface);
      color: var(--sv-text);
      font-size: 0.85rem;
      font-family: inherit;
      resize: none;
      min-height: 56px;
      outline: none;
    }
    .sv-comment-input-area textarea:focus { border-color: var(--sv-interactive); }
    .sv-comment-input-actions {
      display: flex;
      justify-content: center;
      margin-top: 0.5rem;
    }
    .sv-comment-submit-btn {
      background: var(--sv-interactive);
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 0.45rem 1.5rem;
      font-size: 0.8rem;
      font-weight: 500;
      width: 100%;
      cursor: pointer;
      transition: opacity 0.15s, transform 0.1s, box-shadow 0.15s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .sv-comment-submit-btn:hover {
      opacity: 0.9;
      transform: translateY(-1px);
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }
    .sv-comment-submit-btn:active {
      transform: translateY(0);
      box-shadow: none;
    }
    .sv-comment-submit-btn:disabled { opacity: 0.4; cursor: default; transform: none; box-shadow: none; }

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
      top: 0.25rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      background: var(--sv-gold);
      color: #fff;
      font-size: 0.6rem;
      font-weight: 700;
      border-radius: 50%;
      cursor: pointer;
      z-index: 10;
      transition: transform 0.15s;
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
      background: var(--sv-surface);
      border: 1px solid var(--sv-border);
      border-radius: 10px;
      padding: 1rem 1.25rem;
      transition: box-shadow 0.2s, border-color 0.2s, transform 0.15s;
      cursor: pointer;
      border-left: 3px solid transparent;
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
        <a class="sv-back-btn" href="#" onclick="history.back(); return false;" id="sv-back-btn">&larr; Back to history</a>
        <div class="sv-header">
          <span class="sv-type-label">${escapeHtml(typeLabel)}${versions.length > 1 ? ` &middot; v${currentVersion}` : ''}</span>
          <h1 class="sv-title">${escapeHtml(title)}</h1>
          <div class="sv-toolbar">
            <button class="sv-btn sv-copy-btn" onclick="copyContent(this)">Copy text</button>
            ${feedbackEnabled ? `<button class="sv-btn" onclick="exportFeedback()">Export feedback</button>` : ''}
            ${feedbackEnabled ? `<button class="sv-btn" onclick="openCommentPanel()">Comment <span class="sv-kbd">C</span></button>` : ''}
          </div>
        </div>

        <div id="sv-content-area">
          ${contentHtml}
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

  <div class="sv-selection-toolbar" id="sv-selection-toolbar" onclick="commentOnSelection()">Comment</div>


  <!-- Comment Panel (right sidebar) -->
  <aside class="sv-comment-panel" id="sv-comment-panel">
    <div class="sv-comment-panel-header">
      <span class="sv-comment-panel-header-title" id="sv-comment-count">Comments (0)</span>
      <button class="sv-comment-panel-close" onclick="closeCommentPanel()" aria-label="Close comments">&times;</button>
    </div>
    <div class="sv-comment-panel-toggle-resolved">
      <input type="checkbox" id="sv-show-resolved" onchange="toggleResolvedVisibility()">
      <label for="sv-show-resolved">Show resolved</label>
    </div>
    <div class="sv-comment-list" id="sv-comment-list"></div>
    <div class="sv-comment-input-area" id="sv-comment-input-area">
      <textarea id="sv-comment-textarea" placeholder="Type comment..." rows="2"></textarea>
      <div class="sv-comment-input-actions">
        <button class="sv-comment-submit-btn" id="sv-comment-submit" onclick="submitPanelComment()">Send</button>
      </div>
    </div>
    <div class="sv-notes-divider">
      <div class="sv-notes-label">Overall Notes</div>
      <textarea class="sv-notes-textarea" id="sv-notes-textarea" placeholder="General notes about this page..." rows="3"></textarea>
      <div class="sv-notes-actions">
        <span class="sv-notes-saved" id="sv-notes-saved"></span>
        <button class="sv-notes-save-btn" onclick="saveNotes()">Save</button>
      </div>
    </div>
  </aside>

  <!-- Command-K Palette -->
  <div class="sv-cmdk-overlay" id="sv-cmdk" style="display:none" onclick="closeCmdK(event)">
    <div class="sv-cmdk-modal" onclick="event.stopPropagation()">
      <input class="sv-cmdk-input" id="sv-cmdk-input" placeholder="Search or jump to..." autocomplete="off">
      <div class="sv-cmdk-results" id="sv-cmdk-results"></div>
    </div>
  </div>

  <script>
    // History data for dynamic sidebar
    window.__svHistory = ${JSON.stringify(history)};
    window.__svTaskId = '${taskId}';

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
    function copyContent(btn) {
      var area = document.getElementById('sv-content-area');
      var activePanel = area.querySelector('.sv-variation-panel.active');
      var source = activePanel || area;
      var text = source.innerText || source.textContent;
      navigator.clipboard.writeText(text).then(function() {
        var orig = btn.innerHTML;
        btn.innerHTML = '\u2713';
        btn.classList.add('copied');
        setTimeout(function() { btn.innerHTML = orig; btn.classList.remove('copied'); }, 1500);
      });
    }

    // Copy version content from accordion
    function copyVersionContent(btn, e) {
      e.stopPropagation();
      var accordion = btn.closest('.sv-accordion');
      if (!accordion) return;
      var inner = accordion.querySelector('.sv-accordion-content-inner');
      if (!inner) return;
      var text = inner.innerText || inner.textContent;
      navigator.clipboard.writeText(text.trim()).then(function() {
        var orig = btn.textContent;
        btn.textContent = '\u2713';
        setTimeout(function() { btn.textContent = orig; }, 1500);
      });
    }

    // Feedback storage
    var feedbackItems;
    try {
      feedbackItems = JSON.parse(localStorage.getItem('sv-feedback-${taskId}') || '[]');
    } catch(e) {
      console.warn('Superview: corrupted feedback data, resetting.', e);
      feedbackItems = [];
      localStorage.removeItem('sv-feedback-${taskId}');
    }

    function saveFeedback(item) {
      feedbackItems.push(item);
      localStorage.setItem('sv-feedback-${taskId}', JSON.stringify(feedbackItems));
      tryServerSync(item);
    }

    function showToast(msg) {
      var t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);background:var(--sv-text);color:var(--sv-bg);padding:0.5rem 1.25rem;border-radius:8px;font-size:0.85rem;z-index:9000;opacity:0;transition:opacity 0.2s;box-shadow:0 4px 12px rgba(0,0,0,0.2)';
      document.body.appendChild(t);
      requestAnimationFrame(function() { t.style.opacity = '1'; });
      setTimeout(function() { t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 200); }, 2000);
    }

    function tryServerSync(item) {
      // Use relative URL if served via HTTP (same origin), absolute for file://
      var base = location.protocol.startsWith('http') ? '' : 'http://localhost:3847';
      fetch(base + '/health').then(function() {
        fetch(base + '/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: '${taskId}', item: item })
        }).catch(function(err) { console.warn('[superview] sync failed:', err); });
      }).catch(function(err) { console.warn('[superview] sync failed:', err); });
    }

    function exportFeedback() {
      if (feedbackItems.length === 0) { alert('No feedback to export'); return; }
      var data = {
        taskId: '${taskId}',
        items: feedbackItems,
        exportedAt: new Date().toISOString()
      };
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'feedback-${taskId}.json';
      a.click();
    }

    // Comment panel state
    var commentPanel = document.getElementById('sv-comment-panel');
    var commentList = document.getElementById('sv-comment-list');
    var commentTextarea = document.getElementById('sv-comment-textarea');
    var commentCount = document.getElementById('sv-comment-count');
    var pendingCommentBlockId = null;
    var pendingCommentAnchor = null;
    var showResolved = false;

    function openCommentPanel(blockId, anchor) {
      pendingCommentBlockId = blockId || null;
      pendingCommentAnchor = anchor || null;
      commentPanel.classList.add('open');
      document.body.classList.add('sv-comment-panel-open');
      renderCommentList();
      setTimeout(function() { commentTextarea.focus(); }, 320);
    }

    function closeCommentPanel() {
      commentPanel.classList.remove('open');
      document.body.classList.remove('sv-comment-panel-open');
      pendingCommentBlockId = null;
      pendingCommentAnchor = null;
    }

    function toggleResolvedVisibility() {
      showResolved = document.getElementById('sv-show-resolved').checked;
      renderCommentList();
    }

    function renderCommentList() {
      var comments = feedbackItems.filter(function(f) {
        return f.type === 'block_comment' || f.type === 'text_selection';
      });
      var unresolvedCount = comments.filter(function(c) { return !c.resolved; }).length;
      commentCount.textContent = 'Comments (' + unresolvedCount + ')';
      var pill = document.getElementById('sv-feedback-pill');
      if (pill) {
        pill.textContent = unresolvedCount > 0 ? unresolvedCount + ' comment' + (unresolvedCount !== 1 ? 's' : '') : 'Leave feedback';
      }

      var visible = showResolved ? comments : comments.filter(function(c) { return !c.resolved; });
      if (visible.length === 0) {
        commentList.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--sv-muted);font-size:0.85rem;">No comments yet</div>';
        return;
      }
      commentList.innerHTML = visible.map(function(c, idx) {
        var resolvedClass = c.resolved ? ' resolved' : '';
        var quoteHtml = '';
        if (c.anchor && c.anchor.selectedText) {
          var truncated = c.anchor.selectedText.length > 100 ? c.anchor.selectedText.slice(0, 100) + '...' : c.anchor.selectedText;
          quoteHtml = '<div class="sv-comment-item-quote">"' + escapeHtmlInline(truncated) + '"</div>';
        }
        // Get the actual block element's text content
        var blockEl = document.querySelector('.sv-block[data-block-id="' + c.blockId + '"]');
        var blockText = blockEl ? (blockEl.textContent || '').trim() : '';
        var blockLabel = blockText ? (blockText.length > 60 ? blockText.slice(0, 60) + '...' : blockText) : c.blockId;
        var blockNumber = c.blockId ? c.blockId.replace('block-', '') : '';
        var labelHtml = '<div class="sv-comment-item-block">' + (blockNumber ? '<span class="sv-comment-block-num">' + (parseInt(blockNumber) + 1) + '</span> ' : '') + escapeHtmlInline(blockLabel) + '</div>';
        var timeAgo = getTimeAgo(c.createdAt);
        var resolveBtn = c.resolved
          ? '<span style="font-size:0.7rem;color:var(--sv-muted)">Resolved</span>'
          : '<button class="sv-comment-resolve-btn" onclick="resolveComment(event, \\'' + c.id + '\\')"  >Resolve</button>';
        var editBtn = c.resolved ? '' : '<button class="sv-comment-resolve-btn" onclick="editComment(event, \\'' + c.id + '\\')" >Edit</button>';
        var deleteBtn = '<button class="sv-comment-resolve-btn sv-comment-delete-btn" onclick="deleteComment(event, \\'' + c.id + '\\')" >Delete</button>';
        return '<div class="sv-comment-item' + resolvedClass + '" data-comment-id="' + c.id + '" onclick="scrollToCommentBlock(\\'' + c.blockId + '\\')">'
          + labelHtml
          + quoteHtml
          + '<div class="sv-comment-item-text">' + escapeHtmlInline(c.text || '') + '</div>'
          + '<div class="sv-comment-item-meta"><span>' + timeAgo + '</span><span style="display:flex;gap:0.25rem">' + editBtn + resolveBtn + deleteBtn + '</span></div>'
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

    function submitPanelComment() {
      var text = commentTextarea.value.trim();
      if (!text) return;
      var item = {
        type: pendingCommentAnchor ? 'text_selection' : 'block_comment',
        id: 'fb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        blockId: pendingCommentBlockId || 'general',
        version: currentVersion,
        text: text,
        createdAt: new Date().toISOString(),
        resolved: false
      };
      if (pendingCommentAnchor) {
        item.anchor = pendingCommentAnchor;
      }
      saveFeedback(item);
      commentTextarea.value = '';
      pendingCommentAnchor = null;
      renderCommentList();
      updateBlockHighlights();
      showToast('Comment saved');
    }

    function resolveComment(e, id) {
      e.stopPropagation();
      for (var i = 0; i < feedbackItems.length; i++) {
        if (feedbackItems[i].id === id) {
          feedbackItems[i].resolved = true;
          break;
        }
      }
      localStorage.setItem('sv-feedback-${taskId}', JSON.stringify(feedbackItems));
      renderCommentList();
      updateBlockHighlights();
    }

    function editComment(e, id) {
      e.stopPropagation();
      var el = document.querySelector('.sv-comment-item[data-comment-id="' + id + '"]');
      if (!el) return;
      var item = null;
      for (var i = 0; i < feedbackItems.length; i++) {
        if (feedbackItems[i].id === id) { item = feedbackItems[i]; break; }
      }
      if (!item) return;
      var textEl = el.querySelector('.sv-comment-item-text');
      if (!textEl) return;
      // Replace text with textarea
      var existing = el.querySelector('.sv-comment-edit-textarea');
      if (existing) return; // Already editing
      textEl.style.display = 'none';
      var ta = document.createElement('textarea');
      ta.className = 'sv-comment-edit-textarea';
      ta.value = item.text || '';
      ta.rows = 3;
      ta.style.cssText = 'width:100%;padding:0.5rem;border:1px solid var(--sv-border);border-radius:6px;background:var(--sv-bg);color:var(--sv-text);font-size:0.85rem;resize:vertical;margin:0.25rem 0;font-family:inherit;';
      var actions = document.createElement('div');
      actions.className = 'sv-comment-edit-actions';
      actions.style.cssText = 'display:flex;gap:0.35rem;margin-top:0.25rem;';
      var saveBtn = document.createElement('button');
      saveBtn.className = 'sv-comment-resolve-btn';
      saveBtn.textContent = 'Save';
      saveBtn.style.cssText = 'background:var(--sv-interactive);color:#fff;border-color:var(--sv-interactive);';
      saveBtn.onclick = function(ev) { ev.stopPropagation(); saveCommentEdit(id, ta.value); };
      var cancelBtn = document.createElement('button');
      cancelBtn.className = 'sv-comment-resolve-btn';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.onclick = function(ev) { ev.stopPropagation(); renderCommentList(); };
      actions.appendChild(saveBtn);
      actions.appendChild(cancelBtn);
      textEl.parentNode.insertBefore(ta, textEl.nextSibling);
      textEl.parentNode.insertBefore(actions, ta.nextSibling);
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }

    function saveCommentEdit(id, newText) {
      newText = (newText || '').trim();
      if (!newText) return;
      for (var i = 0; i < feedbackItems.length; i++) {
        if (feedbackItems[i].id === id) {
          feedbackItems[i].text = newText;
          feedbackItems[i].editedAt = new Date().toISOString();
          break;
        }
      }
      localStorage.setItem('sv-feedback-${taskId}', JSON.stringify(feedbackItems));
      // Sync edit to server
      var editedItem = feedbackItems.find(function(f) { return f.id === id; });
      if (editedItem) tryServerSync(editedItem);
      renderCommentList();
      updateBlockHighlights();
    }

    function deleteComment(e, id) {
      if (!confirm('Delete this comment?')) return;
      e.stopPropagation();
      feedbackItems = feedbackItems.filter(function(f) { return f.id !== id; });
      localStorage.setItem('sv-feedback-${taskId}', JSON.stringify(feedbackItems));
      renderCommentList();
      updateBlockHighlights();
    }

    function scrollToCommentBlock(blockId) {
      var block = document.querySelector('.sv-block[data-block-id="' + blockId + '"]');
      if (block) {
        block.scrollIntoView({ behavior: 'smooth', block: 'center' });
        block.style.background = 'rgba(212, 152, 40, 0.12)';
        block.style.outline = '2px solid var(--sv-gold)';
        block.style.borderRadius = '6px';
        setTimeout(function() {
          block.style.background = '';
          block.style.outline = '';
          block.style.borderRadius = '';
        }, 2000);
      }
    }

    function updateBlockHighlights() {
      document.querySelectorAll('.sv-block').forEach(function(block) {
        block.classList.remove('has-comment');
        var existing = block.querySelector('.sv-comment-badge');
        if (existing) existing.remove();
      });
      var commentsByBlock = {};
      feedbackItems.forEach(function(f) {
        if ((f.type === 'block_comment' || f.type === 'text_selection') && !f.resolved) {
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
            openCommentPanel(blockId);
          };
          block.appendChild(badge);
        }
      });
    }

    // Block-level comments (now via panel)
    function openBlockComment(blockId) {
      openCommentPanel(blockId);
    }

    function submitBlockComment(blockId) {
      var input = document.querySelector('.sv-feedback-input[data-block="' + blockId + '"]');
      var ta = input ? input.querySelector('textarea') : null;
      if (!ta || !ta.value.trim()) return;
      saveFeedback({
        type: 'block_comment',
        id: 'fb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        blockId: blockId,
        version: currentVersion,
        text: ta.value.trim(),
        createdAt: new Date().toISOString(),
        resolved: false
      });
      ta.value = '';
      if (input) input.classList.remove('open');
      renderCommentList();
      updateBlockHighlights();
    }

    // Text selection comments (now via panel, no prompt())
    var selToolbar = document.getElementById('sv-selection-toolbar');
    var pendingSelection = null;

    document.addEventListener('mouseup', function(e) {
      if (e.target.closest('.sv-comment-panel')) return;
      if (e.target.closest('.sv-block-actions')) return;
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
      var rect = range.getBoundingClientRect();
      selToolbar.style.left = (rect.left + rect.width / 2 - 30) + 'px';
      selToolbar.style.top = (rect.top - 35 + window.scrollY) + 'px';
      selToolbar.classList.add('visible');
      var text = sel.toString();
      // Get clean text from content paragraph only (exclude block actions)
      var contentEl = block.querySelector('p') || block.querySelector('.sv-block-content') || block;
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
    });

    function commentOnSelection() {
      if (!pendingSelection) return;
      selToolbar.classList.remove('visible');
      openCommentPanel(pendingSelection.blockId, pendingSelection);
      window.getSelection().removeAllRanges();
    }

    // Inline text editing
    function makeBlockEditable(blockId) {
      var block = document.querySelector('.sv-block[data-block-id="' + blockId + '"]');
      if (!block) return;
      var p = block.querySelector('p');
      if (!p) return;
      // Clean up any existing edit state
      var existingEditActions = block.querySelector('.sv-block-edit-actions');
      if (existingEditActions) existingEditActions.remove();
      if (p.contentEditable === 'true') return; // already editing
      // Store original text
      p.dataset.originalText = p.textContent;
      p.contentEditable = 'true';
      p.focus();
      // Add save/cancel actions
      var existing = block.querySelector('.sv-block-edit-actions');
      if (existing) { existing.classList.add('visible'); return; }
      var actions = document.createElement('div');
      actions.className = 'sv-block-edit-actions visible';
      actions.innerHTML = '<button class="sv-block-edit-btn" onclick="cancelBlockEdit(\\''+blockId+'\\')">Cancel</button>'
        + '<button class="sv-block-edit-btn primary" onclick="saveBlockEdit(\\''+blockId+'\\')">Save edit</button>';
      block.appendChild(actions);
    }

    function saveBlockEdit(blockId) {
      var block = document.querySelector('.sv-block[data-block-id="' + blockId + '"]');
      if (!block) return;
      var p = block.querySelector('p');
      if (!p) return;
      var newText = p.textContent || '';
      p.contentEditable = 'false';
      var actions = block.querySelector('.sv-block-edit-actions');
      if (actions) actions.classList.remove('visible');
      // Save via server
      var base = location.protocol.startsWith('http') ? '' : 'http://localhost:3847';
      fetch(base + '/save-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: window.__svTaskId, blockId: blockId, newText: newText })
      }).then(function() {
        // Show saved indicator
        p.style.outline = '2px solid var(--sv-interactive)';
        setTimeout(function() { p.style.outline = ''; }, 1000);
        showToast('Saved');
      }).catch(function(err) {
        console.error('Save failed:', err);
        // Revert on failure
        p.textContent = p.dataset.originalText || newText;
        showToast('Save failed');
      });
      // Also save as feedback item locally
      saveFeedback({
        type: 'content_edit',
        id: 'edit-' + blockId + '-' + Date.now(),
        blockId: blockId,
        version: currentVersion,
        text: newText,
        createdAt: new Date().toISOString(),
        resolved: false
      });
    }

    function cancelBlockEdit(blockId) {
      var block = document.querySelector('.sv-block[data-block-id="' + blockId + '"]');
      if (!block) return;
      var p = block.querySelector('p');
      if (!p) return;
      p.textContent = p.dataset.originalText || p.textContent;
      p.contentEditable = 'false';
      var actions = block.querySelector('.sv-block-edit-actions');
      if (actions) actions.classList.remove('visible');
    }

    // Init block actions and comment badges for dynamically loaded content
    function initBlockActions() {
      updateBlockHighlights();
      renderCommentList();

      // Add edit buttons and double-click editing to all blocks
      document.querySelectorAll('.sv-block').forEach(function(block) {
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
          if (block.querySelector('[contenteditable="true"]')) return;
          makeBlockEditable(block.dataset.blockId);
        });
      });
    }

    // Keyboard: Enter in comment textarea to submit
    commentTextarea.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submitPanelComment();
      }
    });

    // Init on load
    initBlockActions();
    updateBlockHighlights();
    renderCommentList();

    // Set theme label on init
    (function() {
      var lbl = document.getElementById('sv-toolbar-theme-label');
      if (lbl) lbl.textContent = window.__svTheme === 'day' ? 'Night' : 'Day';
    })();

    // Rebuild sidebar from shared history data (loaded via _history-data.js)
    (function() {
      var container = document.getElementById('sv-sidebar-items');
      if (!container) return;

      // Use shared file data (latest) or fall back to page's baked data
      var raw = window.__svLatestHistory || window.__svHistory || [];
      // Deduplicate by taskId: keep only the latest entry per task
      var seenIds = {};
      var dedupById = [];
      raw.forEach(function(item) {
        if (!seenIds[item.taskId]) {
          seenIds[item.taskId] = true;
          dedupById.push(item);
        }
      });
      // Deduplicate by title: keep most recent entry per title
      var seenTitles = {};
      var best = [];
      dedupById.forEach(function(item) {
        var key = item.title.toLowerCase().trim();
        if (!seenTitles[key]) {
          seenTitles[key] = true;
          best.push(item);
        }
      });
      var taskId = window.__svTaskId || '';
      var typeIcons = {
        email: '\\u2709', tweet: '\\uD83D\\uDCAC', thread: '\\uD83E\\uDDF5',
        message: '\\uD83D\\uDCE8', linkedin: '\\uD83D\\uDCBC', document: '\\uD83D\\uDCC4',
        code: '\\u2328', table: '\\uD83D\\uDCCA', generic: '\\uD83D\\uDCC3'
      };

      function formatTime(iso) {
        var d = new Date(iso);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      }
      function groupByDate(entries) {
        var groups = {};
        var now = new Date();
        var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        var yesterdayStart = todayStart - 86400000;
        entries.forEach(function(e) {
          var t = new Date(e.updatedAt).getTime();
          var label = t >= todayStart ? 'Today' : t >= yesterdayStart ? 'Yesterday' :
            new Date(e.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          if (!groups[label]) groups[label] = [];
          groups[label].push(e);
        });
        return groups;
      }
      function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
      function renderItem(item) {
        var isCurrent = item.taskId === taskId;
        var cls = 'sv-sidebar-item' + (isCurrent ? ' current' : '');
        var href = isCurrent ? '#' : (item.filePath.indexOf('/') >= 0 ? item.filePath.split('/').pop() : item.filePath);
        var target = isCurrent ? '' : ' target="_blank"';
        var icon = typeIcons[item.type] || '\\uD83D\\uDCC3';
        var meta = formatTime(item.updatedAt);
        if (item.versions > 1) meta += ' <span class="sv-sidebar-badge">' + item.versions + 'v</span>';
        if ((item.feedbackCount || 0) > 0) meta += ' <span class="sv-sidebar-feedback-badge">' + item.feedbackCount + '</span>';
        return '<a class="' + cls + '" href="' + esc(href) + '"' + target + ' title="' + esc(item.title) + '">'
          + '<span>' + icon + '</span>'
          + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(item.title) + '</span>'
          + '<span class="sv-sidebar-item-meta">' + meta + '</span></a>';
      }

      if (best.length === 0) {
        container.innerHTML = '<div class="sv-sidebar-empty">Your renders will appear here</div>';
      } else {
        var active = best.filter(function(i) { return (i.feedbackCount || 0) > 0; });
        var rest = best.filter(function(i) { return (i.feedbackCount || 0) === 0; });
        var grouped = groupByDate(rest);
        var html = '';
        if (active.length > 0) {
          html += '<div class="sv-sidebar-group"><div class="sv-sidebar-group-title">Active</div>'
            + active.map(renderItem).join('') + '</div>';
        }
        Object.keys(grouped).forEach(function(label) {
          html += '<div class="sv-sidebar-group"><div class="sv-sidebar-group-title">' + esc(label) + '</div>'
            + grouped[label].map(renderItem).join('') + '</div>';
        });
        container.innerHTML = html;
      }
    })();

    // Hide back button if no history to go back to
    if (window.history.length <= 1) {
      var backBtn = document.getElementById('sv-back-btn');
      if (backBtn) backBtn.style.display = 'none';
    }

    // Sidebar search (filters both Active and History sections)
    var searchInput = document.getElementById('sv-sidebar-search');
    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        var q = e.target.value.toLowerCase();
        document.querySelectorAll('.sv-sidebar-item').forEach(function(item) {
          var text = item.textContent.toLowerCase();
          item.style.display = text.includes(q) ? '' : 'none';
        });
        // Hide group headers when all items are hidden
        document.querySelectorAll('.sv-sidebar-group').forEach(function(group) {
          var visibleItems = group.querySelectorAll('.sv-sidebar-item:not([style*="display: none"])');
          group.style.display = visibleItems.length > 0 ? '' : 'none';
        });
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
      { title: 'Open comments', icon: '\uD83D\uDCAC', shortcut: 'C', action: function() { openCommentPanel(); } },
      { title: 'Copy content', icon: '\uD83D\uDCCB', shortcut: '', action: function() { copyContent(document.querySelector('.sv-copy-btn')); } },
      { title: 'Export feedback', icon: '\uD83D\uDCE4', shortcut: '', action: function() { exportFeedback(); } }
    ];
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

      // Match history items from sidebar
      var sidebarItems = document.querySelectorAll('.sv-sidebar-item');
      var historyResults = [];
      sidebarItems.forEach(function(el) {
        var text = el.textContent.trim();
        var href = el.getAttribute('href');
        if (!href || href === '#') return;
        var match = !q || words.every(function(w) { return text.toLowerCase().includes(w); });
        if (match) {
          historyResults.push({ type: 'history', title: text.replace(/\\s+/g, ' ').trim(), href: href, icon: el.querySelector('span') ? el.querySelector('span').textContent : '\uD83D\uDCC3' });
        }
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
        var subtitleHtml = r.type === 'history' ? '<div class="sv-cmdk-item-subtitle">History</div>' : '';
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
        window.open(item.href, '_blank');
      }
    }

    cmdkInput.addEventListener('input', function() {
      searchCmdK(cmdkInput.value);
    });

    cmdkInput.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); navigateCmdK(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); navigateCmdK(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); selectCmdKItem(); }
      else if (e.key === 'Escape') { cmdkOverlay.style.display = 'none'; }
    });

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
          }
        }
        return;
      }
      // N/P to navigate comments when panel is open
      if (commentPanel.classList.contains('open')) {
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
          if (commentPanel.classList.contains('open')) closeCommentPanel();
          else openCommentPanel();
          break;
        case 'd': case 'D':
          var diff = document.querySelector('.sv-diff-toggle');
          if (diff) diff.click();
          break;
        case 'Escape':
          cmdkOverlay.style.display = 'none';
          selToolbar.classList.remove('visible');
          closeCommentPanel();
          document.querySelectorAll('.sv-feedback-input.open').forEach(function(el) {
            el.classList.remove('open');
          });
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
    var _notesKey = 'sv-notes-${taskId}';
    (function() {
      var notesTextarea = document.getElementById('sv-notes-textarea');
      var notesSaved = document.getElementById('sv-notes-saved');
      if (!notesTextarea) return;
      // Load from feedback items first (server-persisted), then localStorage fallback
      var noteItem = null;
      for (var i = 0; i < feedbackItems.length; i++) {
        if (feedbackItems[i].id === 'notes-general') { noteItem = feedbackItems[i]; break; }
      }
      if (noteItem && noteItem.text) {
        notesTextarea.value = noteItem.text;
        localStorage.setItem(_notesKey, noteItem.text);
      } else {
        var saved = localStorage.getItem(_notesKey);
        if (saved) notesTextarea.value = saved;
      }
      var debounceTimer = null;
      notesTextarea.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() {
          saveNotes();
        }, 800);
      });
    })();
    function saveNotes() {
      var ta = document.getElementById('sv-notes-textarea');
      var indicator = document.getElementById('sv-notes-saved');
      if (!ta) return;
      // Save to localStorage
      localStorage.setItem(_notesKey, ta.value);
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
      // Upsert in feedbackItems
      var found = false;
      for (var i = 0; i < feedbackItems.length; i++) {
        if (feedbackItems[i].id === 'notes-general') {
          feedbackItems[i] = noteItem;
          found = true;
          break;
        }
      }
      if (!found) feedbackItems.push(noteItem);
      localStorage.setItem('sv-feedback-${taskId}', JSON.stringify(feedbackItems));
      tryServerSync(noteItem);
      var now = new Date();
      if (indicator) indicator.textContent = 'Saved ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    // Onboarding hint on first visit
    (function() {
      if (localStorage.getItem('sv-onboarded')) return;
      var firstBlock = document.querySelector('.sv-block');
      if (!firstBlock) return;
      firstBlock.classList.add('sv-onboard-pulse');
      var tip = document.createElement('div');
      tip.className = 'sv-onboard-tooltip';
      tip.textContent = 'Click any block to comment, or select text for inline notes.';
      firstBlock.style.position = 'relative';
      firstBlock.appendChild(tip);
      function dismiss() {
        firstBlock.classList.remove('sv-onboard-pulse');
        if (tip.parentNode) tip.parentNode.removeChild(tip);
        localStorage.setItem('sv-onboarded', '1');
        document.removeEventListener('click', dismiss);
      }
      document.addEventListener('click', dismiss);
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
              saveFeedback({
                type: 'tab_rename',
                id: 'tab-rename-' + idx + '-' + Date.now(),
                blockId: 'variation-tab-' + idx,
                version: currentVersion,
                text: newName,
                createdAt: new Date().toISOString(),
                resolved: false
              });
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

    // Auto-refresh when new content is rendered
    (function() {
      // Only connect SSE if served via HTTP (not file://)
      if (location.protocol === 'file:') return;
      var es;
      var reconnectDelay = 1000;
      function connectSSE() {
        es = new EventSource('/events');
        es.addEventListener('message', function(e) {
          try {
            var data = JSON.parse(e.data);
            if (data.type === 'new_render') {
              location.reload();
            }
          } catch (err) { console.warn('[superview] SSE parse error:', err); }
        });
        es.addEventListener('open', function() { reconnectDelay = 1000; });
        es.addEventListener('error', function() {
          es.close();
          setTimeout(connectSSE, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        });
      }
      connectSSE();
      window.addEventListener('beforeunload', function() { if (es) es.close(); });
    })();
  </script>

  <div class="sv-lightbox" id="sv-lightbox" onclick="closeLightbox()">
    <button class="sv-lightbox-close" onclick="closeLightbox()">&times;</button>
    <img id="sv-lightbox-img" src="" alt="">
  </div>
</body>
</html>`;
}

function buildSidebar(history: HistoryEntry[], currentTaskId: string): string {
  // Step 1: Deduplicate by taskId (keep latest = first occurrence since history is sorted newest-first)
  const seenTaskIds = new Set<string>();
  const dedupedByTaskId = history.filter(item => {
    if (seenTaskIds.has(item.taskId)) return false;
    seenTaskIds.add(item.taskId);
    return true;
  });

  // Step 2: Deduplicate by title (keep most recent, combine version counts)
  const seenTitles = new Set<string>();
  const deduped = dedupedByTaskId.filter(item => {
    const titleKey = item.title.toLowerCase().trim();
    if (seenTitles.has(titleKey)) return false;
    seenTitles.add(titleKey);
    return true;
  });

  // Split into active (has unresolved feedback) and rest
  const activeItems = deduped.filter(item => (item.feedbackCount || 0) > 0);
  const historyItems = deduped.filter(item => !(activeItems.includes(item)));
  const grouped = groupByDate(historyItems);

  function renderItem(item: HistoryEntry): string {
    const isCurrent = item.taskId === currentTaskId;
    const currentClass = isCurrent ? ' current' : '';
    const targetAttr = isCurrent ? '' : ' target="_blank"';
    return `
      <a class="sv-sidebar-item${currentClass}" href="${isCurrent ? '#' : escapeHtml(item.filePath.includes('/') ? item.filePath.split('/').pop()! : item.filePath)}"${targetAttr} title="${escapeHtml(item.title)}">
        <span>${getTypeIcon(item.type)}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(item.title)}</span>
        <span class="sv-sidebar-item-meta">
          ${formatTime(item.updatedAt)}
          ${item.versions > 1 ? `<span class="sv-sidebar-badge">${item.versions}v</span>` : ''}
          ${(item.feedbackCount || 0) > 0 ? `<span class="sv-sidebar-feedback-badge">${item.feedbackCount}</span>` : ''}
        </span>
      </a>`;
  }

  const activeSectionHtml = activeItems.length > 0 ? `
    <div class="sv-sidebar-group">
      <div class="sv-sidebar-group-title">Active</div>
      ${activeItems.map(renderItem).join('')}
    </div>
  ` : '';

  const historyGroupsHtml = Object.entries(grouped).map(([label, items]) => `
    <div class="sv-sidebar-group">
      <div class="sv-sidebar-group-title">${escapeHtml(label)}</div>
      ${items.map(renderItem).join('')}
    </div>
  `).join('');

  return `
    <nav class="sv-sidebar">
      <div class="sv-sidebar-header">Superview</div>
      <a class="sv-sidebar-item sv-sidebar-today" href="_today.html" target="_blank">
        <span>\uD83D\uDCC5</span> <span>Today</span>
      </a>
      <div class="sv-sidebar-search-wrap">
        <input type="text" class="sv-sidebar-search" id="sv-sidebar-search" placeholder="Search...">
        <span class="sv-sidebar-search-hint">\u2318K</span>
      </div>
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

export { escapeHtml };

export function buildTodayPage(todayHistory: HistoryEntry[], allHistory: HistoryEntry[] = []): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const morning = todayHistory.filter(e => new Date(e.updatedAt).getHours() < 12);
  const afternoon = todayHistory.filter(e => { const h = new Date(e.updatedAt).getHours(); return h >= 12 && h < 17; });
  const evening = todayHistory.filter(e => new Date(e.updatedAt).getHours() >= 17);

  function renderCard(item: HistoryEntry): string {
    const time = new Date(item.updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const icon = getTypeIcon(item.type);
    const versionBadge = item.versions > 1 ? `<span class="sv-today-card-badge sv-today-card-badge-version">${item.versions}v</span>` : '';
    const commentBadge = (item.feedbackCount || 0) > 0 ? `<span class="sv-today-card-badge sv-today-card-badge-comment">${item.feedbackCount} comments</span>` : '';
    const preview = item.preview ? `<div class="sv-today-card-preview">${escapeHtml(item.preview)}</div>` : '';

    return `
      <div class="sv-today-card" onclick="window.open('${escapeHtml(item.filePath.includes('/') ? item.filePath.split('/').pop()! : item.filePath)}','_blank')">
        <div class="sv-today-card-header">
          <span class="sv-today-card-icon">${icon}</span>
          <a href="${escapeHtml(item.filePath.includes('/') ? item.filePath.split('/').pop()! : item.filePath)}" target="_blank" class="sv-today-card-title">${escapeHtml(item.title)}</a>
        </div>
        <div class="sv-today-card-meta">
          <span class="sv-today-card-type">${escapeHtml(item.type)}</span>
          ${versionBadge}
          ${commentBadge}
          <span class="sv-today-card-time">${time}</span>
        </div>
        ${preview}
      </div>`;
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

  const emptyState = todayHistory.length === 0
    ? '<div style="text-align:center;padding:3rem 1rem;color:var(--sv-muted);font-size:0.95rem">Nothing rendered today yet. Pipe some content to get started.</div>'
    : '';

  const todayContentHtml = `
    <div style="margin-bottom:2rem">
      <div style="font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--sv-muted);margin-bottom:0.5rem">\uD83D\uDCC5 Today</div>
      <div style="font-size:0.85rem;color:var(--sv-muted)">${todayHistory.length} item${todayHistory.length !== 1 ? 's' : ''} rendered today</div>
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
    feedbackEnabled: true,
    attribution: true,
  });
}
