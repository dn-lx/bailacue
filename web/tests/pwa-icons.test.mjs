import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const assets = new URL("../assets/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));

test("Android installs use dedicated safe-zone maskable assets", () => {
  for (const size of ["192x192", "512x512"]) {
    assert.ok(manifest.icons.some((icon) => icon.sizes === size && icon.purpose === "maskable" && icon.type === "image/png"));
    assert.ok(manifest.icons.some((icon) => icon.sizes === size && icon.purpose === "any" && icon.type === "image/png"));
  }
});

test("Android artwork has full-bleed color and centered padding", async () => {
  const svg = await readFile(new URL("bailacue-maskable.svg", assets), "utf8");
  assert.match(svg, /<rect width="512" height="512" fill="#201747"\s*\/>/);
  assert.match(svg, /transform="translate\(102 102\) scale\(1\.2\)"/);
});

test("browser favicon uses transparent artwork, not an opaque tile", async () => {
  const svg = await readFile(new URL("bailacue-favicon.svg", assets), "utf8");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(svg, /<rect\b|<image\b|<foreignObject\b/);
  assert.match(html, /href="\/assets\/bailacue-favicon\.svg\?v=6"/);
});
