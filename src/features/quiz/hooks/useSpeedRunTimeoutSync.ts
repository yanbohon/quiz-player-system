"use client";

import { useEffect, useRef } from "react";
import type { ContestModeId, QuizRuntimeState } from "@/features/quiz/types";
import type { PersistenceJob } from "./useQuizPersistenceQueue";

type SpeedRunTimeoutStage = {
  stageId?: string;
  recordId?: string;
  name?: string | null;
  displayName?: string | null;
  scoreSheetId?: string;
};

type SpeedRunTimeoutScoreRecord = {
  recordId?: string;
};

export interface UseSpeedRunTimeoutSyncOptions {
  modeId: ContestModeId;
  speedRunEndReason?: QuizRuntimeState["speedRunEndReason"];
  currentStage?: SpeedRunTimeoutStage;
  scoreRecord?: SpeedRunTimeoutScoreRecord;
  enqueueJob: (job: PersistenceJob) => void;
}

export function useSpeedRunTimeoutSync({
  modeId,
  speedRunEndReason,
  currentStage,
  scoreRecord,
  enqueueJob,
}: UseSpeedRunTimeoutSyncOptions) {
  const syncedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (modeId !== "speed-run" || speedRunEndReason !== "timer") {
      if (modeId !== "speed-run") {
        syncedKeyRef.current = null;
      }
      return;
    }

    const scoreSheetId = currentStage?.scoreSheetId;
    const scoreRecordId = scoreRecord?.recordId;
    if (!scoreSheetId || !scoreRecordId) {
      return;
    }

    const stageKey = currentStage?.stageId ?? currentStage?.recordId ?? scoreSheetId;
    const syncKey = `${stageKey}:${scoreRecordId}`;
    if (syncedKeyRef.current === syncKey) {
      return;
    }
    syncedKeyRef.current = syncKey;

    const stageLabel =
      currentStage?.displayName?.trim() ||
      currentStage?.name?.trim() ||
      "争分夺秒";

    enqueueJob({
      id: `speed-run-timeout:${stageKey}:${scoreRecordId}`,
      label: `${stageLabel} · 倒计时结束`,
      createdAt: Date.now(),
      attempts: 0,
      details: {
        stageLabel,
        answerLabel: "剩余时间 0 秒",
      },
      tasks: [
        {
          type: "judge-result",
          params: {
            datasheetId: scoreSheetId,
            recordId: scoreRecordId,
            time: "0",
          },
        },
      ],
    });
  }, [
    currentStage?.displayName,
    currentStage?.name,
    currentStage?.recordId,
    currentStage?.scoreSheetId,
    currentStage?.stageId,
    enqueueJob,
    modeId,
    scoreRecord?.recordId,
    speedRunEndReason,
  ]);
}
