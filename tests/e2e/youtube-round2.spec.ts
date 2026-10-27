import { test, expect, type BrowserContext } from "@playwright/test";
const playlist = "PL2E0b6twkkHkMemtovF3zHgo95pURUUmy";
const ids = ["Zb2lLo90a14", "dQw4w9WgXcQ"];
const longTitle =
  "How To DANCE Bachata During Quarantine (4 Beginner Basic Steps)";
async function player(context: BrowserContext, error = false) {
  await context.route("https://www.youtube.com/iframe_api", (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body: `
    window.YT={Player:function(id,c){let cued=false,pos=0,state=5,rate=1;window.testPlayer=this;
    this.getCurrentTime=()=>pos;this.getDuration=()=>395;this.getPlaylist=()=>cued?${JSON.stringify(ids)}:[];
    this.getPlayerState=()=>state;this.getAvailablePlaybackRates=()=>[0.5,1,1.5];this.getPlaybackRate=()=>rate;
    this.cuePlaylist=()=>{cued=true;setTimeout(()=>{c.events.onStateChange({data:5});${error ? "c.events.onError({data:153});" : ""}},10)};
    this.playVideo=()=>{state=1;c.events.onStateChange({data:1})};this.pauseVideo=()=>{state=2;c.events.onStateChange({data:2})};
    this.seekTo=n=>{pos=n};this.setPlaybackRate=n=>{rate=n;c.events.onPlaybackRateChange?.({data:n})};this.destroy=()=>{};
    setTimeout(()=>c.events.onReady(),10)}};window.onYouTubeIframeAPIReady();`,
    }),
  );
  await context.route("https://www.youtube.com/oembed?**", (r) =>
    r.fulfill({
      json: {
        title: new URL(r.request().url()).searchParams
          .get("url")
          ?.includes(ids[0])
          ? longTitle
          : "Second lesson",
        author_name: "Test creator",
      },
    }),
  );
}
test("keyless playlist cue needs no playback and saves durable videos despite a preview error", async ({
  page,
  context,
}) => {
  await player(context, true);
  await page.goto("/youtube");
  await page
    .getByRole("textbox", { name: "YouTube video or public playlist URL" })
    .fill(`https://www.youtube.com/playlist?list=${playlist}`);
  await page.getByRole("button", { name: "Preview link", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add selected videos", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("2 selected · playlist order is kept"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add selected videos", exact: true })
    .click();
  await expect(
    page.getByText("Added 2 videos to your Library", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open Library", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Play ${longTitle}`, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /^Play / })).toHaveCount(2);
});
test("bad Data API key falls back to cued player discovery and repeated import deduplicates", async ({
  page,
  context,
}) => {
  await player(context);
  await context.route("https://www.googleapis.com/youtube/v3/**", (r) =>
    r.fulfill({
      status: 403,
      json: { error: { message: "API key not valid" } },
    }),
  );
  await page.goto("/youtube");
  await page
    .getByRole("textbox", { name: "YouTube Data API key (optional)" })
    .fill("invalid-test-key");
  await page
    .getByRole("button", { name: "Save YouTube setup", exact: true })
    .click();
  for (let round = 0; round < 2; round++) {
    await page
      .getByRole("textbox", { name: "YouTube video or public playlist URL" })
      .fill(`https://www.youtube.com/playlist?list=${playlist}`);
    await page
      .getByRole("button", { name: "Preview link", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Add selected videos", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Add selected videos", exact: true })
      .click();
    await expect(
      page.getByText("Added 2 videos to your Library", { exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Open Library", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Play / })).toHaveCount(2);
});
test("YouTube title is compact; resize and full screen retain the same player and position", async ({
  page,
  context,
}) => {
  await player(context);
  await page.goto("/youtube");
  await page
    .getByRole("textbox", { name: "YouTube video or public playlist URL" })
    .fill(`https://youtu.be/${ids[0]}`);
  await page.getByRole("button", { name: "Preview link", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add selected videos", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Add selected videos", exact: true })
    .click();
  await page.getByRole("button", { name: "Open Library", exact: true }).click();
  await page
    .getByRole("button", { name: `Play ${longTitle}`, exact: true })
    .click();
  const title = page.getByRole("heading", { name: longTitle, exact: true });
  expect(
    await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBe(20);
  expect((await title.boundingBox())!.height).toBeLessThanOrEqual(57);
  await page.getByRole("button", { name: "Play video", exact: true }).click();
  await page.getByRole("button", { name: "1.5×", exact: true }).click();
  await page.getByRole("button", { name: "+5 sec", exact: true }).click();
  await expect(page.getByText("0:05 / 6:35", { exact: true })).toBeVisible();
  const token = await page
    .locator('iframe[title="YouTube lesson player"]')
    .evaluate((el) => (el as HTMLIFrameElement).contentWindow!.location.href);
  await page.locator('iframe[title="YouTube lesson player"]').evaluate((el) => {
    (el as HTMLIFrameElement).contentWindow!.name = "same-player";
  });
  const frame = page.getByTestId("video-frame"),
    before = (await frame.boundingBox())!.height;
  await page.getByRole("slider", { name: "Resize video area" }).focus();
  await page.keyboard.press("ArrowDown");
  expect((await frame.boundingBox())!.height).toBeLessThan(before);
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  expect((await frame.boundingBox())!.height).toBeGreaterThan(before);
  await expect(
    page.getByRole("button", { name: "Exit full screen", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 915, height: 412 });
  await expect(
    page.getByRole("button", { name: "Exit full screen", exact: true }),
  ).toBeInViewport();
  await page
    .getByRole("button", { name: "Exit full screen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Full screen", exact: true }),
  ).toBeInViewport();
  await page.setViewportSize({ width: 412, height: 915 });
  expect(
    await page
      .locator('iframe[title="YouTube lesson player"]')
      .evaluate((el) => (el as HTMLIFrameElement).contentWindow!.name),
  ).toBe("same-player");
  expect(token).toContain("about:srcdoc");
  await expect(page.getByText("0:05 / 6:35", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pause video", exact: true }),
  ).toBeVisible();
  expect(
    await page.locator('iframe[title="YouTube lesson player"]').evaluate((el) =>
      (
        (el as HTMLIFrameElement).contentWindow as unknown as {
          testPlayer: { getPlaybackRate: () => number };
        }
      ).testPlayer.getPlaybackRate(),
    ),
  ).toBe(1.5);
  for (const width of [320, 360, 412]) {
    await page.setViewportSize({ width, height: 915 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "artifacts/screenshots/youtube-round2-player.png",
    fullPage: true,
  });
});

test("failed Library write keeps the playlist selection for retry and never announces success", async ({
  page,
  context,
}) => {
  await player(context);
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    let failOnce = true;
    IDBObjectStore.prototype.put = function (value, key) {
      if (
        failOnce &&
        this.name === "libraries" &&
        value.body?.includes('"source":"youtube"')
      ) {
        failOnce = false;
        throw new DOMException(
          "Synthetic disk-full failure",
          "QuotaExceededError",
        );
      }
      return key === undefined
        ? put.call(this, value)
        : put.call(this, value, key);
    };
  });
  await page.goto("/youtube");
  await page
    .getByRole("textbox", { name: "YouTube video or public playlist URL" })
    .fill(`https://www.youtube.com/playlist?list=${playlist}`);
  await page.getByRole("button", { name: "Preview link", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add selected videos", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Add selected videos", exact: true })
    .click();
  await expect(
    page.getByText(/The videos could not be saved on this phone/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Library", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("2 selected · playlist order is kept"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add selected videos", exact: true })
    .click();
  await expect(
    page.getByText("Added 2 videos to your Library", { exact: true }),
  ).toBeVisible();
});
