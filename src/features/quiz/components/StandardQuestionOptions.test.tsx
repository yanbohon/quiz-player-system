import { createRef, type ButtonHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import type { StandardQuestion } from "@/features/quiz/types";
import { StandardQuestionOptions, type StandardQuestionOptionsProps } from "./StandardQuestionOptions";

vi.mock("@arco-design/mobile-react", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

function createQuestion(overrides: Partial<StandardQuestion> = {}): StandardQuestion {
  return {
    id: "question-1",
    title: "标准题",
    type: "single",
    options: [
      { value: "A", label: "选项 A" },
      { value: "B", label: "选项 B" },
    ],
    ...overrides,
  };
}

function createProps(
  overrides: Partial<StandardQuestionOptionsProps> = {}
): StandardQuestionOptionsProps {
  return {
    question: createQuestion(),
    selected: null,
    isAnswerRevealActive: false,
    answeringEnabled: true,
    isCommandSubmissionLocked: false,
    activeMatchingLeft: null,
    matchingSelectionMap: new Map(),
    matchingRightToLeftMap: new Map(),
    matchingUsedRightIds: new Set(),
    matchingOverlaySize: { width: 320, height: 180 },
    matchingLines: [],
    matchingBoardRef: createRef<HTMLDivElement>(),
    onSelect: vi.fn(),
    onToggleMultiOption: vi.fn(),
    onMatchingLeftClick: vi.fn(),
    onMatchingRightClick: vi.fn(),
    wordbankUsedValues: new Set(),
    wordbankActiveIndex: null,
    wordbankValues: [],
    onWordbankSelectOption: vi.fn(),
    pointSelectSelectedSet: new Set(),
    onPointSelectOption: vi.fn(),
    fillPreview: null,
    boardSubmitted: false,
    isBoardOpen: false,
    isBoardUploading: false,
    onOpenBoard: vi.fn(),
    ...overrides,
  };
}

describe("StandardQuestionOptions", () => {
  it("calls onToggleMultiOption for multiple-choice options", async () => {
    const onToggleMultiOption = vi.fn();
    const { user } = renderWithProviders(
      <StandardQuestionOptions
        {...createProps({
          question: createQuestion({
            type: "multiple",
            options: [
              { value: "A", label: "选项 A" },
              { value: "B", label: "选项 B" },
            ],
          }),
          selected: ["A"],
          onToggleMultiOption,
        })}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: /选项 B/i }));

    expect(onToggleMultiOption).toHaveBeenCalledWith("B");
  });

  it("passes the used flag for wordbank selections", async () => {
    const onWordbankSelectOption = vi.fn();
    const { user } = renderWithProviders(
      <StandardQuestionOptions
        {...createProps({
          question: createQuestion({
            type: "wordbank",
            options: [
              { value: "A", label: "苹果" },
              { value: "B", label: "香蕉" },
            ],
          }),
          wordbankUsedValues: new Set(["A"]),
          wordbankActiveIndex: 0,
          wordbankValues: ["A"],
          onWordbankSelectOption,
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: /苹果/i }));

    expect(onWordbankSelectOption).toHaveBeenCalledWith("A", true);
  });

  it("sanitizes matching left labels and routes left/right clicks", async () => {
    const onMatchingLeftClick = vi.fn();
    const onMatchingRightClick = vi.fn();
    const { user } = renderWithProviders(
      <StandardQuestionOptions
        {...createProps({
          question: createQuestion({
            type: "matching",
            options: [
              { value: "A", label: "巴黎" },
              { value: "B", label: "柏林" },
            ],
            matching: {
              left: [
                { id: "1", label: "1、法国" },
                { id: "2", label: "2、德国" },
              ],
              right: [
                { id: "A", label: "巴黎" },
                { id: "B", label: "柏林" },
              ],
            },
          }),
          onMatchingLeftClick,
          onMatchingRightClick,
        })}
      />
    );

    expect(screen.getByRole("button", { name: /法国/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /法国/i }));
    await user.click(screen.getByRole("button", { name: /巴黎/i }));

    expect(onMatchingLeftClick).toHaveBeenCalledWith("1");
    expect(onMatchingRightClick).toHaveBeenCalledWith("A");
  });

  it("marks selected point-select options and forwards clicks", async () => {
    const onPointSelectOption = vi.fn();
    const { user } = renderWithProviders(
      <StandardQuestionOptions
        {...createProps({
          question: createQuestion({
            type: "point-select",
            options: [
              { value: "A", label: "词语 A" },
              { value: "B", label: "词语 B" },
            ],
          }),
          pointSelectSelectedSet: new Set(["B"]),
          onPointSelectOption,
        })}
      />
    );

    const option = screen.getByRole("button", { name: /词语 B/i });
    expect(option).toHaveAttribute("aria-pressed", "true");

    await user.click(option);

    expect(onPointSelectOption).toHaveBeenCalledWith("B");
  });

  it("opens the board when fill questions are actionable", async () => {
    const onOpenBoard = vi.fn();
    const { user } = renderWithProviders(
      <StandardQuestionOptions
        {...createProps({
          question: createQuestion({
            type: "fill",
          }),
          onOpenBoard,
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: "打开画板" }));

    expect(onOpenBoard).toHaveBeenCalledTimes(1);
  });

  it("shows submitted preview state for fill questions", () => {
    renderWithProviders(
      <StandardQuestionOptions
        {...createProps({
          question: createQuestion({
            type: "fill",
          }),
          fillPreview: "data:image/png;base64,preview",
          boardSubmitted: true,
        })}
      />
    );

    expect(screen.queryByRole("button", { name: "打开画板" })).not.toBeInTheDocument();
    expect(screen.getByAltText("画板作答预览")).toBeInTheDocument();
    expect(screen.getByText("提交成功")).toBeInTheDocument();
  });
});
