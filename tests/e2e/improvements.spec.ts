import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { emptyLibrary, type Video } from "../../src/core/types";
const fixture = resolve("tests/fixtures/bailacue-flow-test.mp4");
test("Practice plays a continuous queue, preserves Previous, pauses time and restores safely", async ({
  page,
}) => {
  for (const [title, style] of [
    ["First Salsa", "Salsa"],
    ["First Bachata", "Bachata"],
  ]) {
    await page.goto("/upload");
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "Choose a video", exact: true })
      .click();
    await (await chooser).setFiles(fixture);
    await page
      .getByRole("textbox", { name: "Video title", exact: true })
      .fill(title);
    await page.getByRole("button", { name: style, exact: true }).click();
    await page
      .getByRole("button", { name: "Add to my library", exact: true })
      .click();
    await page.waitForURL(/\/video\//);
  }
  await page.goto("/practice");
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator("video")
        .first()
        .evaluate((v: HTMLVideoElement) => !v.paused),
    )
    .toBe(true);
  await expect(page.getByText("video 2 of 2", { exact: false })).toBeVisible({
    timeout: 12000,
  });
  await page
    .getByRole("button", { name: "Pause practice", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Resume practice", exact: true }),
  ).toBeVisible();
  const timer = page.getByText(/^\d+ active seconds/);
  const before = await timer.innerText();
  await page.waitForTimeout(1100);
  await expect(timer).toHaveText(before);
  await page
    .getByRole("button", { name: "Previous video", exact: true })
    .click();
  await expect(page.getByText("video 1 of 2", { exact: false })).toBeVisible();
  await page.screenshot({
    path: "artifacts/screenshots/practice-active.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Resume practice", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("video")
        .first()
        .evaluate((v: HTMLVideoElement) => v.paused),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Finish & save", exact: true })
    .click();
  await expect(page.getByText(/practised$/)).toHaveCount(1);
  await page.screenshot({
    path: "artifacts/screenshots/practice-history.png",
    fullPage: true,
  });
});
test("Library supports custom dances, exact stars/Unrated and stable numeric sorting", async ({
  page,
}) => {
  const library = emptyLibrary();
  const base = {
    id: "",
    title: "",
    uri: "",
    duration: 5,
    size: 0,
    style: "Salsa",
    labels: [],
    importance: 5,
    ratingSet: true,
    status: "To learn",
    teacher: "",
    className: "",
    location: "",
    lessonDate: "",
    createdAt: "2026-10-20",
    resume: 0,
    segments: [],
    bookmarks: [],
    notes: [],
    available: false,
    source: "device",
  } as Video;
  library.videos = [
    { ...base, id: "ten", title: "0010", importance: 1 },
    { ...base, id: "two", title: "0002", importance: 3 },
    { ...base, id: "new", title: "New", ratingSet: false },
  ];
  await page.addInitScript((l) => {
    if (!localStorage.getItem("bailacue:device-library:v1"))
      localStorage.setItem("bailacue:device-library:v1", JSON.stringify(l));
  }, library);
  await page.goto("/library");
  await page
    .getByRole("button", { name: "Filters & sort", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Number · ascending", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /^Play / })).toHaveText([
    /0002/,
    /0010/,
    /New/,
  ]);
  await page.getByRole("button", { name: "1 ★", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Play / })).toHaveCount(1);
  await page.getByRole("button", { name: "Unrated", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Play / })).toHaveCount(2);
  await page.goto("/upload");
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Choose a video", exact: true })
    .click();
  await (await chooser).setFiles(fixture);
  await page
    .getByRole("button", { name: "Add dance type", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "New dance type", exact: true })
    .fill("Tango");
  await page
    .getByRole("button", { name: "Create dance type", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "New dance type", exact: true }),
  ).toHaveCount(0);
  await page.goto("/library");
  await expect(
    page.getByRole("button", { name: "Tango", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Other", exact: true }),
  ).toHaveCount(0);
});
test("YouTube beginner preview imports a paginated playlist without duplicates or file actions (mock official APIs)", async ({
  page,
  context,
}) => {
  const ids = ["Zb2lLo90a14", "dQw4w9WgXcQ"];
  await context.route("https://www.youtube.com/iframe_api", (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body: `window.YT={Player:function(id,c){this.getCurrentTime=()=>0;this.getDuration=()=>60;this.getPlaylist=()=>${JSON.stringify(ids)};this.getPlayerState=()=>2;this.getAvailablePlaybackRates=()=>[1];this.playVideo=()=>c.events.onStateChange({data:1});this.pauseVideo=()=>{};this.seekTo=()=>{};this.setPlaybackRate=()=>{};this.destroy=()=>{};setTimeout(()=>c.events.onReady(),10)}};window.onYouTubeIframeAPIReady();`,
    }),
  );
  await context.route("https://www.googleapis.com/youtube/v3/**", (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.endsWith("playlists"))
      return r.fulfill({
        json: {
          items: [
            {
              snippet: {
                title: "Bachata Tutorials",
                channelTitle: "Roberto & Magdalena Bachata",
              },
            },
          ],
        },
      });
    const next = !!url.searchParams.get("pageToken");
    return r.fulfill({
      json: {
        items: [
          {
            snippet: {
              title: next ? "Second beginner video" : "Bachata basic steps",
              resourceId: { videoId: ids[next ? 1 : 0] },
            },
          },
        ],
        ...(next ? {} : { nextPageToken: "page2" }),
      },
    });
  });
  await page.goto("/youtube");
  await expect(
    page.getByText("Roberto & Magdalena Bachata", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "YouTube Data API key (optional)" })
    .fill("mock-public-key");
  await page
    .getByRole("button", { name: "Save YouTube setup", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Preview beginner Bachata playlist",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("2 selected · playlist order is kept"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add selected videos", exact: true })
    .click();
  await expect(page.getByText(/Added 2 videos/)).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh Bachata Tutorials", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add selected videos", exact: true })
    .click();
  await page.goto("/library");
  await expect(page.getByRole("button", { name: /^Play / })).toHaveCount(2);
  await page
    .getByRole("button", { name: "Play Bachata basic steps", exact: true })
    .click();
  await expect(page.getByText("YouTube · online video")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download to phone", exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Trim on timeline", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "artifacts/screenshots/youtube-detail.png",
    fullPage: true,
  });
  await page.goto("/settings");
  await page
    .getByRole("switch", {
      name: "Include YouTube in Daily Picks",
      exact: true,
    })
    .check();
  await page.getByRole("tab", { name: "Today", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Play / })).toHaveCount(1);
});
