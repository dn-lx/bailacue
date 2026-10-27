import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
const root = resolve("dist");
const types = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".json": "application/json",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
};
createServer(async (req, res) => {
  const path = resolve(
    root,
    "." + decodeURIComponent((req.url ?? "/").split("?")[0]),
  );
  if (path !== root && !path.startsWith(root + sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const data = await readFile(path);
    res.setHeader(
      "Content-Type",
      types[extname(path)] ?? "application/octet-stream",
    );
    res.end(data);
  } catch {
    try {
      res.setHeader("Content-Type", "text/html");
      res.end(await readFile(resolve(root, "index.html")));
    } catch {
      res.writeHead(404);
      res.end("Build the preview with npm run build:web.");
    }
  }
}).listen(4173, "127.0.0.1");
