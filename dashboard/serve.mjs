// Minimal zero-dependency static server for the dashboard.
// Serves the project root (so /dashboard/* and /.claude/state/* are both reachable)
// with no caching, so the dashboard sees live state-file updates.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';

const root = process.cwd();
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
