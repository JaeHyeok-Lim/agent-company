// Minimal zero-dependency static server for the dashboard.
// Serves the project root (so /dashboard/* and /.claude/state/* are both reachable)
// with no caching, so the dashboard sees live state-file updates.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { homedir } from 'node:os';

const root = process.cwd();
// global shared state written by the (global) hook — lets the dashboard show
// real activity from ANY project, not just this folder
const sharedDir = join(homedir(), '.claude', 'agent-company');
const port = Number(process.env.PORT) || 4317;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/dashboard/index.html';

  // /shared/<file> → global shared state (~/.claude/agent-company/), with a
  // fallback to the project-local .claude/state/ copy (AUDIT-0001).
  if (urlPath.startsWith('/shared/')) {
    const name = urlPath.slice('/shared/'.length);
    const shared = normalize(join(sharedDir, name));
    if (shared !== sharedDir && !shared.startsWith(sharedDir + sep)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    const stateDir = normalize(join(root, '.claude', 'state'));
    const fallback = normalize(join(stateDir, name));
    const candidates = [shared];
    if (fallback === stateDir || fallback.startsWith(stateDir + sep)) candidates.push(fallback);
    for (const f of candidates) {
      try {
        const data = await readFile(f);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(data);
        return;
      } catch { /* try next */ }
    }
    res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'no shared state yet', path: urlPath }));
    return;
  }

  const filePath = normalize(join(root, urlPath));
  // Prevent path traversal outside the project root.
  if (filePath !== root && !filePath.startsWith(root + sep)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'not found', path: urlPath }));
  }
}).listen(port, () => {
  console.log(`agent-company dashboard → http://localhost:${port}/`);
});
