import { expect, test } from "@playwright/test";
test("visible actions retain their backgrounds and chip rows center in both themes with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const add = page.getByRole("button", {
    name: "Add your first video",
    exact: true,
  });
  await expect(add).toBeVisible();
  expect(await add.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(
    "rgb(199, 220, 255)",
  );
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const width of [320, 412]) {
      await page.setViewportSize({ width, height: 915 });
      for (const route of ["library", "settings", "practice"]) {
        await page.goto("/" + route);
        await expect(page.getByRole("button").first()).toBeVisible();
        const rows = await page.evaluate(() => {
          const result: { error: number; labels: string[] }[] = [];
          for (const parent of document.querySelectorAll<HTMLElement>("div")) {
            const style = getComputedStyle(parent);
            if (style.flexDirection !== "row" || style.flexWrap !== "wrap")
              continue;
            const chips = [...parent.children].filter(
              (c) =>
                c.getAttribute("role") === "button" &&
                parseFloat(getComputedStyle(c).borderRadius) >= 20,
            );
            if (chips.length < 2 || chips.length !== parent.children.length)
              continue;
            const rect = parent.getBoundingClientRect(),
              lines = new Map<number, DOMRect[]>();
            for (const chip of chips) {
              const r = chip.getBoundingClientRect();
              if (r.width === 0) continue;
              const key = Math.round(r.top);
              lines.set(key, [...(lines.get(key) ?? []), r]);
            }
            for (const line of lines.values())
              result.push({
                error: Math.abs(
                  (Math.min(...line.map((r) => r.left)) +
                    Math.max(...line.map((r) => r.right))) /
                    2 -
                    (rect.left + rect.right) / 2,
                ),
                labels: chips.map((c) => c.textContent ?? ""),
              });
          }
          return result;
        });
        expect(rows.length).toBeGreaterThan(0);
        expect(
          rows.filter((row) => row.error > 1),
          `${route} ${width} ${colorScheme}`,
        ).toEqual([]);
        await page.screenshot({
          path: `artifacts/screenshots/design-${route}-${width}-${colorScheme}.png`,
          fullPage: true,
        });
      }
    }
  }
});
