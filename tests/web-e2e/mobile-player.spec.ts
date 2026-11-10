import { test, expect } from '@playwright/test';

test('mobile library and player controls stay within viewport', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('library.png'), fullPage: true });
  const cards = page.locator('[data-video-id], .video-card, .video-grid button, .video-grid a');
  if (await cards.count()) {
    await cards.first().click();
  }
  const controls = page.locator('#media-controls');
  if (await controls.isVisible().catch(() => false)) {
    await expect(page.locator('#media-play')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('player.png'), fullPage: true });
    const result = await page.evaluate(() => {
      const ids = ['media-back', 'media-play', 'media-forward', 'media-quality', 'media-speed', 'media-mirror', 'fullscreen-button'];
      const rects = ids.map(id => {
        const el = document.getElementById(id);
        if (!el || el.hidden || el.closest('[hidden]')) return null;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        return { id, left: r.left, right: r.right, center: r.left + r.width / 2, top: r.top };
      }).filter(Boolean);
      return { width: innerWidth, rects };
    });
    for (const r of result.rects) {
      expect(r.left, r.id).toBeGreaterThanOrEqual(-1);
      expect(r.right, r.id).toBeLessThanOrEqual(result.width + 1);
    }
    const back = result.rects.find(r => r.id === 'media-back');
    const play = result.rects.find(r => r.id === 'media-play');
    const forward = result.rects.find(r => r.id === 'media-forward');
    if (back && play && forward) {
      expect(Math.abs((play.center - back.center) - (forward.center - play.center))).toBeLessThanOrEqual(3);
    }
  }
});
