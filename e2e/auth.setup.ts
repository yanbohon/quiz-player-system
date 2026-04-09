import fs from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { loginAsDefaultStation } from "./utils/bridge";

const AUTH_FILE = path.join(
  process.cwd(),
  process.env.PLAYWRIGHT_AUTH_FILE ?? "playwright/.auth/default-station.json"
);

setup("authenticate default station", async ({ page }) => {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  await loginAsDefaultStation(page);
  await expect(page.getByText("比赛等待区")).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});
