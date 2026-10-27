// Export the approved concept05 b/play identity from its refined geometric SVG master.
// SVG masters and outlined typography are committed; normal exports need only sharp.
import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
await mkdir("assets/brand", { recursive: true });
await mkdir("docs/brand", { recursive: true });
const master = await readFile("assets/brand/symbol-master.svg", "utf8");
const mark = master.match(/<g[\s\S]*<\/g>/)[0];
const wordmark = await readFile("assets/brand/wordmark-master.svg", "utf8");
const wordBox = wordmark.match(/viewBox="([^"]+)"/)[1],
  wordPaths = wordmark.match(/<path[\s\S]*<\/svg>/)[0].replace("</svg>", "");
const svg = (w, h, content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${content}</svg>`;
const symbol = (color, x = 0, y = 0, w = 1024, h = w) => {
  const paths =
    color === "brand"
      ? mark
      : color === "brand-dark"
        ? mark.replaceAll("#080D18", "#FFFFFF")
        : mark.replaceAll(/fill="#[0-9A-Fa-f]{6}"/g, `fill="${color}"`);
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 1254 1254">${paths}</svg>`;
};
const type = (mode, x, y, w, h) =>
  `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${wordBox}">${wordPaths.replaceAll("#080D18", mode === "dark" ? "#FFFFFF" : mode === "mono-white" ? "#FFFFFF" : "#080D18").replaceAll("#1465FF", mode === "mono-white" ? "#FFFFFF" : mode === "mono-black" ? "#080D18" : "#1465FF")}</svg>`;
const generated = [];
async function save(path, data) {
  await writeFile(path, data);
  generated.push(path);
}
async function exportSvg(path, source) {
  await save(path + ".svg", source);
  await save(path + ".png", await sharp(Buffer.from(source)).png().toBuffer());
}
for (const [name, color] of [
  ["white", "#FFFFFF"],
  ["black", "#080D18"],
  ["blue", "#1465FF"],
])
  await exportSvg(
    `assets/brand/symbol-${name}-transparent`,
    svg(1024, 1024, symbol(color)),
  );
for (const [name, color] of [
  ["color", "brand"],
  ["color-dark", "brand-dark"],
])
  await exportSvg(
    `assets/brand/symbol-${name}-transparent`,
    svg(1024, 1024, symbol(color)),
  );
await exportSvg(
  "assets/icon",
  svg(
    1024,
    1024,
    '<rect width="1024" height="1024" fill="#F4F7FC"/>' + symbol("brand"),
  ),
);
await save(
  "assets/adaptive-icon.png",
  // Android expands a 108dp foreground behind its 72dp launcher mask.
  // Keep the complete mark inside the central 66dp safe zone, including
  // themed/circular masks. The unpadded transparent master stays unchanged.
  await sharp(Buffer.from(svg(1024, 1024, symbol("brand", 212, 212, 600))))
    .png()
    .toBuffer(),
);
await save(
  "assets/adaptive-monochrome.png",
  await sharp(Buffer.from(svg(1024, 1024, symbol("#000000", 212, 212, 600))))
    .png()
    .toBuffer(),
);
for (const path of [
  "assets/adaptive-icon.png",
  "assets/adaptive-monochrome.png",
]) {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const safeRadius = (info.width * 33) / 108;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      if (
        data[(y * info.width + x) * 4 + 3] > 0 &&
        Math.hypot(x - info.width / 2, y - info.height / 2) > safeRadius
      ) {
        throw new Error(`${path} extends beyond Android's 66dp safe zone`);
      }
    }
}
await save(
  "assets/splash-icon.png",
  await sharp(Buffer.from(svg(512, 512, symbol("brand-dark", 0, 0, 512))))
    .png()
    .toBuffer(),
);
await exportSvg(
  "assets/brand/icon-black",
  svg(
    1024,
    1024,
    '<rect width="1024" height="1024" fill="#080D18"/>' + symbol("brand-dark"),
  ),
);
for (const [name, size] of [
  ["favicon", 64],
  ["brand/favicon-16", 16],
  ["brand/favicon-32", 32],
  ["brand/apple-touch-icon", 180],
  ["brand/android-icon-192", 192],
  ["brand/android-icon-512", 512],
  ["brand/ios-app-store", 1024],
])
  await save(
    `assets/${name}.png`,
    await sharp("assets/icon.svg")
      .resize(size, size)
      .removeAlpha()
      .png()
      .toBuffer(),
  );
for (const mode of ["light", "dark", "mono-white", "mono-black"]) {
  const fg = mode === "light" || mode === "mono-black" ? "#080D18" : "#FFFFFF";
  for (const transparent of [false, true]) {
    const bg = transparent
      ? ""
      : `<rect width="1024" height="256" fill="${mode === "dark" || mode === "mono-white" ? "#080D18" : "#FFFFFF"}"/>`;
    await exportSvg(
      `assets/brand/logo-horizontal-${mode}${transparent ? "-transparent" : ""}`,
      svg(
        1024,
        256,
        bg +
          symbol(
            mode === "light" ? "brand" : mode === "dark" ? "brand-dark" : fg,
            0,
            0,
            256,
          ) +
          type(mode, 270, 70, 710, 116),
      ),
    );
    const stackbg = transparent
      ? ""
      : `<rect width="640" height="640" fill="${mode === "dark" || mode === "mono-white" ? "#080D18" : "#FFFFFF"}"/>`;
    await exportSvg(
      `assets/brand/logo-stacked-${mode}${transparent ? "-transparent" : ""}`,
      svg(
        640,
        640,
        stackbg +
          symbol(
            mode === "light" ? "brand" : mode === "dark" ? "brand-dark" : fg,
            80,
            0,
            480,
          ) +
          type(mode, 90, 490, 460, 82),
      ),
    );
  }
}
for (const [name, color, label] of [
  ["salsa", "#1465FF", "SALSA"],
  ["bachata", "#080D18", "BACHATA"],
  ["practice", "#1465FF", "PRACTICE"],
  ["youtube", "#080D18", "YOUTUBE"],
])
  await exportSvg(
    `docs/brand/badge-${name}`,
    svg(
      240,
      64,
      `<rect width="240" height="64" rx="32" fill="${color}"/><text x="120" y="41" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="bold" letter-spacing="2" fill="#FFFFFF">${label}</text>`,
    ),
  );
await exportSvg(
  "docs/brand/identity",
  svg(
    1200,
    720,
    '<rect width="1200" height="720" fill="#F4F7FC"/>' +
      symbol("brand", 0, 0, 400) +
      '<rect x="400" y="0" width="400" height="400" fill="#080D18"/>' +
      symbol("brand-dark", 400, 0, 400) +
      type("light", 800, 140, 340, 70) +
      ["#1465FF", "#080D18", "#FFFFFF", "#C7DCFF"]
        .map(
          (c, i) =>
            `<rect x="${48 + i * 288}" y="420" width="264" height="144" rx="18" fill="${c}" stroke="#C4D0E0"/><text x="${48 + i * 288}" y="605" font-family="sans-serif" font-size="24" fill="#080D18">${c}</text>`,
        )
        .join("") +
      '<text x="48" y="670" font-family="sans-serif" font-size="22" fill="#54647B">b + play · Vector masters · Outfit + DM Sans · Blue / black / white</text>',
  ),
);
await exportSvg(
  "assets/brand/social-1200x630",
  svg(
    1200,
    630,
    '<rect width="1200" height="630" fill="#080D18"/>' +
      symbol("brand-dark", 30, 30, 570) +
      type("dark", 600, 220, 520, 98) +
      '<text x="610" y="370" font-family="sans-serif" font-size="28" fill="#B5C3D9">Watch. Practise. Repeat.</text>',
  ),
);
await exportSvg(
  "assets/brand/play-feature-1024x500",
  svg(
    1024,
    500,
    '<rect width="1024" height="500" fill="#080D18"/>' +
      symbol("brand-dark", 0, 0, 500) +
      type("dark", 500, 180, 480, 90),
  ),
);
await writeFile(
  "assets/brand/manifest.json",
  JSON.stringify(
    {
      concept: "05 — b + centered play",
      sources: [
        "docs/brand/round-2-selected-concept-05-board.jpg",
        "assets/brand/b-play-approved-preview.png",
      ],
      masters: [
        "assets/brand/symbol-master.svg",
        "assets/brand/wordmark-master.svg",
      ],
      sourceChecksums: await Promise.all(
        [
          "assets/brand/symbol-master.svg",
          "assets/brand/wordmark-master.svg",
          "assets/brand/b-play-approved-preview.png",
        ].map(async (path) => ({
          path,
          sha256: createHash("sha256")
            .update(await readFile(path))
            .digest("hex"),
        })),
      ),
      formatNote:
        "Symbols and logo lockups contain SVG paths, including outlined Outfit typography. PNG exports preserve alpha except opaque app/store tiles. Badge and social-tagline text is editable SVG text.",
      assets: await Promise.all(
        generated.map(async (path) => {
          const data = await readFile(path),
            m = await sharp(data).metadata();
          return {
            path,
            format: m.format,
            width: m.width,
            height: m.height,
            alpha: m.hasAlpha,
            sha256: createHash("sha256").update(data).digest("hex"),
          };
        }),
      ),
      pending: [],
    },
    null,
    2,
  ) + "\n",
);
console.log(`Packaged ${generated.length} brand assets from vector masters.`);
