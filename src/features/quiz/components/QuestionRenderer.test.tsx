import {
  createElement,
  createRef,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { parseWordbankTemplate } from "@/features/quiz/utils/answering";
import type { CustomOceanQuestion, StandardQuestion } from "@/features/quiz/types";
import type { OceanQuestionOptionsProps } from "./OceanQuestionOptions";
import { QuestionRenderer, type QuestionRendererProps } from "./QuestionRenderer";
import type { StandardQuestionOptionsProps } from "./StandardQuestionOptions";

vi.mock("@arco-design/mobile-react", () => ({
  Tag: ({ children }: { children?: ReactNode }) =>
    createElement("span", { "data-testid": "tag" }, children),
}));

vi.mock("@/components/icons/trash.svg", () => ({
  default: { src: "/trash.svg" },
}));

vi.mock("@/features/quiz/components/StandardQuestionOptions", () => ({
  StandardQuestionOptions: () =>
    createElement("div", { "data-testid": "standard-options" }, "standard-options"),
}));

vi.mock("@/features/quiz/components/OceanQuestionOptions", () => ({
  OceanQuestionOptions: () =>
    createElement("div", { "data-testid": "ocean-options" }, "ocean-options"),
}));

vi.mock("@/features/quiz/components/QuizFeedbackPanels", () => ({
  CommandSubmissionOverlay: () =>
    createElement("div", { "data-testid": "command-overlay" }, "command-overlay"),
}));

function createStandardQuestion(
  overrides: Partial<StandardQuestion> = {}
): StandardQuestion {
  return {
    id: "question-1",
    title: "标准题题干",
    type: "single",
    options: [
      { value: "A", label: "选项 A" },
      { value: "B", label: "选项 B" },
    ],
    ...overrides,
  };
}

function createOceanQuestion(
  overrides: Partial<CustomOceanQuestion> = {}
): CustomOceanQuestion {
  return {
    questionKey: "ocean-1",
    stem: "题海题题干",
    categories: ["历史", "多选题"],
    correctBuckets: [],
    optionPool: [
      { id: "opt-1", label: "选项 1" },
      { id: "opt-2", label: "选项 2" },
    ],
    ...overrides,
  };
}

function createStandardOptionsProps(
  question: StandardQuestion,
  overrides: Partial<StandardQuestionOptionsProps> = {}
): StandardQuestionOptionsProps {
  return {
    question,
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

function createOceanOptionsProps(
  question: CustomOceanQuestion,
  overrides: Partial<OceanQuestionOptionsProps> = {}
): OceanQuestionOptionsProps {
  return {
    question,
    selected: null,
    setSelected: vi.fn() as unknown as Dispatch<SetStateAction<string | string[] | null>>,
    answeringEnabled: true,
    isCommandSubmissionLocked: false,
    isAnswerRevealActive: false,
    ...overrides,
  };
}

function createProps(
  overrides: Partial<QuestionRendererProps> = {}
): QuestionRendererProps {
  const question = createStandardQuestion();
  return {
    question,
    questionTags: ["单选题"],
    answerBadgeText: "A",
    selectionSummary: {
      tokens: ["A"],
    },
    isImageQuestion: false,
    illustrationNode: createElement("div", { "data-testid": "illustration" }, "illustration"),
    shouldShowCommandOverlay: false,
    isWordbankQuestion: false,
    wordbankTemplate: null,
    wordbankOptionLabelMap: null,
    wordbankValues: [],
    wordbankActiveIndex: null,
    onWordbankBlankClick: vi.fn(),
    onWordbankClear: vi.fn(),
    isMatchingQuestion: false,
    matchingPrompt: null,
    matchingPairsCount: 0,
    onClearMatchingPairs: vi.fn(),
    isPointSelectQuestion: false,
    pointSelectValues: [],
    pointSelectDisplayTokens: [],
    onPointSelectClear: vi.fn(),
    standardOptionsProps: createStandardOptionsProps(question),
    oceanOptionsProps: undefined,
    ...overrides,
  };
}

describe("QuestionRenderer", () => {
  it("renders wordbank title blanks and routes blank actions", async () => {
    const question = createStandardQuestion({
      type: "wordbank",
      title: "我喜欢{{fruit}}，也喜欢{{drink}}。",
    });
    const onWordbankBlankClick = vi.fn();
    const onWordbankClear = vi.fn();

    const { user } = renderWithProviders(
      <QuestionRenderer
        {...createProps({
          question,
          isWordbankQuestion: true,
          wordbankTemplate: parseWordbankTemplate(question.title),
          wordbankOptionLabelMap: new Map([["A", "苹果"]]),
          wordbankValues: ["A", ""],
          wordbankActiveIndex: 1,
          onWordbankBlankClick,
          onWordbankClear,
          standardOptionsProps: createStandardOptionsProps(question, {
            question,
          }),
        })}
      />
    );

    expect(screen.getByText("苹果")).toBeInTheDocument();
    expect(screen.getByText("点击填空")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "苹果" }));
    await user.click(screen.getByRole("button", { name: "点击填空" }));

    expect(onWordbankClear).toHaveBeenCalledWith(0);
    expect(onWordbankBlankClick).toHaveBeenCalledWith(1);
  });

  it("renders matching prompt, clear action, and command overlay", async () => {
    const question = createStandardQuestion({
      type: "matching",
      matching: {
        left: [{ id: "1", label: "国家" }],
        right: [{ id: "A", label: "首都" }],
      },
    });
    const onClearMatchingPairs = vi.fn();
    const { user } = renderWithProviders(
      <QuestionRenderer
        {...createProps({
          question,
          questionTags: ["连线题"],
          isMatchingQuestion: true,
          matchingPrompt: "请完成连线\n可多次修改",
          matchingPairsCount: 1,
          onClearMatchingPairs,
          shouldShowCommandOverlay: true,
          standardOptionsProps: createStandardOptionsProps(question, {
            question,
          }),
        })}
      />
    );

    expect(screen.getByText("请完成连线")).toBeInTheDocument();
    expect(screen.getByText("可多次修改")).toBeInTheDocument();
    expect(screen.getByTestId("standard-options")).toBeInTheDocument();
    expect(screen.getByTestId("command-overlay")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "清空连线" }));
    expect(onClearMatchingPairs).toHaveBeenCalledTimes(1);
  });

  it("renders point-select summary input and clear action", async () => {
    const question = createStandardQuestion({
      type: "point-select",
      title: "请点选作答",
    });
    const onPointSelectClear = vi.fn();
    const { user } = renderWithProviders(
      <QuestionRenderer
        {...createProps({
          question,
          isPointSelectQuestion: true,
          pointSelectValues: ["A", "B"],
          pointSelectDisplayTokens: [
            { key: "A-0", text: "春" },
            { key: "B-1", text: "天" },
          ],
          onPointSelectClear,
          standardOptionsProps: createStandardOptionsProps(question, {
            question,
          }),
        })}
      />
    );

    expect(screen.getByRole("textbox", { name: "已选择词语" })).toHaveTextContent("春天");

    await user.click(screen.getByRole("button", { name: "清空" }));
    expect(onPointSelectClear).toHaveBeenCalledTimes(1);
  });

  it("hides selection summary for image questions", () => {
    const question = createStandardQuestion();
    renderWithProviders(
      <QuestionRenderer
        {...createProps({
          question,
          isImageQuestion: true,
          selectionSummary: {
            tokens: ["A"],
          },
          standardOptionsProps: createStandardOptionsProps(question, {
            question,
          }),
        })}
      />
    );

    expect(screen.queryByText("已选：")).not.toBeInTheDocument();
    expect(screen.getByText("答案：")).toBeInTheDocument();
  });

  it("renders ocean categories, summary, and command overlay", () => {
    const question = createOceanQuestion();

    renderWithProviders(
      <QuestionRenderer
        {...createProps({
          question,
          questionTags: ["题海题"],
          answerBadgeText: "A / B",
          selectionSummary: {
            tokens: ["A", "B"],
          },
          shouldShowCommandOverlay: true,
          standardOptionsProps: undefined,
          oceanOptionsProps: createOceanOptionsProps(question),
        })}
      />
    );

    expect(screen.getByText("题海题题干")).toBeInTheDocument();
    expect(screen.getByText("历史")).toBeInTheDocument();
    expect(screen.getByText("多选题")).toBeInTheDocument();
    expect(screen.getByText("已选：")).toBeInTheDocument();
    expect(screen.getByTestId("ocean-options")).toBeInTheDocument();
    expect(screen.getByTestId("command-overlay")).toBeInTheDocument();
  });
});
