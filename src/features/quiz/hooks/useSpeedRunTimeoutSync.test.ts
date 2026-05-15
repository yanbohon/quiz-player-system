import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSpeedRunTimeoutSync } from "./useSpeedRunTimeoutSync";

const stage = {
  stageId: "stage-speed-run",
  recordId: "stage-record-1",
  name: "争分夺秒",
  displayName: "争分夺秒",
  scoreSheetId: "score-sheet-1",
};

const scoreRecord = {
  recordId: "score-record-1",
};

describe("useSpeedRunTimeoutSync", () => {
  it("enqueues a time-only score sync once when the speed-run timer expires", async () => {
    const enqueueJob = vi.fn();
    const { rerender } = renderHook(
      (props: Parameters<typeof useSpeedRunTimeoutSync>[0]) =>
        useSpeedRunTimeoutSync(props),
      {
        initialProps: {
          modeId: "speed-run",
          speedRunEndReason: undefined,
          currentStage: stage,
          scoreRecord,
          enqueueJob,
        },
      }
    );

    expect(enqueueJob).not.toHaveBeenCalled();

    rerender({
      modeId: "speed-run",
      speedRunEndReason: "timer",
      currentStage: stage,
      scoreRecord,
      enqueueJob,
    });

    await waitFor(() => {
      expect(enqueueJob).toHaveBeenCalledTimes(1);
    });

    const job = enqueueJob.mock.calls[0]?.[0];
    expect(job).toMatchObject({
      id: "speed-run-timeout:stage-speed-run:score-record-1",
      label: "争分夺秒 · 倒计时结束",
      details: {
        stageLabel: "争分夺秒",
        answerLabel: "剩余时间 0 秒",
      },
      tasks: [
        {
          type: "judge-result",
          params: {
            datasheetId: "score-sheet-1",
            recordId: "score-record-1",
            time: "0",
          },
        },
      ],
    });
    expect(job.tasks[0].params).not.toHaveProperty("questionId");
    expect(job.tasks[0].params).not.toHaveProperty("answer");

    rerender({
      modeId: "speed-run",
      speedRunEndReason: "timer",
      currentStage: stage,
      scoreRecord,
      enqueueJob,
    });

    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });

  it("waits for the score record before syncing timeout", async () => {
    const enqueueJob = vi.fn();
    const { rerender } = renderHook(
      (props: Parameters<typeof useSpeedRunTimeoutSync>[0]) =>
        useSpeedRunTimeoutSync(props),
      {
        initialProps: {
          modeId: "speed-run",
          speedRunEndReason: "timer" as const,
          currentStage: stage,
          scoreRecord: undefined,
          enqueueJob,
        },
      }
    );

    expect(enqueueJob).not.toHaveBeenCalled();

    rerender({
      modeId: "speed-run",
      speedRunEndReason: "timer",
      currentStage: stage,
      scoreRecord,
      enqueueJob,
    });

    await waitFor(() => {
      expect(enqueueJob).toHaveBeenCalledTimes(1);
    });
  });

  it("does not sync when speed-run completes normally", () => {
    const enqueueJob = vi.fn();

    renderHook(() =>
      useSpeedRunTimeoutSync({
        modeId: "speed-run",
        speedRunEndReason: "complete",
        currentStage: stage,
        scoreRecord,
        enqueueJob,
      })
    );

    expect(enqueueJob).not.toHaveBeenCalled();
  });
});
