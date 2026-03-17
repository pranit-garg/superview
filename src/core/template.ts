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
          <button class="sv-accordion-header" onclick="toggleAccordion(this)">
            <svg class="sv-accordion-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="sv-accordion-header-text">
              <strong>v${v.version}</strong>
              <span class="sv-accordion-meta">${escapeHtml(date)}${v.feedbackCount > 0 ? ` &middot; ${v.feedbackCount} comment${v.feedbackCount !== 1 ? 's' : ''}` : ''}</span>
            </span>
          </button>
          <div class="sv-accordion-content">
            <div class="sv-accordion-content-inner">
              ${v.content}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  ` : '';

  const sidebarHtml = !noSidebar && history.length > 0 ? buildSidebar(history, taskId) : '';
  const hasSidebar = !noSidebar && history.length > 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | Superview</title>
  <script>${getThemeScript(theme)}</script>
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

    a { color: var(--sv-accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

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
      padding: 3.5rem 1rem 1rem;
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

    .sv-sidebar-search {
      width: 100%;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--sv-border);
      border-radius: 6px;
      background: var(--sv-bg);
      color: var(--sv-text);
      font-size: 0.875rem;
      margin-bottom: 0.75rem;
      outline: none;
    }
    .sv-sidebar-search:focus { border-color: var(--sv-accent); }
    .sv-sidebar-search::placeholder { color: var(--sv-muted); }

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
      padding: 0.5rem 0.5rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85rem;
      color: var(--sv-text);
      text-decoration: none;
      transition: background 0.15s;
    }
    .sv-sidebar-item:hover { background: var(--sv-bg); text-decoration: none; }
    .sv-sidebar-item.active { background: var(--sv-bg); font-weight: 500; }

    .sv-sidebar-item-meta {
      font-size: 0.75rem;
      color: var(--sv-muted);
      margin-left: auto;
      white-space: nowrap;
    }

    .sv-sidebar-badge {
      background: var(--sv-accent);
      color: #fff;
      font-size: 0.65rem;
      padding: 0.1rem 0.35rem;
      border-radius: 10px;
      font-weight: 600;
    }

    .sv-sidebar-header {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--sv-accent);
      padding-bottom: 0.75rem;
      margin-bottom: 0.5rem;
      border-bottom: 1px solid var(--sv-border);
    }

    .sv-sidebar-item.current {
      background: var(--sv-bg);
      font-weight: 600;
      border-left: 3px solid var(--sv-accent);
      padding-left: calc(0.5rem - 3px);
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

    .sv-sidebar-footer {
      margin-top: auto;
      padding-top: 1rem;
      border-top: 1px solid var(--sv-border);
      display: flex;
      justify-content: space-between;
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
      margin-bottom: 2rem;
    }

    .sv-type-label {
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--sv-muted);
      padding: 0.2rem 0.5rem;
      border: 1px solid var(--sv-border);
      border-radius: 6px;
      margin-bottom: 0.5rem;
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
    }

    .sv-btn {
      padding: 0.35rem 0.75rem;
      font-size: 0.8rem;
      border: 1px solid var(--sv-border);
      border-radius: 6px;
      background: var(--sv-surface);
      color: var(--sv-text);
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .sv-btn:hover { border-color: var(--sv-accent); }
    .sv-btn.active { background: var(--sv-accent); color: #fff; border-color: var(--sv-accent); }

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

    .sv-accordion-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
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
      padding: 0 1rem 1rem;
      border-left: 3px solid var(--sv-accent);
      margin-left: 1rem;
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
      padding: 0.75rem 0;
      border-left: 2px solid transparent;
      margin-left: -0.75rem;
      padding-left: 0.75rem;
      transition: border-color 0.15s;
    }

    .sv-block:hover {
      border-left-color: var(--sv-border);
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
    .sv-block-action:hover { border-color: var(--sv-accent); color: var(--sv-accent); }
    .sv-block-action.reacted { color: var(--sv-accent); border-color: var(--sv-accent); }

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
    .sv-feedback-textarea:focus { border-color: var(--sv-accent); }

    .sv-feedback-submit {
      margin-top: 0.35rem;
      padding: 0.3rem 0.75rem;
      background: var(--sv-accent);
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
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--sv-border);
      flex-shrink: 0;
    }
    .sv-comment-panel-header-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--sv-text);
    }
    .sv-comment-panel-close {
      background: none;
      border: none;
      color: var(--sv-muted);
      cursor: pointer;
      font-size: 1.1rem;
      padding: 0.2rem;
      line-height: 1;
    }
    .sv-comment-panel-close:hover { color: var(--sv-text); }

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
    .sv-comment-item-quote {
      font-size: 0.8rem;
      color: var(--sv-muted);
      font-style: italic;
      padding: 0.25rem 0.5rem;
      border-left: 2px solid var(--sv-gold);
      margin-bottom: 0.35rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
    .sv-comment-resolve-btn:hover { border-color: var(--sv-accent); color: var(--sv-accent); }

    .sv-comment-input-area {
      border-top: 1px solid var(--sv-border);
      padding: 0.75rem;
      flex-shrink: 0;
    }
    .sv-comment-input-area textarea {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid var(--sv-border);
      border-radius: 6px;
      background: var(--sv-bg);
      color: var(--sv-text);
      font-size: 0.85rem;
      font-family: inherit;
      resize: none;
      min-height: 48px;
      outline: none;
    }
    .sv-comment-input-area textarea:focus { border-color: var(--sv-accent); }
    .sv-comment-input-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 0.35rem;
    }
    .sv-comment-submit-btn {
      background: var(--sv-accent);
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 0.3rem 0.75rem;
      font-size: 0.8rem;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .sv-comment-submit-btn:hover { opacity: 0.85; }
    .sv-comment-submit-btn:disabled { opacity: 0.4; cursor: default; }

    /* Block with comments indicator */
    .sv-block.has-comment {
      border-left: 3px solid var(--sv-accent);
      padding-left: 0.75rem;
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
    .sv-block-comment-btn:hover { border-color: var(--sv-accent); color: var(--sv-accent); }

    /* When comment panel is open, adjust main content */
    body.sv-comment-panel-open .sv-main {
      margin-right: 300px;
    }

    /* Feedback highlights */
    .sv-text-highlight {
      background: var(--sv-selection);
      border-bottom: 2px solid var(--sv-accent);
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
      background: rgba(212, 48, 48, 0.15);
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
    .sv-copy-btn.copied::after {
      content: 'Copied!';
      position: absolute;
      top: -1.5rem;
      left: 50%;
      transform: translateX(-50%);
      font-size: 0.7rem;
      color: var(--sv-accent);
      white-space: nowrap;
    }

    /* Footer */
    .sv-footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--sv-border);
      font-size: 0.75rem;
      color: var(--sv-muted);
      text-align: center;
    }
    .sv-footer a { color: var(--sv-muted); }
    .sv-footer a:hover { color: var(--sv-accent); }

    /* Theme toggle */
    #sv-theme-toggle {
      background: none;
      border: 1px solid var(--sv-border);
      border-radius: 50%;
      width: 32px;
      height: 32px;
      font-size: 1rem;
      cursor: pointer;
      color: var(--sv-text);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: border-color 0.15s;
    }
    #sv-theme-toggle:hover { border-color: var(--sv-accent); }

    /* Back button */
    .sv-back-btn {
      display: inline-block;
      font-size: 0.8rem;
      color: var(--sv-muted);
      text-decoration: none;
      margin-bottom: 0.75rem;
      transition: color 0.15s;
    }
    .sv-back-btn:hover { color: var(--sv-accent); text-decoration: none; }

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
    .sv-hamburger:hover { border-color: var(--sv-accent); }

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
      background: var(--sv-accent);
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
            <button class="sv-btn sv-copy-btn" onclick="copyContent(this)">Copy</button>
            ${feedbackEnabled ? `<button class="sv-btn" onclick="exportFeedback()">Export feedback</button>` : ''}
            ${feedbackEnabled ? `<button class="sv-btn" onclick="openCommentPanel()">Comment <span class="sv-kbd">C</span></button>` : ''}
            <button class="sv-btn" onclick="toggleTheme()" id="sv-theme-btn">
              <span class="sv-theme-label"></span>
              <span class="sv-kbd">T</span>
            </button>
            <button class="sv-btn" onclick="openCmdK()">Search <span class="sv-kbd">\u2318K</span></button>
          </div>
        </div>

        <div id="sv-content-area">
          ${contentHtml}
        </div>

        ${diffHtml ? `<div class="sv-diff-container" id="sv-diff-area">${diffHtml}</div>` : ''}

        ${versionAccordionsHtml}

        ${versions.length <= 1 ? `<div style="margin-top:1.5rem;text-align:center;font-size:0.75rem;color:var(--sv-muted)">v1 (current)</div>` : ''}

        ${attribution ? `
          <footer class="sv-footer">
            Built by <a href="https://x.com/Pranit" target="_blank" rel="noopener">Pranit</a> |
            <a href="https://github.com/pranit-garg/superview" target="_blank" rel="noopener">superview</a>
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
  </aside>

  <!-- Command-K Palette -->
  <div class="sv-cmdk-overlay" id="sv-cmdk" style="display:none" onclick="closeCmdK(event)">
    <div class="sv-cmdk-modal" onclick="event.stopPropagation()">
      <input class="sv-cmdk-input" id="sv-cmdk-input" placeholder="Search or jump to..." autocomplete="off">
      <div class="sv-cmdk-results" id="sv-cmdk-results"></div>
    </div>
  </div>

  <script>
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
      var text = area.innerText || area.textContent;
      navigator.clipboard.writeText(text).then(function() {
        btn.classList.add('copied');
        setTimeout(function() { btn.classList.remove('copied'); }, 1500);
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

    function tryServerSync(item) {
      fetch('http://localhost:3847/health').then(function() {
        fetch('http://localhost:3847/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: '${taskId}', item: item })
        }).catch(function() {});
      }).catch(function() {});
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

      var visible = showResolved ? comments : comments.filter(function(c) { return !c.resolved; });
      if (visible.length === 0) {
        commentList.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--sv-muted);font-size:0.85rem;">No comments yet</div>';
        return;
      }
      commentList.innerHTML = visible.map(function(c, idx) {
        var resolvedClass = c.resolved ? ' resolved' : '';
        var quoteHtml = '';
        if (c.anchor && c.anchor.selectedText) {
          var truncated = c.anchor.selectedText.length > 60 ? c.anchor.selectedText.slice(0, 60) + '...' : c.anchor.selectedText;
          quoteHtml = '<div class="sv-comment-item-quote">"' + escapeHtmlInline(truncated) + '"</div>';
        }
        var timeAgo = getTimeAgo(c.createdAt);
        var resolveBtn = c.resolved
          ? '<span style="font-size:0.7rem;color:var(--sv-muted)">Resolved</span>'
          : '<button class="sv-comment-resolve-btn" onclick="resolveComment(event, \'' + c.id + '\')">Resolve</button>';
        return '<div class="sv-comment-item' + resolvedClass + '" data-comment-id="' + c.id + '" onclick="scrollToCommentBlock(\'' + c.blockId + '\')">'
          + '<div class="sv-comment-item-block">' + escapeHtmlInline(c.blockId || 'block') + '</div>'
          + quoteHtml
          + '<div class="sv-comment-item-text">' + escapeHtmlInline(c.text || '') + '</div>'
          + '<div class="sv-comment-item-meta"><span>' + timeAgo + '</span>' + resolveBtn + '</div>'
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

    function scrollToCommentBlock(blockId) {
      var block = document.querySelector('.sv-block[data-block-id="' + blockId + '"]');
      if (block) {
        block.scrollIntoView({ behavior: 'smooth', block: 'center' });
        block.style.outline = '2px solid var(--sv-accent)';
        setTimeout(function() { block.style.outline = ''; }, 1500);
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

    // Quick reactions
    function react(el, blockId, type) {
      el.classList.toggle('reacted');
      saveFeedback({
        type: 'reaction',
        id: 'fb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        blockId: blockId,
        version: currentVersion,
        reaction: type,
        createdAt: new Date().toISOString(),
        resolved: false
      });
    }

    // Text selection comments (now via panel, no prompt())
    var selToolbar = document.getElementById('sv-selection-toolbar');
    var pendingSelection = null;

    document.addEventListener('mouseup', function(e) {
      if (e.target.closest('.sv-comment-panel')) return;
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        selToolbar.classList.remove('visible');
        return;
      }
      var range = sel.getRangeAt(0);
      var block = range.startContainer.parentElement.closest('.sv-block');
      if (!block) { selToolbar.classList.remove('visible'); return; }
      var rect = range.getBoundingClientRect();
      selToolbar.style.left = (rect.left + rect.width / 2 - 30) + 'px';
      selToolbar.style.top = (rect.top - 35 + window.scrollY) + 'px';
      selToolbar.classList.add('visible');
      var text = sel.toString();
      var fullText = block.textContent || '';
      var idx = fullText.indexOf(text);
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

    // Init block actions and comment badges for dynamically loaded content
    function initBlockActions() {
      updateBlockHighlights();
      renderCommentList();
    }

    // Keyboard: Enter in comment textarea to submit
    commentTextarea.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submitPanelComment();
      }
    });

    // Init on load
    updateBlockHighlights();
    renderCommentList();

    // Set theme button labels (avoids document.write)
    (function() {
      var lbl = document.querySelector('#sv-theme-btn .sv-theme-label');
      if (lbl) lbl.textContent = window.__svTheme === 'day' ? 'Night' : 'Day';
      var toggle = document.getElementById('sv-theme-toggle');
      if (toggle) toggle.textContent = window.__svTheme === 'day' ? '\u263E' : '\u2600';
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
    // Add diff toggle if present
    if (document.querySelector('.sv-diff-toggle')) {
      cmdkActions.push({ title: 'Toggle diff', icon: '\u2194', shortcut: 'D', action: function() { toggleDiff(); } });
    }

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
      var matchedActions = cmdkActions.filter(function(a) {
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
  </script>
</body>
</html>`;
}

function buildSidebar(history: HistoryEntry[], currentTaskId: string): string {
  // Split into active (has unresolved feedback) and rest
  const activeItems = history.filter(item => (item.feedbackCount || 0) > 0);
  const historyItems = history.filter(item => !(activeItems.includes(item)));
  const grouped = groupByDate(historyItems);

  function renderItem(item: HistoryEntry): string {
    const isCurrent = item.taskId === currentTaskId;
    const currentClass = isCurrent ? ' current' : '';
    const targetAttr = isCurrent ? '' : ' target="_blank"';
    return `
      <a class="sv-sidebar-item${currentClass}" href="${isCurrent ? '#' : escapeHtml(item.filePath)}"${targetAttr} title="${escapeHtml(item.title)}">
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
      <a class="sv-sidebar-item" href="_today.html" target="_blank" style="font-weight:600;margin-bottom:0.5rem;color:var(--sv-accent)">
        <span>\uD83D\uDCC5</span> <span>Today</span>
      </a>
      <input type="text" class="sv-sidebar-search" id="sv-sidebar-search" placeholder="Search...">
      ${activeSectionHtml}
      ${historyGroupsHtml}
      <div class="sv-sidebar-footer">
        <button id="sv-theme-toggle" onclick="toggleTheme()" aria-label="Toggle theme"></button>
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

export function buildTodayPage(history: HistoryEntry[]): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const morning = history.filter(e => new Date(e.updatedAt).getHours() < 12);
  const afternoon = history.filter(e => { const h = new Date(e.updatedAt).getHours(); return h >= 12 && h < 17; });
  const evening = history.filter(e => new Date(e.updatedAt).getHours() >= 17);

  function renderCard(item: HistoryEntry): string {
    const time = new Date(item.updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const icon = getTypeIcon(item.type);
    const versionBadge = item.versions > 1 ? `<span style="background:var(--sv-accent);color:#fff;font-size:0.6rem;padding:0.1rem 0.35rem;border-radius:10px;font-weight:600">${item.versions}v</span>` : '';
    const commentBadge = (item.feedbackCount || 0) > 0 ? `<span style="background:var(--sv-gold);color:#fff;font-size:0.6rem;padding:0.1rem 0.35rem;border-radius:10px;font-weight:600">${item.feedbackCount} comments</span>` : '';
    const preview = item.preview ? `<div style="font-size:0.8rem;color:var(--sv-muted);margin-top:0.5rem;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escapeHtml(item.preview)}</div>` : '';

    return `
      <div style="background:var(--sv-surface);border:1px solid var(--sv-border);border-radius:10px;padding:1rem;transition:box-shadow 0.15s;cursor:pointer" onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'" onclick="window.open('${escapeHtml(item.filePath)}','_blank')">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.35rem">
          <span style="font-size:1.1rem">${icon}</span>
          <a href="${escapeHtml(item.filePath)}" target="_blank" style="font-weight:600;font-size:0.95rem;color:var(--sv-text);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(item.title)}</a>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
          <span style="font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--sv-muted);padding:0.15rem 0.4rem;border:1px solid var(--sv-border);border-radius:6px">${escapeHtml(item.type)}</span>
          ${versionBadge}
          ${commentBadge}
          <span style="font-size:0.75rem;color:var(--sv-muted);margin-left:auto">${time}</span>
        </div>
        ${preview}
      </div>`;
  }

  function renderSection(label: string, emoji: string, items: HistoryEntry[]): string {
    if (items.length === 0) return '';
    return `
      <div style="margin-bottom:2rem">
        <div style="font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--sv-muted);margin-bottom:0.75rem">${emoji} ${escapeHtml(label)}</div>
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          ${items.map(renderCard).join('')}
        </div>
      </div>`;
  }

  const emptyState = history.length === 0
    ? '<div style="text-align:center;padding:3rem 1rem;color:var(--sv-muted);font-size:0.95rem">Nothing rendered today yet. Pipe some content to get started.</div>'
    : '';

  const GRAIN_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='grain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23grain)'/%3E%3C/svg%3E")`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Today | Superview</title>
  <style>
    :root {
      --sv-bg: #F5F2E8;
      --sv-surface: #FEFCF6;
      --sv-text: #1C1C1A;
      --sv-muted: #6A6B5E;
      --sv-border: rgba(28,28,26,0.12);
      --sv-accent: #2A7047;
      --sv-gold: #B8860B;
      --sv-selection: rgba(42,112,71,0.12);
      --sv-card-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    html.night {
      --sv-bg: #1A1A18;
      --sv-surface: #242422;
      --sv-text: #E8E6DF;
      --sv-muted: #8A8B7E;
      --sv-border: rgba(232,230,223,0.1);
      --sv-accent: #3D9960;
      --sv-gold: #D4A017;
      --sv-selection: rgba(61,153,96,0.15);
      --sv-card-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { -webkit-font-smoothing: antialiased; }
    body {
      background: var(--sv-bg);
      color: var(--sv-text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.5;
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
    a { color: var(--sv-accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
  <script>
    (function() {
      var stored = localStorage.getItem('sv-theme');
      if (stored === 'night' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('night');
      }
    })();
  </script>
</head>
<body>
  <div style="max-width:720px;margin:0 auto;padding:2rem 1rem">
    <div style="margin-bottom:2rem">
      <div style="font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--sv-muted);margin-bottom:0.5rem">\uD83D\uDCC5 Today</div>
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:1.75rem;font-weight:600;letter-spacing:-0.01em;margin-bottom:0.25rem">${escapeHtml(dateStr)}</h1>
      <div style="font-size:0.85rem;color:var(--sv-muted)">${history.length} item${history.length !== 1 ? 's' : ''} rendered today</div>
    </div>

    ${emptyState}
    ${renderSection('Morning', '\u2600\uFE0F', morning)}
    ${renderSection('Afternoon', '\u2601\uFE0F', afternoon)}
    ${renderSection('Evening', '\uD83C\uDF19', evening)}

    <footer style="margin-top:3rem;padding-top:1.5rem;border-top:1px solid var(--sv-border);font-size:0.75rem;color:var(--sv-muted);text-align:center">
      Built by <a href="https://x.com/Pranit" target="_blank" rel="noopener">Pranit</a> |
      <a href="https://github.com/pranit-garg/superview" target="_blank" rel="noopener">superview</a>
    </footer>
  </div>
</body>
</html>`;
}
