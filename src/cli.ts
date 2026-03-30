import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, renameSync, statSync, realpathSync } from 'node:fs';
import { join, resolve, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { render } from './core/renderer.js';
import { ensureDir, appendHistory, readHistory, getVariants, buildHistoryPreview } from './core/history.js';
import { getLatestReviewTaskId, importReviewBundle, readReviewBundle, readReviewBundleFromHtml, readReviewBundleFromPath, summarizeReviewBundle } from './core/feedback.js';
import { buildReviewMachinePayload } from './core/review.js';
import { startServer, tryAutoStart } from './core/server.js';
import { syncWorkspaceArtifacts } from './core/sync.js';
import { readCanonicalContentSnapshot, upsertTaskContentManifest } from './core/task-content.js';
import type { ContentType, ThemeMode, HistoryEntry, ReviewBundle } from './types.js';

const HELP = `
superview - Render AI output to file-first review HTML

Usage:
  superview render <file|->        Render content and open in browser
  superview comment <file|->       Render with comment mode enabled
  superview history                Open history browser
  superview review <id>            View/export the canonical review bundle
  superview review --summary <id>  Human-readable review summary
  superview review --json <id>     Structured JSON review output
  superview review --latest        View the most recently updated review bundle
  superview review --latest --json  Structured JSON of latest review
  superview review --latest --summary  Human-readable latest review summary
  superview content --latest       Print latest canonical content
  superview content --latest --json  Structured JSON of latest canonical content
  superview inbox ...              Agent-facing alias for \`review\`
  superview feedback ...           Alias for \`review\`
  superview import-review <file>   Import a review bundle JSON file
  superview keep <task-id>         Keep a temp view (remove -temp suffix)
  superview today [--open]         Generate today page, optionally open it
  superview sync                   Rebuild shared history assets for this folder
  superview setup-claude           Print CLAUDE.md integration snippet
  superview serve                  Start local server (real-time feedback)
  superview init                   Initialize .superview/ in current dir
  superview clean                  Remove temp views older than 7 days
  superview "<text>"               Shorthand: render inline content

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
  --latest            Use most recent review task ID
  --no-open           Don't auto-open in browser
  --no-sidebar        Hide history sidebar
  --with-fonts        Embed Google Fonts
  --no-fonts          Disable embedded Google Fonts (default)
  --out <path>        Custom output path
  --view <path>       Read/export a review bundle or content target from a saved HTML or JSON file
  --task-id <id>      Task identifier for review tracking
  --version <n>       Version number (for iteration)
  --previous <file>   Previous version file (for diff)
  -h, --help          Show this help
  -v, --version       Show version
`;

export async function runCli(args: string[]): Promise<void> {
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log(HELP.trim());
    process.exit(0);
  }

  if (args.includes('-v') || (args.includes('--version') && args.length === 1)) {
    console.log('0.3.1');
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'render':
    case 'comment':
      await handleRender(args.slice(1), command === 'comment');
      break;
    case 'history':
      await handleHistory(args.slice(1));
      break;
    case 'review':
    case 'inbox':
    case 'feedback':
      handleReview(args.slice(1));
      break;
    case 'content':
      handleContent(args.slice(1));
      break;
    case 'import-review':
      handleImportReview(args.slice(1));
      break;
    case 'serve':
      handleServe(args.slice(1));
      break;
    case 'init':
      handleInit(args.slice(1));
      break;
    case 'clean':
      handleClean(args.slice(1));
      break;
    case 'keep':
      handleKeep(args.slice(1));
      break;
    case 'today':
      handleToday(args.slice(1));
      break;
    case 'sync':
      handleSync(args.slice(1));
      break;
    case 'setup-claude':
      handleSetupClaude();
      break;
    default:
      if (!command.startsWith('-') && !['render','comment','history','review','inbox','feedback','content','import-review','serve','init','clean','keep','today','sync','setup-claude'].includes(command)) {
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
  const resolvedSourcePath = options.file && options.file !== '-' && !options.content ? resolve(options.file) : null;
  const sourceKind = resolvedSourcePath
    ? (/\.(md|mdx|markdown)$/i.test(resolvedSourcePath) ? 'markdown' : 'file')
    : null;

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
  if (options.variantOf) {
    finalMetadata.variantOf = options.variantOf;
  }
  if (options.variantName) {
    finalMetadata.variantName = options.variantName;
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
    commentMode,
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

  const fileViewTarget = `file://${resolve(outPath)}`;
  const serverStarted = options.noOpen ? false : await tryAutoStart(base);
  const liveViewTarget = serverStarted ? 'http://localhost:3847' : '';

  console.log(`Written to: ${outPath}`);
  console.log(`Open file: ${fileViewTarget}`);
  if (liveViewTarget) {
    console.log(`Live sync: ${liveViewTarget}`);
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
    preview: buildHistoryPreview(content),
  };
  appendHistory(base, entry);
  upsertTaskContentManifest(base, taskId, content, {
    type: entry.type,
    title: entry.title,
    metadata: finalMetadata,
    currentVersion: version,
    latestViewFile: basename(outPath),
    updatedAt: entry.updatedAt,
    sourcePath: resolvedSourcePath,
    sourceKind,
  });
  syncSharedArtifacts(base);

  // Notify connected browsers of new render
  if (serverStarted) {
    try {
    const http = await import('node:http');
    const notifyReq = http.request(
      { hostname: '127.0.0.1', port: 3847, path: '/notify', method: 'POST', timeout: 1000 },
      () => {} // ignore response
    );
    notifyReq.on('error', () => {}); // ignore errors
    notifyReq.end();
    } catch {
      // Non-critical fallback: file output already exists.
    }
  }

  // Open in browser
  if (!options.noOpen) {
    openBrowser(liveViewTarget || outPath);
  }
}

function syncSharedArtifacts(basePath: string): void {
  try {
    syncWorkspaceArtifacts(basePath);
  } catch {
    // Non-critical
  }
}

function parseBaseDirArg(args: string[]): string {
  const baseDirArg = args.indexOf('--base-dir');
  return baseDirArg >= 0 ? resolve(args[baseDirArg + 1]) : process.cwd();
}

function getFirstPositionalArg(args: string[], flagsWithValues: string[] = []): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (flagsWithValues.includes(arg)) {
      i++;
      continue;
    }
    if (!arg.startsWith('-')) {
      return arg;
    }
  }
  return undefined;
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0 || index + 1 >= args.length) return undefined;
  return args[index + 1];
}

function inferBaseDirFromArtifactPath(filePath: string): string | null {
  const resolved = resolve(filePath);
  const parts = resolved.split(sep);
  const index = parts.lastIndexOf('.superview');
  if (index <= 0) return null;
  const base = parts.slice(0, index).join(sep);
  return base || sep;
}

async function handleHistory(args: string[]): Promise<void> {
  const baseDir = parseBaseDirArg(args);
  syncSharedArtifacts(baseDir);
  const history = readHistory(baseDir);
  if (history.length === 0) {
    console.log('No history yet. Render something first: superview render <file>');
    return;
  }

  // Build a simple history HTML and open it
  const html = buildHistoryPage(history);
  const dir = ensureDir(baseDir);
  const viewsDir = join(dir, 'views');
  if (!existsSync(viewsDir)) mkdirSync(viewsDir, { recursive: true });
  const outPath = join(viewsDir, '_history.html');
  writeFileSync(outPath, html, 'utf-8');
  openBrowser(outPath);
}

function handleFeedback(args: string[]): void {
  handleReview(args);
}

function handleReview(args: string[]): void {
  const baseDirFlag = args.indexOf('--base-dir');
  const baseDir = baseDirFlag >= 0 ? resolve(args[baseDirFlag + 1]) : process.cwd();
  const summary = args.includes('--summary');
  const jsonMode = args.includes('--json');
  const useLatest = args.includes('--latest');
  const viewPath = getFlagValue(args, '--view');

  let bundle: ReviewBundle | null = null;
  let taskId: string | undefined = getFlagValue(args, '--task-id') || getFirstPositionalArg(args, ['--base-dir', '--task-id', '--view']);
  let targetBaseDir = baseDir;

  if (viewPath) {
    const resolvedViewPath = resolve(viewPath);
    if (resolvedViewPath.endsWith('.json')) {
      bundle = readReviewBundleFromPath(resolvedViewPath);
      if (bundle) {
        taskId = bundle.taskId;
        targetBaseDir = bundle.basePath;
      }
    } else {
      const inferredBaseDir = targetBaseDir !== process.cwd() ? targetBaseDir : inferBaseDirFromArtifactPath(resolvedViewPath) || targetBaseDir;
      targetBaseDir = inferredBaseDir;
      bundle = readReviewBundleFromHtml(targetBaseDir, resolvedViewPath);
      if (bundle) taskId = bundle.taskId;
    }
  }

  if (!bundle && useLatest) {
    const latest = getLatestReviewTaskId(targetBaseDir);
    if (!latest) {
      console.error('No review found. Render something or leave feedback first.');
      process.exit(1);
    }
    taskId = latest;
  }

  if (!bundle && taskId) {
    bundle = readReviewBundle(targetBaseDir, taskId);
  }

  if (!bundle) {
    console.error('Usage: superview review|inbox [--summary|--json] [--latest|--task-id <id>|--view <path>]');
    process.exit(1);
  }

  if (summary) {
    console.log(summarizeReviewBundle(bundle, bundle.taskId));
    return;
  }

  if (jsonMode) {
    console.log(JSON.stringify(buildReviewMachinePayload(targetBaseDir, bundle), null, 2));
    return;
  }

  console.log(JSON.stringify(bundle, null, 2));
}

function resolveLatestContentTaskId(baseDir: string): string | null {
  return getLatestReviewTaskId(baseDir) || readHistory(baseDir)[0]?.taskId || null;
}

function resolveTaskIdFromContentArgs(args: string[], baseDir: string): { taskId: string | null; resolvedBaseDir: string } {
  const viewPath = getFlagValue(args, '--view');
  const explicitTaskId = getFlagValue(args, '--task-id') || getFirstPositionalArg(args, ['--base-dir', '--task-id', '--view']);
  let resolvedBaseDir = baseDir;

  if (viewPath) {
    const resolvedViewPath = resolve(viewPath);
    const inferredBaseDir = resolvedBaseDir !== process.cwd() ? resolvedBaseDir : inferBaseDirFromArtifactPath(resolvedViewPath) || resolvedBaseDir;
    resolvedBaseDir = inferredBaseDir;
    const bundle = resolvedViewPath.endsWith('.json')
      ? readReviewBundleFromPath(resolvedViewPath)
      : readReviewBundleFromHtml(resolvedBaseDir, resolvedViewPath);
    if (bundle) {
      return { taskId: bundle.taskId, resolvedBaseDir };
    }
  }

  if (args.includes('--latest')) {
    return { taskId: resolveLatestContentTaskId(resolvedBaseDir), resolvedBaseDir };
  }

  return { taskId: explicitTaskId || null, resolvedBaseDir };
}

function handleContent(args: string[]): void {
  const baseDirFlag = args.indexOf('--base-dir');
  const baseDir = baseDirFlag >= 0 ? resolve(args[baseDirFlag + 1]) : process.cwd();
  const jsonMode = args.includes('--json');
  const { taskId, resolvedBaseDir } = resolveTaskIdFromContentArgs(args, baseDir);

  if (!taskId) {
    console.error('Usage: superview content [--json] [--latest|--task-id <id>|--view <path>]');
    process.exit(1);
  }

  const snapshot = readCanonicalContentSnapshot(resolvedBaseDir, taskId);
  if (!snapshot) {
    console.error(`No canonical Superview content found for task: ${taskId}`);
    process.exit(1);
  }

  if (jsonMode) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  console.log(snapshot.content);
}

function handleImportReview(args: string[]): void {
  const sourcePath = getFirstPositionalArg(args, ['--base-dir']);
  if (!sourcePath) {
    console.error('Usage: superview import-review <file> [--base-dir <path>]');
    process.exit(1);
  }
  const bundle = readReviewBundleFromPath(sourcePath);
  if (!bundle) {
    console.error(`Could not read review bundle from: ${sourcePath}`);
    process.exit(1);
  }

  const baseDirFlag = args.indexOf('--base-dir');
  const targetBaseDir = baseDirFlag >= 0
    ? resolve(args[baseDirFlag + 1])
    : bundle.basePath || process.cwd();

  importReviewBundle(targetBaseDir, bundle);
  syncSharedArtifacts(targetBaseDir);
  console.log(JSON.stringify({ ok: true, taskId: bundle.taskId, basePath: targetBaseDir }, null, 2));
}

function handleServe(args: string[]): void {
  const portArg = args.indexOf('--port');
  const port = portArg >= 0 ? parseInt(args[portArg + 1]) : 3847;
  const baseDirArg = args.indexOf('--base-dir');
  const baseDir = baseDirArg >= 0 ? resolve(args[baseDirArg + 1]) : process.cwd();
  syncSharedArtifacts(baseDir);
  startServer(baseDir, port);
}

function handleInit(args: string[]): void {
  const dir = ensureDir(parseBaseDirArg(args));
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

function handleClean(args: string[]): void {
  const dir = join(parseBaseDirArg(args), '.superview', 'views');
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
  const baseDir = parseBaseDirArg(args);
  const taskId = getFirstPositionalArg(args, ['--base-dir']);
  if (!taskId) {
    console.error('Usage: superview keep <task-id>');
    process.exit(1);
  }
  const history = readHistory(baseDir);
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
  const dir = ensureDir(baseDir);
  const viewsDir = join(dir, 'views');
  const latestFileName = basename(latest.filePath);
  const newFilePath = latestFileName.replace(/-temp\.html$/, '.html');
  renameSync(join(viewsDir, latestFileName), join(viewsDir, newFilePath));
  // Rewrite history with updated entry
  const allEntries = readHistory(baseDir);
  const historyPath = join(dir, 'history.jsonl');
  const updated = allEntries.map((e) => {
    if (e.id === latest.id) {
      return { ...e, kept: true, filePath: newFilePath };
    }
    return e;
  });
  writeFileSync(historyPath, updated.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
  syncSharedArtifacts(baseDir);
  console.log(`Kept: ${newFilePath}`);
}

function handleToday(args: string[]): void {
  const baseDir = parseBaseDirArg(args);
  syncSharedArtifacts(baseDir);
  const dir = ensureDir(baseDir);
  const todayPath = join(dir, 'views', '_today.html');
  const url = `file://${resolve(todayPath)}`;
  console.log(url);
  if (args.includes('--open')) {
    openBrowser(todayPath);
  }
}

function handleSync(args: string[]): void {
  const baseDir = parseBaseDirArg(args);
  syncSharedArtifacts(baseDir);
  console.log(`Synced shared Superview assets for ${baseDir}`);
}

function handleSetupClaude(): void {
  const snippet = `## Superview Integration

When creating content (tweets, threads, emails, messages, documents):

1. Write content to a temp file:
   \`echo "content" > /tmp/sv-draft.md\`

2. Render with superview:
   \`superview render /tmp/sv-draft.md --type <type> --title "<title>" --task-id "<id>" --no-open\`

3. Tell the user: "Rendered at [path]. Open that HTML file directly to review and leave comments."
   Do NOT tell the user to open localhost unless they explicitly started \`superview serve\`.

4. When user says "iterate", "v2", or asks for feedback on the latest edited draft:
   First read the latest canonical Superview content:
   \`superview content --latest --json --base-dir "<working-dir>"\`
   Then read the latest review bundle:
   \`superview inbox --latest --json --base-dir "<working-dir>"\`
   Note: \`superview inbox --latest --json\` already includes the current canonical \`content\` field, so one command is often enough.
   Improve content against that canonical edited text, then render v2 with --version 2 --previous.

5. \`superview serve\` is optional live sync only. Reading comments should default to \`superview inbox\` / \`superview review\`, not localhost routes.`;
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

async function main(): Promise<void> {
  await runCli(process.argv.slice(2));
}

function isCliEntrypoint(argvPath = process.argv[1]): boolean {
  if (!argvPath) return false;
  try {
    return realpathSync(argvPath) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return resolve(argvPath) === fileURLToPath(import.meta.url);
  }
}

if (isCliEntrypoint()) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
