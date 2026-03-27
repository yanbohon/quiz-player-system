"use client";

import { Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import {
  Button,
  NavBar,
  Progress,
  Tag,
  Image as ArcoImage,
  ImagePreview,
} from "@arco-design/mobile-react";
import NextImage from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { ArcoClient } from "@/components/ArcoClient";
import { Toast, Notify } from "@/lib/arco";
import { QuizApiError } from "@/lib/fusionClient";
import { ensureQuizApiError, showQuizApiErrorToast } from "@/lib/quizApiError";
import { mqttService } from "@/lib/mqtt/client";
import { useMqttSubscription } from "@/lib/mqtt/hooks";
import { MQTT_TOPICS } from "@/config/control";
import { resolveTihaiUrl } from "@/config/api";
import { useAppStore } from "@/store/useAppStore";
import { useQuizStore, DEFAULT_OCEAN_REMAINING_COUNT } from "@/store/quizStore";
import { useQuizRuntime } from "@/features/quiz/useQuizRuntime";
import { CONTEST_MODES, DEFAULT_MODE, isQaVariantMode } from "@/features/quiz/modes";
import {
  ContestModeId,
  CustomOceanQuestion,
  MatchingOption,
  QuizQuestion,
  QuizSubmissionResult,
  StandardQuestion,
  StandardQuestionOption,
  StandardQuestionType,
} from "@/features/quiz/types";
import type { NormalizedQuestion } from "@/lib/normalizeQuestion";
import {
  FillDrawingBoard,
  type FillDrawingBoardHandle,
  FillDrawingBoardEmptyError,
} from "@/features/quiz/components/FillDrawingBoard";
import type { SmoothSerializedStroke } from "@/features/quiz/components/SmoothDrawingCanvas";
import { resolveStatusFieldKey, resolveLastStandGroupStatusIndicator } from "@/features/quiz/status";
import trashIcon from "@/components/icons/trash.svg";
import styles from "./page.module.css";

const DEFAULT_NOTIFY_OFFSET = 68;
const FILL_SKETCH_CACHE_LIMIT = 10;
const FILL_PREVIEW_STORAGE_KEY = "quiz-fill-preview-cache";
const SUBMIT_THROTTLE_INTERVAL_MS = 1000;
const SUBMIT_FREQUENT_TOAST_DURATION_MS = 500;
const SUBMISSION_TIMEOUT_MS = 5000;
const PERSISTENCE_TIMEOUT_MS = 6000;
const PERSISTENCE_STORAGE_KEY = "quiz-persistence-queue-v1";
const PERSISTENCE_MAX_AUTO_ATTEMPTS = 5;
const PERSISTENCE_BASE_RETRY_DELAY_MS = 1500;
const PERSISTENCE_MAX_RETRY_DELAY_MS = 20000;
const EMPTY_BOARD_PLACEHOLDER_URL = "space/2025/11/13/8df5e037ae084183bf23b2fcba675f6d";

type AnswerChoicePersistenceTask = {
  type: "answer-choice";
  params: {
    datasheetId: string;
    recordId: string;
    userId: string;
    answer: string;
    fieldKey?: string;
  };
};

type JudgeResultPersistenceTask = {
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

type PersistenceTask = AnswerChoicePersistenceTask | JudgeResultPersistenceTask;

type PersistenceJob = {
  id: string;
  label: string;
  createdAt: number;
  attempts: number;
  lastErrorMessage?: string;
  nextRetryAt?: number;
  tasks: PersistenceTask[];
};

type PersistenceJobSnapshot = {
  id: string;
  label: string;
  createdAt: number;
  attempts: number;
  lastErrorMessage?: string;
  nextRetryAt?: number;
};

type PersistenceQueueSnapshot = {
  pending: number;
  failed: number;
  failedItems: PersistenceJobSnapshot[];
};

type PersistedPersistenceState = {
  pending: PersistenceJob[];
  failed: PersistenceJob[];
  active?: PersistenceJob | null;
};

type QuestionImageEntry = {
  thumb: string;
  large: string;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function computeRetryDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
) {
  const safeAttempt = Math.max(attempt - 1, 0);
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** safeAttempt);
  const jitter = Math.floor(Math.random() * Math.max(250, exponential * 0.2));
  return exponential + jitter;
}

function dedupePersistenceJobs(jobs: PersistenceJob[]): PersistenceJob[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.id)) {
      return false;
    }
    seen.add(job.id);
    return true;
  });
}

function sanitizePersistenceTask(source: unknown): PersistenceTask | null {
  if (!isPlainRecord(source)) return null;
  const type = source["type"];
  const rawParams = source["params"];
  if (type !== "answer-choice" && type !== "judge-result") {
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
      time:
        typeof time === "number" || typeof time === "string"
          ? time
          : undefined,
      light: light === "0" || light === "1" ? light : undefined,
      statusFieldKey:
        typeof statusFieldKey === "string" && statusFieldKey.trim()
          ? statusFieldKey
          : undefined,
      status:
        typeof status === "string" && status.trim() ? status : undefined,
    },
  };
}

function sanitizePersistenceJob(source: unknown): PersistenceJob | null {
  if (!isPlainRecord(source)) return null;
  const id = source["id"];
  const label = source["label"];
  const createdAt = source["createdAt"];
  const attempts = source["attempts"];
  const lastErrorMessage = source["lastErrorMessage"];
  const nextRetryAt = source["nextRetryAt"];
  const rawTasks = source["tasks"];
  const tasks = Array.isArray(rawTasks)
    ? rawTasks
        .map((task) => sanitizePersistenceTask(task))
        .filter((task): task is PersistenceTask => Boolean(task))
    : [];

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
    tasks,
  };
}

function readPersistedPersistenceState(): PersistedPersistenceState {
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
          .filter((job): job is PersistenceJob => Boolean(job))
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

const QuestionImageGallery = memo(function QuestionImageGallery({
  entries,
}: {
  entries: QuestionImageEntry[];
}) {
  const [openIndex, setOpenIndex] = useState(-1);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [failedIndices, setFailedIndices] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    setOpenIndex(-1);
    setFailedIndices(new Set());
    buttonRefs.current = [];
  }, [entries]);

  const previewImages = useMemo(
    () =>
      entries.map((entry) => ({
        src: entry.large,
        fallbackSrc: entry.thumb,
      })),
    [entries]
  );

  const handleImageLoad = useCallback((index: number) => {
    setFailedIndices((prev) => {
      if (!prev.has(index)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }, []);

  const handleImageError = useCallback((index: number) => {
    setFailedIndices((prev) => {
      if (prev.has(index)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const getThumbBounds = useCallback((index: number) => {
    const element = buttonRefs.current[index];
    if (element) {
      return element.getBoundingClientRect();
    }
    if (typeof window === "undefined" || typeof DOMRect === "undefined") {
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      } as DOMRect;
    }
    return new DOMRect(0, 0, 0, 0);
  }, []);

  if (!entries.length) {
    return null;
  }

  const allFailed = failedIndices.size > 0 && failedIndices.size === entries.length;

  return (
    <div className={styles.questionImageContainer}>
      <div className={styles.questionImageGrid}>
        {entries.map((entry, index) => (
          <button
            key={`${entry.large}-${index}`}
            type="button"
            className={styles.questionImageThumbButton}
            onClick={() => setOpenIndex(index)}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            aria-label={`查看第${index + 1}张图片`}
          >
            <ArcoImage
              className={styles.questionImageThumbImage}
              src={entry.thumb}
              alt={`题目配图 ${index + 1}`}
              fit="cover"
              position="center"
              showLoading
              showError
              onLoad={() => handleImageLoad(index)}
              onError={() => handleImageError(index)}
            />
          </button>
        ))}
      </div>
      {allFailed ? (
        <div className={styles.questionImageFallback} role="status">
          图片加载失败，请稍后重试
        </div>
      ) : null}
      <ImagePreview
        images={previewImages}
        openIndex={openIndex}
        close={() => setOpenIndex(-1)}
        getThumbBounds={getThumbBounds}
      />
    </div>
  );
});

const QUESTION_IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|gif|bmp|webp|avif|svg)$/i;
const QUESTION_IMAGE_CDN_HOST = "cdn.ohvfx.com";

function isValidImageUrlCandidate(candidate: unknown): candidate is string {
  if (typeof candidate !== "string") return false;
  const trimmed = candidate.trim();
  if (!trimmed) return false;
  const sanitized = trimmed.split(/[?#]/)[0];
  return QUESTION_IMAGE_EXTENSION_PATTERN.test(sanitized.toLowerCase());
}

function normalizeQuestionImageUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  if (/^data:image\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, "https://");
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  const normalized = trimmed.replace(/^\/+/, "");
  return `https://${QUESTION_IMAGE_CDN_HOST}/${normalized}`;
}

function parseQuestionImageList(raw: unknown): QuestionImageEntry[] {
  if (raw === undefined || raw === null) {
    return [];
  }

  let payload: unknown = raw;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) {
      return [];
    }
    try {
      payload = JSON.parse(trimmed);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Failed to parse question image data", error);
      }
      return [];
    }
  }

  if (!Array.isArray(payload)) {
    return [];
  }

  const entries: QuestionImageEntry[] = [];
  for (const item of payload) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const thumbCandidate = record.thumb;
    const largeCandidate = record.large;
    if (!isValidImageUrlCandidate(thumbCandidate) || !isValidImageUrlCandidate(largeCandidate)) {
      continue;
    }
    const thumb = normalizeQuestionImageUrl(String(thumbCandidate));
    const large = normalizeQuestionImageUrl(String(largeCandidate));
    entries.push({ thumb, large });
  }

  return entries;
}

function extractQuestionImageEntries(
  source: Record<string, unknown> | undefined | null
): QuestionImageEntry[] {
  if (!source) return [];
  return parseQuestionImageList(source["img"]);
}

function resolveQuestionImageEntries(
  question: QuizQuestion | undefined,
  normalizedQuestion: NormalizedQuestion | null
): QuestionImageEntry[] {
  if (!question) return [];

  if (isOceanQuestion(question)) {
    const directEntries = extractQuestionImageEntries(question.extra);
    if (directEntries.length > 0) {
      return directEntries;
    }
  }

  if (normalizedQuestion?.raw && typeof normalizedQuestion.raw === "object") {
    return extractQuestionImageEntries(normalizedQuestion.raw as Record<string, unknown>);
  }

  return [];
}

function findNormalizedQuestion(
  question: QuizQuestion | undefined,
  normalizedQuestions: NormalizedQuestion[]
): NormalizedQuestion | null {
  if (!question) return null;
  const targetId = isStandardQuestion(question)
    ? question.id
    : isOceanQuestion(question)
    ? question.questionKey
    : null;
  if (!targetId) return null;
  return normalizedQuestions.find((item) => item.id === targetId) ?? null;
}

function isImageTypeQuestion(normalizedQuestion: NormalizedQuestion | null): boolean {
  if (!normalizedQuestion) return false;
  const { type, raw } = normalizedQuestion;
  const typeTokens: string[] = [];
  if (typeof type === "string" && type.trim()) {
    typeTokens.push(type.trim());
  }
  if (raw && typeof raw === "object") {
    const rawType = (raw as Record<string, unknown>).type;
    if (typeof rawType === "string" && rawType.trim()) {
      typeTokens.push(rawType.trim());
    }
  }
  return typeTokens.some((token) => token.includes("图片题"));
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorFactory: () => QuizApiError
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        reject(errorFactory());
      }
    }, timeoutMs);

    promise
      .then((value) => {
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

function formatSeconds(seconds?: number) {
  if (seconds === undefined) return "--:--";
  const safe = Math.max(seconds, 0);
  const mins = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const secs = (safe % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function resolveQuestionId(question: QuizQuestion) {
  return "id" in question ? question.id : question.questionKey;
}

function isStandardQuestion(question: QuizQuestion): question is StandardQuestion {
  return "type" in question;
}

function isOceanQuestion(question: QuizQuestion): question is CustomOceanQuestion {
  return "questionKey" in question && !("type" in question);
}

function resolveOptionLetter(question: StandardQuestion, value: string): string {
  const index = question.options.findIndex((option) => option.value === value);
  if (index >= 0) {
    return String.fromCharCode(65 + index);
  }
  return value.toUpperCase();
}

function formatAnswerForQuestionSheet(
  question: StandardQuestion,
  selection: string | string[] | null | undefined
): string {
  if (question.type === "fill") {
    return "填空";
  }

  if (question.type === "wordbank" || question.type === "point-select") {
    const selections = parseWordbankSelectionInput(selection);
    if (selections.length === 0) {
      return "未选";
    }
    const canonicalValues = selections.map((item) =>
      canonicalizeWordbankValue(item, question.options)
    );
    const hasValue = canonicalValues.some((item) => item);
    if (!hasValue) {
      return "未选";
    }
    if (canonicalValues.every((item) => item.length === 1)) {
      return canonicalValues.join("");
    }
    const letterTokens = canonicalValues
      .map((value) => resolveOptionLetter(question, value))
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    if (letterTokens.length > 0 && letterTokens.every((token) => token.length === 1)) {
      return letterTokens.join("");
    }
    const labelMap = new Map(
      question.options.map((option) => [option.value, option.label])
    );
    const labels = canonicalValues
      .map((item) => (item ? labelMap.get(item) ?? item : ""))
      .filter(Boolean);
    return labels.length > 0 ? labels.join("/") : "未选";
  }

  if (Array.isArray(selection)) {
    if (selection.length === 0) return "未选";
    const letters = selection
      .map((item) => resolveOptionLetter(question, String(item)))
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
      .sort();
    return letters.join("") || "未选";
  }

  if (question.type === "matching") {
    const pairs = normalizeMatchingPairs(selection);
    if (!pairs.length) return "未选";
    return matchingPairsToSheetAnswer(pairs);
  }

  if (!selection) {
    return "未选";
  }

  const letter = resolveOptionLetter(question, String(selection));
  const normalized = letter.trim().toUpperCase();
  return normalized || "未选";
}

function normalizeMatchingPairs(
  selection: string | string[] | null | undefined
): string[] {
  if (!selection) return [];
  if (Array.isArray(selection)) {
    return selection
      .map((item) => String(item))
      .map((item) => item.includes(":") ? item : "")
      .filter(Boolean);
  }
  if (typeof selection === "string" && selection.includes(":")) {
    return [selection];
  }
  return [];
}

function matchingPairsToMap(pairs: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of pairs) {
    const [left, right] = pair.split(":");
    if (left && right) {
      map.set(left.trim(), right.trim());
    }
  }
  return map;
}

function mapToMatchingPairs(map: Map<string, string>): string[] {
  return Array.from(map.entries()).map(([left, right]) => `${left}:${right}`);
}

function matchingPairsToSheetAnswer(pairs: string[]): string {
  const obj = Object.fromEntries(pairs.map((pair) => pair.split(":")));
  return Object.keys(obj).length > 0 ? JSON.stringify(obj) : "未选";
}

function formatStandardQuestionAnswer(question: StandardQuestion): string | null {
  const raw = question.correctAnswer;
  if (raw === undefined || raw === null) {
    return null;
  }

  if (question.type === "wordbank" || question.type === "point-select") {
    const values = parseWordbankSelectionInput(
      raw as string | string[] | null | undefined
    );
    if (values.length === 0) {
      return null;
    }
    const canonicalValues = values.map((value) =>
      canonicalizeWordbankValue(value, question.options)
    );
    const hasValue = canonicalValues.some((item) => item);
    if (!hasValue) {
      return null;
    }
    if (canonicalValues.every((item) => item.length === 1)) {
      return canonicalValues.join("");
    }
    const labelMap = new Map(
      question.options.map((option) => [option.value, option.label])
    );
    const labels = canonicalValues
      .map((value) => (value ? labelMap.get(value) ?? value : ""))
      .filter((value) => value && value.trim().length > 0);
    return labels.length ? labels.join(" / ") : null;
  }

  const values = (Array.isArray(raw) ? raw : [raw])
    .map((value) => (value == null ? "" : String(value).trim()))
    .filter(Boolean);

  if (values.length === 0) {
    return null;
  }

  if (question.type === "matching") {
    const leftItems = question.matching?.left ?? [];
    const rightItems = question.matching?.right ?? [];
    const segments = values
      .map((pair) => {
        if (!pair.includes(":")) {
          return pair;
        }
        const [leftRaw, rightRaw] = pair.split(":");
        const leftId = leftRaw?.trim();
        const rightId = rightRaw?.trim();
        if (!leftId || !rightId) {
          return pair;
        }
        const leftIndex = leftItems.findIndex((item) => item.id === leftId);
        const rightIndex = rightItems.findIndex((item) => item.id === rightId);
        const leftLabel = leftIndex >= 0 ? String(leftIndex + 1) : leftId;
        const rightLetter =
          rightIndex >= 0 ? String.fromCharCode(65 + rightIndex) : rightId.toUpperCase();
        return `${leftLabel}-${rightLetter}`;
      })
      .filter(Boolean);
    return segments.length ? segments.join("|") : null;
  }

  if (question.type === "fill") {
    return values.join("") || null;
  }

  if (question.type === "multiple" || question.type === "indeterminate") {
    const tokens = values
      .map((value) => resolveOptionLetter(question, value).trim().toUpperCase())
      .filter(Boolean)
      .sort();
    return tokens.length ? tokens.join("") : null;
  }

  if (question.type === "single" || question.type === "boolean") {
    const token = resolveOptionLetter(question, values[0]).trim().toUpperCase();
    return token || values[0];
  }

  return values.join(" / ") || null;
}

function formatOceanQuestionAnswer(question: CustomOceanQuestion): string | null {
  const rawAnswers = (question.correctAnswerIds ?? []).map((value) => String(value).trim());
  if (rawAnswers.length > 0) {
    const ordered = sortOceanSelectionIds(rawAnswers, question.optionPool);
    const letters = ordered
      .map((value) => {
        const index = question.optionPool.findIndex((option) => option.id === value);
        if (index >= 0) {
          return String.fromCharCode(65 + index);
        }
        return value.toUpperCase();
      })
      .filter(Boolean);
    return letters.length ? letters.join("") : null;
  }

  const bucketAnswers = (question.correctBuckets ?? []).map((value) => String(value).trim());
  if (bucketAnswers.length > 0) {
    return bucketAnswers.filter(Boolean).join(" / ") || null;
  }

  return null;
}

const TEAM_IDENTIFIER_KEYS = [
  "用户ID",
  "用户 ID",
  "参赛账号",
  "账号",
  "台号",
  "台号ID",
  "stationId",
  "station",
  "ID",
  "编号",
];

function loadPreviewFromStorage(token: string): string | null {
  if (!token || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FILL_PREVIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    const value = parsed?.[token];
    return typeof value === "string" ? value : null;
  } catch (error) {
    console.warn("Failed to load fill preview from storage", error);
    return null;
  }
}

function savePreviewToStorage(token: string, preview: string) {
  if (!token || !preview || typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(FILL_PREVIEW_STORAGE_KEY);
    const parsed = raw && raw.trim() ? (JSON.parse(raw) as Record<string, string>) : {};
    if (Object.prototype.hasOwnProperty.call(parsed, token)) {
      delete parsed[token];
    }
    parsed[token] = preview;
    const entries = Object.entries(parsed);
    const trimmedEntries = entries.length > FILL_SKETCH_CACHE_LIMIT
      ? entries.slice(entries.length - FILL_SKETCH_CACHE_LIMIT)
      : entries;
    const compact = Object.fromEntries(trimmedEntries);
    window.localStorage.setItem(FILL_PREVIEW_STORAGE_KEY, JSON.stringify(compact));
  } catch (error) {
    console.warn("Failed to persist fill preview to storage", error);
  }
}

function orderMatchingPairs(
  pairs: string[],
  leftOrder: MatchingOption[] | undefined
): string[] {
  if (!leftOrder || leftOrder.length === 0) {
    return [...pairs];
  }
  const map = matchingPairsToMap(pairs);
  const ordered: string[] = [];
  for (const item of leftOrder) {
    const right = map.get(item.id);
    if (right) {
      ordered.push(`${item.id}:${right}`);
    }
  }
  return ordered;
}

type SubmitSource = "manual" | "command";

interface SubmitOptions {
  allowEmpty?: boolean;
  source?: SubmitSource;
}

interface MatchingLineSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
}

function resolveScoreFieldKey(
  question: NormalizedQuestion | undefined,
  fallbackIndex: number
): string | undefined {
  const raw = question?.raw ?? {};
  const candidates = [
    (raw as Record<string, unknown>)?.number,
    (raw as Record<string, unknown>)?.Number,
    (raw as Record<string, unknown>)?.题号,
    (raw as Record<string, unknown>)?.序号,
    (raw as Record<string, unknown>)?.题目编号,
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      const value = String(candidate).trim();
      if (value) {
        return value;
      }
    }
  }

  if (fallbackIndex >= 0) {
    return String(fallbackIndex + 1);
  }

  return undefined;
}

function resolvePrimaryScoreField(
  fields?: Record<string, unknown>
): { key: string; value: string | number } | undefined {
  if (!fields) return undefined;

  const preferredKeys = [
    "得分",
    "总分",
    "分数",
    "score",
    "Score",
    "当前得分",
    "总得分",
  ];

  for (const key of preferredKeys) {
    const raw = fields[key];
    if (
      raw !== undefined &&
      raw !== null &&
      (typeof raw === "string" || typeof raw === "number")
    ) {
      return { key, value: raw };
    }
  }

  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "number") {
      return { key, value };
    }
  }

  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string" && value.trim()) {
      return { key, value };
    }
  }

  return undefined;
}

function formatTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "";
  try {
    return new Date(timestamp).toLocaleString();
  } catch (error) {
    console.warn("Failed to format timestamp", error);
    return String(timestamp);
  }
}

function resolveStandardTypeLabel(type: StandardQuestionType): string {
  switch (type) {
    case "single":
      return "单选题";
    case "multiple":
      return "多选题";
    case "indeterminate":
      return "不定项选择题";
    case "boolean":
      return "判断题";
    case "wordbank":
      return "选词填空";
    case "point-select":
      return "点选题";
    case "matching":
      return "连线题";
    case "fill":
      return "填空题";
    default:
      return "题目";
  }
}

function resolveOceanTypeLabel(question: CustomOceanQuestion): string {
  const raw = question.extra as Record<string, unknown> | undefined;
  const rawType =
    raw && typeof raw.type === "string" ? raw.type.trim() : undefined;
  if (rawType) return rawType;
  if (question.categories.length > 0 && question.categories[0]) {
    return String(question.categories[0]);
  }
  return "题目";
}

function resolveOceanSelectionMode(
  question: CustomOceanQuestion
): "single" | "multiple" {
  const answers = question.correctAnswerIds ?? [];
  if (answers.length > 1) return "multiple";

  const raw = question.extra as Record<string, unknown> | undefined;
  const rawType =
    raw && typeof raw.type === "string"
      ? raw.type.trim().toLowerCase()
      : undefined;

  if (rawType) {
    if (
      rawType.includes("多选") ||
      rawType.includes("多项") ||
      rawType.includes("multiple")
    ) {
      return "multiple";
    }
    if (
      rawType.includes("单选") ||
      rawType.includes("判断") ||
      rawType.includes("是非") ||
      rawType.includes("single") ||
      rawType.includes("boolean")
    ) {
      return "single";
    }
  }

  if (question.categories.some((item) => /多/.test(item))) {
    return "multiple";
  }

  return "single";
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function sortOceanSelectionIds(
  rawValues: (string | number)[],
  optionPool: CustomOceanQuestion["optionPool"]
): string[] {
  const normalized = dedupeStrings(rawValues.map((value) => String(value)));
  if (normalized.length === 0) return [];

  const ordered: string[] = [];
  for (const option of optionPool) {
    if (normalized.includes(option.id)) {
      ordered.push(option.id);
    }
  }

  if (ordered.length === normalized.length) {
    return ordered;
  }

  const remaining = normalized.filter((value) => !ordered.includes(value));
  return [...ordered, ...remaining];
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      role="img"
      aria-label="倒计时"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path
        d="M12 7.5v4.2l3 1.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function HeartIcon({
  className,
  filled,
}: {
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      className={`${className ?? ""} ${filled ? styles.heartFilled : styles.heartEmpty}`}
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 21s-7.2-4.5-9.6-9A5.7 5.7 0 0 1 5.5 4.2 4.4 4.4 0 0 1 12 6.3a4.4 4.4 0 0 1 6.5-2.1 5.7 5.7 0 0 1 3.1 7.8c-2.4 4.5-9.6 9-9.6 9Z" />
    </svg>
  );
}

function EliminatedIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="m20 20 24 24M44 20 20 44"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function SuccessCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M20 33.5 28.8 42 44 23"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function ErrorBadgeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M20 20 44 44M44 20 20 44"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function SwitchArrowsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M18 24h28l-8-8"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M46 40H18l8 8"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

interface OptionCardButtonProps {
  value: string;
  label: string;
  description?: string | null;
  badge: string;
  active: boolean;
  disabled?: boolean;
  onSelect: (value: string) => void;
  role?: "radio" | "checkbox";
  status?: "correct" | "wrong";
}

function OptionCardButton({
  value,
  label,
  description,
  badge,
  active,
  disabled = false,
  onSelect,
  role,
  status,
}: OptionCardButtonProps) {
  const [isPressed, setPressed] = useState(false);
  const skipClickRef = useRef(false);
  const releaseTimerRef = useRef<number | null>(null);
  const skipResetTimerRef = useRef<number | null>(null);

  const clearPressTimer = useCallback(() => {
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
  }, []);

  const clearSkipResetTimer = useCallback(() => {
    if (skipResetTimerRef.current !== null) {
      window.clearTimeout(skipResetTimerRef.current);
      skipResetTimerRef.current = null;
    }
  }, []);

  const scheduleSkipReset = useCallback(() => {
    clearSkipResetTimer();
    skipResetTimerRef.current = window.setTimeout(() => {
      skipClickRef.current = false;
      skipResetTimerRef.current = null;
    }, 150);
  }, [clearSkipResetTimer]);

  const triggerSelection = useCallback(() => {
    onSelect(value);
  }, [onSelect, value]);

  const releasePressState = useCallback(() => {
    clearPressTimer();
    setPressed(false);
  }, [clearPressTimer]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      try {
        event.currentTarget.focus({ preventScroll: true });
      } catch {
        event.currentTarget.focus();
      }
      const isTouchLike = event.pointerType === "touch" || event.pointerType === "pen";
      if (isTouchLike) {
        skipClickRef.current = true;
      } else {
        skipClickRef.current = false;
      }
      clearSkipResetTimer();
      setPressed(true);
      if (isTouchLike) {
        triggerSelection();
      }
    },
    [clearSkipResetTimer, disabled, triggerSelection]
  );

  const handlePointerUp = useCallback(() => {
    releasePressState();
    if (skipClickRef.current) {
      scheduleSkipReset();
    }
  }, [releasePressState, scheduleSkipReset]);

  const handlePointerLeave = useCallback(() => {
    releasePressState();
    if (skipClickRef.current) {
      scheduleSkipReset();
    }
  }, [releasePressState, scheduleSkipReset]);

  const handleTouchStart = useCallback(
    (_event: ReactTouchEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (skipClickRef.current) {
        // Pointer events already handled this touch.
        return;
      }
      skipClickRef.current = true;
      clearSkipResetTimer();
      setPressed(true);
      triggerSelection();
    },
    [clearSkipResetTimer, disabled, triggerSelection]
  );

  const handleTouchEnd = useCallback(() => {
    releasePressState();
    if (skipClickRef.current) {
      scheduleSkipReset();
    }
  }, [releasePressState, scheduleSkipReset]);

  const handleClick = useCallback((_event: ReactMouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (skipClickRef.current) {
      skipClickRef.current = false;
      clearSkipResetTimer();
      releasePressState();
      return;
    }
    setPressed(true);
    triggerSelection();
    clearPressTimer();
    releaseTimerRef.current = window.setTimeout(() => {
      releasePressState();
    }, 120);
    scheduleSkipReset();
  }, [
    clearPressTimer,
    clearSkipResetTimer,
    disabled,
    releasePressState,
    scheduleSkipReset,
    triggerSelection,
  ]);

  useEffect(() => {
    return () => {
      clearPressTimer();
      clearSkipResetTimer();
    };
  }, [clearPressTimer, clearSkipResetTimer]);

  const className = [
    styles.optionCard,
    active ? styles.optionCardActive : "",
    status === "correct" ? styles.optionCardCorrect : "",
    status === "wrong" ? styles.optionCardWrong : "",
  ]
    .filter(Boolean)
    .join(" ");

  const ariaChecked = role ? active : undefined;

  const badgeClass = [
    styles.optionBadge,
    active ? styles.optionBadgeActive : "",
    status === "correct" ? styles.optionBadgeCorrect : "",
    status === "wrong" ? styles.optionBadgeWrong : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      role={role}
      aria-checked={ariaChecked}
      className={className}
      data-active={active ? "true" : undefined}
      data-pressed={isPressed ? "true" : undefined}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClick={handleClick}
    >
      <span className={badgeClass}>
        {badge}
      </span>
      <div className={styles.optionContent}>
        <span className={styles.optionLabel}>{label}</span>
        {description ? <span className={styles.optionDesc}>{description}</span> : null}
      </div>
    </button>
  );
}

interface WordbankToken {
  kind: "text" | "blank";
  content: string;
  blankId?: string;
}

function parseWordbankTemplate(template: string): {
  tokens: WordbankToken[];
  blankIds: string[];
} {
  const tokens: WordbankToken[] = [];
  const blankIds: string[] = [];
  if (!template) {
    return { tokens: [{ kind: "text", content: "" }], blankIds };
  }

  const pattern = /{{(.*?)}}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(template)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        kind: "text",
        content: template.slice(lastIndex, match.index),
      });
    }

    const rawId = (match[1] ?? "").trim();
    const blankId = rawId || `blank${blankIds.length + 1}`;
    tokens.push({
      kind: "blank",
      content: "",
      blankId,
    });
    blankIds.push(blankId);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < template.length) {
    tokens.push({
      kind: "text",
      content: template.slice(lastIndex),
    });
  }

  if (tokens.length === 0) {
    tokens.push({ kind: "text", content: template });
  }

  return { tokens, blankIds };
}

function asStringArray(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value) return [value];
  return [];
}

function arraysShallowEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

function canonicalizeWordbankValue(
  raw: unknown,
  options: StandardQuestionOption[]
): string {
  const token = raw === undefined || raw === null ? "" : String(raw).trim();
  if (!token) return "";

  const direct = options.find((option) => option.value === token);
  if (direct) return direct.value;

  const labelMatch = options.find((option) => option.label === token);
  if (labelMatch) return labelMatch.value;

  if (/^[a-z]$/i.test(token)) {
    const upper = token.toUpperCase();
    const upperMatch = options.find((option) => option.value === upper);
    return upperMatch ? upperMatch.value : upper;
  }

  return token;
}

function parseWordbankSelectionInput(
  raw: string | string[] | null | undefined
): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => (item == null ? "" : String(item).trim()))
      .filter(Boolean);
  }

  if (typeof raw !== "string") {
    return [];
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (item == null ? "" : String(item).trim()))
          .filter(Boolean);
      }
      if (parsed && typeof parsed === "object") {
        return Object.values(parsed as Record<string, unknown>)
          .map((item) => (item == null ? "" : String(item).trim()))
          .filter(Boolean);
      }
    } catch {
      /* noop */
    }
  }

  const separatorSegments = trimmed
    .split(/[,，;；\/\\|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (separatorSegments.length > 1) {
    return separatorSegments;
  }

  if (trimmed.includes(" ")) {
    const whitespaceSegments = trimmed
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (whitespaceSegments.length > 1) {
      return whitespaceSegments;
    }
  }

  if (/^[A-Za-z]+$/.test(trimmed)) {
    return trimmed.split("");
  }

  return [trimmed];
}

function canonicalizeWordbankSelections(
  raw: string | string[] | null | undefined,
  blanks: number,
  options: StandardQuestionOption[]
): string[] {
  const parsed = parseWordbankSelectionInput(raw);
  const length = blanks > 0 ? blanks : parsed.length;
  if (length === 0) {
    return parsed.map((value) => canonicalizeWordbankValue(value, options));
  }
  return Array.from({ length }, (_, index) =>
    canonicalizeWordbankValue(parsed[index], options)
  );
}

function QuizPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = (searchParams.get("mode") as ContestModeId | null) ?? DEFAULT_MODE.id;
  const [mode, setMode] = useState<ContestModeId>(initialMode);

  useEffect(() => {
    const fromQuery = searchParams.get("mode") as ContestModeId | null;
    if (fromQuery && CONTEST_MODES[fromQuery]) {
      setMode(fromQuery);
    }
  }, [searchParams]);

  const { user, isAuthenticated, answers, mqttConnected } = useAppStore(
    useShallow((state) => ({
      user: state.user,
      isAuthenticated: state.isAuthenticated,
      answers: state.answers,
      mqttConnected: state.mqttConnected,
    }))
  );

  const { state, controls, meta } = useQuizRuntime(mode);
  const isQaMode = isQaVariantMode(meta.id);
  const isLastStandMode = meta.id === "last-stand" || meta.id === "last-stand-group";
  const isGroupedLastStand = meta.id === "last-stand-group";
  const isUltimatePkMode = meta.id === "ultimate-pk";
  const delegateAnswerToControl = controls.delegateAnswerTo;
  const triggerBuzzerControl = controls.triggerBuzzer;
  const applyHostJudgementControl = controls.applyHostJudgement;
  const resetUltimateRoundControl = controls.resetUltimateRound;
  const {
    currentStage,
    teamProfile,
    scoreRecord,
    submitAnswerChoice,
    submitJudgeResult,
    updateScoreStatus,
    normalizedQuestions,
    teamProfiles,
    ensureTeamProfile,
    oceanRemainingCount,
    questionLoadStatus,
    questionLoadAttempts,
    questionLoadError,
    questionGateOpened,
    waitingForStageStart,
  } = useQuizStore(
    useShallow((storeState) => ({
      currentStage: storeState.currentStage,
      teamProfile: storeState.teamProfile,
      scoreRecord: storeState.scoreRecord,
      submitAnswerChoice: storeState.submitAnswerChoice,
      submitJudgeResult: storeState.submitJudgeResult,
      updateScoreStatus: storeState.updateScoreStatus,
      normalizedQuestions: storeState.questions,
      teamProfiles: storeState.teamProfiles,
      ensureTeamProfile: storeState.ensureTeamProfile,
      oceanRemainingCount: storeState.oceanRemainingCount,
      questionLoadStatus: storeState.questionLoadStatus,
      questionLoadAttempts: storeState.questionLoadAttempts,
      questionLoadError: storeState.questionLoadError,
      questionGateOpened: storeState.questionGateOpened,
      waitingForStageStart: storeState.waitingForStageStart,
    }))
  );
  const [selected, setSelected] = useState<string | string[] | null>(null);
  const [matchingPairs, setMatchingPairs] = useState<string[]>([]);
  const [isSubmitting, setSubmitting] = useState(false);
  const [canBuzz, setCanBuzz] = useState(() => meta.id !== "ultimate-challenge");
  const progressUserLabel = useMemo(
    () => teamProfile?.displayName ?? user?.name ?? null,
    [teamProfile?.displayName, user?.name]
  );
  const controlMessage = useMqttSubscription(
    MQTT_TOPICS.control,
    meta.id === "ultimate-challenge"
  );
  const resultMessage = useMqttSubscription(
    MQTT_TOPICS.result,
    meta.id === "ultimate-challenge"
  );
  const shouldHandleSubmitCommand =
    isQaMode || isLastStandMode || meta.id === "ultimate-challenge";
  const commandMessage = useMqttSubscription(
    MQTT_TOPICS.command,
    shouldHandleSubmitCommand
  );
  const ultimatePkCommandMessage = useMqttSubscription(
    MQTT_TOPICS.command,
    meta.id === "ultimate-pk"
  );
  const navWrapperRef = useRef<HTMLDivElement | null>(null);
  const [isBoardOpen, setBoardOpen] = useState(false);
  const boardRef = useRef<FillDrawingBoardHandle | null>(null);
  const [boardSubmitted, setBoardSubmitted] = useState(false);
  const [isBoardUploading, setBoardUploading] = useState(false);
  const fillSketchCacheRef = useRef<
    Record<string, { preview?: string; paths?: SmoothSerializedStroke[] }>
  >({});
  const [fillPreview, setFillPreview] = useState<string | null>(null);
  const [cachedPaths, setCachedPaths] = useState<SmoothSerializedStroke[] | null>(null);
  const lastQuestionIdRef = useRef<string | null>(null);
  const lastSubmitCommandRef = useRef<number | null>(null);
  const lastCommandHandledRef = useRef<number | null>(null);
  const statusInitRef = useRef<string | null>(null);
  const retractHandlingRef = useRef(false);
  const [notifyOffset, setNotifyOffset] = useState(DEFAULT_NOTIFY_OFFSET);
  const [isCommandSubmissionLocked, setCommandSubmissionLocked] = useState(false);
  const [isCommandSubmissionOverlayVisible, setCommandSubmissionOverlayVisible] =
    useState(false);
  const [isAnswerRevealActive, setAnswerRevealActive] = useState(false);
  const [wordbankActiveIndex, setWordbankActiveIndex] = useState<number | null>(null);
  const [activeMatchingLeft, setActiveMatchingLeft] = useState<string | null>(null);
  const matchingBoardRef = useRef<HTMLDivElement | null>(null);
  const [matchingLines, setMatchingLines] = useState<MatchingLineSegment[]>([]);
  const [oceanStats, setOceanStats] = useState<{
    total?: number;
    correct?: number;
    wrong?: number;
    score?: number;
    accuracy?: number;
    lastAnswerTime?: number;
  } | null>(null);
  const [oceanStatsStatus, setOceanStatsStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [oceanStatsError, setOceanStatsError] = useState<string | null>(null);
  const [matchingOverlaySize, setMatchingOverlaySize] = useState<{ width: number; height: number }>(
    { width: 0, height: 0 }
  );
  const matchingLineRafRef = useRef<number | null>(null);
  const lastBuzzResultRef = useRef<{ questionId: string | null; timestamp: number }>({
    questionId: null,
    timestamp: 0,
  });
  const lastResultTimestampRef = useRef<number>(0);
  const lastStartBuzzingRef = useRef<{ timestamp: number | null; questionId: string | null } | null>(
    null
  );
  const [lockedWinnerId, setLockedWinnerId] = useState<string | null>(null);
  const lastManualSubmitAtRef = useRef<number>(0);
  const submissionQueueTailRef = useRef<Promise<void>>(Promise.resolve());
  const activeSubmissionIdRef = useRef<string | null>(null);
  const inflightSubmissionSetRef = useRef<Set<string>>(new Set());
  const persistenceQueueRef = useRef<PersistenceJob[]>([]);
  const persistenceActiveRef = useRef<PersistenceJob | null>(null);
  const persistenceFailedRef = useRef<PersistenceJob[]>([]);
  const [persistenceStats, setPersistenceStats] = useState<PersistenceQueueSnapshot>({
    pending: 0,
    failed: 0,
    failedItems: [],
  });
  const [showPersistenceDetails, setShowPersistenceDetails] = useState(false);
  const [ultimatePkTeam, setUltimatePkTeam] = useState<"affirmative" | "negative">("affirmative");
  const [ultimatePkStageLocked, setUltimatePkStageLocked] = useState(true);
  const [ultimatePkThrottleActive, setUltimatePkThrottleActive] = useState(false);
  const [ultimatePkSending, setUltimatePkSending] = useState(false);
  const ultimatePkThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistenceRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistenceRestoredRef = useRef(false);

  const clearUltimatePkThrottle = useCallback(() => {
    if (ultimatePkThrottleTimerRef.current !== null) {
      clearTimeout(ultimatePkThrottleTimerRef.current);
      ultimatePkThrottleTimerRef.current = null;
    }
  }, []);

  const scheduleUltimatePkThrottle = useCallback(() => {
    clearUltimatePkThrottle();
    setUltimatePkThrottleActive(true);
    ultimatePkThrottleTimerRef.current = setTimeout(() => {
      setUltimatePkThrottleActive(false);
      ultimatePkThrottleTimerRef.current = null;
    }, 1000);
  }, [clearUltimatePkThrottle]);

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
    setPersistenceStats({
      pending: persistenceQueueRef.current.length + active,
      failed: persistenceFailedRef.current.length,
      failedItems: persistenceFailedRef.current.map((job) => ({
        id: job.id,
        label: job.label,
        createdAt: job.createdAt,
        attempts: job.attempts,
        lastErrorMessage: job.lastErrorMessage,
        nextRetryAt: job.nextRetryAt,
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
      }
    },
    [submitAnswerChoice, submitJudgeResult]
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
  }, [
    clearPersistenceRetryTimer,
    executePersistenceJob,
    updatePersistenceSnapshot,
  ]);

  const enqueuePersistenceJob = useCallback(
    (job: PersistenceJob) => {
      const existsInQueue = persistenceQueueRef.current.some((item) => item.id === job.id);
      const existsAsActive = persistenceActiveRef.current?.id === job.id;
      const existsInFailed = persistenceFailedRef.current.some((item) => item.id === job.id);
      if (existsInQueue || existsAsActive || existsInFailed) {
        // 避免重复排队，失败任务会通过 retry 接口重新进入队列
        return;
      }
      persistenceQueueRef.current.push({
        ...job,
        lastErrorMessage: undefined,
        nextRetryAt: undefined,
      });
      updatePersistenceSnapshot();
      processPersistenceQueue();
    },
    [processPersistenceQueue, updatePersistenceSnapshot]
  );

  const handleRetryPersistenceFailures = useCallback(() => {
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

  const enqueueSubmission = useCallback(
    (task: () => Promise<QuizSubmissionResult | undefined>) => {
      const previous = submissionQueueTailRef.current;
      const runTask = (async () => {
        await previous;
        return task();
      })();
      submissionQueueTailRef.current = runTask.then(
        () => undefined,
        () => undefined
      );
      return runTask;
    },
    []
  );

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
    if (!isAuthenticated) {
      Toast.info("请先登录",500);
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

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
      clearUltimatePkThrottle();
      clearPersistenceRetryTimer();
    };
  }, [clearPersistenceRetryTimer, clearUltimatePkThrottle, processPersistenceQueue]);

  useEffect(() => {
    if (!isUltimatePkMode) {
      setUltimatePkTeam("affirmative");
      setUltimatePkStageLocked(true);
      setUltimatePkThrottleActive(false);
      setUltimatePkSending(false);
      clearUltimatePkThrottle();
    }
  }, [isUltimatePkMode, clearUltimatePkThrottle]);

  useEffect(() => {
    if (!isUltimatePkMode) return;
    if (!ultimatePkCommandMessage) return;
    const rawPayload = ultimatePkCommandMessage.payload ?? "";
    if (!rawPayload.trim()) return;
    let commandText = rawPayload.trim();
    try {
      const parsed = JSON.parse(rawPayload);
      if (parsed && typeof parsed === "object") {
        const source = parsed as Record<string, unknown>;
        const candidate = source["command"] ?? source["type"] ?? source["action"];
        if (typeof candidate === "string" && candidate.trim()) {
          commandText = candidate.trim();
        }
      }
    } catch {
      // payload is plain text, ignore
    }
    const normalized = commandText.toLowerCase();
    if (normalized === "stage-3") {
      setUltimatePkStageLocked(false);
      return;
    }
    if (
      normalized === "stage-1" ||
      normalized === "stage-2" ||
      normalized === "stage-4" ||
      normalized === "stage-5"
    ) {
      setUltimatePkStageLocked(true);
      setUltimatePkThrottleActive(false);
      setUltimatePkSending(false);
      clearUltimatePkThrottle();
    }
  }, [
    ultimatePkCommandMessage,
    clearUltimatePkThrottle,
    isUltimatePkMode,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateOffset = () => {
      const rect = navWrapperRef.current?.getBoundingClientRect();
      if (rect) {
        setNotifyOffset(rect.bottom);
      }
    };

    updateOffset();

    const resizeObserver =
      typeof ResizeObserver !== "undefined" && navWrapperRef.current
        ? new ResizeObserver(updateOffset)
        : null;

    if (resizeObserver && navWrapperRef.current) {
      resizeObserver.observe(navWrapperRef.current);
    }

    window.addEventListener("resize", updateOffset);
    window.addEventListener("scroll", updateOffset, { passive: true });

    return () => {
      window.removeEventListener("resize", updateOffset);
      window.removeEventListener("scroll", updateOffset);
      resizeObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (meta.id !== "ultimate-challenge") {
      setLockedWinnerId(null);
    }
  }, [meta.id]);

  useEffect(() => {
    if (!isLastStandMode) return;
    if (!currentStage || !scoreRecord) return;
    const scoreSheetId = currentStage.scoreSheetId;
    const recordId = scoreRecord.recordId;
    if (!scoreSheetId || !recordId) return;

    const statusFieldKey = resolveStatusFieldKey(scoreRecord.fields);
    if (!statusFieldKey) return;

    let statusValue: string | undefined;
    if (isGroupedLastStand) {
      statusValue = resolveLastStandGroupStatusIndicator(currentStage.name);
    } else {
      const initialHp = meta.features.initialHp ?? 0;
      if (!Number.isFinite(initialHp) || initialHp <= 0) return;
      statusValue = String(Math.max(0, Math.trunc(initialHp)));
    }

    if (!statusValue) return;

    const cacheKey = `${recordId}:${statusValue}:${isGroupedLastStand ? "group" : "classic"}`;
    if (statusInitRef.current === cacheKey) return;

    const currentStatus = scoreRecord.fields?.[statusFieldKey];
    if (
      currentStatus !== undefined &&
      currentStatus !== null &&
      String(currentStatus) === statusValue
    ) {
      statusInitRef.current = cacheKey;
      return;
    }

    let cancelled = false;
    updateScoreStatus({
      datasheetId: scoreSheetId,
      recordId,
      fieldKey: statusFieldKey,
      status: statusValue,
    })
      .then(() => {
        if (!cancelled) {
          statusInitRef.current = cacheKey;
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("初始化一站到底状态失败", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    currentStage,
    isGroupedLastStand,
    isLastStandMode,
    meta.features.initialHp,
    scoreRecord,
    updateScoreStatus,
  ]);

  const question = state.question;
  const questionId = question ? resolveQuestionId(question) : null;
  const normalizedQuestion = useMemo(
    () => findNormalizedQuestion(question, normalizedQuestions),
    [question, normalizedQuestions]
  );
  const questionImageEntries = useMemo(
    () => resolveQuestionImageEntries(question, normalizedQuestion),
    [question, normalizedQuestion]
  );
  const hasQuestionImages = questionImageEntries.length > 0;
  const isImageQuestion = useMemo(
    () => isImageTypeQuestion(normalizedQuestion),
    [normalizedQuestion]
  );
  const questionTags = useMemo(() => {
    if (!question) return [];
    if (isImageQuestion) {
      return ["图片题"];
    }
    if (isStandardQuestion(question)) {
      return [resolveStandardTypeLabel(question.type)];
    }
    if (isOceanQuestion(question)) {
      const label = resolveOceanTypeLabel(question);
      return label ? [label] : [];
    }
    return [];
  }, [isImageQuestion, question]);
  const isWordbankQuestion =
    !!question && isStandardQuestion(question) && question.type === "wordbank";
  const isPointSelectQuestion =
    !!question && isStandardQuestion(question) && question.type === "point-select";
  const isMatchingQuestion =
    !!question && isStandardQuestion(question) && question.type === "matching";
  const matchingConfig =
    question && isStandardQuestion(question) && question.type === "matching"
      ? question.matching ?? null
      : null;

  const wordbankTemplate = useMemo(() => {
    if (!isWordbankQuestion || !question || !isStandardQuestion(question)) {
      return null;
    }
    return parseWordbankTemplate(question.title);
  }, [isWordbankQuestion, question]);

  const wordbankOptions = useMemo(() => {
    if (!isWordbankQuestion || !question || !isStandardQuestion(question)) {
      return [] as StandardQuestionOption[];
    }
    return question.options;
  }, [isWordbankQuestion, question]);

  useEffect(() => {
    if (meta.id !== "ultimate-challenge") {
      lastBuzzResultRef.current = {
        questionId: null,
        timestamp: 0,
      };
      lastResultTimestampRef.current = 0;
      return;
    }

    if (!questionId) {
      lastBuzzResultRef.current = {
        questionId: null,
        timestamp: 0,
      };
      return;
    }

    if (lastBuzzResultRef.current.questionId !== questionId) {
      lastBuzzResultRef.current = {
        questionId,
        timestamp: 0,
      };
    }
  }, [meta.id, questionId]);


  const wordbankOptionLabelMap = useMemo(() => {
    if (!isWordbankQuestion) {
      return null;
    }
    const map = new Map<string, string>();
    wordbankOptions.forEach((option) => map.set(option.value, option.label));
    return map;
  }, [isWordbankQuestion, wordbankOptions]);

  const wordbankValues = useMemo(() => {
    if (!isWordbankQuestion || !wordbankTemplate) return [];
    const blanks = wordbankTemplate.blankIds.length;
    return canonicalizeWordbankSelections(selected, blanks, wordbankOptions);
  }, [isWordbankQuestion, selected, wordbankOptions, wordbankTemplate]);
  const pointSelectOptions = useMemo(() => {
    if (!isPointSelectQuestion || !question || !isStandardQuestion(question)) {
      return [];
    }
    return question.options;
  }, [isPointSelectQuestion, question]);
  const pointSelectLabelMap = useMemo(() => {
    if (!isPointSelectQuestion) {
      return null;
    }
    const map = new Map<string, string>();
    pointSelectOptions.forEach((option) => {
      map.set(option.value, option.label);
    });
    return map;
  }, [isPointSelectQuestion, pointSelectOptions]);
  const pointSelectValues = useMemo(() => {
    if (!isPointSelectQuestion) return [];
    const rawSelections = Array.isArray(selected)
      ? selected
      : typeof selected === "string" && selected
      ? parseWordbankSelectionInput(selected)
      : [];
    return rawSelections
      .map((item) => canonicalizeWordbankValue(item, pointSelectOptions))
      .filter((item) => item && item.trim());
  }, [isPointSelectQuestion, pointSelectOptions, selected]);
  const pointSelectSelectedSet = useMemo(
    () => new Set(pointSelectValues),
    [pointSelectValues]
  );
  const pointSelectDisplayLabel = useMemo(() => {
    if (!isPointSelectQuestion) return "";
    if (!pointSelectLabelMap) {
      return pointSelectValues.join("");
    }
    return pointSelectValues
      .map((value) => pointSelectLabelMap.get(value) ?? value)
      .join("");
  }, [isPointSelectQuestion, pointSelectLabelMap, pointSelectValues]);
  const pointSelectDisplayTokens = useMemo(() => {
    if (!isPointSelectQuestion) return [];
    return pointSelectValues.map((value, index) => ({
      key: `${value}-${index}`,
      text: pointSelectLabelMap?.get(value) ?? value,
    }));
  }, [isPointSelectQuestion, pointSelectLabelMap, pointSelectValues]);

  const revealedAnswerText = useMemo(() => {
    if (!isAnswerRevealActive || !question) {
      return null;
    }
    if (isStandardQuestion(question)) {
      return formatStandardQuestionAnswer(question) ?? "暂无标准答案";
    }
    if (isOceanQuestion(question)) {
      return formatOceanQuestionAnswer(question) ?? "暂无标准答案";
    }
    return "暂无标准答案";
  }, [isAnswerRevealActive, question]);

  const answerBadgeText = isAnswerRevealActive ? revealedAnswerText : null;

  const selectionSummary = useMemo<{
    tokens: string[];
    emptyLabel?: string;
  } | null>(() => {
    if (!question) return null;

    const dedupeTokens = (values: string[]): string[] => {
      const seen = new Set<string>();
      const result: string[] = [];
      for (const raw of values) {
        const token = raw.trim();
        if (!token || seen.has(token)) continue;
        seen.add(token);
        result.push(token);
      }
      return result;
    };

    const buildSummary = (tokens: string[], emptyLabel?: string) => ({
      tokens,
      emptyLabel: emptyLabel ?? (tokens.length ? undefined : "未选"),
    });

    if (isStandardQuestion(question)) {
      switch (question.type) {
        case "single":
        case "boolean": {
          const value =
            typeof selected === "string"
              ? selected
              : Array.isArray(selected) && selected.length > 0
              ? selected[0]
              : "";
          if (!value) return buildSummary([], "未选");
          const letter = resolveOptionLetter(question, String(value)).toUpperCase();
          return buildSummary([letter]);
        }
        case "multiple":
        case "indeterminate": {
          const values = Array.isArray(selected)
            ? selected
            : typeof selected === "string" && selected
            ? [selected]
            : [];
          const letters = dedupeTokens(
            values
              .map((value) => resolveOptionLetter(question, String(value)).trim().toUpperCase())
              .filter(Boolean)
          ).sort();
          return buildSummary(letters);
        }
        case "wordbank": {
          const letters = wordbankValues
            .map((value) => {
              const token = value?.trim?.() ?? "";
              if (!token) return "";
              const optionIndex = question.options.findIndex((option) => option.value === token);
              return optionIndex >= 0 ? String.fromCharCode(65 + optionIndex) : "";
            })
            .filter(Boolean);
          return buildSummary(letters);
        }
        case "point-select": {
          if (!pointSelectValues.length) {
            return buildSummary([], "未选");
          }
          if (pointSelectDisplayLabel) {
            return buildSummary([pointSelectDisplayLabel]);
          }
          const tokens = pointSelectValues.map((value) => {
            const optionIndex = question.options.findIndex((option) => option.value === value);
            return optionIndex >= 0 ? String.fromCharCode(65 + optionIndex) : value;
          });
          return buildSummary(tokens);
        }
        case "matching": {
          if (!matchingPairs.length) return buildSummary([], "未选");
          const leftItems = matchingConfig?.left ?? [];
          const rightItems = matchingConfig?.right ?? [];
          const tokens = matchingPairs.map((pair) => {
            const [leftId, rightId] = pair.split(":");
            const leftIndex = leftItems.findIndex((item) => item.id === leftId);
            const rightIndex = rightItems.findIndex((item) => item.id === rightId);
            const leftLabel = leftIndex >= 0 ? String(leftIndex + 1) : leftId;
            const rightLetter = rightIndex >= 0 ? String.fromCharCode(65 + rightIndex) : rightId;
            return `${leftLabel}-${rightLetter}`;
          });
          return buildSummary(tokens);
        }
        case "fill": {
          return null;
        }
        default: {
          const value =
            typeof selected === "string"
              ? selected
              : Array.isArray(selected) && selected.length > 0
              ? selected.join(" ")
              : "";
          return value ? buildSummary([value]) : buildSummary([], "未选");
        }
      }
    }

    if (isOceanQuestion(question)) {
      const values = Array.isArray(selected)
        ? selected
        : typeof selected === "string" && selected
        ? [selected]
        : [];
      const orderedIds = sortOceanSelectionIds(values, question.optionPool);
      const letters = orderedIds
        .map((value) => {
          const index = question.optionPool.findIndex((option) => option.id === value);
          return index >= 0 ? String.fromCharCode(65 + index) : "";
        })
        .filter(Boolean);
      return buildSummary(letters);
    }

    return buildSummary([], "未选");
  }, [
    matchingConfig,
    matchingPairs,
    pointSelectDisplayLabel,
    pointSelectValues,
    question,
    selected,
    wordbankValues,
  ]);

  const lockedWinnerProfile = useMemo(() => {
    if (!lockedWinnerId) return null;
    const normalized = lockedWinnerId.trim();
    if (!normalized) return null;
    const profiles = teamProfiles ?? {};
    const direct = profiles[normalized];
    if (direct) return direct;
    for (const profile of Object.values(profiles)) {
      if (!profile) continue;
      const identifier =
        typeof profile.identifier === "string" ? profile.identifier.trim() : "";
      if (identifier && identifier === normalized) {
        return profile;
      }
      const fields = profile.fields ?? {};
      for (const key of TEAM_IDENTIFIER_KEYS) {
        const value = fields?.[key];
        if (value !== undefined && value !== null) {
          if (String(value).trim() === normalized) {
            return profile;
          }
        }
      }
    }
    return null;
  }, [lockedWinnerId, teamProfiles]);

  const lockedWinnerLabel = useMemo(() => {
    if (!lockedWinnerId) {
      return "对方队伍";
    }
    const profile = lockedWinnerProfile;
    if (profile?.displayName) {
      return profile.displayName;
    }
    return `台号${lockedWinnerId}`;
  }, [lockedWinnerId, lockedWinnerProfile]);

  useEffect(() => {
    if (!lockedWinnerId) return;
    if (lockedWinnerProfile) return;
    void ensureTeamProfile(lockedWinnerId).catch((error) => {
      console.warn("Failed to ensure team profile for identifier", lockedWinnerId, error);
    });
  }, [ensureTeamProfile, lockedWinnerId, lockedWinnerProfile]);

  useEffect(() => {
    if (!isWordbankQuestion || !wordbankTemplate) return;
    const blanks = wordbankTemplate.blankIds.length;
    const normalized = canonicalizeWordbankSelections(
      selected,
      blanks,
      wordbankOptions
    );
    const base = asStringArray(selected);
    if (!arraysShallowEqual(normalized, base)) {
      setSelected(normalized);
    }
  }, [isWordbankQuestion, selected, wordbankOptions, wordbankTemplate]);

  const wordbankUsedValues = useMemo(
    () => new Set(wordbankValues.filter((item) => item)),
    [wordbankValues]
  );

  const matchingSelectionMap = useMemo(() => matchingPairsToMap(matchingPairs), [matchingPairs]);
  const matchingUsedRightIds = useMemo(() => {
    const used = new Set<string>();
    for (const rightId of matchingSelectionMap.values()) {
      used.add(rightId);
    }
    return used;
  }, [matchingSelectionMap]);
  const matchingRightToLeftMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const [leftId, rightId] of matchingSelectionMap.entries()) {
      map.set(rightId, leftId);
    }
    return map;
  }, [matchingSelectionMap]);
  const updateMatchingLines = useCallback(() => {
    if (!matchingBoardRef.current || !isMatchingQuestion) {
      setMatchingLines([]);
      setMatchingOverlaySize({ width: 0, height: 0 });
      return;
    }
    const container = matchingBoardRef.current;
    const containerRect = container.getBoundingClientRect();
    const escapeSelector = (value: string) => {
      if (typeof window !== "undefined" && window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(value);
      }
      return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
    };
    const segments: MatchingLineSegment[] = [];
    matchingSelectionMap.forEach((rightId, leftId) => {
      const leftSelector = escapeSelector(leftId);
      const rightSelector = escapeSelector(rightId);
      const leftEl = container.querySelector<HTMLElement>(`[data-left-id="${leftSelector}"]`);
      const rightEl = container.querySelector<HTMLElement>(`[data-right-id="${rightSelector}"]`);
      if (!leftEl || !rightEl) {
        return;
      }
      const leftRect = leftEl.getBoundingClientRect();
      const rightRect = rightEl.getBoundingClientRect();
      segments.push({
        id: `${leftId}:${rightId}`,
        x1: leftRect.right - containerRect.left,
        y1: leftRect.top + leftRect.height / 2 - containerRect.top,
        x2: rightRect.left - containerRect.left,
        y2: rightRect.top + rightRect.height / 2 - containerRect.top,
        active: activeMatchingLeft === leftId,
      });
    });
    setMatchingOverlaySize({
      width: containerRect.width,
      height: containerRect.height,
    });
    setMatchingLines(segments);
  }, [activeMatchingLeft, isMatchingQuestion, matchingSelectionMap]);

  useEffect(() => {
    if (!isMatchingQuestion) {
      setMatchingLines([]);
      setMatchingOverlaySize({ width: 0, height: 0 });
      return;
    }
    const raf = requestAnimationFrame(() => {
      updateMatchingLines();
    });
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [isMatchingQuestion, matchingPairs, updateMatchingLines]);

  useEffect(() => {
    if (!isMatchingQuestion) return;
    const handle = () => {
      if (matchingLineRafRef.current !== null) {
        cancelAnimationFrame(matchingLineRafRef.current);
      }
      matchingLineRafRef.current = requestAnimationFrame(() => {
        updateMatchingLines();
        matchingLineRafRef.current = null;
      });
    };
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
      if (matchingLineRafRef.current !== null) {
        cancelAnimationFrame(matchingLineRafRef.current);
        matchingLineRafRef.current = null;
      }
    };
  }, [isMatchingQuestion, updateMatchingLines]);

  useEffect(() => {
    if (!isMatchingQuestion) return;
    const container = matchingBoardRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      updateMatchingLines();
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [isMatchingQuestion, updateMatchingLines]);

  const ultimateStage =
    meta.id === "ultimate-challenge"
      ? state.phase ?? (question ? "buzz" : "waiting")
      : undefined;
  useEffect(() => {
    if (ultimateStage !== "locked") {
      setLockedWinnerId(null);
    }
  }, [ultimateStage]);

  useEffect(() => {
    if (meta.id !== "ultimate-challenge") {
      setCanBuzz(true);
      return;
    }
    setCanBuzz(false);
  }, [meta.id, questionId, ultimateStage]);

  useEffect(() => {
    if (!controlMessage || meta.id !== "ultimate-challenge") return;

    const rawPayload = controlMessage.payload?.trim();
    if (!rawPayload) return;

    let action: string | undefined;
    try {
      const parsed = JSON.parse(rawPayload) as {
        action?: unknown;
        type?: unknown;
        command?: unknown;
      };
      if (parsed && typeof parsed === "object") {
        const candidate =
          (parsed as Record<string, unknown>).action ??
          (parsed as Record<string, unknown>).type ??
          (parsed as Record<string, unknown>).command;
        if (typeof candidate === "string") {
          action = candidate;
        }
      }
    } catch {
      action = rawPayload;
    }

    const normalizedAction = (action ?? rawPayload).trim().toLowerCase();
    if (normalizedAction !== "start_buzzing") return;
    const messageTimestamp = controlMessage.timestamp ?? null;
    const lastStart = lastStartBuzzingRef.current;
    if (messageTimestamp !== null && lastStart && lastStart.timestamp === messageTimestamp) {
      if (lastStart.questionId !== questionId) {
        return;
      }
      if (ultimateStage === "buzz") {
        return;
      }
    }
    if (ultimateStage !== "buzz") return;

    lastBuzzResultRef.current = {
      questionId,
      timestamp: 0,
    };
    lastStartBuzzingRef.current = {
      timestamp: messageTimestamp,
      questionId,
    };
    setCanBuzz(true);
    setLockedWinnerId(null);
  }, [controlMessage, meta.id, ultimateStage, questionId]);

  useEffect(() => {
    if (!resultMessage || meta.id !== "ultimate-challenge") return;
    if (ultimateStage !== "buzz") return;
    if (!questionId) return;

    if (resultMessage.timestamp <= lastResultTimestampRef.current) {
      return;
    }

    const previous = lastBuzzResultRef.current;
    if (previous.questionId === questionId && resultMessage.timestamp <= previous.timestamp) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(resultMessage.payload);
    } catch (error) {
      console.warn("Failed to parse buzz result payload", error);
      return;
    }

    if (!parsed || typeof parsed !== "object") return;
    const winnerCandidate =
      (parsed as Record<string, unknown>).winnerId ??
      (parsed as Record<string, unknown>).winner_id ??
      (parsed as Record<string, unknown>).winnerID;
    if (winnerCandidate === undefined || winnerCandidate === null) return;

    const winnerId = String(winnerCandidate).trim();
    if (!winnerId) return;

    lastBuzzResultRef.current = {
      questionId,
      timestamp: resultMessage.timestamp,
    };
    lastResultTimestampRef.current = resultMessage.timestamp;
    setCanBuzz(false);

    const currentUserId = user?.id ? String(user.id) : null;
    if (currentUserId && winnerId === currentUserId) {
      if (!delegateAnswerToControl) {
        Toast.warn("当前不可进入作答阶段");
        return;
      }
      delegateAnswerToControl(currentUserId, { isSelf: true });
      setSelected(null);
      setLockedWinnerId(null);
      Toast.success("抢答成功，开始作答",500);
      return;
    }

    delegateAnswerToControl?.(winnerId, { isSelf: false });
    setLockedWinnerId(winnerId);
    Toast.info("本题由其他队伍抢答成功");
  }, [
    delegateAnswerToControl,
    meta.id,
    questionId,
    resultMessage,
    ultimateStage,
    user?.id,
  ]);

  useEffect(() => {
    if (!question || !questionId) {
      setSelected(null);
      setMatchingPairs([]);
      setActiveMatchingLeft(null);
      return;
    }

    const persisted = answers[questionId]?.value;
    if (isMatchingQuestion) {
      const nextPairs = normalizeMatchingPairs(
        Array.isArray(persisted) ? persisted : typeof persisted === "string" ? persisted : null
      );
      setMatchingPairs(nextPairs);
      setSelected(null);
      setActiveMatchingLeft(null);
      return;
    }

    if (
      isPointSelectQuestion &&
      isStandardQuestion(question) &&
      question.type === "point-select"
    ) {
      if (Array.isArray(persisted)) {
        setSelected(persisted);
      } else if (typeof persisted === "string" && persisted.trim()) {
        setSelected(parseWordbankSelectionInput(persisted));
      } else {
        setSelected([]);
      }
      setActiveMatchingLeft(null);
      return;
    }

    if (Array.isArray(persisted)) {
      setSelected(persisted);
      return;
    }
    if (typeof persisted === "string") {
      setSelected(persisted);
      return;
    }

    if (
      isStandardQuestion(question) &&
      (question.type === "multiple" ||
        question.type === "indeterminate" ||
        question.type === "wordbank" ||
        question.type === "point-select")
    ) {
      setSelected([]);
    } else if (
      isStandardQuestion(question) &&
      question.type === "matching"
    ) {
      setMatchingPairs([]);
      setSelected(null);
    } else if (isOceanQuestion(question)) {
      setSelected([]);
    } else {
      setSelected(null);
    }
  }, [answers, isMatchingQuestion, isPointSelectQuestion, question, questionId]);

  useEffect(() => {
    setFillPreview(null);
    setCachedPaths(null);
    setBoardOpen(false);
    setBoardSubmitted(false);
    setBoardUploading(false);
    lastSubmitCommandRef.current = null;
    setLockedWinnerId(null);
  }, [questionId]);

  useEffect(() => {
    if (
      !questionId ||
      !question ||
      !isStandardQuestion(question) ||
      question.type !== "fill"
    ) {
      setFillPreview(null);
      setCachedPaths(null);
      return;
    }
    let cache = fillSketchCacheRef.current[questionId];
    let preview = cache?.preview ?? null;
    const answerValue = answers[questionId]?.value;
    let token = "";
    if (typeof answerValue === "string") {
      token = answerValue.trim();
    } else if (Array.isArray(answerValue)) {
      const first = answerValue.find((value) => typeof value === "string" && value.trim());
      token = typeof first === "string" ? first.trim() : "";
    }
    if (!preview && token) {
      const stored = loadPreviewFromStorage(token);
      if (stored) {
        preview = stored;
        fillSketchCacheRef.current[questionId] = {
          ...(cache ?? {}),
          preview: stored,
        };
        cache = fillSketchCacheRef.current[questionId];
      }
    }
    setFillPreview(preview ?? null);
    setCachedPaths(cache?.paths ?? null);
  }, [answers, question, questionId]);

  useEffect(() => {
    const previousId = lastQuestionIdRef.current;
    if (questionId && questionId !== previousId) {
      setCommandSubmissionLocked(false);
      setCommandSubmissionOverlayVisible(false);
      setAnswerRevealActive(false);
      setWordbankActiveIndex(null);
      setActiveMatchingLeft(null);
      lastQuestionIdRef.current = questionId;
      return;
    }

    if (!questionId) {
      setCommandSubmissionLocked(false);
      setCommandSubmissionOverlayVisible(false);
      setAnswerRevealActive(false);
      setWordbankActiveIndex(null);
      setActiveMatchingLeft(null);
      lastQuestionIdRef.current = null;
    }
  }, [questionId]);

  const totalQuestions =
    typeof state.totalQuestions === "number" && Number.isFinite(state.totalQuestions)
      ? state.totalQuestions
      : undefined;
  const questionOrdinal = state.questionIndex >= 0 ? state.questionIndex + 1 : 0;
  const showProgress = typeof totalQuestions === "number" && totalQuestions > 0;
  const progress = useMemo(() => {
    if (!showProgress) return 0;

    const total =
      typeof totalQuestions === "number" && Number.isFinite(totalQuestions) && totalQuestions > 0
        ? totalQuestions
        : 0;

    if (total <= 0) {
      return 0;
    }

    if (meta.id === "ocean-adventure") {
      const normalizedRemaining =
        typeof oceanRemainingCount === "number" && Number.isFinite(oceanRemainingCount)
          ? Math.max(0, Math.floor(oceanRemainingCount))
          : Math.max(total - Math.max(questionOrdinal - 1, 0), 0);

      const clampedRemaining = Math.max(0, Math.min(normalizedRemaining, total));
      const fraction = clampedRemaining / total;
      if (!Number.isFinite(fraction)) return 0;
      return Math.max(0, Math.min(100, Math.round(fraction * 100)));
    }

    const ratio = questionOrdinal / total;
    if (!Number.isFinite(ratio)) return 0;
    const percentage = Math.round(ratio * 100);
    return Math.min(100, Math.max(0, percentage));
  }, [meta.id, oceanRemainingCount, questionOrdinal, showProgress, totalQuestions]);
  const progressValue = Number.isFinite(progress) ? progress : 0;

  const hpDisplay = meta.features.hasHp
    ? {
        current: state.hp ?? meta.features.initialHp ?? 0,
        initial: meta.features.initialHp ?? 0,
      }
    : null;

  const oceanEndReason =
    meta.id === "ocean-adventure" ? state.oceanEndReason : undefined;
  const isOceanFinished = oceanEndReason !== undefined;
  const isOceanEliminated = oceanEndReason === "hp";
  const isOceanTimerExpired = oceanEndReason === "timer";
  const isOceanPoolExhausted = oceanEndReason === "empty";

  const speedRunEndReason =
    meta.id === "speed-run" ? state.speedRunEndReason : undefined;
  const isSpeedRunFinished = speedRunEndReason !== undefined;
  const isSpeedRunTimerExpired = speedRunEndReason === "timer";
  const isSpeedRunCompleted = speedRunEndReason === "complete";

  const speedRunStats = useMemo(() => {
    if (meta.id !== "speed-run") return null;
    const total = normalizedQuestions.length;
    let correct = 0;
    let wrong = 0;
    let answered = 0;
    const seen = new Set<string>();

    for (const question of normalizedQuestions) {
      if (!question?.id) continue;
      if (seen.has(question.id)) continue;
      seen.add(question.id);
      const record = answers[question.id];
      if (!record) continue;
      const metadata = record.metadata as Record<string, unknown> | undefined;
      if (metadata && typeof metadata["mode"] === "string" && metadata["mode"] !== meta.id) {
        continue;
      }
      answered += 1;
      const correctness = metadata?.["correct"];
      if (correctness === true) {
        correct += 1;
      } else if (correctness === false) {
        wrong += 1;
      }
    }

    return {
      total,
      answered,
      correct,
      wrong,
    };
  }, [answers, meta.id, normalizedQuestions]);

  const speedRunScore = speedRunStats?.correct ?? 0;
  const speedRunAnswered = speedRunStats?.answered ?? 0;
  const speedRunWrong = speedRunStats?.wrong ?? 0;
  const speedRunTotal = speedRunStats?.total ?? (meta.id === "speed-run" ? normalizedQuestions.length : 0);
  const speedRunUnanswered = Math.max(speedRunTotal - speedRunAnswered, 0);

  const shouldShowActionBar =
    meta.id === "speed-run"
      ? !isSpeedRunFinished
      : meta.id === "ocean-adventure"
        ? !isOceanFinished
        : false;

  const isEliminated = isLastStandMode && (hpDisplay?.current ?? 0) <= 0;

  const oceanRemainingDisplay =
    meta.id === "ocean-adventure"
      ? Math.max(
          0,
          typeof oceanRemainingCount === "number" && Number.isFinite(oceanRemainingCount)
            ? Math.floor(oceanRemainingCount)
            : DEFAULT_OCEAN_REMAINING_COUNT
        )
      : null;

  const fetchOceanStats = useCallback(async () => {
    if (!isOceanFinished) return;
    const userId = user?.id;
    if (!userId) {
      setOceanStatsStatus("error");
      setOceanStatsError("选手信息缺失，无法获取成绩。");
      return;
    }
    const statsUrl = resolveTihaiUrl(
      `/user/${encodeURIComponent(userId)}/answers`
    );
    setOceanStatsStatus("loading");
    setOceanStatsError(null);
    try {
      const response = await fetch(statsUrl);
      if (!response.ok) {
        throw new Error(`成绩查询失败: ${response.status}`);
      }
      const data = await response.json();
      if (!data?.success || !data?.stats) {
        throw new Error("成绩数据格式不正确");
      }
      setOceanStats({
        total: typeof data.stats.total === "number" ? data.stats.total : undefined,
        correct: typeof data.stats.correct === "number" ? data.stats.correct : undefined,
        wrong: typeof data.stats.wrong === "number" ? data.stats.wrong : undefined,
        score: typeof data.stats.score === "number" ? data.stats.score : undefined,
        accuracy: typeof data.stats.accuracy === "number" ? data.stats.accuracy : undefined,
        lastAnswerTime:
          typeof data.stats.lastAnswerTime === "number"
            ? data.stats.lastAnswerTime
            : undefined,
      });
      setOceanStatsStatus("success");
    } catch (error) {
      console.error("Failed to fetch ocean stats", error);
      setOceanStatsStatus("error");
      setOceanStatsError(error instanceof Error ? error.message : "成绩同步失败");
    }
  }, [isOceanFinished, user?.id]);

  useEffect(() => {
    if (!isOceanFinished) {
      if (oceanStatsStatus !== "idle") {
        setOceanStats(null);
        setOceanStatsStatus("idle");
        setOceanStatsError(null);
      }
      return;
    }
    if (oceanStatsStatus !== "idle") return;
    void fetchOceanStats();
  }, [fetchOceanStats, isOceanFinished, oceanStatsStatus]);

  const handleRetryOceanStats = useCallback(() => {
    void fetchOceanStats();
  }, [fetchOceanStats]);

  const buzzerStatusLabel = useMemo(() => {
    if (!meta.features.requiresBuzzer) return null;
    if (meta.id !== "ultimate-challenge") {
      return state.awaitingHost ? "未抢答" : "等待裁决";
    }
    switch (ultimateStage) {
      case "waiting":
        return "等待主持人";
      case "buzz":
        return "等待抢答";
      case "decision":
        return "选择作答方";
      case "locked":
        return "等待对手";
      case "answer":
        return "本队作答中";
      default:
        return state.awaitingHost ? "未抢答" : "等待裁决";
    }
  }, [meta.features.requiresBuzzer, meta.id, state.awaitingHost, ultimateStage]);

  const handleSelect = useCallback((value: string) => {
    setSelected(value);
  }, [setSelected]);

  const toggleMultiOption = useCallback(
    (value: string) => {
      setSelected((prev) => {
        const previous = Array.isArray(prev) ? prev.map(String) : [];
        if (previous.includes(value)) {
          return previous.filter((item) => item !== value);
        }
        return [...previous, value];
      });
    },
    [setSelected]
  );

  const handleWordbankBlankClick = useCallback(
    (index: number) => {
      if (!state.answeringEnabled || isCommandSubmissionLocked) return;
      setWordbankActiveIndex(index);
    },
    [isCommandSubmissionLocked, state.answeringEnabled]
  );

  const handleWordbankClear = useCallback(
    (index: number) => {
      if (!state.answeringEnabled || isCommandSubmissionLocked) return;
      const next = [...wordbankValues];
      if (!next[index]) {
        setWordbankActiveIndex(index);
        return;
      }
      next[index] = "";
      setSelected([...next]);
      setWordbankActiveIndex(index);
    },
    [isCommandSubmissionLocked, state.answeringEnabled, wordbankValues]
  );

  const handleWordbankSelectOption = useCallback(
    (optionValue: string, isUsed?: boolean) => {
      if (!state.answeringEnabled || isCommandSubmissionLocked || !wordbankTemplate) return;
      if (isUsed) {
        return;
      }
      const safeValue = canonicalizeWordbankValue(optionValue, wordbankOptions);
      const next = [...wordbankValues];

      let targetIndex =
        wordbankActiveIndex !== null && wordbankActiveIndex >= 0
          ? wordbankActiveIndex
          : next.findIndex((item) => !item);
      if (targetIndex === -1) {
        targetIndex =
          wordbankActiveIndex !== null ? wordbankActiveIndex : next.length - 1;
      }
      if (targetIndex < 0) return;

      const existingIndex = next.findIndex(
        (item, idx) => item === safeValue && idx !== targetIndex
      );
      if (existingIndex !== -1) {
        next[existingIndex] = "";
      }

      next[targetIndex] = safeValue;
      const blanks = wordbankTemplate.blankIds.length;
      const sanitizedNext = canonicalizeWordbankSelections(
        next,
        blanks,
        wordbankOptions
      );
      setSelected(sanitizedNext);

      if (targetIndex < next.length - 1) {
        setWordbankActiveIndex(targetIndex + 1);
      } else {
        const hasEmpty = sanitizedNext.some((item) => !item);
        setWordbankActiveIndex(hasEmpty ? 0 : null);
      }
    },
    [
      isCommandSubmissionLocked,
      state.answeringEnabled,
      wordbankOptions,
      wordbankTemplate,
      wordbankValues,
      wordbankActiveIndex,
    ]
  );

  const handlePointSelectOption = useCallback(
    (optionValue: string) => {
      if (!state.answeringEnabled || isCommandSubmissionLocked || !isPointSelectQuestion) {
        return;
      }
      const canonical = canonicalizeWordbankValue(optionValue, pointSelectOptions);
      if (!canonical) return;
      setSelected((prev) => {
        const base = Array.isArray(prev)
          ? prev
          : typeof prev === "string" && prev
          ? parseWordbankSelectionInput(prev)
          : [];
        const normalized = base
          .map((item) => canonicalizeWordbankValue(item, pointSelectOptions))
          .filter((item) => item && item.trim());
        const existingIndex = normalized.findIndex((item) => item === canonical);
        if (existingIndex >= 0) {
          return normalized.filter((_, index) => index !== existingIndex);
        }
        return [...normalized, canonical];
      });
    },
    [isCommandSubmissionLocked, isPointSelectQuestion, pointSelectOptions, state.answeringEnabled]
  );

  const handlePointSelectClear = useCallback(() => {
    if (!state.answeringEnabled || isCommandSubmissionLocked || !isPointSelectQuestion) {
      return;
    }
    setSelected([]);
  }, [isCommandSubmissionLocked, isPointSelectQuestion, state.answeringEnabled]);

  const handleMatchingLeftClick = useCallback(
    (leftId: string) => {
      if (!state.answeringEnabled || isCommandSubmissionLocked) return;
      setActiveMatchingLeft((prev) => (prev === leftId ? null : leftId));
    },
    [isCommandSubmissionLocked, state.answeringEnabled]
  );

  const handleMatchingRightClick = useCallback(
    (rightId: string) => {
      if (!state.answeringEnabled || isCommandSubmissionLocked) return;

      if (activeMatchingLeft) {
        setMatchingPairs((prev) => {
          const map = matchingPairsToMap(prev);
          const currentValue = map.get(activeMatchingLeft);
          for (const [leftKey, value] of map.entries()) {
            if (value === rightId) {
              map.delete(leftKey);
            }
          }
          if (currentValue === rightId) {
            map.delete(activeMatchingLeft);
          } else {
            map.set(activeMatchingLeft, rightId);
          }
          const nextPairs = mapToMatchingPairs(map);
          return orderMatchingPairs(nextPairs, matchingConfig?.left);
        });
        setActiveMatchingLeft(null);
        return;
      }

      for (const [leftKey, value] of matchingSelectionMap.entries()) {
        if (value === rightId) {
          setActiveMatchingLeft(leftKey);
          return;
        }
      }
    },
    [
      activeMatchingLeft,
      isCommandSubmissionLocked,
      matchingConfig?.left,
      matchingSelectionMap,
      state.answeringEnabled,
    ]
  );

  const handleClearMatchingPairs = useCallback(() => {
    if (!state.answeringEnabled || isCommandSubmissionLocked || matchingPairs.length === 0) {
      return;
    }
    setMatchingPairs([]);
    setActiveMatchingLeft(null);
  }, [isCommandSubmissionLocked, matchingPairs, state.answeringEnabled]);

  const handleOpenBoard = useCallback(() => {
    if (isBoardOpen || boardSubmitted || isCommandSubmissionLocked) return;
    lastSubmitCommandRef.current = null;
    setBoardOpen(true);
  }, [boardSubmitted, isBoardOpen, isCommandSubmissionLocked]);

  const handleBoardPathsChange = useCallback(
    (paths: SmoothSerializedStroke[]) => {
      if (!questionId) return;
      const cache = fillSketchCacheRef.current[questionId] ?? {};
      fillSketchCacheRef.current[questionId] = {
        ...cache,
        paths,
      };
      setCachedPaths(paths.length > 0 ? paths : null);
    },
    [questionId]
  );

  const handleBoardUploadSuccess = useCallback(
    ({
      token,
      preview,
      paths,
    }: {
      token: string;
      preview: string;
      paths: SmoothSerializedStroke[];
    }) => {
      if (
        !questionId ||
        !question ||
        !isStandardQuestion(question) ||
        question.type !== "fill"
      ) {
        return;
      }
      setSelected(token);
      fillSketchCacheRef.current[questionId] = {
        preview,
        paths,
      };
      savePreviewToStorage(token, preview);
      setFillPreview(preview);
      setCachedPaths(paths);
      setBoardSubmitted(true);
      setBoardUploading(false);
    },
    [question, questionId]
  );

  const handleSubmit = useCallback(
    async (options: SubmitOptions = {}, overrideValue?: string | string[]) => {
      const { allowEmpty = false, source = "manual" } = options;
      let pendingManualTimestamp: number | null = null;
      if (source === "manual") {
        const now = Date.now();
        if (now - lastManualSubmitAtRef.current < SUBMIT_THROTTLE_INTERVAL_MS) {
          Toast.info("操作过于频繁，请稍后再试", SUBMIT_FREQUENT_TOAST_DURATION_MS);
          return;
        }
        pendingManualTimestamp = now;
      }
      if (isSubmitting) return;

      const currentQuestion = question;
      if (!currentQuestion) {
        if (source === "manual") {
          Toast.warn("当前无法提交答案");
        }
        return;
      }

      if (!state.answeringEnabled) {
        if (source === "manual") {
          Toast.warn("当前无法提交答案");
        }
        return;
      }

      let resolvedSelection: string | string[] | null | undefined = overrideValue;
      if (resolvedSelection === undefined) {
        resolvedSelection =
          isStandardQuestion(currentQuestion) && currentQuestion.type === "matching"
            ? matchingPairs
            : selected;
      }

      let submissionValue: string | string[] = "";
      let questionSheetAnswer: string | undefined;

      if (isStandardQuestion(currentQuestion)) {
        if (currentQuestion.type === "matching") {
          const pairCandidates = Array.isArray(resolvedSelection)
            ? normalizeMatchingPairs(resolvedSelection)
            : normalizeMatchingPairs(
                typeof resolvedSelection === "string" ? resolvedSelection : null
              );
          const orderedPairs = orderMatchingPairs(
            pairCandidates,
            currentQuestion.matching?.left
          );
          const pairMap = matchingPairsToMap(orderedPairs);
          const expectedPairs = currentQuestion.matching?.left?.length ?? 0;
          const hasPairs = pairMap.size > 0;
          const hasAllPairs =
            expectedPairs > 0 ? pairMap.size === expectedPairs : hasPairs;
          const isSameOrder =
            matchingPairs.length === orderedPairs.length &&
            matchingPairs.every((pair, index) => pair === orderedPairs[index]);
          if (!isSameOrder) {
            setMatchingPairs(orderedPairs);
          }
          if (!allowEmpty && !hasAllPairs) {
            Toast.warn(expectedPairs > 0 ? "请完成全部连线" : "请至少完成一条连线");
            return;
          }
          submissionValue = orderedPairs;
          questionSheetAnswer = orderedPairs.length
            ? matchingPairsToSheetAnswer(orderedPairs)
            : "未选";
        } else if (
          currentQuestion.type === "multiple" ||
          currentQuestion.type === "indeterminate"
        ) {
          const values = Array.isArray(resolvedSelection)
            ? resolvedSelection.map(String)
            : typeof resolvedSelection === "string" && resolvedSelection
            ? [resolvedSelection]
            : [];
          if (!allowEmpty && values.length === 0) {
            Toast.warn("请至少选择一个选项");
            return;
          }
          submissionValue = values;
          questionSheetAnswer = formatAnswerForQuestionSheet(
            currentQuestion,
            values.length > 0 ? values : null
          );
        } else if (currentQuestion.type === "wordbank") {
          const { blankIds } = parseWordbankTemplate(currentQuestion.title);
          const rawValues = parseWordbankSelectionInput(resolvedSelection);
          const normalizedValues = blankIds.length
            ? blankIds.map((_, index) => rawValues[index] ?? "")
            : rawValues;
          const canonicalValues = normalizedValues.map((item) =>
            canonicalizeWordbankValue(item, currentQuestion.options)
          );
          const hasEmpty =
            blankIds.length > 0
              ? canonicalValues.some((item) => !item)
              : canonicalValues.length === 0 || canonicalValues.some((item) => !item);
          if (!allowEmpty && hasEmpty) {
            Toast.warn("请完成所有填空");
            return;
          }
          submissionValue = canonicalValues;
          const hasValue = canonicalValues.some((item) => item);
          questionSheetAnswer = hasValue
            ? canonicalValues.join("")
            : "未选";
        } else if (currentQuestion.type === "point-select") {
          const rawValues = parseWordbankSelectionInput(resolvedSelection);
          const canonicalValues = rawValues
            .map((item) => canonicalizeWordbankValue(item, currentQuestion.options))
            .filter((item) => item && item.trim());
          if (!allowEmpty && canonicalValues.length === 0) {
            Toast.warn("请至少选择一个词语");
            return;
          }
          submissionValue = canonicalValues;
          const labelMap = new Map(
            currentQuestion.options.map((option) => [option.value, option.label])
          );
          const labels = canonicalValues.map((value) => labelMap.get(value) ?? value);
          questionSheetAnswer =
            canonicalValues.length > 0
              ? labels.join("") || canonicalValues.join("")
              : "未选";
        } else if (currentQuestion.type === "fill") {
          const value =
            typeof resolvedSelection === "string"
              ? resolvedSelection.trim()
              : "";
          if (!allowEmpty && !value) {
            Toast.warn("请使用画板功能作答");
            return;
          }
          submissionValue = value;
          questionSheetAnswer = value || EMPTY_BOARD_PLACEHOLDER_URL;
        } else {
          const value =
            typeof resolvedSelection === "string" ? resolvedSelection : "";
          if (!allowEmpty && !value) {
            Toast.warn("请选择一个选项");
            return;
          }
          submissionValue = value;
          questionSheetAnswer = formatAnswerForQuestionSheet(
            currentQuestion,
            value || null
          );
        }
      } else if (isOceanQuestion(currentQuestion)) {
        const values = Array.isArray(resolvedSelection)
          ? resolvedSelection.map(String)
          : typeof resolvedSelection === "string" && resolvedSelection
          ? [resolvedSelection]
          : [];
        if (!allowEmpty && values.length === 0) {
          Toast.warn("请至少选择一个选项");
          return;
        }
        submissionValue = values;
      } else {
        submissionValue =
          typeof resolvedSelection === "string" ? resolvedSelection : "";
      }

      if (pendingManualTimestamp !== null) {
        lastManualSubmitAtRef.current = pendingManualTimestamp;
      }

      const requestId = createRequestId();
      if (inflightSubmissionSetRef.current.has(requestId)) {
        return;
      }
      inflightSubmissionSetRef.current.add(requestId);
      activeSubmissionIdRef.current = requestId;

      const currentQuestionIndex = state.questionIndex;
      const speedRunRemainingSeconds =
        meta.id === "speed-run"
          ? Math.max(0, Math.round((state.timeRemaining ?? 0)))
          : undefined;

      setSubmitting(true);
      try {
        await enqueueSubmission(async () => {
          const submissionResult = await controls.submitAnswer(submissionValue, {
            requestId,
            timeoutMs: SUBMISSION_TIMEOUT_MS,
          });
          const isCorrect = submissionResult?.correct;
          const hpAfterAnswer = submissionResult?.hpAfterAnswer;
          const rawResult = submissionResult?.rawResult;

          if (
            (shouldHandleSubmitCommand || meta.id === "speed-run") &&
            isStandardQuestion(currentQuestion)
          ) {
            const questionKey = currentQuestion.id;
            const normalizedQuestion = normalizedQuestions.find(
              (item) => item.id === questionKey
            );
            const questionRecordId = normalizedQuestion?.recordId
              ? String(normalizedQuestion.recordId)
              : undefined;
            const questionSheetId = currentStage?.questionSheetId;
            const scoreSheetId = currentStage?.scoreSheetId;
            const scoreRecordId = scoreRecord?.recordId;
            const userId = user?.id ?? undefined;
            const answerForSheet = questionSheetAnswer || "未选";
            const correctness = isCorrect === true ? "1" : "0";
            const scoreAnswerValue =
              currentQuestion.type === "fill" ? "填空" : correctness;
            const lightValue: "0" | "1" = correctness === "1" ? "1" : "0";
            const scoreFieldKey = resolveScoreFieldKey(
              normalizedQuestion,
              currentQuestionIndex
            );
            const persistenceTasks: PersistenceTask[] = [];
            const timeFieldValue =
              meta.id === "speed-run" && speedRunRemainingSeconds !== undefined
                ? String(speedRunRemainingSeconds)
                : undefined;

            if (questionSheetId && questionRecordId && userId) {
              persistenceTasks.push({
                type: "answer-choice",
                params: {
                  datasheetId: questionSheetId,
                  recordId: questionRecordId,
                  userId,
                  fieldKey: userId,
                  answer: answerForSheet,
                },
              });
            }

            if (scoreSheetId && scoreRecordId && scoreFieldKey) {
              const statusFieldKey = isLastStandMode
                ? resolveStatusFieldKey(scoreRecord?.fields)
                : undefined;
              let statusValue: string | undefined;
              if (isLastStandMode && typeof hpAfterAnswer === "number") {
                if (!isGroupedLastStand) {
                  statusValue = String(Math.max(0, Math.trunc(hpAfterAnswer)));
                } else {
                  const indicator = resolveLastStandGroupStatusIndicator(currentStage?.name);
                  statusValue = hpAfterAnswer > 0 ? indicator ?? undefined : "0";
                  if (hpAfterAnswer > 0 && !indicator) {
                    console.warn("Grouped last-stand stage缺少状态标识符, 将跳过状态同步");
                    statusValue = undefined;
                  }
                }
              }
              persistenceTasks.push({
                type: "judge-result",
                params: {
                  datasheetId: scoreSheetId,
                  recordId: scoreRecordId,
                  questionId: scoreFieldKey,
                  answer: scoreAnswerValue,
                  time: timeFieldValue,
                  light: lightValue,
                  statusFieldKey,
                  status: statusValue,
                },
              });
            }

            if (persistenceTasks.length > 0) {
              const job: PersistenceJob = {
                id: `${requestId}-sync`,
                label: `题目同步（${resolveQuestionId(currentQuestion)}）`,
                createdAt: Date.now(),
                attempts: 0,
                tasks: persistenceTasks,
              };
              enqueuePersistenceJob(job);
            }
          }

          const showCorrectness =
            meta.id === "speed-run" || meta.id === "ocean-adventure";
          const notifyStyle = {
            position: "fixed" as const,
            top: notifyOffset,
            left: 0,
            right: 0,
            pointerEvents: "none" as const,
            display: "flex",
            justifyContent: "center",
            zIndex: 1200,
          };
          if (source === "command") {
            setCommandSubmissionLocked(true);
            setCommandSubmissionOverlayVisible(true);
            setAnswerRevealActive(false);
          } else {
            setCommandSubmissionLocked(false);
            setCommandSubmissionOverlayVisible(false);
            if (showCorrectness) {
              if (isCorrect === true) {
                Notify.success({
                  content: "回答正确",
                  style: notifyStyle,
                  duration: 500,
                });
              } else if (isCorrect === false) {
                Notify.error({
                  content: "回答错误",
                  style: notifyStyle,
                  duration: 500,
                });
              } else {
                Notify.info({
                  content:
                    meta.id === "ocean-adventure"
                      ? "答案已提交"
                      : "答案已记录，正在同步",
                  style: notifyStyle,
                  duration: 500,
                });
              }
            } else {
              Toast.success(
                (shouldHandleSubmitCommand || meta.id === "speed-run") &&
                  isStandardQuestion(currentQuestion)
                  ? "答案已记录，正在同步"
                  : "答案已提交"
              );
            }
          }

          if (meta.id === "ocean-adventure") {
            if (submissionResult?.stats || submissionResult?.score) {
              setOceanStats((prev) => ({
                total: submissionResult.stats?.total ?? prev?.total,
                correct: submissionResult.stats?.correct ?? prev?.correct,
                wrong: submissionResult.stats?.wrong ?? prev?.wrong,
                accuracy: submissionResult.stats?.accuracy ?? prev?.accuracy,
                lastAnswerTime:
                  submissionResult.stats?.lastAnswerTime ?? prev?.lastAnswerTime,
                score: submissionResult.score?.total ?? prev?.score,
              }));
              setOceanStatsError(null);
              if (typeof hpAfterAnswer === "number" && hpAfterAnswer <= 0) {
                setOceanStatsStatus("success");
              }
            }

            const shouldSkipNext =
              rawResult === "wrong" &&
              typeof hpAfterAnswer === "number" &&
              hpAfterAnswer <= 0;
            if (!shouldSkipNext) {
              await controls.requestNextQuestion();
            }
          }

          return submissionResult;
        });
      } catch (error) {
        console.error("提交答案失败", error);
        showQuizApiErrorToast(error, "提交答案");
      } finally {
        inflightSubmissionSetRef.current.delete(requestId);
        if (activeSubmissionIdRef.current === requestId) {
          activeSubmissionIdRef.current = null;
        }
        setSubmitting(false);
      }
    },
    [
      controls,
      currentStage,
      meta.id,
      normalizedQuestions,
      notifyOffset,
      scoreRecord,
      selected,
      matchingPairs,
      shouldHandleSubmitCommand,
      setOceanStats,
      setOceanStatsError,
      setOceanStatsStatus,
      state.answeringEnabled,
      state.questionIndex,
      state.timeRemaining,
      question,
      user?.id,
      isSubmitting,
      isLastStandMode,
      isGroupedLastStand,
      enqueuePersistenceJob,
      enqueueSubmission,
    ]
  );

  const handleRetractCommand = useCallback(async () => {
    if (retractHandlingRef.current) return;
    if (!isLastStandMode) return;
    const recoverControl = controls.recoverHp;
    if (!recoverControl) return;

    const maxHp = Math.max(0, Math.trunc(meta.features.initialHp ?? 0));
    if (maxHp <= 0) return;

    const scoreSheetId = currentStage?.scoreSheetId;
    const scoreRecordId = scoreRecord?.recordId;
    if (!scoreSheetId || !scoreRecordId) {
      Toast.error("当前环节缺少分数表配置，无法恢复血量");
      return;
    }

    const statusFieldKey = resolveStatusFieldKey(scoreRecord?.fields);
    if (!statusFieldKey) {
      Toast.error("当前环节缺少血量字段配置，无法恢复血量");
      return;
    }
    const lastHpPenalty = state.lastHpPenalty;
    if (!lastHpPenalty || lastHpPenalty.amount <= 0) {
      Toast.info("上一题未扣血，无需回退");
      return;
    }

    const currentHp = Math.trunc(state.hp ?? maxHp);
    const restoredHp = Math.trunc(lastHpPenalty.hpBefore);
    const targetHp = Math.max(0, Math.min(restoredHp, maxHp));

    if (targetHp <= currentHp) {
      Toast.info("当前血量无需回退");
      return;
    }

    let statusValue: string | undefined;
    if (isGroupedLastStand) {
      const indicator = resolveLastStandGroupStatusIndicator(currentStage?.name);
      if (!indicator) {
        Toast.error("当前环节缺少状态标识符，无法恢复状态");
        return;
      }
      statusValue = targetHp > 0 ? indicator : "0";
    } else {
      statusValue = String(targetHp);
    }

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });

    retractHandlingRef.current = true;
    let attempt = 0;
    let lastError: unknown;
    try {
      while (attempt < 3) {
        try {
          await updateScoreStatus({
            datasheetId: scoreSheetId,
            recordId: scoreRecordId,
            fieldKey: statusFieldKey,
            status: statusValue,
          });
          recoverControl(targetHp);
          return;
        } catch (error) {
          lastError = error;
          attempt += 1;
          if (attempt < 3) {
            await wait(1000);
          }
        }
      }
      console.error("血量恢复同步失败", lastError);
      Toast.error("血量恢复失败，请稍后重试");
    } finally {
      retractHandlingRef.current = false;
    }
  }, [
    controls.recoverHp,
    currentStage?.scoreSheetId,
    currentStage?.name,
    meta.features.initialHp,
    isLastStandMode,
    isGroupedLastStand,
    scoreRecord?.fields,
    scoreRecord?.recordId,
    state.lastHpPenalty,
    state.hp,
    updateScoreStatus,
  ]);

  useEffect(() => {
    if (!commandMessage) return;
    if (commandMessage.timestamp === lastCommandHandledRef.current) {
      return;
    }

    const rawPayload = commandMessage.payload.trim();
    const normalizedCommand = rawPayload.toLowerCase();
    const isNumericCommand = /^\d+$/.test(rawPayload);

    if (isNumericCommand) {
      lastCommandHandledRef.current = commandMessage.timestamp;
      setCommandSubmissionLocked(false);
      setCommandSubmissionOverlayVisible(false);
      setAnswerRevealActive(false);
      if (meta.id === "ultimate-challenge") {
        resetUltimateRoundControl?.();
        setCanBuzz(false);
        setLockedWinnerId(null);
        lastBuzzResultRef.current = { questionId: null, timestamp: 0 };
      }
      return;
    }

    if (normalizedCommand === "answer") {
      lastCommandHandledRef.current = commandMessage.timestamp;
      setCommandSubmissionOverlayVisible(false);
      setAnswerRevealActive(true);
      setCommandSubmissionLocked(true);
      return;
    }

    if (normalizedCommand === "retract") {
      lastCommandHandledRef.current = commandMessage.timestamp;
      void handleRetractCommand();
      return;
    }

    if (isBoardUploading || boardSubmitted) return;

    if (!shouldHandleSubmitCommand) return;
    if (normalizedCommand !== "submit") return;
    if (commandMessage.timestamp === lastSubmitCommandRef.current) return;
    lastSubmitCommandRef.current = commandMessage.timestamp;
    lastCommandHandledRef.current = commandMessage.timestamp;

    const executeSubmission = async () => {
      if (question && isStandardQuestion(question) && question.type === "fill") {
        if (!boardRef.current) {
          Toast.warn("画板尚未打开，无法提交");
          return;
        }
        setBoardUploading(true);
        try {
          Toast.info("正在上传画板");
          const result = await boardRef.current.exportAndUpload();
          setBoardSubmitted(true);
          await handleSubmit(
            { allowEmpty: true, source: "command" },
            result.token
          );
          setBoardOpen(false);
        } catch (error) {
          if (error instanceof FillDrawingBoardEmptyError) {
            setBoardSubmitted(true);
            setBoardOpen(false);
            await handleSubmit({ allowEmpty: true, source: "command" });
          } else {
            console.error("画板上传失败", error);
          }
        } finally {
          setBoardUploading(false);
        }
        return;
      }
      await handleSubmit({ allowEmpty: true, source: "command" });
    };

    void executeSubmission();
  }, [
    boardSubmitted,
    boardRef,
    commandMessage,
    handleRetractCommand,
    handleSubmit,
    isBoardUploading,
    meta.id,
    question,
    resetUltimateRoundControl,
    shouldHandleSubmitCommand,
  ]);

  const handleUltimatePkTeamSelect = useCallback((team: "affirmative" | "negative") => {
    setUltimatePkTeam(team);
  }, []);

  const handleUltimatePkSwitch = useCallback(() => {
    if (!isUltimatePkMode) return;
    if (ultimatePkStageLocked) {
      Toast.warn("主持人尚未允许切换");
      return;
    }
    if (ultimatePkThrottleActive) {
      Toast.info("切换冷却中，请稍候");
      return;
    }
    if (!mqttService.isConnected()) {
      Toast.warn(
        mqttConnected ? "实时服务暂不可用，请稍后再试" : "尚未连接实时服务，请稍后重试"
      );
      return;
    }

    const payload = ultimatePkTeam === "affirmative" ? "switch-blue" : "switch-red";
    setUltimatePkSending(true);
    try {
      mqttService.publish(MQTT_TOPICS.command, payload, { qos: 1 });
      scheduleUltimatePkThrottle();
      Toast.success("切换指令已发送", 600);
    } catch (error) {
      console.error("Failed to publish ultimate PK switch command", error);
      Toast.error("切换指令发送失败");
    } finally {
      setUltimatePkSending(false);
    }
  }, [
    isUltimatePkMode,
    mqttConnected,
    scheduleUltimatePkThrottle,
    ultimatePkStageLocked,
    ultimatePkTeam,
    ultimatePkThrottleActive,
  ]);

  const handleApplyJudgement = (result: "correct" | "wrong") => {
    applyHostJudgementControl?.(result);
  };

  const handleTriggerBuzzer = () => {
    if (!triggerBuzzerControl) {
      Toast.warn("当前不可抢答");
      return;
    }
    if (!canBuzz) {
      Toast.warn("主持人尚未开启抢答");
      return;
    }
    if (!user?.id) {
      Toast.warn("选手信息缺失，无法抢答");
      return;
    }
    if (!mqttService.isConnected()) {
      Toast.warn(
        mqttConnected
          ? "抢答服务暂时不可用，请稍后再试"
          : "尚未连接抢答服务，请稍后重试"
      );
      return;
    }

    const payload = JSON.stringify({ player_id: String(user.id) });
    try {
      mqttService.publish(MQTT_TOPICS.buzzIn, payload, { qos: 1 });
      triggerBuzzerControl();
      setCanBuzz(false);
    } catch (error) {
      console.error("Failed to publish buzz-in message", error);
      Toast.error("抢答请求发送失败");
    }
  };

  const renderCommandSubmissionResult = () => (
    <div className={styles.commandSubmissionResult}>
      <div className={styles.commandSubmissionBadge}>
        <SuccessCheckIcon />
      </div>
      <p className={styles.commandSubmissionTitle}>提交成功</p>
      <p className={styles.commandSubmissionSubtitle}>请等待大屏公示</p>
    </div>
  );

  const renderCommandSubmissionOverlay = () => (
    <div className={styles.commandSubmissionOverlay} role="status" aria-live="polite">
      <div className={styles.commandSubmissionOverlayInner}>
        {renderCommandSubmissionResult()}
      </div>
    </div>
  );

  const renderSpeedRunResult = () => {
    if (!isSpeedRunFinished) {
      return null;
    }
    const ResultBadgeIcon = isSpeedRunTimerExpired ? ErrorBadgeIcon : SuccessCheckIcon;
    const resultTitle = isSpeedRunTimerExpired ? "倒计时结束" : "全部题目完成";
    const resultSubtitle = isSpeedRunTimerExpired
      ? "作答时间已用尽，本轮成绩已锁定，请等待主持人下一步指令。"
      : "已作答全部题目，本轮成绩已锁定，请等待主持人下一步指令。";

    const displayEntries: Array<[string, string]> = [];
    const pushEntry = (label: string, value: number | string | undefined) => {
      if (value === undefined || value === null) return;
      if (typeof value === "number") {
        displayEntries.push([label, value.toString()]);
        return;
      }
      const text = value.trim();
      if (!text) return;
      displayEntries.push([label, text]);
    };

    pushEntry("总题数", speedRunTotal);
    pushEntry("已作答", speedRunAnswered);
    pushEntry("答对", speedRunScore);
    pushEntry("答错", speedRunWrong);
    if (speedRunUnanswered > 0) {
      pushEntry("未作答", speedRunUnanswered);
    }
    if (isSpeedRunCompleted && typeof state.timeRemaining === "number") {
      pushEntry("剩余时间", formatSeconds(state.timeRemaining));
    }

    const statusMessage = isSpeedRunTimerExpired
      ? "倒计时已结束，本轮成绩已锁定，请等待主持人下一步指令。"
      : "成绩已锁定，请等待主持人下一步指令。";

    return (
      <div className={styles.oceanResultWrapper}>
        <div className={styles.commandSubmissionResult}>
          <div className={styles.commandSubmissionBadge}>
            <ResultBadgeIcon />
          </div>
          <p className={styles.commandSubmissionTitle}>{resultTitle}</p>
          <p className={styles.commandSubmissionSubtitle}>{resultSubtitle}</p>
        </div>

        <div className={styles.oceanResultScoreCard}>
          <div className={styles.oceanResultScore}>
            <span className={styles.oceanResultLabel}>当前得分</span>
            <span className={styles.oceanResultValue}>{speedRunScore}</span>
            <span className={styles.oceanResultKeyHint}>每题 1 分</span>
          </div>

          {displayEntries.length > 0 ? (
            <dl className={styles.oceanResultList}>
              {displayEntries.map(([key, value]) => (
                <div key={key} className={styles.oceanResultItem}>
                  <dt className={styles.oceanResultItemKey}>{key}</dt>
                  <dd className={styles.oceanResultItemValue}>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {statusMessage ? (
            <p className={styles.oceanResultMessage}>{statusMessage}</p>
          ) : null}
        </div>
      </div>
    );
  };

  const renderOceanResult = () => {
    const fields = scoreRecord?.fields;
    const primary = resolvePrimaryScoreField(fields);
    const statsScore =
      oceanStats && typeof oceanStats.score === "number" ? oceanStats.score : undefined;
    const scoreInfo = statsScore !== undefined
      ? { value: statsScore, hint: "统计得分" }
      : primary
      ? { value: primary.value, hint: primary.key }
      : null;

    const displayEntries: Array<[string, string]> = [];
    const pushEntry = (label: string, value: string | number | undefined) => {
      if (value === undefined || value === null) return;
      const text = typeof value === "number" ? value.toString() : value.trim();
      if (!text) return;
      displayEntries.push([label, typeof value === "number" ? value.toString() : text]);
    };
    const seenKeys = new Set<string>();

    if (oceanStats) {
      pushEntry("作答题数", oceanStats.total);
      pushEntry("答对", oceanStats.correct);
      pushEntry("答错", oceanStats.wrong);
      if (typeof oceanStats.accuracy === "number") {
        const percentage = `${Math.round(oceanStats.accuracy * 1000) / 10}%`;
        pushEntry("正确率", percentage);
      }
      if (typeof oceanStats.lastAnswerTime === "number") {
        pushEntry("最后作答时间", formatTimestamp(oceanStats.lastAnswerTime));
      }
      for (const [label] of displayEntries) {
        seenKeys.add(label);
      }
    }

    if (fields) {
      for (const [key, value] of Object.entries(fields)) {
        if (primary && key === primary.key) continue;
        if (seenKeys.has(key)) continue;
        if (typeof value === "number" || (typeof value === "string" && value.trim())) {
          pushEntry(key, value);
          seenKeys.add(key);
        }
      }
    }

    const isLoadingStats = oceanStatsStatus === "loading";
    const isErrorStats = oceanStatsStatus === "error";
    const canRetry = isErrorStats && isOceanFinished;

    const { resultTitle, resultSubtitle } = (() => {
      if (isOceanEliminated) {
        return {
          resultTitle: "挑战结束",
          resultSubtitle: "血量已耗尽，本轮成绩已锁定，请等待主持人下一步指令。",
        };
      }
      if (isOceanTimerExpired) {
        return {
          resultTitle: "倒计时结束",
          resultSubtitle: "作答时间已用尽，本轮成绩已锁定，请等待主持人下一步指令。",
        };
      }
      if (isOceanPoolExhausted) {
        return {
          resultTitle: "全部题目完成",
          resultSubtitle: "题库已清空，本轮成绩已锁定，请等待主持人下一步指令。",
        };
      }
      return {
        resultTitle: "挑战结束",
        resultSubtitle: "本轮成绩已锁定，请等待主持人下一步指令。",
      };
    })();

    let statusMessage = "成绩正在同步中，请稍候查看最新得分。";
    if (isLoadingStats) {
      statusMessage = "正在获取最新成绩，请稍候...";
    } else if (isErrorStats) {
      statusMessage = oceanStatsError ?? "成绩同步失败，请稍后重试。";
    } else if (scoreInfo) {
      if (displayEntries.length === 0) {
        statusMessage = "成绩已更新，请等待主持人下一步指令。";
      } else {
        statusMessage = "";
      }
    }

    return (
      <div className={styles.oceanResultWrapper}>
        <div className={styles.commandSubmissionResult}>
          <div className={styles.commandSubmissionBadge}>
            <EliminatedIcon />
          </div>
          <p className={styles.commandSubmissionTitle}>{resultTitle}</p>
          <p className={styles.commandSubmissionSubtitle}>{resultSubtitle}</p>
        </div>

        <div className={styles.oceanResultScoreCard}>
          <div className={styles.oceanResultScore}>
            <span className={styles.oceanResultLabel}>当前得分</span>
            <span className={styles.oceanResultValue}>
              {scoreInfo ? String(scoreInfo.value) : "--"}
            </span>
            {scoreInfo ? (
              <span className={styles.oceanResultKeyHint}>{scoreInfo.hint}</span>
            ) : null}
          </div>

          {displayEntries.length > 0 ? (
            <dl className={styles.oceanResultList}>
              {displayEntries.map(([key, value]) => (
                <div key={key} className={styles.oceanResultItem}>
                  <dt className={styles.oceanResultItemKey}>{key}</dt>
                  <dd className={styles.oceanResultItemValue}>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {statusMessage ? (
            <p
              className={`${styles.oceanResultMessage} ${
                isErrorStats ? styles.oceanResultMessageError : ""
              }`}
            >
              {statusMessage}
            </p>
          ) : null}

          {canRetry ? (
            <div className={styles.oceanResultActions}>
              <Button type="ghost" size="small" onClick={handleRetryOceanStats}>
                重新获取成绩
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const renderEliminationState = () => (
    <div className={styles.commandSubmissionResult}>
      <div className={styles.commandSubmissionBadge}>
        <EliminatedIcon />
      </div>
      <p className={styles.commandSubmissionTitle}>您已淘汰</p>
      <p className={styles.commandSubmissionSubtitle}>血量已耗尽，无法继续作答。</p>
    </div>
  );

  const sanitizeMatchingLabel = useCallback(
    (label: string) => label.replace(/^\s*\d+、\s*/, ""),
    []
  );

  const renderStandardOptions = (standard: StandardQuestion) => {
    const isRevealSupportedType = ["single", "multiple", "indeterminate", "boolean"].includes(
      standard.type
    );
    const rawSelectionValues =
      Array.isArray(selected) && selected.length > 0
        ? selected
        : typeof selected === "string" && selected
        ? [selected]
        : [];
    const selectionValueSet = new Set(
      rawSelectionValues.map((value) => String(value).trim()).filter(Boolean)
    );
    const rawCorrectValues =
      isRevealSupportedType && isAnswerRevealActive
        ? Array.isArray(standard.correctAnswer)
          ? standard.correctAnswer
          : standard.correctAnswer
          ? [standard.correctAnswer]
          : []
        : [];
    const correctValueSet =
      rawCorrectValues.length > 0
        ? new Set(rawCorrectValues.map((value) => String(value).trim()).filter(Boolean))
        : null;
    const resolveOptionStatus = (optionValue: string): "correct" | "wrong" | undefined => {
      if (!correctValueSet) return undefined;
      const normalized = String(optionValue).trim();
      if (!normalized) return undefined;
      if (correctValueSet.has(normalized)) {
        return "correct";
      }
      if (selectionValueSet.has(normalized)) {
        return "wrong";
      }
      return undefined;
    };

    if (standard.type === "matching") {
      const config = standard.matching;
      const leftOptions = config?.left ?? [];
      const rightOptions =
        config?.right ??
        standard.options.map((option) => ({
          id: option.value,
          label: option.label,
        }));
      const rightLabelMap = new Map(rightOptions.map((item) => [item.id, item.label]));
      const activeLeft = activeMatchingLeft;

      const overlayWidth = Math.max(1, matchingOverlaySize.width);
      const overlayHeight = Math.max(1, matchingOverlaySize.height);
      return (
        <div ref={matchingBoardRef} className={styles.matchingBoard}>
          <svg
            className={styles.matchingOverlay}
            width={overlayWidth}
            height={overlayHeight}
            viewBox={`0 0 ${overlayWidth} ${overlayHeight}`}
            preserveAspectRatio="none"
          >
            {matchingLines.map((line) => (
              <line
                key={line.id}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke="#2563eb"
                className={`${styles.matchingOverlayLine} ${
                  line.active ? styles.matchingOverlayLineActive : ""
                }`}
              />
            ))}
          </svg>
          <div className={styles.matchingColumn}>
            <div className={styles.matchingList}>
              {leftOptions.length === 0 ? (
                <div className={styles.matchingEmpty}>题目未提供左侧内容</div>
              ) : (
                leftOptions.map((leftItem, index) => {
                  const matchedRightId = matchingSelectionMap.get(leftItem.id);
                  const matchedRightLabel = matchedRightId
                    ? rightLabelMap.get(matchedRightId) ?? matchedRightId
                    : null;
                  const isActive = activeLeft === leftItem.id;
                  return (
                    <div key={leftItem.id} className={styles.matchingLeftRow}>
                      <button
                        type="button"
                        className={[
                          styles.matchingLeftItem,
                          isActive ? styles.matchingLeftItemActive : "",
                          matchedRightLabel ? styles.matchingLeftItemMatched : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => handleMatchingLeftClick(leftItem.id)}
                        disabled={!state.answeringEnabled || isCommandSubmissionLocked}
                        data-left-id={leftItem.id}
                        data-active={isActive ? "true" : undefined}
                        data-match-right-id={matchedRightId ?? undefined}
                      >
                        <span className={styles.matchingLeftBadge}>
                          {leftItem.id || index + 1}
                        </span>
                        <span className={styles.matchingLeftLabel}>
                          {sanitizeMatchingLabel(leftItem.label)}
                        </span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div className={styles.matchingColumn}>
            <div className={styles.matchingList}>
              {rightOptions.length === 0 ? (
                <div className={styles.matchingEmpty}>题目未提供右侧选项</div>
              ) : (
                rightOptions.map((rightItem, index) => {
                  const assignedLeftId = matchingRightToLeftMap.get(rightItem.id);
                  const isUsed = matchingUsedRightIds.has(rightItem.id);
                  const isReassignTarget =
                    activeLeft &&
                    assignedLeftId &&
                    activeLeft !== assignedLeftId &&
                    state.answeringEnabled &&
                    !isCommandSubmissionLocked;

                  return (
                    <button
                      key={rightItem.id || index}
                      type="button"
                      className={[
                        styles.matchingRightItem,
                        isUsed ? styles.matchingRightItemUsed : "",
                        isReassignTarget ? styles.matchingRightItemReassign : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => handleMatchingRightClick(rightItem.id)}
                      disabled={!state.answeringEnabled || isCommandSubmissionLocked}
                      data-right-id={rightItem.id}
                      data-assigned-left-id={assignedLeftId ?? undefined}
                      data-matched={isUsed ? "true" : undefined}
                    >
                      <span className={styles.matchingRightBadge}>
                        {rightItem.id || String.fromCharCode(65 + index)}
                      </span>
                      <span className={styles.matchingRightLabel}>{rightItem.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      );
    }

    if (standard.type === "multiple" || standard.type === "indeterminate") {
      const multipleValue = Array.isArray(selected) ? selected : [];
      return (
        <div className={styles.optionGroup} role="group">
          {standard.options.map((option, index) => {
            const isActive = multipleValue.includes(option.value);
            return (
              <OptionCardButton
                key={option.value}
                value={option.value}
                label={option.label}
                description={option.description}
                badge={String.fromCharCode(65 + index)}
                active={isActive}
                disabled={!state.answeringEnabled || isCommandSubmissionLocked}
                onSelect={toggleMultiOption}
                role="checkbox"
                status={resolveOptionStatus(option.value)}
              />
            );
          })}
        </div>
      );
    }

    if (standard.type === "wordbank") {
      return (
        <div className={styles.wordbankOptions}>
          {standard.options.map((option) => {
            const isUsed = wordbankUsedValues.has(option.value);
            const active =
              wordbankActiveIndex !== null &&
              wordbankActiveIndex >= 0 &&
              option.value === wordbankValues[wordbankActiveIndex];
            const buttonClass = [
              styles.wordbankOption,
              isUsed ? styles.wordbankOptionUsed : "",
              active ? styles.wordbankOptionActive : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={option.value}
                type="button"
                className={buttonClass}
                onClick={() => handleWordbankSelectOption(option.value, isUsed)}
                disabled={!state.answeringEnabled || isCommandSubmissionLocked}
              >
                <span className={styles.wordbankOptionBadge}>{option.value}</span>
                <span className={styles.wordbankOptionLabel}>{option.label}</span>
              </button>
            );
          })}
        </div>
      );
    }

    if (standard.type === "point-select") {
      return (
        <div className={styles.pointSelectOptions} role="group">
          {standard.options.map((option) => {
            const isSelected = pointSelectSelectedSet.has(option.value);
            const buttonClass = [
              styles.pointSelectOption,
              isSelected ? styles.pointSelectOptionSelected : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={option.value}
                type="button"
                className={buttonClass}
                onClick={() => handlePointSelectOption(option.value)}
                disabled={!state.answeringEnabled || isCommandSubmissionLocked}
                aria-pressed={isSelected}
              >
                <span className={styles.pointSelectOptionLabel}>{option.label}</span>
              </button>
            );
          })}
        </div>
      );
    }

    if (standard.type === "fill") {
      return (
        <div className={styles.blankBoard}>
          {!fillPreview && !boardSubmitted ? (
            <Button
              type="primary"
              size="large"
              className={styles.boardButton}
              onClick={handleOpenBoard}
              disabled={
                !state.answeringEnabled ||
                isCommandSubmissionLocked ||
                isBoardOpen ||
                isBoardUploading
              }
            >
              打开画板
            </Button>
          ) : null}
          {fillPreview ? (
            <>
              <div className={styles.boardPreview}>
                <NextImage
                  src={fillPreview}
                  alt="画板作答预览"
                  className={styles.boardPreviewImage}
                  width={320}
                  height={240}
                  unoptimized
                  sizes="(max-width: 600px) 80vw, 320px"
                />
              </div>
              <div className={styles.boardSubmitted}>
                <SuccessCheckIcon className={styles.boardSubmittedIcon} />
                <div className={styles.boardSubmittedTexts}>
                  <span className={styles.boardSubmittedTitle}>提交成功</span>
                  <span className={styles.boardSubmittedSubtitle}>
                    填空画板提交成功
                  </span>
                </div>
              </div>
            </>
          ) : null}
        </div>
      );
    }

    const singleValue = typeof selected === "string" ? selected : null;
    return (
      <div className={styles.optionGroup} role="radiogroup">
        {standard.options.map((option, index) => {
          const isActive = singleValue === option.value;
          return (
            <OptionCardButton
              key={option.value}
              value={option.value}
              label={option.label}
              description={option.description}
              badge={String.fromCharCode(65 + index)}
              active={isActive}
              disabled={!state.answeringEnabled || isCommandSubmissionLocked}
              onSelect={handleSelect}
              role="radio"
              status={resolveOptionStatus(option.value)}
            />
          );
        })}
      </div>
    );
  };

  const renderOceanOptions = (ocean: CustomOceanQuestion) => {
    const selectionMode = resolveOceanSelectionMode(ocean);
    const values =
      selectionMode === "single"
        ? (() => {
            if (typeof selected === "string" && selected) return [selected];
            if (Array.isArray(selected) && selected.length > 0) {
              const last = selected[selected.length - 1];
              return last ? [String(last)] : [];
            }
            return [];
          })()
        : sortOceanSelectionIds(
            Array.isArray(selected)
              ? selected
              : typeof selected === "string" && selected
              ? [selected]
              : [],
            ocean.optionPool
          );

    const normalizedSelectionSet = new Set(
      values.map((value) => String(value).trim()).filter(Boolean)
    );
    const normalizedCorrectSet =
      isAnswerRevealActive &&
      Array.isArray(ocean.correctAnswerIds) &&
      ocean.correctAnswerIds.length > 0
        ? new Set(ocean.correctAnswerIds.map((id) => String(id).trim()).filter(Boolean))
        : null;
    const resolveOptionStatus = (optionId: string): "correct" | "wrong" | undefined => {
      if (!normalizedCorrectSet) return undefined;
      const normalized = String(optionId).trim();
      if (!normalized) return undefined;
      if (normalizedCorrectSet.has(normalized)) {
        return "correct";
      }
      if (normalizedSelectionSet.has(normalized)) {
        return "wrong";
      }
      return undefined;
    };

    const handleOceanSelect = (optionId: string) => {
      if (!state.answeringEnabled || isCommandSubmissionLocked) {
        return;
      }
      if (selectionMode === "single") {
        setSelected((prev) => {
          const previousValue =
            typeof prev === "string"
              ? prev
              : Array.isArray(prev) && prev.length > 0
              ? String(prev[prev.length - 1])
              : null;
          if (previousValue === optionId) {
            return null;
          }
          return optionId;
        });
        return;
      }

      setSelected((prev) => {
        const base =
          Array.isArray(prev) && prev.length > 0
            ? prev.map(String)
            : typeof prev === "string" && prev
            ? [prev]
            : [];
        if (base.includes(optionId)) {
          return base.filter((item) => item !== optionId);
        }
        return sortOceanSelectionIds([...base, optionId], ocean.optionPool);
      });
    };

    const groupRole = selectionMode === "single" ? "radiogroup" : "group";

    return (
      <div className={styles.optionGroup} role={groupRole}>
        {ocean.optionPool.map((option, index) => {
          const isActive = values.includes(option.id);
          return (
            <OptionCardButton
              key={option.id}
              value={option.id}
              label={option.label}
              description={
                option.meta?.note ? String(option.meta.note) : undefined
              }
              badge={String.fromCharCode(65 + index)}
              active={isActive}
              disabled={!state.answeringEnabled || isCommandSubmissionLocked}
              onSelect={handleOceanSelect}
              role={selectionMode === "single" ? "radio" : "checkbox"}
              status={resolveOptionStatus(option.id)}
            />
          );
        })}
      </div>
    );
  };

  const renderQuestionIllustration = () => {
    if (!hasQuestionImages) {
      return null;
    }
    return <QuestionImageGallery entries={questionImageEntries} />;
  };

  const renderUltimatePkContent = () => {
    const teamOptions: Array<{
      id: "affirmative" | "negative";
      label: string;
      toneClass: string;
    }> = [
      { id: "affirmative", label: "正方", toneClass: styles.ultimatePkTeamPositive },
      { id: "negative", label: "反方", toneClass: styles.ultimatePkTeamNegative },
    ];
    const buttonDisabled =
      ultimatePkStageLocked || ultimatePkThrottleActive || ultimatePkSending;
    const statusText = ultimatePkStageLocked
      ? "等待主持人允许切换"
      : ultimatePkThrottleActive
        ? "切换冷却中，请稍候"
        : ultimatePkSending
          ? "正在发送切换指令..."
          : "当前可切换发言队伍";
    const statusClass = ultimatePkStageLocked
      ? styles.ultimatePkStatusLocked
      : ultimatePkThrottleActive || ultimatePkSending
        ? styles.ultimatePkStatusCooling
        : styles.ultimatePkStatusReady;

    return (
      <div className={styles.ultimatePkPanel}>
        <div className={styles.ultimatePkTeamSelector} role="radiogroup" aria-label="请选择发言队伍">
          {teamOptions.map((team) => {
            const active = ultimatePkTeam === team.id;
            return (
              <button
                key={team.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`${styles.ultimatePkTeamButton} ${team.toneClass} ${
                  active ? styles.ultimatePkTeamButtonActive : ""
                }`}
                onClick={() => handleUltimatePkTeamSelect(team.id)}
              >
                {team.label}
              </button>
            );
          })}
        </div>
        <div className={styles.ultimatePkSwitchWrapper}>
          <button
            type="button"
            className={`${styles.ultimatePkSwitchButton} ${
              buttonDisabled ? styles.ultimatePkSwitchButtonDisabled : ""
            }`}
            onClick={handleUltimatePkSwitch}
            disabled={buttonDisabled}
            aria-busy={ultimatePkSending}
          >
            <SwitchArrowsIcon className={styles.ultimatePkSwitchIcon} />
            <span className={styles.ultimatePkSwitchLabel}>切换发言</span>
          </button>
        </div>
        <p className={styles.ultimatePkHint}>
          点击按钮进行切换发言
          <br />
          <span>1 秒内仅可切换一次</span>
        </p>
        <p className={`${styles.ultimatePkStatusText} ${statusClass}`} aria-live="polite">
          {statusText}
        </p>
      </div>
    );
  };

  const renderQuestionContent = () => {
    const shouldShowCommandOverlay =
      isCommandSubmissionLocked && isCommandSubmissionOverlayVisible;
    if (isUltimatePkMode) {
      return renderUltimatePkContent();
    }

    if (meta.id === "speed-run" && isSpeedRunFinished) {
      return renderSpeedRunResult();
    }

    if (isOceanFinished) {
      return renderOceanResult();
    }

    if (isEliminated) {
      return renderEliminationState();
    }

    if (
      meta.id === "speed-run" &&
      (waitingForStageStart || !questionGateOpened || state.questionIndex < 0)
    ) {
      return (
        <div className={styles.questionLoading}>
          <div className={`${styles.statusBadge} ${styles.statusBadgeSuccess}`}>
            <SuccessCheckIcon className={styles.statusIcon} />
          </div>
          <div className={styles.loadingTexts}>
            <p className={styles.loadingPrimary}>题目加载完成</p>
            <p className={styles.loadingSecondary}>请做好准备 比赛即将开始</p>
            <p className={styles.loadingMeta}>
              已准备 {normalizedQuestions.length} 道题，等待主持人发出切题指令
            </p>
          </div>
        </div>
      );
    }

    if (meta.id === "ocean-adventure" && waitingForStageStart) {
      return (
        <div className={styles.questionLoading}>
          <div className={`${styles.statusBadge} ${styles.statusBadgeSuccess}`}>
            <SuccessCheckIcon className={styles.statusIcon} />
          </div>
          <div className={styles.loadingTexts}>
            <p className={styles.loadingPrimary}>题库准备就绪</p>
            <p className={styles.loadingSecondary}>请做好准备 比赛即将开始</p>
            <p className={styles.loadingMeta}>等待主持人发出开始指令</p>
          </div>
        </div>
      );
    }

    if (meta.id === "ultimate-challenge") {
      if (!question && ultimateStage === "waiting") {
        return (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>等待主持人推送题目</p>
            <p className={styles.emptyDesc}>抢答阶段即将开始，请留意主持人指令。</p>
          </div>
        );
      }

      if (ultimateStage === "buzz") {
        return (
          <div className={styles.ultimateWrapper}>
            <Button
              type="primary"
              className={styles.ultimateBuzzer}
              onClick={handleTriggerBuzzer}
              disabled={!triggerBuzzerControl || !canBuzz}
              needActive
            >
              <span className={styles.ultimateBuzzerText}>抢答</span>
            </Button>
            <p className={styles.ultimateHint}>抢答成功后将默认由本队作答。</p>
          </div>
        );
      }

      if (ultimateStage === "locked") {
        return (
          <div className={styles.ultimateWrapper}>
            <div className={`${styles.ultimateResultBadge} ${styles.ultimateResultBadgeError}`}>
              <ErrorBadgeIcon className={styles.ultimateResultIcon} />
            </div>
            <h2 className={`${styles.ultimateTitle} ${styles.ultimateTitleError}`}>未抢到答题权</h2>
            <p className={`${styles.ultimateHint} ${styles.ultimateHintEmphasis}`}>
              本题将由{lockedWinnerLabel}进行作答
            </p>
          </div>
        );
      }

      if (!question) {
        return (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>等待决策结果</p>
            <p className={styles.emptyDesc}>请保持在线，随时准备进入下一题。</p>
          </div>
        );
      }

      if (ultimateStage !== "answer") {
        if (isCommandSubmissionLocked) {
          return renderCommandSubmissionResult();
        }
        return (
          <div className={styles.ultimateWrapper}>
            <p className={styles.ultimateHint}>等待主持人通知作答，请保持专注。</p>
          </div>
        );
      }
    }

    if (!question) {
      return (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>
            {state.awaitingHost ? "等待主持人推送下一题" : "当前没有可答题目"}
          </p>
          <p className={styles.emptyDesc}>
            {meta.questionFlow === "push"
              ? "请关注主持人指令，接收到题目后自动显示。"
              : "请尝试拉取下一题或重置赛段。"}
          </p>
        </div>
      );
    }

    if (isStandardQuestion(question)) {
      const questionTitleNode = (() => {
        if (isWordbankQuestion && wordbankTemplate) {
          let blankCursor = -1;
          return (
            <h2 className={`${styles.questionTitle} ${styles.wordbankTitle}`}>
              {wordbankTemplate.tokens.map((token, index) => {
                if (token.kind === "text") {
                  return (
                    <span key={`wb-text-${index}`} className={styles.wordbankText}>
                      {token.content}
                    </span>
                  );
                }

                blankCursor += 1;
                const blankIndex = blankCursor;
                const value = wordbankValues[blankIndex] ?? "";
                const label = value
                  ? wordbankOptionLabelMap?.get(value) ?? value
                  : null;
                const hasAllFilled = wordbankValues.every((item) => item && item.trim());
                const isActive =
                  !hasAllFilled && wordbankActiveIndex === blankIndex;

                return (
                  <button
                    key={`wb-blank-${token.blankId}-${index}`}
                    type="button"
                    className={`${styles.wordbankBlank} ${value ? styles.wordbankBlankFilled : styles.wordbankBlankEmpty} ${isActive ? styles.wordbankBlankActive : ""}`}
                    onClick={() =>
                      value
                        ? handleWordbankClear(blankIndex)
                        : handleWordbankBlankClick(blankIndex)
                    }
                    disabled={!state.answeringEnabled || isCommandSubmissionLocked}
                  >
                    {label ? (
                      <span className={styles.wordbankBlankValue}>{label}</span>
                    ) : (
                      <span className={styles.wordbankBlankPlaceholder}>点击填空</span>
                    )}
                  </button>
                );
              })}
            </h2>
          );
        }

        if (isMatchingQuestion) {
          const prompt = matchingConfig?.prompt;
          const matchingTitleContent = prompt
            ? prompt.split(/\n+/).map((line, index, lines) => (
                <span key={`matching-prompt-${index}`}>
                  {line}
                  {index < lines.length - 1 ? <br /> : null}
                </span>
              ))
            : "请完成连线";
          const isClearDisabled =
            !state.answeringEnabled || isCommandSubmissionLocked || matchingPairs.length === 0;
          return (
            <div className={styles.questionTitleRow}>
              <h2 className={styles.questionTitle}>{matchingTitleContent}</h2>
              <button
                type="button"
                className={styles.questionTitleAction}
                onClick={handleClearMatchingPairs}
                disabled={isClearDisabled}
              >
                <span
                  aria-hidden="true"
                  className={styles.questionTitleActionIcon}
                  style={{
                    WebkitMaskImage: `url(${trashIcon.src})`,
                    maskImage: `url(${trashIcon.src})`,
                  }}
                />
                清空连线
              </button>
            </div>
          );
        }

        if (isPointSelectQuestion) {
          const isClearDisabled =
            !state.answeringEnabled ||
            pointSelectValues.length === 0 ||
            isCommandSubmissionLocked;
          return (
            <div className={styles.questionTitleRow}>
              <h2 className={styles.questionTitle}>{question.title}</h2>
              <button
                type="button"
                className={styles.pointSelectClear}
                onClick={handlePointSelectClear}
                disabled={isClearDisabled}
              >
                <span
                  aria-hidden="true"
                  className={styles.pointSelectClearIcon}
                  style={{
                    WebkitMaskImage: `url(${trashIcon.src})`,
                    maskImage: `url(${trashIcon.src})`,
                  }}
                />
                清空
              </button>
            </div>
          );
        }

        return <h2 className={styles.questionTitle}>{question.title}</h2>;
      })();
        const optionsNode = renderStandardOptions(question);
        const shouldShowStandardOverlay =
          question.type !== "fill" && shouldShowCommandOverlay;
        const pointSelectInputNode =
          isPointSelectQuestion && isStandardQuestion(question) ? (
            <div className={styles.pointSelectArea}>
              <div
                className={[
                  styles.pointSelectInput,
                  pointSelectValues.length ? styles.pointSelectInputFilled : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="textbox"
                aria-readonly="true"
                aria-label="已选择词语"
                tabIndex={0}
              >
                {pointSelectDisplayTokens.length ? (
                  pointSelectDisplayTokens.map((token) => (
                    <span key={token.key} className={styles.pointSelectToken}>
                      {token.text}
                    </span>
                  ))
                ) : (
                  <span className={styles.pointSelectPlaceholder}>
                    点击下方词语拼成答案
                  </span>
                )}
              </div>
            </div>
          ) : null;
        return (
          <>
            <div className={styles.questionHeader}>
              <div className={styles.questionHeaderLeft}>
                {questionTags.map((tag) => (
                  <span key={tag} className={styles.questionTag}>
                    {tag}
                  </span>
                ))}
                {answerBadgeText ? (
                  <span className={`${styles.questionTag} ${styles.answerTag}`}>
                    <span className={styles.answerTagLabel}>答案：</span>
                    <span className={styles.answerTagValue}>{answerBadgeText}</span>
                  </span>
                ) : null}
              </div>
                <div className={styles.questionHeaderRight}>
                  {selectionSummary && !isImageQuestion ? (
                    <div
                      className={styles.selectionSummary}
                    title={
                      selectionSummary.tokens.length
                      ? selectionSummary.tokens.join(" ")
                      : selectionSummary.emptyLabel ?? "未选"
                  }
                >
                  <span className={styles.selectionSummaryLabel}>已选：</span>
                  {selectionSummary.tokens.length ? (
                    selectionSummary.tokens.map((token, index) => (
                      <Tag
                        key={`selection-${index}-${token}`}
                        size="small"
                        filleted
                        type="primary"
                        className={styles.selectionTag}
                      >
                        {token}
                      </Tag>
                    ))
                  ) : (
                    <Tag size="small" filleted type="hollow" className={styles.selectionTagMuted}>
                      {selectionSummary.emptyLabel ?? "未选"}
                    </Tag>
                  )}
                </div>
              ) : null}
            </div>
          </div>
          {questionTitleNode}
          {renderQuestionIllustration()}
          {pointSelectInputNode}
          <div className={styles.options}>
            {optionsNode}
            {shouldShowStandardOverlay ? renderCommandSubmissionOverlay() : null}
          </div>
        </>
      );
    }

    if (isOceanQuestion(question)) {
      return (
        <>
          <div className={styles.questionHeader}>
            <div className={styles.questionHeaderLeft}>
              {questionTags.map((tag) => (
                <span key={tag} className={styles.questionTag}>
                  {tag}
                </span>
              ))}
              {answerBadgeText ? (
                <span className={`${styles.questionTag} ${styles.answerTag}`}>
                  <span className={styles.answerTagLabel}>答案：</span>
                  <span className={styles.answerTagValue}>{answerBadgeText}</span>
                </span>
              ) : null}
            </div>
            <div className={styles.questionHeaderRight}>
              {selectionSummary && !isImageQuestion ? (
                <div
                  className={styles.selectionSummary}
                  title={
                    selectionSummary.tokens.length
                      ? selectionSummary.tokens.join(" ")
                      : selectionSummary.emptyLabel ?? "未选"
                  }
                >
                  <span className={styles.selectionSummaryLabel}>已选：</span>
                  {selectionSummary.tokens.length ? (
                    selectionSummary.tokens.map((token, index) => (
                      <Tag
                        key={`selection-${index}-${token}`}
                        size="small"
                        filleted
                        type="primary"
                        className={styles.selectionTag}
                      >
                        {token}
                      </Tag>
                    ))
                  ) : (
                    <Tag size="small" filleted type="hollow" className={styles.selectionTagMuted}>
                      {selectionSummary.emptyLabel ?? "未选"}
                    </Tag>
                  )}
                </div>
              ) : null}
            </div>
          </div>
          <h2 className={styles.questionTitle}>{question.stem}</h2>
          {renderQuestionIllustration()}
          <div className={styles.categories}>
          {question.categories.map((category) => (
            <Tag key={category} type="primary" size="small" filleted className={styles.categoryTag}>
              {category}
            </Tag>
          ))}
        </div>
          <div className={styles.options}>
            {renderOceanOptions(question)}
            {shouldShowCommandOverlay ? renderCommandSubmissionOverlay() : null}
          </div>
        </>
      );
    }

    return null;
  };

  const renderQuestionLoadingState = () => {
    if (questionLoadStatus === "error") {
      const attempts = Math.max(questionLoadAttempts, 1);
      return (
        <div className={styles.questionLoading}>
          <div className={`${styles.statusBadge} ${styles.statusBadgeError}`}>
            <ErrorBadgeIcon className={styles.statusIcon} />
          </div>
          <div className={styles.loadingTexts}>
            <p className={styles.loadingPrimary}>题目加载出错</p>
            <p className={styles.loadingSecondary}>请举手示意，告知主持人重新进入环节</p>
            <p className={styles.loadingMeta}>已尝试 {attempts} 次加载</p>
            {questionLoadError ? (
              <p className={styles.loadingMeta} title={questionLoadError}>
                {questionLoadError}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    if (questionLoadStatus === "success") {
      return (
        <div className={styles.questionLoading}>
          <div className={`${styles.statusBadge} ${styles.statusBadgeSuccess}`}>
            <SuccessCheckIcon className={styles.statusIcon} />
          </div>
          <div className={styles.loadingTexts}>
            <p className={styles.loadingPrimary}>题目加载完成</p>
            <p className={styles.loadingSecondary}>请做好准备 比赛即将开始</p>
            <p className={styles.loadingMeta}>
              已准备 {normalizedQuestions.length} 道题，等待主持人发出切题指令
            </p>
          </div>
        </div>
      );
    }

    const attemptLabel =
      questionLoadAttempts > 0
        ? `第 ${questionLoadAttempts} 次尝试`
        : "准备加载题目数据";

    return (
      <div className={styles.questionLoading}>
        <div className={`${styles.statusBadge} ${styles.statusBadgePending}`}>
          <span className={styles.loadingSpinner} aria-hidden="true" />
        </div>
        <div className={styles.loadingTexts}>
          <p className={styles.loadingPrimary}>正在加载题目</p>
          <p className={styles.loadingSecondary}>{attemptLabel}</p>
          <p className={styles.loadingMeta}>请保持在线，留意主持人通知</p>
        </div>
      </div>
    );
  };

  const navTitle = useMemo(() => {
    const display = currentStage?.displayName?.trim();
    if (display) {
      return display;
    }
    const name = currentStage?.name?.trim();
    return name || meta.name || meta.id;
  }, [currentStage?.displayName, currentStage?.name, meta.id, meta.name]);
  const hasQuestion = Boolean(question);
  const showQuestionLoading = !isUltimatePkMode && meta.questionFlow === "push" && !questionGateOpened;
  const submitLabel =
    meta.id === "speed-run"
      ? "提交并进入下一题"
      : meta.id === "ocean-adventure"
      ? "提交并抢下一题"
      : isQaMode || isLastStandMode
      ? "提交等待主持人"
      : meta.id === "ultimate-challenge"
      ? "提交并等待裁决"
      : "提交";

  return (
    <div className={styles.page}>
      <ArcoClient fallback={<div className={styles.fallback}>加载中...</div>}>
        <div ref={navWrapperRef}>
          <NavBar
            title={navTitle}
            leftContent={null}
          />
        </div>
        <div className={styles.body}>
          <div className={styles.syncQueueWrapper}>
            <div className={styles.syncQueueIndicator}>
              <div className={styles.syncQueueLabelGroup}>
                <span className={styles.syncQueueLabel}>成绩上传队列</span>
                <span className={styles.syncQueueBadge}>
                  待处理 {persistenceStats.pending}
                </span>
                <span
                  className={`${styles.syncQueueBadge} ${
                    persistenceStats.failed > 0 ? styles.syncQueueBadgeDanger : ""
                  }`}
                >
                  失败 {persistenceStats.failed}
                </span>
              </div>
              <div className={styles.syncQueueControls}>
                <Button
                  type="ghost"
                  size="mini"
                  className={styles.syncQueueActionButton}
                  onClick={() => setShowPersistenceDetails((prev) => !prev)}
                >
                  {showPersistenceDetails ? "收起" : "详情"}
                </Button>
                <Button
                  type="ghost"
                  size="mini"
                  className={styles.syncQueueActionButton}
                  onClick={handleRetryPersistenceFailures}
                  disabled={persistenceStats.failed === 0}
                >
                  重试
                </Button>
              </div>
            </div>
            {showPersistenceDetails ? (
              <div className={styles.syncQueueDetails}>
                {persistenceStats.failedItems.length === 0 ? (
                  <p className={styles.syncQueueEmpty}>当前无失败任务</p>
                ) : (
                  persistenceStats.failedItems.map((item) => (
                    <div key={item.id} className={styles.syncQueueRow}>
                      <div className={styles.syncQueueRowHeader}>
                        <span className={styles.syncQueueRowLabel}>{item.label}</span>
                        <span className={styles.syncQueueRowMeta}>尝试 {item.attempts}</span>
                      </div>
                      {item.lastErrorMessage ? (
                        <p className={styles.syncQueueRowError}>{item.lastErrorMessage}</p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
          {!isUltimatePkMode ? (
            <section className={styles.progressCard}>
              <div className={styles.progressHead}>
                <span className={styles.progressCounter}>
                  {hasQuestion ? questionOrdinal : 0}
                  {meta.id === "ocean-adventure" ? (
                    <span className={styles.progressTotal}>
                      {" / "}
                    {oceanRemainingDisplay ?? DEFAULT_OCEAN_REMAINING_COUNT}
                  </span>
                ) : showProgress && totalQuestions ? (
                  <span className={styles.progressTotal}> / {totalQuestions}</span>
                ) : null}
              </span>
              <div className={styles.progressRight}>
                {state.timeRemaining !== undefined ? (
                  <div className={styles.timerDisplay}>
                    <ClockIcon className={styles.timerIcon} />
                    <span
                      className={`${styles.timerText} ${
                        state.timeRemaining <= 30 ? styles.statusDanger : ""
                      }`}
                    >
                      {formatSeconds(state.timeRemaining)}
                    </span>
                  </div>
                ) : null}
                {hpDisplay ? (
                  <div
                    className={styles.hpDisplay}
                    role="img"
                    aria-label={`剩余血量 ${hpDisplay.current}，总血量 ${hpDisplay.initial}`}
                  >
                    {Array.from({ length: hpDisplay.initial }).map((_, index) => (
                      <HeartIcon
                        key={index}
                        className={styles.heartIcon}
                        filled={index < (hpDisplay?.current ?? 0)}
                      />
                    ))}
                  </div>
                ) : null}
                {buzzerStatusLabel ? (
                  <div className={styles.buzzerStatus}>{buzzerStatusLabel}</div>
                ) : null}
                {progressUserLabel ? (
                  <span className={styles.progressUser}>{progressUserLabel}</span>
                ) : null}
              </div>
              </div>
             {showProgress ? (
               <div className={styles.progressBar}>
                  <Progress
                    percentage={progressValue}
                    percentPosition="innerLeft"
                    mountedTransition={progressValue > 0}
                  />
                </div>
              ) : null}
            </section>
          ) : null}

          <section
            className={
              isUltimatePkMode ? `${styles.questionCard} ${styles.ultimatePkCard}` : styles.questionCard
            }
          >
            {showQuestionLoading ? renderQuestionLoadingState() : renderQuestionContent()}
          </section>
        {meta.features.hasHp &&
          meta.questionFlow === "push" &&
          !isLastStandMode &&
          !showQuestionLoading ? (
            <section className={styles.judgementPanel}>
              <h3 className={styles.panelTitle}>主持人判定</h3>
              <div className={styles.judgementActions}>
                <Button
                  type="primary"
                  size="small"
                  onClick={() => handleApplyJudgement("correct")}
                  disabled={!applyHostJudgementControl}
                >
                  判定正确
                </Button>
                <Button
                  type="default"
                  size="small"
                  onClick={() => handleApplyJudgement("wrong")}
                  disabled={!applyHostJudgementControl}
                >
                  判定错误
                </Button>
              </div>
            </section>
          ) : null}
        </div>

        {shouldShowActionBar ? (
          <div className={styles.actionBar}>
            <div className={styles.actionInner}>
              <Button
                type="primary"
                size="large"
                className={styles.nextButton}
                onClick={() => void handleSubmit()}
                loading={isSubmitting}
                disabled={
                  !hasQuestion || !state.answeringEnabled || isSubmitting || isCommandSubmissionLocked
                }
              >
                {submitLabel}
              </Button>
            </div>
          </div>
        ) : null}

        <FillDrawingBoard
          key={questionId ?? "board"}
          ref={boardRef}
          open={isBoardOpen}
          questionId={questionId}
          questionTitle={
            question && isStandardQuestion(question) ? question.title : undefined
          }
          questionSheetId={currentStage?.questionSheetId}
          onClose={() => setBoardOpen(false)}
          onUploadSuccess={handleBoardUploadSuccess}
          onPathsChange={handleBoardPathsChange}
          initialPaths={cachedPaths}
          disabled={!state.answeringEnabled || isCommandSubmissionLocked}
        />
      </ArcoClient>
    </div>
  );
}

export default function QuizPage() {
  return (
    <Suspense fallback={<div className={styles.loadingContainer}>加载中...</div>}>
      <QuizPageContent />
    </Suspense>
  );
}
