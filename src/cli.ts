import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, renameSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { render } from './core/renderer.js';
import { buildTodayPage } from './core/template.js';
import { ensureDir, appendHistory, readHistory, readTodayHistory, getVariants, getLatestTaskId } from './core/history.js';
import { readFeedback, summarizeFeedback } from './core/feedback.js';
import { startServer, tryAutoStart } from './core/server.js';
import type { ContentType, ThemeMode, HistoryEntry } from './types.js';

const HELP = `
superview - Render AI output as beautiful, reviewable HTML

Usage:
  superview render <file|->     Render content and open in browser
  superview comment <file|->    Render with comment mode enabled
  superview history             Open history browser
  superview feedback <id>       View/export feedback for a task (JSON)
  superview feedback --summary <id>  Human-readable feedback summary
  superview feedback --json <id>     Structured JSON feedback output
  superview feedback --latest       View feedback for most recent render
  superview feedback --latest --json  Structured JSON of latest feedback
  superview feedback --latest --summary  Human-readable latest feedback summary
  superview keep <task-id>      Keep a temp view (remove -temp suffix)
  superview today [--open]      Generate today page, optionally open it
  superview setup-claude        Print CLAUDE.md integration snippet
  superview serve               Start local server (real-time feedback)
  superview init                Initialize .superview/ in current dir
  superview clean               Remove temp views older than 7 days
  superview "<text>"            Shorthand: render inline content

Options:
  --type <type>       Content type: email|tweet|thread|message|linkedin|document|code|table|generic
  --title <title>     Page title
  --theme <mode>      Theme: day|night|auto (default: auto)
  --content <text>    Inline content string (instead of file)
  --metadata <json>   JSON metadata object
  --variant-of <id>   Mark as variant of another task
  --variant-name <n>  Label this render as a named variant (metadata only)
  --base-dir <path>   Base directory (default: cwd)
  --images <paths>    Comma-separated image paths or URLs
  --latest            Use most recent task ID (for feedback command)
  --no-open           Don't auto-open in browser
  --no-sidebar        Hide history sidebar
  --with-fonts        Embed Google Fonts (default)
  --no-fonts          Disable embedded Google Fonts
  --out <path>        Custom output path
  --task-id <id>      Task identifier for feedback tracking
  --version <n>       Version number (for iteration)
  --previous <file>   Previous version file (for diff)
  -h, --help          Show this help
  -v, --version       Show version
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log(HELP.trim());
    process.exit(0);
  }

  if (args.includes('-v') || (args.includes('--version') && args.length === 1)) {
    console.log('0.3.0');
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'render':
    case 'comment':
      await handleRender(args.slice(1), command === 'comment');
      break;
    case 'history':
      await handleHistory();
      break;
    case 'feedback':
      handleFeedback(args.slice(1));
      break;
    case 'serve':
      handleServe(args.slice(1));
      break;
    case 'init':
      handleInit();
      break;
    case 'clean':
      handleClean();
      break;
    case 'keep':
      handleKeep(args.slice(1));
      break;
    case 'today':
      handleToday(args.slice(1));
      break;
    case 'setup-claude':
      handleSetupClaude();
      break;
    default:
      if (!command.startsWith('-') && !['render','comment','history','feedback','serve','init','clean','keep','today','setup-claude'].includes(command)) {
        // Treat as shorthand: superview "text here"
        await handleRender(['--content', command, ...args.slice(1)], false);
      } else {
        await handleRender(args, false);
      }
      break;
  }
}

async function handleRender(args: string[], commentMode: boolean): Promise<void> {
  const options = parseRenderArgs(args);
  const base = options.baseDir || process.cwd();
  let content: string;

  if (options.content) {
    content = options.content;
  } else if (options.file === '-' || !options.file) {
    content = await readStdin();
  } else {
    const filePath = resolve(options.file);
    if (!existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }
    content = readFileSync(filePath, 'utf-8');
  }

  if (!content.trim()) {
    console.error('Error: No content to render');
    process.exit(1);
  }

  // Auto-detect previous version for same task-id
  const dir = ensureDir(base);
  const contentDir = join(dir, 'content');
  if (!existsSync(contentDir)) mkdirSync(contentDir, { recursive: true });

  const taskId = options.taskId || `sv-${Date.now()}`;
  const contentPath = join(contentDir, `${taskId}.txt`);

  let previousContent: string | undefined;
  if (options.previous) {
    // Explicit --previous flag takes priority
    const prevPath = resolve(options.previous);
    if (existsSync(prevPath)) {
      previousContent = readFileSync(prevPath, 'utf-8');
    }
  } else if (existsSync(contentPath)) {
    // Auto-load previous content for this task
    const savedContent = readFileSync(contentPath, 'utf-8');
    if (savedContent !== content) {
      previousContent = savedContent;
    }
  }

  // Auto-detect version number
  let version = options.version ? parseInt(options.version) : 1;
  if (!options.version && previousContent) {
    const existingHistory = readHistory(base);
    const taskHistory = existingHistory.filter(e => e.taskId === taskId);
    version = taskHistory.length + 1;
  }

  // Save current content for future version tracking
  writeFileSync(contentPath, content, 'utf-8');

  const metadata = options.metadata ? JSON.parse(options.metadata) : undefined;

  // Process images
  let images: string[] | undefined;
  if (options.images) {
    images = options.images.split(',').map(p => p.trim()).filter(Boolean);
  }

  // Merge images into metadata
  const finalMetadata = { ...metadata };
  if (images && images.length > 0) {
    finalMetadata.images = images;
  }

  const html = await render(content, {
    type: options.type as ContentType | undefined,
    title: options.title,
    theme: (options.theme as ThemeMode) || 'auto',
    noOpen: options.noOpen,
    noSidebar: options.noSidebar,
    withFonts: options.withFonts,
    taskId,
    version,
    previousContent,
    out: options.out,
    metadata: finalMetadata,
    basePath: base,
  });

  // Determine output path
  const viewsDir = join(dir, 'views');
  if (!existsSync(viewsDir)) mkdirSync(viewsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = options.title
    ? options.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
    : 'output';
  const outPath = options.out || join(viewsDir, `${timestamp}-${name}-temp.html`);

  writeFileSync(outPath, html, 'utf-8');

  // Also write as _latest.html for server serving (atomic write)
  const latestPath = join(viewsDir, '_latest.html');
  const latestTmpPath = join(viewsDir, `_latest.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(latestTmpPath, html, 'utf-8');
  renameSync(latestTmpPath, latestPath);

  console.log(`Written to: ${outPath}`);
  console.log(`View at: http://localhost:3847`);

  // Auto-start feedback server in background
  const serverStarted = await tryAutoStart(base);
  if (serverStarted) {
    console.log('[superview] Feedback server running (auto-started).');
  }

  // Record in history
  const entry: HistoryEntry = {
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    taskId,
    title: options.title || name,
    type: (options.type as ContentType) || 'generic',
    versions: version,
    feedbackCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    filePath: basename(outPath),
    kept: false,
    variantOf: options.variantOf,
    preview: content.replace(/[#*_\-\n]+/g, ' ').trim().slice(0, 120),
  };
  appendHistory(base, entry);
  generateTodayPage(base);

  // Notify connected browsers of new render
  try {
    const http = await import('node:http');
    const notifyReq = http.request(
      { hostname: '127.0.0.1', port: 3847, path: '/notify', method: 'POST', timeout: 1000 },
      () => {} // ignore response
    );
    notifyReq.on('error', () => {}); // ignore errors
    notifyReq.end();
  } catch {
    // Server not running yet, no problem
  }

  // Open in browser
  if (!options.noOpen) {
    openBrowser('http://localhost:3847');
  }
}

function generateTodayPage(basePath: string): void {
  try {
    const todayEntries = readTodayHistory(basePath);
    const allHistory = readHistory(basePath);
    const html = buildTodayPage(todayEntries, allHistory);
    const dir = ensureDir(basePath);
    const viewsDir = join(dir, 'views');
    if (!existsSync(viewsDir)) mkdirSync(viewsDir, { recursive: true });
    writeFileSync(join(viewsDir, '_today.html'), html, 'utf-8');
    writeHistoryData(basePath);
  } catch {
    // Silently fail - today page is non-critical
  }
}

function deduplicateHistory(history: HistoryEntry[]): HistoryEntry[] {
  const seen = new Set<string>();
  return history.filter(entry => {
    if (seen.has(entry.taskId)) return false;
    seen.add(entry.taskId);
    return true;
  });
}

function writeHistoryData(basePath: string): void {
  try {
    const history = deduplicateHistory(readHistory(basePath));
    const dir = ensureDir(basePath);
    const viewsDir = join(dir, 'views');
    if (!existsSync(viewsDir)) mkdirSync(viewsDir, { recursive: true });
    // Strip to basename for all entries (handles legacy absolute paths)
    const historyForJs = history.map(e => ({
      ...e,
      filePath: basename(e.filePath),
    }));
    const js = `window.__svLatestHistory = ${JSON.stringify(historyForJs)};`;
    writeFileSync(join(viewsDir, '_history-data.js'), js, 'utf-8');
  } catch {
    // Non-critical
  }
}

async function handleHistory(): Promise<void> {
  const history = readHistory(process.cwd());
  if (history.length === 0) {
    console.log('No history yet. Render something first: superview render <file>');
    return;
  }

  // Build a simple history HTML and open it
  const html = buildHistoryPage(history);
  const dir = ensureDir(process.cwd());
  const viewsDir = join(dir, 'views');
  if (!existsSync(viewsDir)) mkdirSync(viewsDir, { recursive: true });
  const outPath = join(viewsDir, '_history.html');
  writeFileSync(outPath, html, 'utf-8');
  openBrowser(outPath);
}

function handleFeedback(args: string[]): void {
  const summary = args.includes('--summary');
  const jsonMode = args.includes('--json');
  const useLatest = args.includes('--latest');

  let taskId: string | undefined;
  if (useLatest) {
    const latest = getLatestTaskId(process.cwd());
    if (!latest) {
      console.error('No history found. Render something first.');
      process.exit(1);
    }
    taskId = latest;
  } else {
    taskId = args.find((a) => !a.startsWith('-'));
  }

  if (!taskId) {
    console.error('Usage: superview feedback [--summary|--json] [--latest|<task-id>]');
    process.exit(1);
  }
  if (summary) {
    console.log(summarizeFeedback(process.cwd(), taskId));
    return;
  }
  const feedback = readFeedback(process.cwd(), taskId);
  if (jsonMode) {
    const items = feedback?.items || [];
    const unresolved = items.filter((item) => !item.resolved);
    const output = {
      taskId,
      unresolvedCount: unresolved.length,
      comments: items.map((item) => ({
        blockId: item.blockId,
        text: item.text || '',
        anchor: item.anchor || null,
        resolved: item.resolved,
      })),
      notes: '',
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  if (!feedback) {
    console.log(`No feedback found for task: ${taskId}`);
    return;
  }
  console.log(JSON.stringify(feedback, null, 2));
}

function handleServe(args: string[]): void {
  const portArg = args.indexOf('--port');
  const port = portArg >= 0 ? parseInt(args[portArg + 1]) : 3847;
  const baseDirArg = args.indexOf('--base-dir');
  const baseDir = baseDirArg >= 0 ? resolve(args[baseDirArg + 1]) : process.cwd();
  startServer(baseDir, port);
  console.log(`[superview] Feedback server running at ${baseDir}. Press Ctrl+C to stop.`);
}

function handleInit(): void {
  const dir = ensureDir(process.cwd());
  const configPath = join(dir, 'config.json');
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify({
      theme: 'auto',
      port: 3847,
      attribution: true,
    }, null, 2), 'utf-8');
  }
  console.log(`Initialized .superview/ at ${dir}`);
}

function handleClean(): void {
  const dir = join(process.cwd(), '.superview', 'views');
  if (!existsSync(dir)) {
    console.log('Nothing to clean.');
    return;
  }

  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let count = 0;

  for (const file of readdirSync(dir)) {
    if (!file.endsWith('-temp.html')) continue;
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    if (stat.mtimeMs < cutoff) {
      unlinkSync(fullPath);
      count++;
    }
  }

  console.log(`Cleaned ${count} temp file${count !== 1 ? 's' : ''}.`);
}

interface RenderArgs {
  file?: string;
  type?: string;
  title?: string;
  theme?: string;
  noOpen: boolean;
  noSidebar: boolean;
  withFonts: boolean;
  out?: string;
  taskId?: string;
  version?: string;
  previous?: string;
  content?: string;
  metadata?: string;
  variantOf?: string;
  variantName?: string;
  baseDir?: string;
  images?: string;
}

function parseRenderArgs(args: string[]): RenderArgs {
  const result: RenderArgs = {
    noOpen: false,
    noSidebar: false,
    withFonts: true,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case '--type':
        result.type = args[++i];
        break;
      case '--title':
        result.title = args[++i];
        break;
      case '--theme':
        result.theme = args[++i];
        break;
      case '--no-open':
        result.noOpen = true;
        break;
      case '--no-sidebar':
        result.noSidebar = true;
        break;
      case '--with-fonts':
        result.withFonts = true;
        break;
      case '--no-fonts':
        result.withFonts = false;
        break;
      case '--out':
        result.out = args[++i];
        break;
      case '--task-id':
        result.taskId = args[++i];
        break;
      case '--version':
        result.version = args[++i];
        break;
      case '--previous':
        result.previous = args[++i];
        break;
      case '--content':
        result.content = args[++i];
        break;
      case '--metadata':
        result.metadata = args[++i];
        break;
      case '--variant-of':
        result.variantOf = args[++i];
        break;
      case '--variant-name':
        result.variantName = args[++i];
        break;
      case '--base-dir':
        result.baseDir = args[++i];
        break;
      case '--images':
        result.images = args[++i];
        break;
      default:
        if (!arg.startsWith('-')) {
          result.file = arg;
        }
        break;
    }
    i++;
  }

  return result;
}

function handleKeep(args: string[]): void {
  const taskId = args.find((a) => !a.startsWith('-'));
  if (!taskId) {
    console.error('Usage: superview keep <task-id>');
    process.exit(1);
  }
  const history = readHistory(process.cwd());
  const entries = history.filter((e) => e.taskId === taskId);
  if (entries.length === 0) {
    console.error(`No history found for task: ${taskId}`);
    process.exit(1);
  }
  const latest = entries[0]; // Already sorted by updatedAt desc
  if (!latest.filePath.endsWith('-temp.html')) {
    console.log(`Already kept: ${latest.filePath}`);
    return;
  }
  const newPath = latest.filePath.replace(/-temp\.html$/, '.html');
  renameSync(latest.filePath, newPath);
  // Rewrite history with updated entry
  const allEntries = readHistory(process.cwd());
  const dir = ensureDir(process.cwd());
  const historyPath = join(dir, 'history.jsonl');
  const updated = allEntries.map((e) => {
    if (e.id === latest.id) {
      return { ...e, kept: true, filePath: newPath };
    }
    return e;
  });
  writeFileSync(historyPath, updated.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
  console.log(`Kept: ${newPath}`);
}

function handleToday(args: string[]): void {
  generateTodayPage(process.cwd());
  const dir = ensureDir(process.cwd());
  const todayPath = join(dir, 'views', '_today.html');
  const url = `file://${resolve(todayPath)}`;
  console.log(url);
  if (args.includes('--open')) {
    openBrowser(todayPath);
  }
}

function handleSetupClaude(): void {
  const snippet = `## Superview Integration

When creating content (tweets, threads, emails, messages, documents):

1. Write content to a temp file:
   \`echo "content" > /tmp/sv-draft.md\`

2. Render with superview:
   \`npx superview render /tmp/sv-draft.md --type <type> --title "<title>" --task-id "<id>" --no-open\`

3. Tell the user: "Rendered at [path]. Open to review and leave comments."

4. When user says "iterate" or "v2":
   \`npx superview feedback --json <id>\`
   Parse the output, improve content, render v2 with --version 2 --previous.`;
  console.log(snippet);
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk: string) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function openBrowser(target: string): void {
  const toOpen = target.startsWith('http') ? target : resolve(target);
  if (process.platform === 'darwin') {
    spawn('open', [toOpen], { stdio: 'ignore', detached: true }).unref();
  } else if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', toOpen], { stdio: 'ignore', detached: true }).unref();
  } else {
    spawn('xdg-open', [toOpen], { stdio: 'ignore', detached: true }).unref();
  }
}

function buildHistoryPage(history: HistoryEntry[]): string {
  const rows = history.map(h => `
    <tr>
      <td><a href="${basename(h.filePath)}">${escapeHtml(h.title)}</a></td>
      <td>${h.type}</td>
      <td>${h.versions}</td>
      <td>${new Date(h.updatedAt).toLocaleString()}</td>
      <td>${h.kept ? 'Kept' : 'Temp'}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Superview History</title>
<style>
  body { font-family: system-ui; max-width: 900px; margin: 2rem auto; padding: 0 1rem; background: #F5F2E8; color: #1C1C1A; }
  h1 { font-family: Georgia, serif; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.5rem; text-align: left; border-bottom: 1px solid rgba(28,28,26,0.1); }
  th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6A6B5E; }
  a { color: #2A7047; }
</style>
</head><body>
<h1>Superview History</h1>
<table><tr><th>Title</th><th>Type</th><th>Versions</th><th>Updated</th><th>Status</th></tr>
${rows}
</table></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
