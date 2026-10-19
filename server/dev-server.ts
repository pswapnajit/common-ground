// Local server: serves the built UI from dist/ and the same API handlers that
// run on Vercel. `npm start` builds then runs this; `npm run dev` runs it next
// to Vite's dev server (which proxies /api here).

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { handleHealth, handlePlan, handleSearch } from "./http/handlers.js";

// Minimal .env loader (no dependency): KEY=VALUE lines, existing env wins.
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const PORT = Number(process.env.PORT ?? process.env.API_PORT ?? 8787);
const DIST = resolve(process.cwd(), "dist");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

async function toRequest(req: IncomingMessage): Promise<Request> {
  const url = `http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as unknown as BodyInit) : undefined,
    // @ts-expect-error Node's fetch needs this for streamed request bodies
    duplex: hasBody ? "half" : undefined,
  });
}

async function send(res: ServerResponse, response: Response) {
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (!response.body) return res.end();
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

function serveStatic(pathname: string, res: ServerResponse) {
  if (!existsSync(DIST)) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("API is running. Run `npm run build` (or `npm start`) to serve the UI here, or use `npm run dev`.");
  }
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(DIST, safe);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url ?? "/", "http://x").pathname;
    if (pathname === "/api/plan") return send(res, await handlePlan(await toRequest(req)));
    if (pathname === "/api/search") return send(res, await handleSearch(await toRequest(req)));
    if (pathname === "/api/health") return send(res, await handleHealth());
    serveStatic(pathname, res);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(String((error as Error).message));
  }
}).listen(PORT, () => {
  console.log(`Common Ground running at http://localhost:${PORT}`);
});
