import { createElement, type ButtonHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { OceanResultPanel, SpeedRunResultPanel } from "./QuizResultPanels";

vi.mock("@arco-design/mobile-react", () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement>) =>
    createElement("button", { type: "button", onClick, ...props }, children),
}));

describe("QuizResultPanels", () => {
  it("renders speed-run completion details and remaining time", () => {
    renderWithProviders(
      createElement(SpeedRunResultPanel, {
        isTimerExpired: false,
        isCompleted: true,
        total: 10,
        answered: 10,
        score: 8,
        wrong: 2,
        unanswered: 0,
        timeRemaining: 19,
        formatSeconds: (seconds) => `T-${seconds}`,
      })
    );

    expect(screen.getByText("全部题目完成")).toBeInTheDocument();
    expect(screen.getAllByText("当前得分").length).toBeGreaterThan(0);
    expect(screen.getAllByText("8").length).toBeGreaterThan(0);
    expect(screen.getByText("剩余时间")).toBeInTheDocument();
    expect(screen.getByText("T-19")).toBeInTheDocument();
    expect(screen.queryByText("未作答")).not.toBeInTheDocument();
  });

  it("renders ocean stats with score priority from live stats", () => {
    renderWithProviders(
      createElement(OceanResultPanel, {
        scoreFields: {
          得分: 11,
          备注: "备用字段",
        },
        stats: {
          total: 12,
          correct: 9,
          wrong: 3,
          score: 15,
          accuracy: 0.75,
        },
        statsStatus: "success",
        statsError: null,
        isEliminated: false,
        isTimerExpired: false,
        isPoolExhausted: true,
        onRetry: vi.fn(),
      })
    );

    expect(screen.getByText("全部题目完成")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("统计得分")).toBeInTheDocument();
    expect(screen.getByText("正确率")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("备注")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新获取成绩" })).not.toBeInTheDocument();
  });

  it("renders retry action when ocean stats loading fails", async () => {
    const onRetry = vi.fn();
    const { user } = renderWithProviders(
      createElement(OceanResultPanel, {
        scoreFields: {
          当前得分: 6,
        },
        stats: null,
        statsStatus: "error",
        statsError: "成绩服务暂时不可用",
        isEliminated: true,
        isTimerExpired: false,
        isPoolExhausted: false,
        onRetry,
      })
    );

    expect(screen.getByText("挑战结束")).toBeInTheDocument();
    expect(screen.getAllByText("6").length).toBeGreaterThan(0);
    expect(screen.getAllByText("当前得分").length).toBeGreaterThan(0);
    expect(screen.getByText("成绩服务暂时不可用")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新获取成绩" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
