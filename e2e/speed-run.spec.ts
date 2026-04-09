import { expect, test } from "./fixtures";

const speedStage = {
  order: 1,
  stageId: "1",
  recordId: "stage-speed",
  name: "争分夺秒",
  displayName: "争分夺秒",
  questionSheetId: "sheet-speed",
  scoreSheetId: "score-speed",
  generalSheetId: "general-speed",
  kind: "standard",
  rawFields: {},
};

test("speed-run loads stage questions and advances to the next question after submit", async ({
  quizApp,
}) => {
  await quizApp.mockFusionDatasheet("sheet-speed", [
    {
      recordId: "q1",
      fields: {
        ID: "q1",
        type: "单选题",
        stem: "速度题 1",
        options: "A. 正确答案\nB. 错误答案",
        answer: "A",
      },
    },
    {
      recordId: "q2",
      fields: {
        ID: "q2",
        type: "单选题",
        stem: "速度题 2",
        options: "A. 第二题正确\nB. 第二题错误",
        answer: "A",
      },
    },
  ]);

  await quizApp.goto("/quiz?mode=speed-run", {
    quiz: {
      stages: [speedStage],
      currentStage: speedStage,
      selectedEvent: {
        id: "event-speed",
        name: "速度赛测试",
        type: "folder",
        index: 0,
      },
      waitingForStageStart: false,
      questionGateOpened: true,
    },
  });

  await expect(quizApp.page.getByText("题目加载完成")).toBeVisible();

  await quizApp.setQuizState({
    waitingForStageStart: false,
    questionGateOpened: true,
    currentIndex: 0,
  });

  await expect(quizApp.page.getByText("速度题 1")).toBeVisible();
  await quizApp.page.getByRole("radio", { name: /正确答案/ }).click();
  await quizApp.page.getByRole("button", { name: "提交并进入下一题" }).click();

  await expect(quizApp.page.getByText("速度题 2")).toBeVisible();
});
