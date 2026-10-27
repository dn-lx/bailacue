import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    ...devices["Pixel 7"],
    browserName: "chromium",
    channel: process.env.BAILACUE_TEST_BROWSER === "chrome" ? "chrome" : undefined,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/serve-preview.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
