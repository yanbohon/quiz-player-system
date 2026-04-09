import { expect, test } from "./fixtures";

test("waiting page renders the ranking ticket view", async ({ quizApp }) => {
  await quizApp.goto("/waiting", {
    quiz: {
      selectedEvent: {
        id: "event-1",
        name: "测试赛事",
        type: "folder",
        index: 0,
      },
      teamProfile: {
        recordId: "team-1",
        identifier: "1001",
        displayName: "测试中学",
        fields: {
          学校名: "测试中学",
        },
      },
      waitingTicketView: "rank",
      rankStatus: "success",
      rankEntries: [
        { id: "r1", schoolName: "测试中学", score: 100 },
        { id: "r2", schoolName: "第二中学", score: 95 },
      ],
    },
  });

  await expect(quizApp.page.getByText("比赛等待区")).toBeVisible();
  await expect(quizApp.page.getByText("总分排行榜")).toBeVisible();
  await expect(quizApp.page.getByText("测试中学")).toBeVisible();
  await expect(quizApp.page.getByText("第二中学")).toBeVisible();
  await expect(quizApp.page.getByText("100分")).toBeVisible();
  await expect(quizApp.page.getByText("95分")).toBeVisible();
});
