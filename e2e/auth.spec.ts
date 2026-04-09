import { expect, test } from "@playwright/test";

test("station login redirects to waiting page and logout returns to login", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(page.getByText("选手登录")).toBeVisible();
  await expect(page.getByText("请选择所属队伍的参赛台号，点击按钮即可登录。")).toBeVisible();

  await page.getByRole("button", { name: "ID 1001 1号台" }).click();
  await page.waitForFunction(() => window.location.pathname === "/waiting");

  await expect(page.getByText("比赛等待区")).toBeVisible();
  await expect(page.getByText("1001")).toBeVisible();

  await page.getByRole("button", { name: "退出登录" }).click();
  await page.waitForFunction(() => window.location.pathname === "/login");

  await expect(page.getByText("选手登录")).toBeVisible();
});
