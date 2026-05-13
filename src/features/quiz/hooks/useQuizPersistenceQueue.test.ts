import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuizApiError } from "@/lib/fusionClient";
import { Toast } from "@/lib/arco";
import { showQuizApiErrorToast } from "@/lib/quizApiError";
import {
  PERSISTENCE_STORAGE_KEY,
  readPersistedPersistenceState,
  sanitizePersistenceJob,
  useQuizPersistenceQueue,
  type PersistenceJob,
} from "./useQuizPersistenceQueue";

vi.mock("@/lib/arco", () => ({
  Toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    toast: vi.fn(),
    loading: vi.fn(),
  },
}));

vi.mock("@/lib/quizApiError", async () => {
  const actual = await vi.importActual<typeof import("@/lib/quizApiError")>("@/lib/quizApiError");
  return {
    ...actual,
    showQuizApiErrorToast: vi.fn(),
  };
});

function createJob(overrides: Partial<PersistenceJob> = {}): PersistenceJob {
  return {
    id: "job-1",
    label: "sync answer",
    createdAt: 1_700_000_000_000,
    attempts: 0,
    details: {
      stageLabel: "抢答冲刺",
      questionLabel: "第 3 题",
      answerLabel: "A",
    },
    tasks: [
      {
        type: "answer-choice",
        params: {
          datasheetId: "sheet-1",
          recordId: "record-1",
          userId: "user-1",
          answer: "A",
        },
      },
    ],
    ...overrides,
  };
}

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("useQuizPersistenceQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    setNavigatorOnline(true);
  });

  it("sanitizes persisted jobs and promotes the active job back to pending", () => {
    const active = createJob({
      id: "active-job",
      nextRetryAt: Date.now() + 10_000,
    });
    const pending = createJob({
      id: "pending-job",
      tasks: [
        {
          type: "judge-result",
          params: {
            datasheetId: "sheet-2",
            recordId: "record-2",
            questionId: "question-2",
            answer: "B",
            light: "1",
          },
        },
      ],
    });

    window.localStorage.setItem(
      PERSISTENCE_STORAGE_KEY,
      JSON.stringify({
        active,
        pending: [
          pending,
          pending,
          { id: "bad-job", createdAt: "oops", attempts: 0, tasks: [] },
        ],
        failed: [createJob({ id: "failed-job" }), { broken: true }],
      })
    );

    const restored = readPersistedPersistenceState();

    expect(restored.pending).toHaveLength(2);
    expect(restored.pending.map((job) => job.id)).toEqual(["active-job", "pending-job"]);
    expect(restored.pending[0]).toMatchObject({
      id: "active-job",
      label: active.label,
      attempts: active.attempts,
      details: active.details,
    });
    expect(restored.pending[0]?.nextRetryAt).toBeUndefined();
    expect(restored.pending[1]).toMatchObject({
      id: "pending-job",
      tasks: [
        {
          type: "judge-result",
          params: expect.objectContaining({
            datasheetId: "sheet-2",
            recordId: "record-2",
            questionId: "question-2",
            answer: "B",
            light: "1",
          }),
        },
      ],
    });
    expect(restored.failed.map((job) => job.id)).toEqual(["failed-job"]);
    expect(restored.failed[0]?.details).toEqual({
      stageLabel: "抢答冲刺",
      questionLabel: "第 3 题",
      answerLabel: "A",
    });
  });

  it("returns null for invalid persisted job shapes", () => {
    expect(
      sanitizePersistenceJob({
        id: "job-1",
        label: "missing tasks",
        createdAt: Date.now(),
        attempts: 0,
        tasks: [],
      })
    ).toBeNull();
  });

  it("drops legacy failed jobs that do not carry queue details metadata", () => {
    window.localStorage.setItem(
      PERSISTENCE_STORAGE_KEY,
      JSON.stringify({
        pending: [],
        failed: [
          {
            id: "legacy-failed-job",
            label: "题目同步（question-1）",
            createdAt: Date.now(),
            attempts: 1,
            lastErrorMessage: "旧版失败缓存",
            tasks: [
              {
                type: "answer-choice",
                params: {
                  datasheetId: "sheet-1",
                  recordId: "record-1",
                  userId: "user-1",
                  answer: "A",
                },
              },
            ],
          },
          createJob({ id: "current-failed-job" }),
        ],
      })
    );

    const restored = readPersistedPersistenceState();

    expect(restored.failed.map((job) => job.id)).toEqual(["current-failed-job"]);
  });

  it("restores persisted jobs while offline and processes them after coming online", async () => {
    setNavigatorOnline(false);
    const restoredJob = createJob({ id: "restored-job" });
    window.localStorage.setItem(
      PERSISTENCE_STORAGE_KEY,
      JSON.stringify({
        active: restoredJob,
        pending: [],
        failed: [],
      })
    );

    const submitAnswerChoice = vi.fn().mockResolvedValue(undefined);
    const submitJudgeResult = vi.fn().mockResolvedValue(undefined);
    const incrementScoreFieldByIdentifier = vi.fn().mockResolvedValue(0);

    const { result } = renderHook(() =>
      useQuizPersistenceQueue({
        submitAnswerChoice,
        submitJudgeResult,
        incrementScoreFieldByIdentifier,
      })
    );

    await waitFor(() => {
      expect(result.current.stats.pending).toBe(1);
    });
    expect(submitAnswerChoice).not.toHaveBeenCalled();

    setNavigatorOnline(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(submitAnswerChoice).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(result.current.stats.pending).toBe(0);
      expect(result.current.stats.failed).toBe(0);
    });
  });

  it("requeues failed jobs through retryFailures and reports success", async () => {
    const submitAnswerChoice = vi
      .fn()
      .mockRejectedValueOnce(
        new QuizApiError("business", "sync failed", "try again later")
      )
      .mockResolvedValueOnce(undefined);
    const submitJudgeResult = vi.fn().mockResolvedValue(undefined);
    const incrementScoreFieldByIdentifier = vi.fn().mockResolvedValue(0);

    const { result } = renderHook(() =>
      useQuizPersistenceQueue({
        submitAnswerChoice,
        submitJudgeResult,
        incrementScoreFieldByIdentifier,
      })
    );

    act(() => {
      result.current.enqueueJob(createJob({ id: "retry-job" }));
    });

    await waitFor(() => {
      expect(result.current.stats.failed).toBe(1);
    });
    expect(showQuizApiErrorToast).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retryFailures();
    });

    expect(Toast.success).toHaveBeenCalledWith("失败任务已重新排队", 800);
    await waitFor(() => {
      expect(submitAnswerChoice).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(result.current.stats.failed).toBe(0);
      expect(result.current.stats.pending).toBe(0);
    });
  });

  it("removes a failed job and persists the updated snapshot", async () => {
    const submitAnswerChoice = vi
      .fn()
      .mockRejectedValueOnce(
        new QuizApiError("business", "sync failed", "try again later")
      );
    const submitJudgeResult = vi.fn().mockResolvedValue(undefined);
    const incrementScoreFieldByIdentifier = vi.fn().mockResolvedValue(0);

    const { result } = renderHook(() =>
      useQuizPersistenceQueue({
        submitAnswerChoice,
        submitJudgeResult,
        incrementScoreFieldByIdentifier,
      })
    );

    act(() => {
      result.current.enqueueJob(createJob({ id: "failed-job" }));
    });

    await waitFor(() => {
      expect(result.current.stats.failed).toBe(1);
    });
    expect(result.current.stats.failedItems[0]?.details).toEqual({
      stageLabel: "抢答冲刺",
      questionLabel: "第 3 题",
      answerLabel: "A",
    });

    act(() => {
      result.current.removeFailedJob("failed-job");
    });

    await waitFor(() => {
      expect(result.current.stats.failed).toBe(0);
    });
    expect(window.localStorage.getItem(PERSISTENCE_STORAGE_KEY)).toBeNull();
  });

  it("processes score increment jobs", async () => {
    const submitAnswerChoice = vi.fn().mockResolvedValue(undefined);
    const submitJudgeResult = vi.fn().mockResolvedValue(undefined);
    const incrementScoreFieldByIdentifier = vi.fn().mockResolvedValue(40);

    const { result } = renderHook(() =>
      useQuizPersistenceQueue({
        submitAnswerChoice,
        submitJudgeResult,
        incrementScoreFieldByIdentifier,
      })
    );

    act(() => {
      result.current.enqueueJob(
        createJob({
          id: "score-job",
          label: "sync challenge score",
          tasks: [
            {
              type: "score-increment",
              params: {
                datasheetId: "score-sheet",
                identifier: "1001",
                fieldKey: "challengeScore",
                delta: 20,
              },
            },
          ],
        })
      );
    });

    await waitFor(() => {
      expect(incrementScoreFieldByIdentifier).toHaveBeenCalledWith({
        datasheetId: "score-sheet",
        identifier: "1001",
        fieldKey: "challengeScore",
        delta: 20,
      });
    });
    expect(submitAnswerChoice).not.toHaveBeenCalled();
    expect(submitJudgeResult).not.toHaveBeenCalled();
  });
});
