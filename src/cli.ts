import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, renameSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { exec } from 'node:child_process';
import { render } from './core/renderer.js';
import { buildTodayPage } from './core/template.js';
import { ensureDir, appendHistory, readHistory, readTodayHistory } from './core/history.js';
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
  superview serve               Start local server (real-time feedback)
  superview init                Initialize .superview/ in current dir
  superview clean               Remove temp views older than 7 days

Options:
  --type <type>       Content type: email|tweet|thread|message|linkedin|document|code|table|generic
  --title <title>     Page title
  --theme <mode>      Theme: day|night|auto (default: auto)
  --no-open           Don't auto-open in browser
  --no-sidebar        Hide history sidebar
  --with-fonts        Embed Google Fonts
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
    console.log('0.2.1');
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
    default:
      // Treat as file path: superview draft.md
      await handleRender(args, false);
      break;
  }
}

async function handleRender(args: string[], commentMode: boolean): Promise<void> {
  const options = parseRenderArgs(args);
  let content: string;

  if (options.file === '-' || !options.file) {
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

  let previousContent: string | undefined;
  if (options.previous) {
    const prevPath = resolve(options.previous);
    if (existsSync(prevPath)) {
      previousContent = readFileSync(prevPath, 'utf-8');
    }
  }

  const html = await render(content, {
    type: options.type as ContentType | undefined,
    title: options.title,
    theme: (options.theme as ThemeMode) || 'auto',
    noOpen: options.noOpen,
    noSidebar: options.noSidebar,
    withFonts: options.withFonts,
    taskId: options.taskId,
    version: options.version ? parseInt(options.version) : undefined,
    previousContent,
    out: options.out,
  });

  // Determine output path
  const dir = ensureDir(process.cwd());
  const viewsDir = join(dir, 'views');
  if (!existsSync(viewsDir)) mkdirSync(viewsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = options.title
    ? options.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
    : 'output';
  const outPath = options.out || join(viewsDir, `${timestamp}-${name}-temp.html`);

  writeFileSync(outPath, html, 'utf-8');
  console.log(`Written to: ${outPath}`);

  // Auto-start feedback server in background
  const serverStarted = await tryAutoStart(process.cwd());
  if (serverStarted) {
    console.log('[superview] Feedback server running (auto-started).');
  }

  // Record in history
  const taskId = options.taskId || `sv-${Date.now()}`;
  const entry: HistoryEntry = {
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    taskId,
    title: options.title || name,
    type: (options.type as ContentType) || 'generic',
    versions: options.version ? parseInt(options.version) : 1,
    feedbackCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    filePath: outPath,
    kept: false,
    preview: content.replace(/[#*_\-\n]+/g, ' ').trim().slice(0, 120),
  };
  appendHistory(process.cwd(), entry);
  generateTodayPage(process.cwd());

  // Open in browser
  if (!options.noOpen) {
    openBrowser(outPath);
  }
}

function generateTodayPage(basePath: string): void {
  try {
    const todayEntries = readTodayHistory(basePath);
    const html = buildTodayPage(todayEntries);
    const dir = ensureDir(basePath);
    const viewsDir = join(dir, 'views');
    if (!existsSync(viewsDir)) mkdirSync(viewsDir, { recursive: true });
    writeFileSync(join(viewsDir, '_today.html'), html, 'utf-8');
  } catch {
    // Silently fail - today page is non-critical
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
  const taskId = args.find((a) => !a.startsWith('-'));
  if (!taskId) {
    console.error('Usage: superview feedback [--summary] <task-id>');
    process.exit(1);
  }
  if (summary) {
    console.log(summarizeFeedback(process.cwd(), taskId));
    return;
  }
  const feedback = readFeedback(process.cwd(), taskId);
  if (!feedback) {
    console.log(`No feedback found for task: ${taskId}`);
    return;
  }
  console.log(JSON.stringify(feedback, null, 2));
}

function handleServe(args: string[]): void {
  const portArg = args.indexOf('--port');
  const port = portArg >= 0 ? parseInt(args[portArg + 1]) : 3847;
  startServer(process.cwd(), port);
  console.log(`[superview] Feedback server running. Press Ctrl+C to stop.`);
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
}

function parseRenderArgs(args: string[]): RenderArgs {
  const result: RenderArgs = {
    noOpen: false,
    noSidebar: false,
    withFonts: false,
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

function openBrowser(filePath: string): void {
  const absPath = resolve(filePath);
  const platform = process.platform;
  let cmd: string;

  if (platform === 'darwin') {
    cmd = `open "${absPath}"`;
  } else if (platform === 'win32') {
    cmd = `start "" "${absPath}"`;
  } else {
    cmd = `xdg-open "${absPath}"`;
  }

  exec(cmd, (err) => {
    if (err) console.error(`Could not open browser: ${err.message}`);
  });
}

function buildHistoryPage(history: HistoryEntry[]): string {
  const rows = history.map(h => `
    <tr>
      <td><a href="${h.filePath}">${escapeHtml(h.title)}</a></td>
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
