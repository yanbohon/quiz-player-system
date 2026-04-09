import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;
const authFile = "playwright/.auth/default-station.json";

process.env.PLAYWRIGHT_AUTH_FILE = authFile;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      NEXT_PUBLIC_E2E: "true",
      NEXT_PUBLIC_MQTT_ENABLED: "false",
      NEXT_PUBLIC_API_BASE_URL: "https://e2e.local",
      NEXT_PUBLIC_TIHAI_API_BASE: "https://e2e.local/tihai",
      NEXT_PUBLIC_FUSION_API_BASE: "https://e2e.local/fusion",
      NEXT_PUBLIC_FUSION_SPACE_ID: "e2e-space",
      NEXT_PUBLIC_FUSION_EVENT_NODE_ID: "e2e-event-node",
    },
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      testIgnore: [/.*\.setup\.ts/, /.*auth\.spec\.ts/, /.*broker\.spec\.ts/],
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
    },
    {
      name: "chromium-auth",
      testMatch: /.*auth\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
