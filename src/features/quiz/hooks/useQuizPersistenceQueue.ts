"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/lib/arco";
import { QuizApiError } from "@/lib/fusionClient";
import { ensureQuizApiError, showQuizApiErrorToast } from "@/lib/quizApiError";

export const PERSISTENCE_TIMEOUT_MS = 6000;
export const PERSISTENCE_STORAGE_KEY = "quiz-persistence-queue-v1";
export const PERSISTENCE_MAX_AUTO_ATTEMPTS = 5;
export const PERSISTENCE_BASE_RETRY_DELAY_MS = 1500;
export const PERSISTENCE_MAX_RETRY_DELAY_MS = 20000;

export type AnswerChoicePersistenceTask = {
  type: "answer-choice";
  params: {
    datasheetId: string;
    recordId: string;
    userId: string;
    answer: string;
    fieldKey?: string;
  };
};

export type JudgeResultPersistenceTask = {
  type: "judge-result";
  params: {
    datasheetId: string;
    recordId: string;
    questionId: string;
    answer: string;
    time?: number | string;
    light?: "0" | "1";
    statusFieldKey?: string;
    status?: string;
  };
};

export type ScoreIncrementPersistenceTask = {
  type: "score-increment";
  params: {
    datasheetId: string;
    identifier: string;
    fieldKey: string;
    delta: number;
  };
};

export type PersistenceTask =
  | AnswerChoicePersistenceTask
  | JudgeResultPersistenceTask
  | ScoreIncrementPersistenceTask;

export type PersistenceJobDetails = {
  stageLabel?: string;
  questionLabel?: string;
  answerLabel?: string;
};

export type PersistenceJob = {
  id: string;
  label: string;
  createdAt: number;
  attempts: number;
  lastErrorMessage?: string;
  nextRetryAt?: number;
  details?: PersistenceJobDetails;
  tasks: PersistenceTask[];
};

export type PersistenceJobSnapshot = {
  id: string;
  label: string;
  createdAt: number;
  attempts: number;
  lastErrorMessage?: string;
  nextRetryAt?: number;
  details?: PersistenceJobDetails;
};

export type PersistenceQueueSnapshot = {
  pending: number;
  failed: number;
  failedItems: PersistenceJobSnapshot[];
};

export type PersistedPersistenceState = {
  pending: PersistenceJob[];
  failed: PersistenceJob[];
  active?: PersistenceJob | null;
};

export interface UseQuizPersistenceQueueDependencies {
  submitAnswerChoice: (
    params: AnswerChoicePersistenceTask["params"]
  ) => Promise<void>;
  submitJudgeResult: (params: JudgeResultPersistenceTask["params"]) => Promise<void>;
  incrementScoreFieldByIdentifier: (
    params: ScoreIncrementPersistenceTask["params"]
  ) => Promise<number>;
}

export interface UseQuizPersistenceQueueResult {
  stats: PersistenceQueueSnapshot;
  enqueueJob: (job: PersistenceJob) => void;
  retryFailures: () => void;
  removeFailedJob: (jobId: string) => void;
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function computeRetryDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
) {
  const safeAttempt = Math.max(attempt - 1, 0);
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** safeAttempt);
  const jitter = Math.floor(Math.random() * Math.max(250, exponential * 0.2));
  return exponential + jitter;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorFactory: () => QuizApiError
) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(errorFactory());
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function dedupePersistenceJobs(jobs: PersistenceJob[]): PersistenceJob[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.id)) {
      return false;
    }
    seen.add(job.id);
    return true;
  });
}

function hasPersistenceJobDetails(
  job: PersistenceJob | null | undefined
): job is PersistenceJob {
  return Boolean(
    job &&
      (job.details?.stageLabel || job.details?.questionLabel || job.details?.answerLabel)
  );
}

export function sanitizePersistenceTask(source: unknown): PersistenceTask | null {
  if (!isPlainRecord(source)) return null;
  const type = source["type"];
  const rawParams = source["params"];
  if (type !== "answer-choice" && type !== "judge-result" && type !== "score-increment") {
    return null;
  }
  if (!isPlainRecord(rawParams)) {
    return null;
  }

  if (type === "answer-choice") {
    const datasheetId = rawParams["datasheetId"];
    const recordId = rawParams["recordId"];
    const userId = rawParams["userId"];
    const answer = rawParams["answer"];
    const fieldKey = rawParams["fieldKey"];
    if (
      typeof datasheetId !== "string" ||
      typeof recordId !== "string" ||
      typeof userId !== "string" ||
      typeof answer !== "string"
    ) {
      return null;
    }
    return {
      type,
      params: {
        datasheetId,
        recordId,
        userId,
        answer,
        fieldKey: typeof fieldKey === "string" && fieldKey.trim() ? fieldKey : undefined,
      },
    };
  }

  if (type === "score-increment") {
    const datasheetId = rawParams["datasheetId"];
    const identifier = rawParams["identifier"];
    const fieldKey = rawParams["fieldKey"];
    const delta = rawParams["delta"];
    if (
      typeof datasheetId !== "string" ||
      typeof identifier !== "string" ||
      typeof fieldKey !== "string" ||
      typeof delta !== "number" ||
      !Number.isFinite(delta)
    ) {
      return null;
    }
    return {
      type,
      params: {
        datasheetId,
        identifier,
        fieldKey,
        delta,
      },
    };
  }

  const datasheetId = rawParams["datasheetId"];
  const recordId = rawParams["recordId"];
  const questionId = rawParams["questionId"];
  const answer = rawParams["answer"];
  const time = rawParams["time"];
  const light = rawParams["light"];
  const statusFieldKey = rawParams["statusFieldKey"];
  const status = rawParams["status"];
  if (
    typeof datasheetId !== "string" ||
    typeof recordId !== "string" ||
    typeof questionId !== "string" ||
    typeof answer !== "string"
  ) {
    return null;
  }
  return {
    type,
    params: {
      datasheetId,
      recordId,
      questionId,
      answer,
      time: typeof time === "number" || typeof time === "string" ? time : undefined,
      light: light === "0" || light === "1" ? light : undefined,
      statusFieldKey:
        typeof statusFieldKey === "string" && statusFieldKey.trim()
          ? statusFieldKey
          : undefined,
      status: typeof status === "string" && status.trim() ? status : undefined,
    },
  };
}

export function sanitizePersistenceJob(source: unknown): PersistenceJob | null {
  if (!isPlainRecord(source)) return null;
  const id = source["id"];
  const label = source["label"];
  const createdAt = source["createdAt"];
  const attempts = source["attempts"];
  const lastErrorMessage = source["lastErrorMessage"];
  const nextRetryAt = source["nextRetryAt"];
  const rawDetails = source["details"];
  const rawTasks = source["tasks"];
  const tasks = Array.isArray(rawTasks)
    ? rawTasks
        .map((task) => sanitizePersistenceTask(task))
        .filter((task): task is PersistenceTask => Boolean(task))
    : [];
  const details = isPlainRecord(rawDetails)
    ? {
        stageLabel:
          typeof rawDetails["stageLabel"] === "string" && rawDetails["stageLabel"].trim()
            ? rawDetails["stageLabel"].trim()
            : undefined,
        questionLabel:
          typeof rawDetails["questionLabel"] === "string" && rawDetails["questionLabel"].trim()
            ? rawDetails["questionLabel"].trim()
            : undefined,
        answerLabel:
          typeof rawDetails["answerLabel"] === "string" && rawDetails["answerLabel"].trim()
            ? rawDetails["answerLabel"].trim()
            : undefined,
      }
    : undefined;

  if (
    typeof id !== "string" ||
    typeof label !== "string" ||
    typeof createdAt !== "number" ||
    !Number.isFinite(createdAt) ||
    tasks.length === 0
  ) {
    return null;
  }

  return {
    id,
    label,
    createdAt,
    attempts:
      typeof attempts === "number" && Number.isFinite(attempts)
        ? Math.max(0, Math.trunc(attempts))
        : 0,
    lastErrorMessage:
      typeof lastErrorMessage === "string" && lastErrorMessage.trim()
        ? lastErrorMessage
        : undefined,
    nextRetryAt:
      typeof nextRetryAt === "number" && Number.isFinite(nextRetryAt)
        ? nextRetryAt
        : undefined,
    details:
      details?.stageLabel || details?.questionLabel || details?.answerLabel
        ? details
        : undefined,
    tasks,
  };
}

export function readPersistedPersistenceState(): PersistedPersistenceState {
  if (typeof window === "undefined") {
    return { pending: [], failed: [] };
  }

  try {
    const raw = window.localStorage.getItem(PERSISTENCE_STORAGE_KEY);
    if (!raw) {
      return { pending: [], failed: [] };
    }

    const parsed = JSON.parse(raw);
    if (!isPlainRecord(parsed)) {
      return { pending: [], failed: [] };
    }

    const pending = Array.isArray(parsed["pending"])
      ? parsed["pending"]
          .map((job) => sanitizePersistenceJob(job))
          .filter((job): job is PersistenceJob => Boolean(job))
      : [];
    const failed = Array.isArray(parsed["failed"])
      ? parsed["failed"]
          .map((job) => sanitizePersistenceJob(job))
          .filter((job): job is PersistenceJob => hasPersistenceJobDetails(job))
      : [];
    const active = sanitizePersistenceJob(parsed["active"]);

    return {
      pending: dedupePersistenceJobs([
        ...(active ? [{ ...active, nextRetryAt: undefined }] : []),
        ...pending,
      ]),
      failed: dedupePersistenceJobs(failed),
    };
  } catch {
    window.localStorage.removeItem(PERSISTENCE_STORAGE_KEY);
    return { pending: [], failed: [] };
  }
}

export function useQuizPersistenceQueue(
  deps: UseQuizPersistenceQueueDependencies
): UseQuizPersistenceQueueResult {
  const { submitAnswerChoice, submitJudgeResult, incrementScoreFieldByIdentifier } = deps;
  const [stats, setStats] = useState<PersistenceQueueSnapshot>({
    pending: 0,
    failed: 0,
    failedItems: [],
  });

  const persistenceQueueRef = useRef<PersistenceJob[]>([]);
  const persistenceActiveRef = useRef<PersistenceJob | null>(null);
  const persistenceFailedRef = useRef<PersistenceJob[]>([]);
  const persistenceRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistenceRestoredRef = useRef(false);

  const clearPersistenceRetryTimer = useCallback(() => {
    if (persistenceRetryTimerRef.current !== null) {
      clearTimeout(persistenceRetryTimerRef.current);
      persistenceRetryTimerRef.current = null;
    }
  }, []);

  const writePersistedPersistenceState = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const payload: PersistedPersistenceState = {
        pending: persistenceQueueRef.current,
        failed: persistenceFailedRef.current,
        active: persistenceActiveRef.current,
      };
      const hasJobs =
        payload.pending.length > 0 ||
        payload.failed.length > 0 ||
        Boolean(payload.active);

      if (!hasJobs) {
        window.localStorage.removeItem(PERSISTENCE_STORAGE_KEY);
        return;
      }

      window.localStorage.setItem(PERSISTENCE_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn("Failed to persist sync queue state", error);
    }
  }, []);

  const updatePersistenceSnapshot = useCallback(() => {
    const active = persistenceActiveRef.current ? 1 : 0;
    setStats({
      pending: persistenceQueueRef.current.length + active,
      failed: persistenceFailedRef.current.length,
      failedItems: persistenceFailedRef.current.map((job) => ({
        id: job.id,
        label: job.label,
        createdAt: job.createdAt,
        attempts: job.attempts,
        lastErrorMessage: job.lastErrorMessage,
        nextRetryAt: job.nextRetryAt,
        details: job.details,
      })),
    });
    writePersistedPersistenceState();
  }, [writePersistedPersistenceState]);

  const executePersistenceJob = useCallback(
    async (job: PersistenceJob) => {
      for (const task of job.tasks) {
        if (task.type === "answer-choice") {
          await withTimeout(
            submitAnswerChoice(task.params),
            PERSISTENCE_TIMEOUT_MS,
            () =>
              new QuizApiError(
                "timeout",
                "答题记录同步超时",
                "网络恢复后会自动重试"
              )
          );
          continue;
        }

        if (task.type === "judge-result") {
          await withTimeout(
            submitJudgeResult(task.params),
            PERSISTENCE_TIMEOUT_MS,
            () =>
              new QuizApiError(
                "timeout",
                "成绩结果同步超时",
                "网络恢复后会自动重试"
              )
          );
          continue;
        }

        await withTimeout(
          incrementScoreFieldByIdentifier(task.params),
          PERSISTENCE_TIMEOUT_MS,
          () =>
            new QuizApiError(
              "timeout",
              "挑战积分同步超时",
              "网络恢复后会自动重试"
            )
        );
        continue;
      }
    },
    [incrementScoreFieldByIdentifier, submitAnswerChoice, submitJudgeResult]
  );

  const processPersistenceQueue = useCallback(() => {
    const isOffline =
      typeof window !== "undefined" &&
      typeof window.navigator !== "undefined" &&
      window.navigator.onLine === false;

    if (isOffline) {
      clearPersistenceRetryTimer();
      updatePersistenceSnapshot();
      return;
    }

    if (persistenceActiveRef.current || persistenceQueueRef.current.length === 0) {
      clearPersistenceRetryTimer();
      updatePersistenceSnapshot();
      return;
    }

    const now = Date.now();
    let nextRetryAt: number | null = null;
    const readyIndex = persistenceQueueRef.current.findIndex((job) => {
      if (typeof job.nextRetryAt !== "number" || job.nextRetryAt <= now) {
        return true;
      }
      nextRetryAt =
        nextRetryAt === null ? job.nextRetryAt : Math.min(nextRetryAt, job.nextRetryAt);
      return false;
    });

    if (readyIndex < 0) {
      clearPersistenceRetryTimer();
      if (nextRetryAt !== null) {
        persistenceRetryTimerRef.current = setTimeout(() => {
          persistenceRetryTimerRef.current = null;
          processPersistenceQueue();
        }, Math.max(250, nextRetryAt - now));
      }
      updatePersistenceSnapshot();
      return;
    }

    const [job] = persistenceQueueRef.current.splice(readyIndex, 1);
    if (!job) {
      updatePersistenceSnapshot();
      return;
    }

    clearPersistenceRetryTimer();
    job.nextRetryAt = undefined;
    persistenceActiveRef.current = job;
    updatePersistenceSnapshot();

    const executeJob = async () => {
      try {
        await executePersistenceJob(job);
        persistenceActiveRef.current = null;
        updatePersistenceSnapshot();
        processPersistenceQueue();
      } catch (error) {
        const normalized = ensureQuizApiError(error);
        job.lastErrorMessage = `${normalized.message}${
          normalized.suggestion ? `，${normalized.suggestion}` : ""
        }`;
        job.attempts += 1;
        persistenceActiveRef.current = null;
        const shouldAutoRetry =
          (normalized.type === "network" || normalized.type === "timeout") &&
          job.attempts < PERSISTENCE_MAX_AUTO_ATTEMPTS;

        if (shouldAutoRetry) {
          job.nextRetryAt =
            Date.now() +
            computeRetryDelayMs(
              job.attempts,
              PERSISTENCE_BASE_RETRY_DELAY_MS,
              PERSISTENCE_MAX_RETRY_DELAY_MS
            );
          job.lastErrorMessage = `自动重试中：${job.lastErrorMessage}`;
          persistenceQueueRef.current.push(job);
        } else {
          job.nextRetryAt = undefined;
          persistenceFailedRef.current.push(job);
          showQuizApiErrorToast(normalized, job.label);
        }

        updatePersistenceSnapshot();
        processPersistenceQueue();
      }
    };

    executeJob().catch((error) => {
      console.error("同步任务执行失败", error);
    });
  }, [clearPersistenceRetryTimer, executePersistenceJob, updatePersistenceSnapshot]);

  const enqueueJob = useCallback(
    (job: PersistenceJob) => {
      const existsInQueue = persistenceQueueRef.current.some((item) => item.id === job.id);
      const existsAsActive = persistenceActiveRef.current?.id === job.id;
      const existsInFailed = persistenceFailedRef.current.some((item) => item.id === job.id);
      if (existsInQueue || existsAsActive || existsInFailed) {
        return;
      }
      persistenceQueueRef.current.push({
        ...job,
        details: job.details ? { ...job.details } : undefined,
        tasks: [...job.tasks],
        lastErrorMessage: undefined,
        nextRetryAt: undefined,
      });
      updatePersistenceSnapshot();
      processPersistenceQueue();
    },
    [processPersistenceQueue, updatePersistenceSnapshot]
  );

  const retryFailures = useCallback(() => {
    if (persistenceFailedRef.current.length === 0) {
      Toast.info("暂无需要重试的任务", 800);
      return;
    }
    const jobs = persistenceFailedRef.current.splice(0);
    jobs.forEach((job) => {
      job.lastErrorMessage = undefined;
      job.nextRetryAt = undefined;
      persistenceQueueRef.current.push(job);
    });
    updatePersistenceSnapshot();
    processPersistenceQueue();
    Toast.success("失败任务已重新排队", 800);
  }, [processPersistenceQueue, updatePersistenceSnapshot]);

  const removeFailedJob = useCallback((jobId: string) => {
    const target = jobId.trim();
    if (!target) {
      return;
    }
    const nextFailedJobs = persistenceFailedRef.current.filter((job) => job.id !== target);
    if (nextFailedJobs.length === persistenceFailedRef.current.length) {
      return;
    }
    persistenceFailedRef.current = nextFailedJobs;
    updatePersistenceSnapshot();
  }, [updatePersistenceSnapshot]);

  useEffect(() => {
    if (persistenceRestoredRef.current) {
      return;
    }
    persistenceRestoredRef.current = true;
    const restored = readPersistedPersistenceState();
    persistenceQueueRef.current = restored.pending;
    persistenceFailedRef.current = restored.failed;
    persistenceActiveRef.current = null;
    updatePersistenceSnapshot();
    processPersistenceQueue();
  }, [processPersistenceQueue, updatePersistenceSnapshot]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleOnline = () => {
      processPersistenceQueue();
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        processPersistenceQueue();
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearPersistenceRetryTimer();
    };
  }, [clearPersistenceRetryTimer, processPersistenceQueue]);

  return {
    stats,
    enqueueJob,
    retryFailures,
    removeFailedJob,
  };
}
