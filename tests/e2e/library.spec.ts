import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
const fixture = resolve("tests/fixtures/bailacue-test-video.mp4");
test.beforeAll(() => {
  mkdirSync("artifacts/screenshots", { recursive: true });
});
test("import → label → loop → note → daily pick → persisted local video", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Find your rhythm.")).toBeVisible();
  await page.screenshot({
    path: "artifacts/screenshots/today.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add your first video" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose a video" }).click();
  await (await chooser).setFiles(fixture);
  await page
    .getByRole("textbox", { name: "Video title", exact: true })
    .fill("Bachata turn practice");
  await page
    .getByRole("button", { name: "Choose labels", exact: true })
    .click();
  for (const label of ["Footwork", "Beginner"]) {
    await page
      .getByRole("textbox", { name: "Search labels", exact: true })
      .fill(label);
    await page
      .getByRole("button", {
        name:
          label === "Beginner" || label === "Partnerwork"
            ? `Select ${label}`
            : `Create “${label}”`,
        exact: true,
      })
      .click();
  }
  await page
    .getByRole("button", { name: "Done choosing labels", exact: true })
    .click();
  await page.getByRole("button", { name: "Add to my library" }).click();
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Bachata turn practice");
  await expect
    .poll(() =>
      page
        .locator("video")
        .first()
        .evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThan(1);
  const timeline = page.getByRole("slider", { name: "Video position" });
  const bounds = await timeline.boundingBox();
  await timeline.click({
    position: { x: bounds!.width / 4, y: bounds!.height / 2 },
  });
  await expect
    .poll(() =>
      page
        .locator("video")
        .first()
        .evaluate((v: HTMLVideoElement) => v.currentTime),
    )
    .toBeGreaterThan(1);
  expect(
    await page
      .locator("video")
      .first()
      .evaluate((v: HTMLVideoElement) => v.currentTime),
  ).toBeLessThan(2.1);
  const frame = page.getByTestId("video-frame");
  const grip = page.getByRole("slider", { name: "Resize video area" });
  // React Native Web exposes adjustable as slider; keyboard and drag stay accessible.
  await grip.focus();
  await grip.press("ArrowRight");
  await expect.poll(async () => (await frame.boundingBox())!.height).toBe(310);
  await grip.press("ArrowLeft");
  await expect.poll(async () => (await frame.boundingBox())!.height).toBe(270);
  await page.getByRole("button", { name: "Mirror", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("video")
        .first()
        .evaluate((v) => {
          let e: Element | null = v;
          const transforms: string[] = [];
          while (e) {
            transforms.push(getComputedStyle(e).transform);
            e = e.parentElement;
          }
          return transforms.join(" ");
        }),
    )
    .toContain("-1");
  await page
    .getByRole("button", { name: "Extra options", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Trim on timeline", exact: true })
    .click();
  const startHandle = page.getByRole("slider", {
    name: "Trim start",
    exact: true,
  });
  await startHandle.focus();
  await startHandle.press("ArrowRight");
  await expect(
    page.getByRole("textbox", { name: "Start (m:ss or seconds)" }),
  ).toHaveValue("0.01");
  // Drag the actual handle on the shared playback line as well as using keyboard access.
  const handleBounds = (await startHandle.boundingBox())!;
  await page.mouse.move(
    handleBounds.x + 8,
    handleBounds.y + handleBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handleBounds.x + handleBounds.width * 0.3,
    handleBounds.y + handleBounds.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect
    .poll(async () =>
      Number(
        await page
          .getByRole("textbox", { name: "Start (m:ss or seconds)" })
          .inputValue(),
      ),
    )
    .toBeGreaterThan(1);
  const endHandle = page.getByRole("slider", { name: "Trim end", exact: true });
  await endHandle.focus();
  await endHandle.press("ArrowLeft");
  await expect(
    page.getByRole("textbox", { name: "End (m:ss or seconds)" }),
  ).toHaveValue("5.99");
  await page.screenshot({
    path: "artifacts/screenshots/timeline-trim.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Done trimming", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Start (m:ss or seconds)" })
    .fill("1");
  await page.getByRole("textbox", { name: "End (m:ss or seconds)" }).fill("4");
  await page.getByRole("textbox", { name: "Section name" }).fill("The turn");
  await page.getByRole("button", { name: "Save practice section" }).click();
  await page.getByRole("button", { name: "Loop section", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Loop on", exact: true }),
  ).toBeVisible();
  await page
    .locator("video")
    .first()
    .evaluate((element: HTMLVideoElement) => {
      const video = element as HTMLVideoElement & { loopObserved?: boolean };
      let last = video.currentTime;
      video.addEventListener("timeupdate", () => {
        if (last > 3 && video.currentTime < 2) video.loopObserved = true;
        last = video.currentTime;
      });
    });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(
      () =>
        page
          .locator("video")
          .first()
          .evaluate(
            (video: HTMLVideoElement & { loopObserved?: boolean }) =>
              !!video.loopObserved,
          ),
      { timeout: 15000, intervals: [100] },
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Note or moment" })
    .fill("Keep the steps small");
  await page
    .getByRole("button", { name: "Save note or moment", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Keep the steps small/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Library", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "artifacts/screenshots/player.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Export new trimmed video", exact: true })
    .click();
  await expect(
    page.getByText(
      "Trimmed-file export is available in the Android and iOS app.",
      { exact: false },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("tab", { name: "Today" }).click();
  await expect(
    page.getByRole("button", { name: "Play Bachata turn practice" }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/screenshots/today-with-video.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Play Bachata turn practice" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Play Bachata turn practice" })
    .click();
  await page
    .getByRole("button", { name: "Extra options", exact: true })
    .click();
  await expect(page.getByText("The turn", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Keep the steps small/ }),
  ).toBeVisible();
  expect(
    await page
      .locator("video")
      .first()
      .evaluate((v: HTMLVideoElement) => v.readyState),
  ).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await page
    .getByRole("button", { name: "Remove this local video", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep video", exact: true }).click();
  await expect(page.getByText("The turn", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Remove this local video", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove local copy", exact: true })
    .click();
  await expect(page.getByText("A home for your dance videos")).toBeVisible();
  expect(existsSync(fixture)).toBe(true);
});
test("dark theme and collection creation", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.screenshot({
    path: "artifacts/screenshots/settings-dark.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Library" }).click();
  await page
    .getByRole("textbox", { name: "Search your moves" })
    .fill("missing");
  await expect(page.getByText("A home for your dance videos")).toBeVisible();
  await page
    .getByRole("textbox", { name: "New collection" })
    .fill("Sunday basics");
  await page.getByRole("button", { name: "Create collection" }).click();
  await expect(page.getByText("Sunday basics")).toBeVisible();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByText("A fresh collection")).toBeVisible();
});

test("artist and video-type labels can be created, reused, edited and retained after reload", async ({
  page,
}) => {
  await page.goto("/upload");
  const importVideo = async (title: string) => {
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "Choose a video", exact: true })
      .click();
    await (await chooser).setFiles(fixture);
    await page
      .getByRole("textbox", { name: "Video title", exact: true })
      .fill(title);
    await page
      .getByRole("button", { name: "Choose labels", exact: true })
      .click();
  };
  await importVideo("Artist demo");
  for (const label of ["Partnerwork", "Daniel & Désirée"]) {
    await page
      .getByRole("textbox", { name: "Search labels", exact: true })
      .fill(label);
    await page
      .getByRole("button", {
        name:
          label === "Beginner" || label === "Partnerwork"
            ? `Select ${label}`
            : `Create “${label}”`,
        exact: true,
      })
      .click();
  }
  await page
    .getByRole("button", { name: "Done choosing labels", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add to my library", exact: true })
    .click();
  await page.waitForURL(/\/video\//);
  await expect(
    page.getByRole("button", {
      name: "Remove label Daniel & Désirée",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Remove label Partnerwork", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remove label Partnerwork", exact: true })
    .click();
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.getByText("Details saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Remove label Daniel & Désirée",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove label Partnerwork", exact: true }),
  ).toHaveCount(0);
  await page.goto("/upload");
  await importVideo("Second artist demo");
  await page
    .getByRole("textbox", { name: "Search labels", exact: true })
    .fill("daniel & désirée");
  await expect(page.getByRole("button", { name: /^Create / })).toHaveCount(0);
  await page.screenshot({
    path: "artifacts/screenshots/label-picker.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Select Daniel & Désirée", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Remove label Daniel & Désirée",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Done choosing labels", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add to my library", exact: true })
    .click();
  await page.waitForURL(/\/video\//);
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Remove label Daniel & Désirée",
      exact: true,
    }),
  ).toBeVisible();
});

test("Daily Picks chooses one rated video per style, supports a minimum rating and persists the daily mix", async ({
  page,
}) => {
  const add = async (
    title: string,
    style: "Salsa" | "Bachata",
    stars: number,
  ) => {
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
    await page.getByRole("button", { name: `${stars} ★`, exact: true }).click();
    await page
      .getByRole("button", { name: "Add to my library", exact: true })
      .click();
    await page.waitForURL(/\/video\//);
  };
  await add("Salsa five stars", "Salsa", 5);
  await add("Salsa three stars", "Salsa", 3);
  await add("Bachata four stars", "Bachata", 4);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Update today’s picks", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play Salsa five stars", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play Bachata four stars", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play Salsa three stars", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Play Bachata four stars", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/screenshots/daily-salsa-bachata.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("switch", {
      name: "One video per selected dance or source",
      exact: true,
    }),
  ).toBeChecked();
  await page.getByRole("button", { name: "5★ or higher", exact: true }).click();
  await page.getByRole("tab", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play Salsa five stars", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Your Bachata pick is waiting", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play Bachata four stars", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Skip today", exact: true }).click();
  await page.reload();
  await expect(
    page.getByText("A rest day counts, too.", { exact: true }),
  ).toBeVisible();
});
