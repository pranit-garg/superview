import { createServer, request as httpRequest, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, dirname, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { URL, fileURLToPath } from 'node:url';
import type { FeedbackItem } from '../types.js';
import { addFeedbackItem, deleteFeedbackItem, readFeedback } from './feedback.js';
import {
  buildHistoryPreview,
  findWorkspaceBasePaths,
  getHistoryForTask,
  renameTask,
  renderHistoryDataScript,
  updateTaskVersionHistory,
} from './history.js';
import { buildReviewMachinePayload, getLatestReviewTaskId, readReviewBundle, renameReviewBundleTitle } from './review.js';
import { syncWorkspaceArtifacts } from './sync.js';
import {
  ensureTaskContentManifest,
  readTaskContent,
  renameTaskContentManifest,
  upsertTaskContentManifest,
} from './task-content.js';
import { applyCanonicalContentEdit, applyLegacyContentEdits, ContentSaveError } from './editable-content.js';
import { rewriteTaskViews, upgradeViewHtml } from './view-upgrade.js';

const DEFAULT_PORT = 3847;
const APP_VERSION = '0.3.1';
const MAX_SSE_CLIENTS = 100;
const SSE_TIMEOUT_MS = 5 * 60 * 1000;
const SSE_HEARTBEAT_MS = 30 * 1000;
const MAX_BODY_SIZE = 1 * 1024 * 1024; // 1MB

interface SSEClient {
  res: ServerResponse;
  connectedAt: number;
  lastActivity: number;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function setCors(res: ServerResponse): void {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        req.destroy(new Error('Request body too large'));
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown): void {
  setCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function getAllowedBasePaths(basePath: string): Set<string> {
  return new Set(findWorkspaceBasePaths(basePath).map((entry) => resolve(entry)));
}

function resolveTargetBasePath(serverBasePath: string, requestedBasePath?: string | null): string | null {
  if (!requestedBasePath) return resolve(serverBasePath);
  const resolvedBasePath = resolve(requestedBasePath);
  return getAllowedBasePaths(serverBasePath).has(resolvedBasePath) ? resolvedBasePath : null;
}

function resolveViewFilePath(basePath: string, requestedFile: string | null): string | null {
  if (!requestedFile) return null;
  const fileName = basename(requestedFile);
  if (!fileName.endsWith('.html')) return null;
  const viewsDir = resolve(join(basePath, '.superview', 'views'));
  const filePath = resolve(join(viewsDir, fileName));
  if (filePath !== viewsDir && !filePath.startsWith(`${viewsDir}${sep}`)) {
    return null;
  }
  return filePath;
}

function resolveCompatibilityReviewBundle(
  targetBasePath: string,
  pathname: string,
  searchParams: URLSearchParams,
): ReturnType<typeof readReviewBundle> {
  const normalizedPath = pathname.replace(/\/+$/, '') || pathname;
  const routeMatch = normalizedPath.match(/^\/(feedback|inbox|review)(?:\/([^/]+?))(?:\.json)?$/);
  const prefixMatch = normalizedPath.match(/^\/(feedback|inbox|review)$/);
  if (!routeMatch && !prefixMatch) return null;

  const token = routeMatch?.[2] || searchParams.get('taskId') || searchParams.get('id') || searchParams.get('reviewId') || 'latest';
  const taskId = token === 'latest'
    ? getLatestReviewTaskId(targetBasePath)
    : token;
  if (!taskId) return null;
  return readReviewBundle(targetBasePath, taskId);
}

function sendCompatibilityReviewBundle(
  res: ServerResponse,
  targetBasePath: string,
  pathname: string,
  searchParams: URLSearchParams,
): boolean {
  const bundle = resolveCompatibilityReviewBundle(targetBasePath, pathname, searchParams);
  if (!bundle) return false;
  json(res, 200, buildReviewMachinePayload(targetBasePath, bundle));
  return true;
}

function readServedHtml(targetBasePath: string, filePath: string): string {
  const rawHtml = readFileSync(filePath, 'utf-8');
  const upgradedHtml = upgradeViewHtml(targetBasePath, filePath, rawHtml);
  const baseHtml = upgradedHtml || rawHtml;
  const servedHtml = baseHtml.includes('window.__svServedMode = false;')
    ? baseHtml.replace('window.__svServedMode = false;', 'window.__svServedMode = true;')
    : baseHtml;

  if (upgradedHtml && upgradedHtml !== rawHtml) {
    try {
      writeFileSync(filePath, upgradedHtml, 'utf-8');
    } catch {
      // Non-critical: serve upgraded HTML even if the write-through fails.
    }
  }
  return servedHtml;
}

export function startServer(basePath: string, port?: number): Server {
  const actualPort = port ?? DEFAULT_PORT;
  const sseClients: SSEClient[] = [];

  const heartbeatInterval = setInterval(() => {
    const now = Date.now();
    for (let i = sseClients.length - 1; i >= 0; i--) {
      const client = sseClients[i];
      if (now - client.lastActivity > SSE_TIMEOUT_MS) {
        try { client.res.end(); } catch { /* already closed */ }
        sseClients.splice(i, 1);
        continue;
      }
      try {
        client.res.write(':heartbeat\n\n');
      } catch {
        sseClients.splice(i, 1);
      }
    }
  }, SSE_HEARTBEAT_MS);

  function broadcast(data: unknown): void {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    const now = Date.now();
    for (let i = sseClients.length - 1; i >= 0; i--) {
      try {
        sseClients[i].res.write(payload);
        sseClients[i].lastActivity = now;
      } catch {
        sseClients.splice(i, 1);
      }
    }
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET';
    const rawUrl = req.url ?? '/';
    const url = new URL(rawUrl, 'http://localhost');
    const pathname = url.pathname;

    // OPTIONS preflight
    if (method === 'OPTIONS') {
      setCors(res);
      res.writeHead(204);
      res.end();
      console.log(`[superview] ${method} ${rawUrl} 204`);
      return;
    }

    // GET /health
    if (method === 'GET' && pathname === '/health') {
      json(res, 200, { status: 'ok', version: APP_VERSION });
      console.log(`[superview] ${method} ${rawUrl} 200`);
      return;
    }

    // GET /info
    if (method === 'GET' && pathname === '/info') {
      json(res, 200, { status: 'ok', basePath: resolve(basePath), version: APP_VERSION });
      console.log(`[superview] ${method} ${rawUrl} 200`);
      return;
    }

    // GET /events (SSE)
    if (method === 'GET' && pathname === '/events') {
      if (sseClients.length >= MAX_SSE_CLIENTS) {
        json(res, 503, { error: 'Too many SSE connections' });
        console.log(`[superview] ${method} ${rawUrl} 503 (max SSE clients)`);
        return;
      }
      setCors(res);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('data: {"type":"connected"}\n\n');
      const now = Date.now();
      const client: SSEClient = { res, connectedAt: now, lastActivity: now };
      sseClients.push(client);
      req.on('close', () => {
        const idx = sseClients.indexOf(client);
        if (idx !== -1) sseClients.splice(idx, 1);
      });
      console.log(`[superview] ${method} ${rawUrl} 200 (SSE)`);
      return;
    }

    if (method === 'GET' && (pathname === '/feedback' || pathname === '/feedback/latest' || pathname.startsWith('/feedback/') || pathname === '/inbox' || pathname === '/inbox/latest' || pathname.startsWith('/inbox/') || pathname === '/review' || pathname === '/review/latest' || pathname.startsWith('/review/'))) {
      const targetBasePath = resolveTargetBasePath(basePath, url.searchParams.get('base'));
      if (!targetBasePath) {
        json(res, 403, { error: 'Forbidden basePath' });
        console.log(`[superview] ${method} ${rawUrl} 403`);
        return;
      }
      if (sendCompatibilityReviewBundle(res, targetBasePath, pathname, url.searchParams)) {
        console.log(`[superview] ${method} ${rawUrl} 200`);
        return;
      }
      json(res, 404, { error: 'Review bundle not found' });
      console.log(`[superview] ${method} ${rawUrl} 404`);
      return;
    }

    // POST /feedback
    if (method === 'POST' && pathname === '/feedback') {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as { taskId: string; item: FeedbackItem; basePath?: string };
        if (!parsed.taskId || !parsed.item) {
          json(res, 400, { error: 'Missing taskId or item' });
          console.log(`[superview] ${method} ${rawUrl} 400`);
          return;
        }
        const targetBasePath = resolveTargetBasePath(basePath, parsed.basePath);
        if (!targetBasePath) {
          json(res, 403, { error: 'Forbidden basePath' });
          console.log(`[superview] ${method} ${rawUrl} 403`);
          return;
        }
        const taskHistory = getHistoryForTask(targetBasePath, parsed.taskId);
        const latestTaskEntry = taskHistory[0];
        addFeedbackItem(targetBasePath, parsed.taskId, parsed.item, {
          title: latestTaskEntry?.title,
          currentVersion: latestTaskEntry?.versions,
          syncState: 'synced',
        });
        broadcast({ type: 'feedback', taskId: parsed.taskId, item: parsed.item, basePath: targetBasePath });
        json(res, 200, { ok: true });
        console.log(`[superview] ${method} ${rawUrl} 200`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        json(res, 400, { error: message });
        console.log(`[superview] ${method} ${rawUrl} 400`);
      }
      return;
    }

    if (method === 'POST' && pathname === '/feedback/delete') {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as { taskId: string; itemId: string; basePath?: string };
        if (!parsed.taskId || !parsed.itemId) {
          json(res, 400, { error: 'Missing taskId or itemId' });
          return;
        }
        const targetBasePath = resolveTargetBasePath(basePath, parsed.basePath);
        if (!targetBasePath) {
          json(res, 403, { error: 'Forbidden basePath' });
          return;
        }
        deleteFeedbackItem(targetBasePath, parsed.taskId, parsed.itemId);
        broadcast({ type: 'feedback_delete', taskId: parsed.taskId, itemId: parsed.itemId, basePath: targetBasePath });
        json(res, 200, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        json(res, 400, { error: message });
      }
      return;
    }

    if (method === 'POST' && pathname === '/rename-task') {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as { taskId: string; title: string; basePath?: string };
        if (!parsed.taskId || !parsed.title || !parsed.title.trim()) {
          json(res, 400, { error: 'Missing taskId or title' });
          return;
        }
        const targetBasePath = resolveTargetBasePath(basePath, parsed.basePath);
        if (!targetBasePath) {
          json(res, 403, { error: 'Forbidden basePath' });
          return;
        }

        const renamedCount = renameTask(targetBasePath, parsed.taskId, parsed.title.trim());
        if (renamedCount === 0) {
          json(res, 404, { error: 'Task not found' });
          return;
        }
        renameTaskContentManifest(targetBasePath, parsed.taskId, parsed.title.trim());
        renameReviewBundleTitle(targetBasePath, parsed.taskId, parsed.title.trim());

        rewriteTaskViews(targetBasePath, parsed.taskId);
        syncWorkspaceArtifacts(targetBasePath);
        broadcast({
          type: 'task_rename',
          taskId: parsed.taskId,
          title: parsed.title.trim(),
          basePath: targetBasePath,
        });
        json(res, 200, { ok: true, renamedCount });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        json(res, 400, { error: message });
      }
      return;
    }

    if (method === 'GET' && pathname === '/_history-data.js') {
      const targetBasePath = resolveTargetBasePath(basePath, url.searchParams.get('base'));
      if (!targetBasePath) {
        json(res, 403, { error: 'Forbidden basePath' });
        console.log(`[superview] ${method} ${rawUrl} 403`);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', ...CORS_HEADERS });
      res.end(renderHistoryDataScript(targetBasePath));
      console.log(`[superview] ${method} ${rawUrl} 200`);
      return;
    }

    if (method === 'GET' && pathname === '/_view') {
      const targetBasePath = resolveTargetBasePath(basePath, url.searchParams.get('base'));
      if (!targetBasePath) {
        json(res, 403, { error: 'Forbidden basePath' });
        console.log(`[superview] ${method} ${rawUrl} 403`);
        return;
      }
      const filePath = resolveViewFilePath(targetBasePath, url.searchParams.get('file'));
      if (!filePath) {
        json(res, 400, { error: 'Invalid file' });
        console.log(`[superview] ${method} ${rawUrl} 400`);
        return;
      }
      if (!existsSync(filePath)) {
        json(res, 404, { error: 'Not found' });
        console.log(`[superview] ${method} ${rawUrl} 404`);
        return;
      }
      const html = readServedHtml(targetBasePath, filePath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS });
      res.end(html);
      console.log(`[superview] ${method} ${rawUrl} 200`);
      return;
    }

    // GET / → serve latest rendered HTML
    if (method === 'GET' && pathname === '/') {
      try {
        const viewsDir = join(basePath, '.superview', 'views');
        const latestPath = join(viewsDir, '_latest.html');
        if (existsSync(latestPath)) {
          const html = readServedHtml(basePath, latestPath);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS });
          res.end(html);
        } else {
          // No renders yet — show a waiting page that auto-refreshes via SSE
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS });
          res.end(`<!DOCTYPE html><html><head><title>Superview</title>
            <style>body{background:#080810;color:#EDE8E0;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
            .waiting{text-align:center;opacity:0.6}h2{font-weight:400;margin-bottom:0.5rem}p{font-size:0.9rem;color:#908878}</style></head>
            <body><div class="waiting"><h2>Superview</h2><p>Waiting for first render...</p></div>
            <script>var es=new EventSource('/events');es.addEventListener('message',function(e){
              try{var d=JSON.parse(e.data);if(d.type==='new_render')location.reload();}catch(err){}
            });</script></body></html>`);
        }
        console.log(`[superview] ${method} ${rawUrl} 200`);
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        json(res, 500, { error: message });
        return;
      }
    }

    // Serve static files from .superview/views/ (JS, images, etc.)
    if (method === 'GET' && (pathname.startsWith('/_') || pathname.endsWith('.js') || pathname.endsWith('.png') || pathname.endsWith('.jpg') || pathname.endsWith('.html'))) {
      const viewsDir = resolve(join(basePath, '.superview', 'views'));
      const filePath = resolve(join(viewsDir, decodeURIComponent(pathname.slice(1))));
      if (filePath !== viewsDir && !filePath.startsWith(`${viewsDir}${sep}`)) {
        json(res, 403, { error: 'Forbidden' });
        console.log(`[superview] ${method} ${rawUrl} 403 (path traversal blocked)`);
        return;
      }
      try {
        if (existsSync(filePath)) {
          const ext = pathname.split('.').pop() || '';
          const mimeTypes: Record<string, string> = {
            'html': 'text/html; charset=utf-8',
            'js': 'application/javascript; charset=utf-8',
            'css': 'text/css; charset=utf-8',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'svg': 'image/svg+xml',
            'json': 'application/json',
          };
          res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream', ...CORS_HEADERS });
          if (ext === 'html') {
            res.end(readServedHtml(basePath, filePath));
          } else {
            res.end(readFileSync(filePath));
          }
          console.log(`[superview] ${method} ${rawUrl} 200`);
          return;
        }
      } catch {
        // Fall through to 404
      }
    }

    // POST /notify — trigger auto-refresh for all connected clients
    if (method === 'POST' && pathname === '/notify') {
      broadcast({ type: 'new_render' });
      json(res, 200, { ok: true });
      console.log(`[superview] ${method} ${rawUrl} 200 (broadcast)`);
      return;
    }

    // POST /save-content — save edited content from inline editing
    if (method === 'POST' && pathname === '/save-content') {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as { taskId: string; blockId: string; version?: number; itemId?: string; newText: string; basePath?: string; clientId?: string };
        if (!parsed.taskId || !parsed.blockId || parsed.newText === undefined) {
          json(res, 400, { error: 'Missing taskId, blockId, or newText' });
          return;
        }
        const targetBasePath = resolveTargetBasePath(basePath, parsed.basePath);
        if (!targetBasePath) {
          json(res, 403, { error: 'Forbidden basePath' });
          return;
        }
        const taskHistory = getHistoryForTask(targetBasePath, parsed.taskId);
        const latestTaskEntry = taskHistory[0];
        if (!latestTaskEntry) {
          json(res, 404, { error: 'Task not found' });
          return;
        }
        const currentVersion = latestTaskEntry.versions || parsed.version || 1;
        if (parsed.version && parsed.version !== currentVersion) {
          json(res, 409, { error: 'Only the latest task version can be edited' });
          return;
        }
        const manifest = ensureTaskContentManifest(targetBasePath, parsed.taskId, {
          type: latestTaskEntry.type,
          title: latestTaskEntry.title,
          metadata: {},
          currentVersion,
          latestViewFile: latestTaskEntry.filePath,
        });
        const canonicalContent = readTaskContent(targetBasePath, parsed.taskId);
        if (!manifest || canonicalContent === null) {
          json(res, 404, { error: 'Canonical task content not found' });
          return;
        }
        const feedbackItems = readFeedback(targetBasePath, parsed.taskId)?.items || [];
        const materializedContent = applyLegacyContentEdits(manifest, canonicalContent, feedbackItems);
        if (materializedContent !== canonicalContent) {
          upsertTaskContentManifest(targetBasePath, parsed.taskId, materializedContent, {
            type: manifest.type,
            title: manifest.title,
            metadata: manifest.metadata,
            currentVersion: manifest.currentVersion || currentVersion,
            latestViewFile: manifest.latestViewFile || latestTaskEntry.filePath,
            updatedAt: new Date().toISOString(),
          });
        }
        const editResult = applyCanonicalContentEdit(manifest, materializedContent, parsed.blockId, String(parsed.newText));
        const updatedAt = new Date().toISOString();
        upsertTaskContentManifest(targetBasePath, parsed.taskId, editResult.content, {
          type: manifest.type,
          title: manifest.title,
          metadata: manifest.metadata,
          currentVersion: manifest.currentVersion || currentVersion,
          latestViewFile: manifest.latestViewFile || latestTaskEntry.filePath,
          updatedAt,
        });
        const editItem: FeedbackItem = {
          type: 'content_edit',
          id: parsed.itemId || `edit-${parsed.blockId}-${Date.now()}`,
          blockId: parsed.blockId,
          version: manifest.currentVersion || currentVersion,
          text: editResult.savedText,
          createdAt: updatedAt,
          resolved: false,
        };
        addFeedbackItem(targetBasePath, parsed.taskId, editItem, {
          title: manifest.title,
          currentVersion: manifest.currentVersion || currentVersion,
          syncState: 'synced',
        });
        updateTaskVersionHistory(targetBasePath, parsed.taskId, manifest.currentVersion || currentVersion, {
          preview: buildHistoryPreview(editResult.content),
          updatedAt,
          filePath: manifest.latestViewFile || latestTaskEntry.filePath,
        });
        const rewrittenViews = rewriteTaskViews(targetBasePath, parsed.taskId);
        syncWorkspaceArtifacts(targetBasePath);
        broadcast({
          type: 'content_saved',
          taskId: parsed.taskId,
          blockId: parsed.blockId,
          basePath: targetBasePath,
          updatedAt,
          clientId: parsed.clientId || '',
        });
        json(res, 200, {
          ok: true,
          taskId: parsed.taskId,
          blockId: parsed.blockId,
          savedText: editResult.savedText,
          updatedAt,
          rewrittenViews,
          item: editItem,
        });
        console.log(`[superview] ${method} ${rawUrl} 200`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const status = err instanceof ContentSaveError ? err.status : 400;
        json(res, status, { error: message });
      }
      return;
    }

    // 404 for everything else
    json(res, 404, { error: 'Not found' });
    console.log(`[superview] ${method} ${rawUrl} 404`);
  });

  server.listen(actualPort, () => {
    console.log(`[superview] Server listening on http://localhost:${actualPort}`);
  });

  server.on('close', () => clearInterval(heartbeatInterval));

  return server;
}

export function isServerRunning(port?: number): Promise<boolean> {
  const actualPort = port ?? DEFAULT_PORT;
  return new Promise((resolve) => {
    const req = httpRequest(
      { hostname: '127.0.0.1', port: actualPort, path: '/health', method: 'GET', timeout: 1000 },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data) as { status?: string };
            resolve(parsed.status === 'ok');
          } catch {
            resolve(false);
          }
        });
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function getServerInfo(port: number): Promise<{basePath: string} | null> {
  return new Promise((resolve) => {
    const req = httpRequest(
      { hostname: '127.0.0.1', port, path: '/info', method: 'GET', timeout: 1000 },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data) as { basePath?: string };
            if (parsed.basePath) {
              resolve({ basePath: parsed.basePath });
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function killPort(port: number): Promise<void> {
  const { execFileSync } = await import('node:child_process');
  try {
    const output = execFileSync('lsof', ['-ti', `:${port}`], { encoding: 'utf-8' }).trim();
    if (output) {
      const pids = output.split('\n').map(p => p.trim()).filter(Boolean);
      for (const pid of pids) {
        try { process.kill(parseInt(pid, 10), 'SIGTERM'); } catch { /* already dead */ }
      }
    }
  } catch { /* No process found */ }
}

export async function tryAutoStart(basePath: string, port?: number): Promise<boolean> {
  const actualPort = port ?? DEFAULT_PORT;

  // Check if server is already running
  const info = await getServerInfo(actualPort);
  if (info) {
    // Server running — check if it's serving the right directory
    if (resolve(info.basePath) === resolve(basePath)) {
      return true; // Correct server already running
    }
    // Wrong directory — kill it and start fresh
    await killPort(actualPort);
    await new Promise(r => setTimeout(r, 500));
  }

  try {
    // Resolve cli.js path: try import.meta.url first, fallback to dirname-based resolution
    let cliPath: string;
    try {
      cliPath = fileURLToPath(new URL('../cli.js', import.meta.url));
    } catch {
      cliPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.js');
    }
    // If the resolved path doesn't exist, try finding it relative to process.argv[1]
    if (!existsSync(cliPath) && process.argv[1]) {
      const altPath = join(dirname(process.argv[1]), 'cli.js');
      if (existsSync(altPath)) cliPath = altPath;
    }

    const child = spawn(
      process.execPath,
      [cliPath, 'serve', '--port', String(actualPort), '--base-dir', resolve(basePath)],
      {
        cwd: basePath,
        detached: true,
        stdio: 'ignore',
      },
    );
    child.unref();

    // Poll for server readiness (200ms intervals, up to 10 attempts = 2s)
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 200));
      if (await isServerRunning(actualPort)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
