import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number.parseInt(process.env.SVG_E2E_PORT ?? "43174", 10);
if (!Number.isSafeInteger(e2ePort) || e2ePort < 1 || e2ePort > 65_535) {
  throw new RangeError("SVG_E2E_PORT must be an integer from 1 through 65535");
}
const e2eOrigin = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: e2eOrigin,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${e2ePort}`,
    url: e2eOrigin,
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
