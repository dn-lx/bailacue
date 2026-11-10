import { test, expect } from '@playwright/test';

const layouts = [
  { name: 'small-phone', width: 320, height: 720 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'large-phone', width: 430, height: 932 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'wide-desktop', width: 1920, height: 1080 },
];

for (const layout of layouts) {
  test(`player controls fit and align: ${layout.name} (${layout.width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await page.goto('/#library');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('library.png'), fullPage: true });

    const open = page.locator('[data-action="open"][data-id]').first();
    await expect(open, 'Library must have an actionable video card').toBeVisible({ timeout: 20000 });
    await open.click();
    const dialog = page.locator('dialog#player');
    await expect(dialog, 'Player must actually open; never silently skip visual assertions').toBeVisible();
    const controls = page.locator('#media-controls');
    await expect(controls).toBeVisible();
    await expect(page.locator('#media-play')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('player.png'), fullPage: true });

    const geometry = await page.evaluate(() => {
      const ids = ['media-back', 'media-play', 'media-forward', 'media-mute',
        'media-quality', 'media-speed', 'media-mirror', 'fullscreen-button'];
      const rects = ids.map(id => {
        const el = document.getElementById(id);
        if (!el || el.hidden || el.closest('[hidden]')) return null;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return null;
        return { id, x: r.x, y: r.y, right: r.right, bottom: r.bottom,
          width: r.width, height: r.height, centerX: r.x + r.width / 2 };
      }).filter((v): v is NonNullable<typeof v> => Boolean(v));
      const bounds = document.querySelector('#media-controls')!.getBoundingClientRect();
      return { width: innerWidth, bounds: { left: bounds.left, right: bounds.right }, rects };
    });
    expect(geometry.rects.length, 'Player controls must be present').toBeGreaterThanOrEqual(5);
    for (const r of geometry.rects) {
      expect(r.x, `${r.id} off left edge`).toBeGreaterThanOrEqual(-1);
      expect(r.right, `${r.id} off right edge`).toBeLessThanOrEqual(geometry.width + 1);
      expect(r.x, `${r.id} outside control panel`).toBeGreaterThanOrEqual(geometry.bounds.left - 2);
      expect(r.right, `${r.id} outside control panel`).toBeLessThanOrEqual(geometry.bounds.right + 2);
      expect(r.height, `${r.id} touch height`).toBeGreaterThanOrEqual(28);
    }
    const get = (id: string) => geometry.rects.find(r => r.id === id);
    const back = get('media-back'), play = get('media-play'), forward = get('media-forward');
    expect(back).toBeTruthy(); expect(play).toBeTruthy(); expect(forward).toBeTruthy();
    if (back && play && forward) {
      expect(Math.abs((play.centerX - back.centerX) - (forward.centerX - play.centerX)),
        'Back / Play / Forward must be symmetrical').toBeLessThanOrEqual(4);
      expect(Math.abs(back.y - forward.y), 'Skip buttons must share a baseline').toBeLessThanOrEqual(3);
    }
    const quality = get('media-quality'), speed = get('media-speed');
    if (quality && speed) {
      expect(Math.abs(quality.y - speed.y), 'Quality and speed must align').toBeLessThanOrEqual(4);
      expect(quality.right <= speed.x || speed.right <= quality.x,
        'Quality and speed must not overlap').toBeTruthy();
    }
    const mute = get('media-mute'), mirror = get('media-mirror');
    if (layout.width <= 430 && mute && mirror && speed) {
      expect(mute.y, 'Volume should be above secondary controls on phones').toBeLessThan(speed.y);
    }
  });
}
