import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { emptyLibrary, type Video } from "../../src/core/types";
const oldVideo: Video = {
  id: "local-1",
  title: "My old class",
  uri: "file:///private/original.mp4",
  size: 123,
  duration: 60,
  style: "Bachata",
  labels: ["Artist"],
  importance: 4,
  status: "To learn",
  teacher: "",
  className: "",
  location: "",
  lessonDate: "",
  createdAt: "2026-10-22T12:00:00Z",
  resume: 0,
  segments: [],
  bookmarks: [],
  notes: [
    {
      id: "n1",
      text: "Keep this lesson note",
      createdAt: "2026-10-22T12:00:00Z",
    },
  ],
  available: true,
  source: "device",
};
test("migrates an old library, removes labels globally, exports and reviews recovery without contacting Me+", async ({
  page,
}) => {
  const backend: string[] = [],
    errors: string[] = [];
  page.on("request", (request) => {
    if (/supabase|bailacue-api/.test(request.url()))
      backend.push(request.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(
    (library) => {
      if (!localStorage.getItem("seeded")) {
        localStorage.setItem(
          "bailacue:device-library:v1",
          JSON.stringify(library),
        );
        localStorage.setItem("seeded", "true");
      }
    },
    {
      ...emptyLibrary(),
      videos: [oldVideo],
      youtubeSettings: { apiKey: "device-secret" },
    },
  );
  await page.goto("/backups");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup file", exact: true })
    .click();
  const file = await download;
  const path = await file.path();
  const raw = readFileSync(path!, "utf8");
  expect(raw).not.toContain("file://");
  expect(raw).not.toContain("device-secret");
  expect(raw).toContain("Keep this lesson note");
  await page
    .getByRole("button", { name: "Manage labels", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove label Artist", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm removal", exact: true })
    .click();
  await expect(page.getByText("Labels saved.")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Remove label Artist", exact: true }),
  ).toHaveCount(0);
  await page.goto("/backups");
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Import backup file", exact: true })
    .click();
  await (await chooser).setFiles(path!);
  await expect(
    page.getByText("Review recovery", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Use backup’s matching metadata",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Confirm recovery", exact: true })
    .click();
  await expect(page.getByText(/Recovery saved on this phone/)).toBeVisible();
  await page.reload();
  await expect(page.getByText("Recent phone recovery points")).toBeVisible();
  await page
    .getByRole("button", { name: "Manage labels", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove label Artist", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("bailacue:device-library:v1")!)
          .videos[0].uri,
    ),
  ).toBe(oldVideo.uri);
  expect(backend).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "artifacts/screenshots/local-first-labels.png",
    fullPage: true,
  });
});
test("keeps migrated profiles separate and shows honest spreadsheet setup and offline boundaries", async ({
  page,
}) => {
  await page.addInitScript((video) => {
    const base = { version: 1, videos: [] };
    localStorage.setItem("bailacue:device-library:v1", JSON.stringify(base));
    localStorage.setItem(
      "bailacue:device-library:v1:previous-user",
      JSON.stringify({ ...base, videos: [video] }),
    );
  }, oldVideo);
  await page.goto("/backups");
  await expect(
    page.getByRole("button", { name: "Previous library 1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Previous library 1", exact: true })
    .click();
  await expect(
    page.getByText("Find your rhythm.", { exact: true }),
  ).toBeVisible();
  await page.goto("/labels");
  await expect(
    page.getByRole("button", { name: "Remove label Artist", exact: true }),
  ).toBeVisible();
  await page.goto("/backups");
  await page.getByRole("button", { name: "This phone", exact: true }).click();
  await expect(
    page.getByText("Find your rhythm.", { exact: true }),
  ).toBeVisible();
  await page.goto("/labels");
  await expect(
    page.getByRole("button", { name: "Remove label Artist", exact: true }),
  ).toHaveCount(0);
  await page.goto("/sheets");
  await expect(
    page.getByText(/Offline changes stay queued in SQLite/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Create my BailaCue spreadsheet",
      exact: true,
    }),
  ).toBeDisabled();
  await page.screenshot({
    path: "artifacts/screenshots/local-first-sheets-setup.png",
    fullPage: true,
  });
});
