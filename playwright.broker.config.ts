import { defineConfig, devices } from "@playwright/test";
import {
  resolveBrokerEnv,
} from "./e2e/utils/broker-env";

const PORT = 3200;
const baseURL = `http://127.0.0.1:${PORT}`;
const authFile = "playwright/.auth/default-station-broker.json";
const brokerNamespace =
  process.env.PLAYWRIGHT_BROKER_NAMESPACE ??
  `contestant-app-e2e-live-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2, 8)}`;

process.env.PLAYWRIGHT_BROKER_NAMESPACE = brokerNamespace;
process.env.PLAYWRIGHT_AUTH_FILE = authFile;

const {
  BROKER_BUZZ_IN_TOPIC,
  BROKER_COMMAND_TOPIC,
  BROKER_CONTROL_TOPIC,
  BROKER_PASSWORD,
  BROKER_RESULT_TOPIC,
  BROKER_STATE_PREFIX,
  BROKER_URL,
  BROKER_USERNAME,
} = resolveBrokerEnv(process.env);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      VITE_E2E: "true",
      VITE_MQTT_ENABLED: "true",
      VITE_MQTT_URL: BROKER_URL,
      VITE_MQTT_USERNAME: BROKER_USERNAME,
      VITE_MQTT_PASSWORD: BROKER_PASSWORD,
      VITE_MQTT_TOPIC_COMMAND: BROKER_COMMAND_TOPIC,
      VITE_MQTT_TOPIC_CONTROL: BROKER_CONTROL_TOPIC,
      VITE_MQTT_TOPIC_RESULT: BROKER_RESULT_TOPIC,
      VITE_MQTT_TOPIC_BUZZ_IN: BROKER_BUZZ_IN_TOPIC,
      VITE_MQTT_TOPIC_STATE_PREFIX: BROKER_STATE_PREFIX,
      VITE_API_BASE_URL: "https://e2e.local",
      VITE_TIHAI_API_BASE: "https://e2e.local/tihai",
      VITE_FUSION_API_BASE: "https://e2e.local/fusion",
      VITE_FUSION_SPACE_ID: "e2e-space",
      VITE_FUSION_EVENT_NODE_ID: "e2e-event-node",
      NEXT_PUBLIC_E2E: "true",
      NEXT_PUBLIC_MQTT_ENABLED: "true",
      NEXT_PUBLIC_MQTT_URL: BROKER_URL,
      NEXT_PUBLIC_MQTT_USERNAME: BROKER_USERNAME,
      NEXT_PUBLIC_MQTT_PASSWORD: BROKER_PASSWORD,
      NEXT_PUBLIC_MQTT_TOPIC_COMMAND: BROKER_COMMAND_TOPIC,
      NEXT_PUBLIC_MQTT_TOPIC_CONTROL: BROKER_CONTROL_TOPIC,
      NEXT_PUBLIC_MQTT_TOPIC_RESULT: BROKER_RESULT_TOPIC,
      NEXT_PUBLIC_MQTT_TOPIC_BUZZ_IN: BROKER_BUZZ_IN_TOPIC,
      NEXT_PUBLIC_MQTT_TOPIC_STATE_PREFIX: BROKER_STATE_PREFIX,
      PLAYWRIGHT_BROKER_NAMESPACE: brokerNamespace,
      NEXT_PUBLIC_API_BASE_URL: "https://e2e.local",
      NEXT_PUBLIC_TIHAI_API_BASE: "https://e2e.local/tihai",
      NEXT_PUBLIC_FUSION_API_BASE: "https://e2e.local/fusion",
      NEXT_PUBLIC_FUSION_SPACE_ID: "e2e-space",
      NEXT_PUBLIC_FUSION_EVENT_NODE_ID: "e2e-event-node",
    },
  },
  projects: [
    {
      name: "setup-broker",
      testMatch: /.*auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "chromium-broker",
      dependencies: ["setup-broker"],
      testMatch: /.*broker\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
    },
  ],
});
