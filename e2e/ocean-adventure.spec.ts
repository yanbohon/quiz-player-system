import { expect, test } from "./fixtures";

test("ocean-adventure grabs the next question after a successful submission", async ({
  quizApp,
}) => {
  await quizApp.mockGrabQuestionSequence([
    {
      success: true,
      questionId: "ocean-1",
      remainingCount: 9,
      question: {
        id: "ocean-1",
        title: "题海题 1",
        type: "单选题",
        options: [
          { value: "opt-1", text: "第一项" },
          { value: "opt-2", text: "第二项" },
        ],
        answer: ["opt-1"],
        categories: ["历史"],
      },
    },
    {
      success: true,
      questionId: "ocean-2",
      remainingCount: 8,
      question: {
        id: "ocean-2",
        title: "题海题 2",
        type: "单选题",
        options: [
          { value: "opt-1", text: "继续作答" },
          { value: "opt-2", text: "错误选项" },
        ],
        answer: ["opt-1"],
        categories: ["地理"],
      },
    },
  ]);

  await quizApp.mockSubmitAnswerSequence([
    {
      success: true,
      result: "correct",
      correctAnswer: ["opt-1"],
      score: {
        total: 10,
        increment: 10,
      },
      stats: {
        total: 1,
        correct: 1,
        wrong: 0,
        accuracy: 1,
      },
    },
  ]);

  await quizApp.goto("/quiz?mode=ocean-adventure", {
    app: {
      oceanPlayMode: "solo",
    },
  });

  await expect(quizApp.page.getByText("题海题 1")).toBeVisible();
  await expect(quizApp.page.getByText("历史")).toBeVisible();

  await quizApp.page.getByRole("radio", { name: /第一项/ }).click();
  await quizApp.page.getByRole("button", { name: "提交并抢下一题" }).click();

  await expect(quizApp.page.getByText("题海题 2")).toBeVisible();
  await expect(quizApp.page.getByText("地理")).toBeVisible();
});
