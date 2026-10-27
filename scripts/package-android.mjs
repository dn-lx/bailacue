import { readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const config = JSON.parse(await readFile("app.json", "utf8")).expo;
const name = `BailaCue-v${config.version}-build${config.android.versionCode}-preview.apk`;
await mkdir("artifacts", { recursive: true });
await copyFile(
  "android/app/build/outputs/apk/release/app-release.apk",
  `artifacts/${name}`,
);
const hash = createHash("sha256")
  .update(await readFile(`artifacts/${name}`))
  .digest("hex");
await writeFile(`artifacts/${name}.sha256`, `${hash}  ${name}\n`);
console.log(`Created artifacts/${name}`);
