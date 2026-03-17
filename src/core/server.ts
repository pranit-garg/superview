import { createServer, request as httpRequest, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { FeedbackItem } from '../types.js';
import { addFeedbackItem } from './feedback.js';

const DEFAULT_PORT = 3847;

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
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
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
  const sseClients: ServerResponse[] = [];

  function broadcast(data: unknown): void {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (let i = sseClients.length - 1; i >= 0; i--) {
      try {
        sseClients[i].write(payload);
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

    // GET /events (SSE)
    if (method === 'GET' && url === '/events') {
      setCors(res);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('data: {"type":"connected"}\n\n');
      sseClients.push(res);
      req.on('close', () => {
        const idx = sseClients.indexOf(res);
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

    // 404 for everything else
    json(res, 404, { error: 'Not found' });
    console.log(`[superview] ${method} ${url} 404`);
  });

  server.listen(actualPort, () => {
    console.log(`[superview] Server listening on http://localhost:${actualPort}`);
  });

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

export async function tryAutoStart(basePath: string, port?: number): Promise<boolean> {
  const actualPort = port ?? DEFAULT_PORT;

  if (await isServerRunning(actualPort)) {
    return true;
  }

  try {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('../cli.js', import.meta.url)), 'serve', '--port', String(actualPort)],
      {
        cwd: basePath,
        detached: true,
        stdio: 'ignore',
      },
    );
    child.unref();

    // Give the server a moment to start
    await new Promise((r) => setTimeout(r, 500));
    return isServerRunning(actualPort);
  } catch {
    return false;
  }
}
