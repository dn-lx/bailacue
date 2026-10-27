import { expect, test } from "@playwright/test";
import { emptyLibrary } from "../../src/core/types";
test("phone layouts contain long source/account labels and button rows at 320–412px", async ({
  page,
}) => {
  const library = emptyLibrary();
  library.connections = [
    {
      id: "c",
      provider: "google-drive",
      accountId: "synthetic",
      name: "Dancer",
      email: "a-very-long-dance-library-account@example.com",
      connected: false,
      writable: true,
    },
  ];
  library.sources = [
    {
      id: "s",
      connectionId: "c",
      provider: "google-drive",
      folderId: "folder",
      name: "Salsa classes and advanced combinations — Wednesday evening",
      defaultStyle: "Salsa",
      defaultLabels: ["Partnerwork", "Musicality"],
      writable: true,
    },
    {
      id: "b",
      connectionId: "c",
      provider: "google-drive",
      folderId: "bachata",
      name: "Bachata classes and musical interpretation — Saturday",
      defaultStyle: "Bachata",
      defaultLabels: [],
      writable: true,
    },
  ];
  await page.addInitScript(
    (l) =>
      localStorage.setItem("bailacue:device-library:v1", JSON.stringify(l)),
    library,
  );
  for (const width of [320, 360, 412]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/settings",
      "/storage",
      "/library",
      "/practice",
      "/upload",
      "/backups",
      "/sheets",
      "/labels",
      "/sharing",
      "/youtube",
    ]) {
      await page.goto(route);
      await expect(page.getByRole("button").first()).toBeVisible();
      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        buttons: [...document.querySelectorAll<HTMLElement>('[role="button"]')]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
          })
          .map((e) => e.textContent),
      }));
      expect(overflow, `${width}px ${route}`).toEqual({
        document: width,
        buttons: [],
      });
      if (width === 320 && ["/storage", "/settings"].includes(route)) {
        await page
          .getByText(library.sources[0].name, { exact: true })
          .last()
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `artifacts/screenshots/layout-${route.slice(1)}-320.png`,
          fullPage: true,
        });
      }
    }
  }
});

test("large text keeps Library and Settings controls inside a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  for (const route of ["/library", "/settings", "/practice", "/youtube"]) {
    await page.goto(route);
    await expect(page.getByRole("button").first()).toBeVisible();
    await page.evaluate(() => {
      for (const e of document.querySelectorAll<HTMLElement>(
        'div[dir="auto"]',
      )) {
        const style = getComputedStyle(e);
        e.style.fontSize = parseFloat(style.fontSize) * 1.5 + "px";
        e.style.lineHeight = "1.4";
      }
    });
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[role="button"]')]
        .filter((e) => {
          const b = e.getBoundingClientRect();
          return b.width > 0 && (b.left < -1 || b.right > innerWidth + 1);
        })
        .map((e) => e.textContent),
    );
    expect(clipped, route).toEqual([]);
  }
});
