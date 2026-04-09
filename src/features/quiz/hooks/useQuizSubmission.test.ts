import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Notify, Toast } from "@/lib/arco";
import type { NormalizedQuestion } from "@/lib/normalizeQuestion";
import type { OceanGroupId } from "@/features/quiz/oceanGroup";
import type {
  ContestModeId,
  CustomOceanQuestion,
  QuizRuntimeControls,
  QuizSubmissionResult,
  StandardQuestion,
} from "@/features/quiz/types";
import { useQuizSubmission, type UseQuizSubmissionOptions } from "./useQuizSubmission";

vi.mock("@/lib/arco", () => ({
  Notify: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  Toast: {
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    toast: vi.fn(),
  },
}));

vi.mock("@/lib/quizApiError", () => ({
  showQuizApiErrorToast: vi.fn(),
}));

function createStandardQuestion(
  overrides: Partial<StandardQuestion> = {}
): StandardQuestion {
  return {
    id: "question-1",
    title: "示例题目",
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
    stem: "题海题目",
    categories: ["分类"],
    correctBuckets: [],
    optionPool: [
      { id: "opt-1", label: "选项 1" },
      { id: "opt-2", label: "选项 2" },
    ],
    ...overrides,
  };
}

function createControls(
  overrides: Partial<QuizRuntimeControls> = {}
): QuizRuntimeControls {
  return {
    submitAnswer: vi.fn<QuizRuntimeControls["submitAnswer"]>().mockResolvedValue(undefined),
    requestNextQuestion: vi.fn<QuizRuntimeControls["requestNextQuestion"]>().mockResolvedValue(),
    reset: vi.fn<QuizRuntimeControls["reset"]>().mockResolvedValue(),
    startLocalTimer: vi.fn(),
    stopLocalTimer: vi.fn(),
    ...overrides,
  };
}

function createNormalizedQuestion(
  overrides: Partial<NormalizedQuestion> = {}
): NormalizedQuestion {
  return {
    id: "question-1",
    type: "single",
    content: "示例题目",
    options: [
      { value: "A", text: "选项 A" },
      { value: "B", text: "选项 B" },
    ],
    answer: ["A"],
    recordId: "question-record-1",
    raw: { number: "3" },
    source: "default",
    ...overrides,
  };
}

function createOptions(
  overrides: Partial<UseQuizSubmissionOptions> = {}
): UseQuizSubmissionOptions {
  const controls = createControls();
  return {
    question: createStandardQuestion(),
    selected: "A",
    matchingPairs: [],
    setMatchingPairs: vi.fn(),
    controls,
    runtimeState: {
      answeringEnabled: true,
      questionIndex: 0,
      timeRemaining: 45,
    },
    modeId: "qa",
    normalizedQuestions: [createNormalizedQuestion()],
    currentStage: undefined,
    scoreRecord: undefined,
    userId: "user-1",
    sprintTeamId: null satisfies OceanGroupId | null,
    notifyOffset: 68,
    shouldHandleSubmitCommand: false,
    isLastStandMode: false,
    isGroupedLastStand: false,
    shouldSyncLastStandStatus: false,
    enqueueJob: vi.fn(),
    onCommandSubmissionStateChange: vi.fn(),
    onOceanStatsPatch: vi.fn(),
    ...overrides,
  };
}

describe("useQuizSubmission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValue("00000000-0000-4000-8000-000000000123");
  });

  it("throttles repeated manual submissions within the guard interval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const controls = createControls();
    const options = createOptions({
      controls,
    });

    const { result } = renderHook(() => useQuizSubmission(options));

    await act(async () => {
      await result.current.submit();
    });
    await act(async () => {
      await result.current.submit();
    });

    expect(controls.submitAnswer).toHaveBeenCalledTimes(1);
    expect(Toast.info).toHaveBeenCalledWith("操作过于频繁，请稍后再试", 500);
  });

  it("blocks matching submissions until all pairs are completed", async () => {
    const controls = createControls();
    const setMatchingPairs = vi.fn();
    const options = createOptions({
      question: createStandardQuestion({
        type: "matching",
        options: [
          { value: "A", label: "Paris" },
          { value: "B", label: "Berlin" },
        ],
        matching: {
          left: [
            { id: "1", label: "France" },
            { id: "2", label: "Germany" },
          ],
          right: [
            { id: "A", label: "Paris" },
            { id: "B", label: "Berlin" },
          ],
        },
      }),
      selected: null,
      matchingPairs: ["1:A"],
      setMatchingPairs,
      controls,
    });

    const { result } = renderHook(() => useQuizSubmission(options));

    await act(async () => {
      await result.current.submit();
    });

    expect(Toast.warn).toHaveBeenCalledWith("请完成全部连线");
    expect(controls.submitAnswer).not.toHaveBeenCalled();
    expect(setMatchingPairs).not.toHaveBeenCalled();
  });

  it("enqueues sync tasks and locks the UI for command submissions", async () => {
    const controls = createControls({
      submitAnswer: vi
        .fn<QuizRuntimeControls["submitAnswer"]>()
        .mockResolvedValue({ correct: true } satisfies QuizSubmissionResult),
    });
    const enqueueJob = vi.fn();
    const onCommandSubmissionStateChange = vi.fn();

    const options = createOptions({
      controls,
      modeId: "qa" satisfies ContestModeId,
      shouldHandleSubmitCommand: true,
      currentStage: {
        questionSheetId: "question-sheet-1",
        scoreSheetId: "score-sheet-1",
        name: "普通赛",
      },
      scoreRecord: {
        recordId: "score-record-1",
        fields: {},
      },
      enqueueJob,
      onCommandSubmissionStateChange,
      normalizedQuestions: [
        createNormalizedQuestion({
          id: "question-1",
          recordId: "question-record-1",
          raw: { number: "3" },
        }),
      ],
    });

    const { result } = renderHook(() => useQuizSubmission(options));

    await act(async () => {
      await result.current.submit({ source: "command" });
    });

    expect(controls.submitAnswer).toHaveBeenCalledWith("A", {
      requestId: "00000000-0000-4000-8000-000000000123",
      timeoutMs: 5000,
    });
    expect(onCommandSubmissionStateChange).toHaveBeenCalledWith({
      locked: true,
      overlayVisible: true,
      answerRevealActive: false,
    });
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "00000000-0000-4000-8000-000000000123-sync",
        label: "普通赛 · 第 3 题",
        details: {
          stageLabel: "普通赛",
          questionLabel: "第 3 题",
          answerLabel: "A",
        },
        tasks: [
          {
            type: "answer-choice",
            params: {
              datasheetId: "question-sheet-1",
              recordId: "question-record-1",
              userId: "user-1",
              fieldKey: "user-1",
              answer: "A",
            },
          },
          {
            type: "judge-result",
            params: expect.objectContaining({
              datasheetId: "score-sheet-1",
              recordId: "score-record-1",
              questionId: "3",
              answer: "1",
              light: "1",
            }),
          },
        ],
      })
    );
    expect(Toast.success).not.toHaveBeenCalled();
    expect(Notify.success).not.toHaveBeenCalled();
  });

  it("does not auto-advance ocean questions when a wrong answer ends the run", async () => {
    const controls = createControls({
      submitAnswer: vi
        .fn<QuizRuntimeControls["submitAnswer"]>()
        .mockResolvedValue({
          correct: false,
          rawResult: "wrong",
          hpAfterAnswer: 0,
          score: { total: 9 },
          stats: {
            total: 4,
            correct: 2,
            wrong: 2,
            accuracy: 0.5,
            lastAnswerTime: 123456,
          },
        } satisfies QuizSubmissionResult),
    });
    const onOceanStatsPatch = vi.fn();

    const options = createOptions({
      question: createOceanQuestion(),
      selected: ["opt-1"],
      controls,
      modeId: "ocean-adventure",
      onOceanStatsPatch,
      normalizedQuestions: [],
    });

    const { result } = renderHook(() => useQuizSubmission(options));

    await act(async () => {
      await result.current.submit();
    });

    expect(onOceanStatsPatch).toHaveBeenCalledWith(
      {
        total: 4,
        correct: 2,
        wrong: 2,
        accuracy: 0.5,
        lastAnswerTime: 123456,
        score: 9,
      },
      { finished: true }
    );
    expect(controls.requestNextQuestion).not.toHaveBeenCalled();
    expect(Notify.error).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "回答错误",
      })
    );
  });

  it("uses the sprint team as the question-sheet field key in buzzer sprint", async () => {
    const controls = createControls({
      submitAnswer: vi
        .fn<QuizRuntimeControls["submitAnswer"]>()
        .mockResolvedValue({ correct: true } satisfies QuizSubmissionResult),
    });
    const enqueueJob = vi.fn();

    const options = createOptions({
      controls,
      modeId: "buzzer-sprint" satisfies ContestModeId,
      sprintTeamId: "red",
      shouldHandleSubmitCommand: true,
      currentStage: {
        questionSheetId: "question-sheet-1",
        scoreSheetId: "score-sheet-1",
        name: "抢答冲刺",
      },
      scoreRecord: {
        recordId: "score-record-1",
        fields: {},
      },
      enqueueJob,
    });

    const { result } = renderHook(() => useQuizSubmission(options));

    await act(async () => {
      await result.current.submit({ source: "command" });
    });

    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        tasks: expect.arrayContaining([
          expect.objectContaining({
            type: "answer-choice",
            params: expect.objectContaining({
              userId: "user-1",
              fieldKey: "red",
            }),
          }),
        ]),
      })
    );
  });
});
