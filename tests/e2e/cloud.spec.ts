import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
const fixture = resolve("tests/fixtures/bailacue-cloud-test.mp4");
test("user connects Salsa and Bachata folders → streams → edits → refresh preserves both sources (mock provider)", async ({
  page,
  context,
}) => {
  let outsideAdded = false;
  let failExternalOnce = true;
  const renamed = new Map<string, string>();
  const renames: { from_path: string; to_path: string }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.route(
    "https://www.dropbox.com/oauth2/authorize**",
    async (route) => {
      const url = new URL(route.request().url()),
        callback = new URL(url.searchParams.get("redirect_uri")!);
      callback.searchParams.set("code", "mock-authorisation-code");
      callback.searchParams.set("state", url.searchParams.get("state")!);
      await route.fulfill({
        contentType: "text/html",
        body: `<script>location.replace(${JSON.stringify(callback.toString())})</script>`,
      });
    },
  );
  await context.route("https://api.dropboxapi.com/oauth2/token", (r) =>
    r.fulfill({
      json: {
        access_token: "mock-user-access",
        refresh_token: "mock-user-refresh",
        expires_in: 14400,
      },
    }),
  );
  await context.route(
    "https://api.dropboxapi.com/2/users/get_current_account",
    (r) =>
      r.fulfill({
        json: {
          account_id: "dbid:my-own-account",
          email: "dancer@example.com",
          name: { display_name: "Test Dancer" },
        },
      }),
  );
  await context.route(
    "https://api.dropboxapi.com/2/files/get_metadata",
    (r) => {
      const path = r.request().postDataJSON().path;
      if (path.startsWith("id:")) {
        const parent = path === "id:bachata-video" ? "/bachata" : "/salsa";
        return r.fulfill({
          json: {
            ".tag": "file",
            id: path,
            name: renamed.get(path) ?? "Original.mp4",
            path_display: `${parent}/${renamed.get(path) ?? "Original.mp4"}`,
          },
        });
      }
      const bachata = path === "/bachata";
      return r.fulfill({
        json: {
          ".tag": "folder",
          id: bachata ? "id:bachata-folder" : "id:salsa-folder",
          name: bachata ? "My Bachata" : "My Salsa",
          path_lower: bachata ? "/bachata" : "/salsa",
        },
      });
    },
  );
  await context.route("https://api.dropboxapi.com/2/files/move_v2", (r) => {
    const args = r.request().postDataJSON();
    expect(args.autorename).toBe(false);
    renames.push(args);
    if (args.from_path === "id:external" && failExternalOnce) {
      failExternalOnce = false;
      return r.fulfill({
        status: 403,
        json: { error_summary: "no_write_permission" },
      });
    }
    renamed.set(args.from_path, args.to_path.split("/").pop());
    return r.fulfill({
      json: {
        metadata: {
          ".tag": "file",
          id: args.from_path,
          name: renamed.get(args.from_path),
        },
      },
    });
  });
  await context.route(
    "https://api.dropboxapi.com/2/files/list_folder",
    async (r) => {
      const data = r.request().postDataJSON();
      await r.fulfill({
        json: {
          entries:
            data.path === ""
              ? [
                  {
                    ".tag": "folder",
                    id: "id:folder",
                    name: "My Salsa",
                    path_lower: "/salsa",
                  },
                  {
                    ".tag": "folder",
                    id: "id:bachata-folder",
                    name: "My Bachata",
                    path_lower: "/bachata",
                  },
                ]
              : [
                  ...(outsideAdded && data.path === "/salsa"
                    ? [
                        {
                          ".tag": "file",
                          id: "id:external",
                          name: renamed.get("id:external") ?? "9999.mp4",
                          size: 1234,
                        },
                      ]
                    : []),
                  {
                    ".tag": "file",
                    id:
                      data.path === "/bachata"
                        ? "id:bachata-video"
                        : "id:video",
                    name:
                      renamed.get(
                        data.path === "/bachata"
                          ? "id:bachata-video"
                          : "id:video",
                      ) ??
                      (data.path === "/bachata"
                        ? "Bachata basics.mp4"
                        : "Cloud turn.mp4"),
                    size: 1234,
                    media_info: {
                      ".tag": "metadata",
                      metadata: { ".tag": "video", duration: 6000 },
                    },
                  },
                ],
          cursor: "done",
          has_more: false,
        },
      });
    },
  );
  await context.route(
    "https://api.dropboxapi.com/2/files/get_temporary_link",
    (r) =>
      r.fulfill({
        json: { link: "https://dl.dropboxusercontent.com/mock-video.mp4" },
      }),
  );
  await context.route("https://dl.dropboxusercontent.com/mock-video.mp4", (r) =>
    r.fulfill({
      path: fixture,
      contentType: "video/mp4",
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.goto("/storage");
  await page
    .getByRole("button", { name: "App connection setup", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Dropbox app key", exact: true })
    .fill("mock-public-app-key");
  await page.getByRole("button", { name: "Save app key", exact: true }).click();
  await page
    .getByRole("button", { name: "Connect Dropbox", exact: true })
    .click();
  await expect(
    page
      .getByText("dancer@example.com", { exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Browse my folders", exact: true })
    .click();
  await page.getByRole("button", { name: "My Salsa", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Folder name in BailaCue", exact: true })
    .fill("Tuesday class");
  await page.getByRole("button", { name: "Salsa", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose labels", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search labels", exact: true })
    .fill("Musicality");
  await page
    .getByRole("button", { name: "Select Musicality", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Done choosing labels", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect folder & find videos", exact: true })
    .click();
  await expect(
    page.getByText("Tuesday class", { exact: true }).first(),
  ).toBeVisible();
  // Add the second folder to the same account without replacing Salsa.
  await page
    .getByRole("textbox", { name: "Dropbox folder path", exact: true })
    .fill("/bachata");
  await page
    .getByRole("textbox", { name: "Folder name in BailaCue", exact: true })
    .fill("Bachata class");
  await page.getByRole("button", { name: "Bachata", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove label Musicality", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose labels", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search labels", exact: true })
    .fill("Sensual");
  await page
    .getByRole("button", { name: "Select Sensual", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Done choosing labels", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect folder & find videos", exact: true })
    .click();
  await expect(
    page.getByText("Bachata class", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Tuesday class", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Connect folder & find videos",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole("switch", {
      name: "Number new uploads to Tuesday class",
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("switch", {
      name: "Number new uploads to Bachata class",
      exact: true,
    }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Refresh videos", exact: true })
    .first()
    .click();
  expect(renames).toHaveLength(0);
  await page.goto("/library");
  await expect(
    page.getByRole("button", { name: "Play Cloud turn", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play Bachata basics", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play 0001", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Filters & sort", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Bachata class", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play Bachata basics", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play Cloud turn", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Tuesday class", exact: true })
    .click();
  // Reconnect after this explicit full navigation; real phone credentials use SecureStore.
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Manage video storage", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect Dropbox", exact: true })
    .click();
  await expect(
    page
      .getByText("dancer@example.com", { exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Browse my folders", exact: true }),
  ).toBeVisible();
  const salsaCard = page
    .getByText("Tuesday class", { exact: true })
    .filter({ visible: true })
    .first()
    .locator("..");
  const bachataCard = page
    .getByText("Bachata class", { exact: true })
    .filter({ visible: true })
    .first()
    .locator("..");
  await salsaCard
    .getByRole("button", { name: "Rename existing videos…", exact: true })
    .click();
  await expect(
    salsaCard.getByText("Preview numbered filenames", { exact: true }),
  ).toBeVisible();
  expect(renames).toHaveLength(0);
  await salsaCard
    .getByRole("button", { name: "Keep current filenames", exact: true })
    .click();
  expect(renames).toHaveLength(0);
  await salsaCard
    .getByRole("button", { name: "Rename existing videos…", exact: true })
    .click();
  await salsaCard
    .getByText("Preview numbered filenames", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "artifacts/screenshots/rename-preview.png",
    fullPage: true,
  });
  await salsaCard
    .getByRole("button", { name: "Apply numbered filenames", exact: true })
    .click();
  await expect(
    salsaCard.getByText("Rename results", { exact: true }),
  ).toBeVisible();
  expect(renames).toHaveLength(1);
  await page
    .getByRole("switch", {
      name: "Number new uploads to Bachata class",
      exact: true,
    })
    .check();
  expect(renames).toHaveLength(1);
  await bachataCard
    .getByRole("button", { name: "Rename existing videos…", exact: true })
    .click();
  await bachataCard
    .getByRole("button", { name: "Apply numbered filenames", exact: true })
    .click();
  await expect(
    bachataCard.getByText("Rename results", { exact: true }),
  ).toBeVisible();
  expect(renames).toHaveLength(2);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("tab", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Play 0001", exact: true }).click();
  await page
    .getByRole("button", { name: "Extra options", exact: true })
    .click();
  await expect(page.getByText("ONLINE VIDEO", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("video")
        .first()
        .evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThan(1);
  await page.screenshot({
    path: "artifacts/screenshots/cloud-video.png",
    fullPage: true,
  });
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Source title: 0001", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Choose labels", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search labels", exact: true })
    .fill("Artist A");
  await page
    .getByRole("button", { name: "Create “Artist A”", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Done choosing labels", exact: true })
    .click();
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await page
    .getByRole("button", { name: "Library", exact: true })
    .first()
    .click();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Manage video storage", exact: true })
    .click();
  outsideAdded = true;
  await page
    .getByRole("button", { name: "Refresh videos", exact: true })
    .first()
    .click();
  expect(renames).toHaveLength(2);
  expect(renamed.has("id:external")).toBe(false);
  await salsaCard
    .getByRole("button", { name: "Rename existing videos…", exact: true })
    .click();
  await expect(
    salsaCard.getByText("9999.mp4 → 0002.mp4", { exact: true }),
  ).toBeVisible();
  expect(renames).toHaveLength(2);
  await salsaCard
    .getByRole("button", { name: "Apply numbered filenames", exact: true })
    .click();
  await expect(salsaCard.getByText(/9999.mp4: Dropbox access/)).toBeVisible();
  expect(renamed.has("id:external")).toBe(false);
  await salsaCard
    .getByText(/9999.mp4: Dropbox access/)
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "artifacts/screenshots/rename-failure.png",
    fullPage: true,
  });
  await salsaCard
    .getByRole("button", { name: "Review remaining renames", exact: true })
    .click();
  await salsaCard
    .getByRole("button", { name: "Apply numbered filenames", exact: true })
    .click();
  await expect(salsaCard.getByText(/9999.mp4: Dropbox access/)).toHaveCount(0);
  await expect.poll(() => renamed.get("id:external")).toBe("0002.mp4");
  await expect(
    salsaCard.getByText("2 / 2 checked · 1 renamed · 1 already numbered", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("tab", { name: "Library", exact: true }).click();
  const filters = page.getByRole("button", {
    name: "Filters & sort",
    exact: true,
  });
  if (await filters.count()) await filters.click();
  await page.getByRole("button", { name: "All storage", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play 0001", exact: true }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Play 0002", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Artist A", { exact: false }).first(),
  ).toBeVisible();
  expect(
    renames.some(
      (r) => r.from_path === "id:external" && r.to_path === "/salsa/0002.mp4",
    ),
  ).toBe(true);
  expect(renames.some((r) => r.to_path === "/bachata/0001.mp4")).toBe(true);
  await page
    .getByRole("button", { name: "Play 0001", exact: true })
    .first()
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "artifacts/screenshots/numeric-source-library.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Today", exact: true }).click();
  await page
    .getByRole("button", { name: "Update today’s picks", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Play 000[12]$/ }),
  ).toHaveCount(2);
  await expect(
    page.getByText(/Unrated \(counts as 5-star\) Bachata/),
  ).toBeVisible();
  await expect(page.getByText("Unrated · treated as 5★").first()).toBeVisible();
  await page
    .getByText(/Unrated \(counts as 5-star\) Bachata/)
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "artifacts/screenshots/source-daily-picks.png",
    fullPage: true,
  });
  // Imports explicitly choose their folder, independent of style or labels.
  await page.getByRole("tab", { name: "Add video", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Choose a video", exact: true })
    .click();
  await (await chooser).setFiles(fixture);
  await page.getByRole("button", { name: "Play preview", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("video")
        .last()
        .evaluate((v: HTMLVideoElement) => v.currentTime),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Pause preview", exact: true })
    .click();
  await page.screenshot({
    path: "artifacts/screenshots/import-preview.png",
    fullPage: true,
  });
  await page
    .getByRole("textbox", { name: "Video title", exact: true })
    .fill("New Bachata upload");
  await page
    .getByRole("button", { name: "Online storage", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Tuesday class · Dropbox", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Bachata class · Dropbox", exact: true })
    .click();
  await page
    .getByRole("switch", {
      name: "Keep a phone copy after upload",
      exact: true,
    })
    .uncheck();
  await page
    .getByRole("button", { name: "Upload & add to library", exact: true })
    .click();
  await page.waitForURL(/\/transfer\//);
  await expect(
    page.getByText("Selected: Bachata class", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", {
      name: "Keep a phone copy after upload",
      exact: true,
    }),
  ).not.toBeChecked();
  // The web preview cannot transfer native files; its failed upload must retain the import.
  await expect(
    page.getByText("Upload phone videos in the Android or iOS app.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("tab", { name: "Library", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play New Bachata upload", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
