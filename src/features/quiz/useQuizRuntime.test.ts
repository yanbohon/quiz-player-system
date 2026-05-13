import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedQuestion } from "@/lib/normalizeQuestion";
import { useAppStore } from "@/store/useAppStore";
import { type StageConfig, useQuizStore } from "@/store/quizStore";
import { useQuizRuntime } from "./useQuizRuntime";

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerMocks.push,
    replace: routerMocks.replace,
  }),
}));

function createNormalizedQuestion(
  overrides: Partial<NormalizedQuestion> = {}
): NormalizedQuestion {
  return {
    id: "question-1",
    type: "单选题",
    content: "抢答题题干",
    options: [
      { value: "A", text: "选项 A" },
      { value: "B", text: "选项 B" },
    ],
    answer: ["A"],
    source: "default",
    ...overrides,
  };
}

function createStage(overrides: Partial<StageConfig> = {}): StageConfig {
  return {
    order: 1,
    stageId: "stage-speed-run",
    recordId: "record-stage-speed-run",
    name: "争分夺秒",
    displayName: "争分夺秒",
    questionSheetId: "sheet-speed-run",
    scoreSheetId: "score-speed-run",
    generalSheetId: "general-speed-run",
    kind: "standard",
    rawFields: {},
    ...overrides,
  };
}

describe("useQuizRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuizStore.getState().reset();

    const appState = useAppStore.getState();
    appState.setUser(null);
    appState.setOceanPlayMode(null);
    appState.setOceanGroupId(null);
    appState.setOceanGroupLocked(false);
    appState.setSprintTeamId(null);
    appState.setSprintTeamLocked(false);
    appState.setSprintTeamStageId(null);
    appState.setCurrentQuestion(null);
    appState.clearAnswers();
    appState.setMqttConnected(false);
  });

  it("keeps the current question visible after ultimate buzzer submission", async () => {
    useAppStore.getState().setUser({
      id: "1001",
      name: "一号竞答队",
    });
    useQuizStore.getState().setQuestions([createNormalizedQuestion()]);

    const { result } = renderHook(() => useQuizRuntime("ultimate-challenge"));

    await waitFor(() => {
      expect(result.current.state.phase).toBe("buzz");
      expect(result.current.state.question).toMatchObject({
        id: "question-1",
        title: "抢答题题干",
      });
    });

    act(() => {
      result.current.controls.delegateAnswerTo?.("1001", { isSelf: true });
    });

    expect(result.current.state.phase).toBe("answer");
    expect(result.current.state.answeringEnabled).toBe(true);

    await act(async () => {
      await result.current.controls.submitAnswer("A");
    });

    expect(result.current.state.phase).toBe("submitted");
    expect(result.current.state.answeringEnabled).toBe(false);
    expect(result.current.state.awaitingHost).toBe(true);
    expect(result.current.state.question).toMatchObject({
      id: "question-1",
      title: "抢答题题干",
    });
    expect(useAppStore.getState().answers["question-1"]).toMatchObject({
      value: "A",
      metadata: expect.objectContaining({
        mode: "ultimate-challenge",
        correct: true,
      }),
    });
  });

  it("uses the current stage URL field as the speed-run time limit when it is a pure number", async () => {
    useQuizStore.setState({
      currentStage: createStage({
        rawFields: {
          URL: "90",
        },
      }),
    });
    useQuizStore.getState().setQuestions([createNormalizedQuestion()]);

    const { result } = renderHook(() => useQuizRuntime("speed-run"));

    await waitFor(() => {
      expect(result.current.state.timeRemaining).toBe(90);
      expect(result.current.state.timeElapsed).toBe(0);
    });
  });

  it("falls back to 120 seconds when the speed-run stage URL field is empty", async () => {
    useQuizStore.setState({
      currentStage: createStage({
        rawFields: {
          URL: "",
        },
      }),
    });
    useQuizStore.getState().setQuestions([createNormalizedQuestion()]);

    const { result } = renderHook(() => useQuizRuntime("speed-run"));

    await waitFor(() => {
      expect(result.current.state.timeRemaining).toBe(120);
      expect(result.current.state.timeElapsed).toBe(0);
    });
  });
});
