import { expect, test } from "./fixtures";

test("ultimate-challenge shows the waiting state before a question is pushed", async ({
  quizApp,
}) => {
  await quizApp.goto("/quiz?mode=ultimate-challenge");

  await expect(quizApp.page.getByText("等待主持人推送题目")).toBeVisible();
  await expect(quizApp.page.getByText("等待主持人", { exact: true })).toBeVisible();
});

test("ultimate-pk shows the locked switching state by default", async ({ quizApp }) => {
  await quizApp.goto("/quiz?mode=ultimate-pk");

  await expect(quizApp.page.getByText("等待主持人允许切换")).toBeVisible();
  await expect(quizApp.page.getByRole("radio", { name: "正方" })).toBeVisible();
  await expect(quizApp.page.getByRole("radio", { name: "反方" })).toBeVisible();
  await expect(quizApp.page.getByRole("button", { name: "切换发言" })).toBeDisabled();
});
