import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import {
  CommandSubmissionOverlay,
  CommandSubmissionResult,
  EliminationStatePanel,
} from "./QuizFeedbackPanels";

vi.mock("@/features/quiz/components/QuizIcons", () => ({
  SuccessCheckIcon: () =>
    createElement("span", {
      "data-testid": "success-icon",
      "aria-hidden": "true",
    }),
  EliminatedIcon: () =>
    createElement("span", {
      "data-testid": "eliminated-icon",
      "aria-hidden": "true",
    }),
}));

describe("QuizFeedbackPanels", () => {
  it("renders command submission result content", () => {
    renderWithProviders(<CommandSubmissionResult />);

    expect(screen.getByTestId("success-icon")).toBeInTheDocument();
    expect(screen.getByText("提交成功")).toBeInTheDocument();
    expect(screen.getByText("请等待大屏公示")).toBeInTheDocument();
  });

  it("renders live status overlay for command submission", () => {
    renderWithProviders(<CommandSubmissionOverlay />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("提交成功")).toBeInTheDocument();
    expect(screen.getByText("请等待大屏公示")).toBeInTheDocument();
  });

  it("renders elimination feedback when hp is depleted", () => {
    renderWithProviders(<EliminationStatePanel />);

    expect(screen.getByTestId("eliminated-icon")).toBeInTheDocument();
    expect(screen.getByText("您已淘汰")).toBeInTheDocument();
    expect(screen.getByText("血量已耗尽，无法继续作答。")).toBeInTheDocument();
  });
});
