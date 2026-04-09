import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { QuizProgressCard, type QuizProgressCardProps } from "./QuizProgressCard";

vi.mock("@arco-design/mobile-react", () => ({
  Progress: ({
    percentage,
    percentPosition,
    mountedTransition,
  }: {
    percentage: number;
    percentPosition?: string;
    mountedTransition?: boolean;
  }) =>
    createElement("div", {
      "data-testid": "progress",
      "data-percentage": String(percentage),
      "data-position": percentPosition ?? "",
      "data-transition": String(Boolean(mountedTransition)),
    }),
}));

vi.mock("@/features/quiz/components/QuizIcons", () => ({
  ClockIcon: ({ className }: { className?: string }) =>
    createElement("span", { "data-testid": "clock-icon", className }, "clock-icon"),
  HeartIcon: ({
    className,
    filled = false,
  }: {
    className?: string;
    filled?: boolean;
  }) =>
    createElement(
      "span",
      {
        "data-testid": filled ? "heart-filled" : "heart-empty",
        className,
      },
      filled ? "heart-filled" : "heart-empty"
    ),
}));

function createProps(
  overrides: Partial<QuizProgressCardProps> = {}
): QuizProgressCardProps {
  return {
    hasQuestion: true,
    isOceanAdventure: false,
    oceanRemainingDisplay: null,
    defaultOceanRemainingCount: 20,
    showProgress: true,
    totalQuestions: 10,
    questionOrdinal: 3,
    progressValue: 30,
    timeRemaining: 45,
    hpDisplay: {
      current: 2,
      initial: 3,
    },
    buzzerStatusLabel: "已抢答",
    progressUserLabel: "张三",
    oceanPlayMode: null,
    highlightTeamId: null,
    formatSeconds: (seconds) => `00:${String(seconds ?? 0).padStart(2, "0")}`,
    ...overrides,
  };
}

function hasExactTextContent(expected: string) {
  return (_content: string, element: Element | null) => {
    if (!element) return false;
    const normalizedText = element.textContent?.replace(/\s+/g, " ").trim();
    if (normalizedText !== expected) return false;

    return Array.from(element.children).every(
      (child) => child.textContent?.replace(/\s+/g, " ").trim() !== expected
    );
  };
}

describe("QuizProgressCard", () => {
  it("renders standard progress, timer, hp, and user status", () => {
    renderWithProviders(createElement(QuizProgressCard, createProps()));

    expect(screen.getByText(hasExactTextContent("3 / 10"))).toBeInTheDocument();
    expect(screen.getByTestId("clock-icon")).toBeInTheDocument();
    expect(screen.getByText("00:45")).toBeInTheDocument();
    expect(screen.getByLabelText("剩余血量 2，总血量 3")).toBeInTheDocument();
    expect(screen.getAllByTestId("heart-filled")).toHaveLength(2);
    expect(screen.getAllByTestId("heart-empty")).toHaveLength(1);
    expect(screen.getByText("已抢答")).toBeInTheDocument();
    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.getByTestId("progress")).toHaveAttribute("data-percentage", "30");
    expect(screen.getByTestId("progress")).toHaveAttribute("data-position", "innerLeft");
    expect(screen.getByTestId("progress")).toHaveAttribute("data-transition", "true");
  });

  it("uses ocean remaining count and hides progress bar when disabled", () => {
    renderWithProviders(
      createElement(
        QuizProgressCard,
        createProps({
          isOceanAdventure: true,
          oceanRemainingDisplay: 7,
          defaultOceanRemainingCount: 12,
          totalQuestions: undefined,
          questionOrdinal: 4,
          showProgress: false,
          timeRemaining: undefined,
          hpDisplay: null,
          buzzerStatusLabel: null,
          progressUserLabel: "红队",
          highlightTeamId: "red",
        })
      )
    );

    expect(screen.getByText(hasExactTextContent("4 / 7"))).toBeInTheDocument();
    expect(screen.getByText("红队")).toBeInTheDocument();
    expect(screen.queryByTestId("progress")).not.toBeInTheDocument();
    expect(screen.queryByTestId("clock-icon")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/剩余血量/)).not.toBeInTheDocument();
  });

  it("falls back to zero index and default ocean count when no question is active", () => {
    renderWithProviders(
      createElement(
        QuizProgressCard,
        createProps({
          hasQuestion: false,
          isOceanAdventure: true,
          oceanRemainingDisplay: null,
          defaultOceanRemainingCount: 12,
          questionOrdinal: 9,
          showProgress: false,
          timeRemaining: undefined,
          hpDisplay: null,
          buzzerStatusLabel: null,
          progressUserLabel: null,
        })
      )
    );

    expect(screen.getByText(hasExactTextContent("0 / 12"))).toBeInTheDocument();
  });

  it("applies team highlighting for non-ocean buzzer team labels", () => {
    renderWithProviders(
      createElement(
        QuizProgressCard,
        createProps({
          progressUserLabel: "蓝队",
          highlightTeamId: "blue",
        })
      )
    );

    const label = screen.getByText("蓝队");
    expect(label.className).toContain("progressUserBlue");
  });
});
