import { createServer, request as httpRequest, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { FeedbackItem } from '../types.js';
import { addFeedbackItem } from './feedback.js';

const DEFAULT_PORT = 3847;
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
    const url = req.url ?? '/';

    // OPTIONS preflight
    if (method === 'OPTIONS') {
      setCors(res);
      res.writeHead(204);
      res.end();
      console.log(`[superview] ${method} ${url} 204`);
      return;
    }

    // GET /health
    if (method === 'GET' && url === '/health') {
      json(res, 200, { status: 'ok', version: '0.2.0' });
      console.log(`[superview] ${method} ${url} 200`);
      return;
    }

    // GET /info
    if (method === 'GET' && url === '/info') {
      json(res, 200, { status: 'ok', basePath: resolve(basePath), version: '0.2.0' });
      console.log(`[superview] ${method} ${url} 200`);
      return;
    }

    // GET /events (SSE)
    if (method === 'GET' && url === '/events') {
      if (sseClients.length >= MAX_SSE_CLIENTS) {
        json(res, 503, { error: 'Too many SSE connections' });
        console.log(`[superview] ${method} ${url} 503 (max SSE clients)`);
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
      console.log(`[superview] ${method} ${url} 200 (SSE)`);
      return;
    }

    // POST /feedback
    if (method === 'POST' && url === '/feedback') {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as { taskId: string; item: FeedbackItem };
        if (!parsed.taskId || !parsed.item) {
          json(res, 400, { error: 'Missing taskId or item' });
          console.log(`[superview] ${method} ${url} 400`);
          return;
        }
        addFeedbackItem(basePath, parsed.taskId, parsed.item);
        broadcast({ type: 'feedback', taskId: parsed.taskId, item: parsed.item });
        json(res, 200, { ok: true });
        console.log(`[superview] ${method} ${url} 200`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        json(res, 400, { error: message });
        console.log(`[superview] ${method} ${url} 400`);
      }
      return;
    }

    // GET / → serve latest rendered HTML
    if (method === 'GET' && url === '/') {
      try {
        const viewsDir = join(basePath, '.superview', 'views');
        const latestPath = join(viewsDir, '_latest.html');
        if (existsSync(latestPath)) {
          const html = readFileSync(latestPath, 'utf-8');
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
        console.log(`[superview] ${method} ${url} 200`);
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        json(res, 500, { error: message });
        return;
      }
    }

    // Serve static files from .superview/views/ (JS, images, etc.)
    if (method === 'GET' && (url.startsWith('/_') || url.endsWith('.js') || url.endsWith('.png') || url.endsWith('.jpg') || url.endsWith('.html'))) {
      const viewsDir = resolve(join(basePath, '.superview', 'views'));
      const filePath = resolve(join(viewsDir, decodeURIComponent(url.slice(1))));
      if (!filePath.startsWith(viewsDir)) {
        json(res, 403, { error: 'Forbidden' });
        console.log(`[superview] ${method} ${url} 403 (path traversal blocked)`);
        return;
      }
      try {
        if (existsSync(filePath)) {
          const content = readFileSync(filePath);
          const ext = url.split('.').pop() || '';
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
          res.end(content);
          console.log(`[superview] ${method} ${url} 200`);
          return;
        }
      } catch {
        // Fall through to 404
      }
    }

    // POST /notify — trigger auto-refresh for all connected clients
    if (method === 'POST' && url === '/notify') {
      broadcast({ type: 'new_render' });
      json(res, 200, { ok: true });
      console.log(`[superview] ${method} ${url} 200 (broadcast)`);
      return;
    }

    // POST /save-content — save edited content from inline editing
    if (method === 'POST' && url === '/save-content') {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as { taskId: string; blockId: string; newText: string };
        if (!parsed.taskId || !parsed.blockId || parsed.newText === undefined) {
          json(res, 400, { error: 'Missing taskId, blockId, or newText' });
          return;
        }
        // Save the edit as a feedback item for tracking
        const editItem = {
          type: 'content_edit',
          id: 'edit-' + parsed.blockId + '-' + Date.now(),
          blockId: parsed.blockId,
          text: parsed.newText,
          createdAt: new Date().toISOString(),
          resolved: false,
        };
        addFeedbackItem(basePath, parsed.taskId, editItem as any);
        broadcast({ type: 'content_edit', taskId: parsed.taskId, blockId: parsed.blockId });
        json(res, 200, { ok: true });
        console.log(`[superview] ${method} ${url} 200`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        json(res, 400, { error: message });
      }
      return;
    }

    // 404 for everything else
    json(res, 404, { error: 'Not found' });
    console.log(`[superview] ${method} ${url} 404`);
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
