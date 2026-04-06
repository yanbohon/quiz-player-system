'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { Toast } from "@/lib/arco";
import { API_ENDPOINTS } from "@/constants";
import { useAppStore } from "@/store/useAppStore";
import { useQuizStore, DEFAULT_OCEAN_REMAINING_COUNT } from "@/store/quizStore";
import { submitGrabbedAnswer, QuestionPoolEmptyError } from "@/lib/fusionClient";
import { showQuizApiErrorToast } from "@/lib/quizApiError";
import type { NormalizedQuestion } from "@/lib/normalizeQuestion";
import { CONTEST_MODES, DEFAULT_MODE, isQaVariantMode } from "./modes";
import {
  applyHpPenalty as applyHpPenaltyState,
  createPenaltyGuardKey,
  shouldClearRecoveredPenalty,
} from "./hpPenalty";
import {
  ContestModeId,
  ContestModeMeta,
  CustomOceanQuestion,
  MatchingOption,
  QuizQuestion,
  QuizSubmissionResult,
  QuizRuntime,
  QuizRuntimeState,
  StandardQuestion,
  StandardQuestionOption,
  StandardQuestionType,
} from "./types";

type ModeIdInput = ContestModeId | string | null | undefined;

const SPEED_RUN_TIME_LIMIT = 2 * 60; // 3 minutes
const OCEAN_TIME_LIMIT = 5 * 60; // 5 minutes

function resolveMode(id: ModeIdInput): ContestModeMeta {
  if (!id) return DEFAULT_MODE;
  return CONTEST_MODES[id as ContestModeId] ?? DEFAULT_MODE;
}

function createInitialState(meta: ContestModeMeta): QuizRuntimeState {
  return {
    mode: meta.id,
    questionIndex: meta.questionFlow === "push" ? -1 : 0,
    totalQuestions: undefined,
    hp: meta.features.hasHp ? meta.features.initialHp ?? 0 : undefined,
    timeElapsed: undefined,
    timeRemaining: undefined,
    question: undefined,
    answeringEnabled:
      meta.id === "ultimate-challenge" ? false : meta.questionFlow !== "push",
    awaitingHost: meta.questionFlow !== "local",
    delegationTargetId: null,
    phase: meta.id === "ultimate-challenge" ? "waiting" : undefined,
    oceanEndReason: undefined,
    speedRunEndReason: undefined,
    lastHpPenalty: undefined,
  };
}

function mapQuestionType(type?: string): StandardQuestionType {
  if (!type) return "single";
  const normalized = String(type).trim().toLowerCase();

  switch (normalized) {
    case "multiple":
    case "multiple-choice":
    case "多选":
    case "多选题":
      return "multiple";
    case "indeterminate":
    case "indeterminate-choice":
    case "不定项选择":
    case "不定项选择题":
      return "indeterminate";
    case "boolean":
    case "true-false":
    case "判断":
    case "判断题":
      return "boolean";
    case "fill":
    case "fill-in":
    case "fill-in-the-blank":
    case "text":
    case "填空":
    case "填空题":
      return "fill";
    case "select-word-fill":
    case "wordbank":
    case "word-bank":
    case "word-bank-fill":
    case "wordbank-fill":
    case "pick":
    case "pick-fill":
    case "选词填空":
    case "选词填空题":
      return "wordbank";
    case "point-select":
    case "pointselect":
    case "point":
    case "tap-select":
    case "tap":
    case "dot-select":
    case "pointing":
    case "spot-select":
    case "选字组词":
    case "选字":
    case "点选":
    case "点选题":
    case "组词题":
    case "组词":
      return "point-select";
    case "matching":
    case "match":
    case "pairing":
    case "连线题":
    case "配对题":
    case "关联题":
    case "连线":
      return "matching";
    case "single":
    case "single-choice":
    case "单选":
    case "单选题":
      return "single";
    default:
      return "single";
  }
}

function splitPointSelectTokens(source: string): string[] {
  if (!source) return [];
  return source
    .split(/\r?\n|[、，,;；/／]+/u)
    .map((item) =>
      item
        .replace(/[“”"'‘’]/g, "")
        .replace(/\s+/g, "")
        .trim()
    )
    .filter((item) => item.length > 0);
}

function buildPointSelectOptions(
  question: NormalizedQuestion
): StandardQuestionOption[] {
  const tokens: string[] = [];

  const pushToken = (raw: string | undefined | null) => {
    if (typeof raw !== "string") return;
    const token = raw.trim();
    if (
      !token ||
      tokens.includes(token) ||
      /^[A-Z]$/i.test(token) ||
      /^选项\d+$/.test(token)
    ) {
      return;
    }
    tokens.push(token);
  };

  const ingestSource = (source: unknown) => {
    if (!source) return;
    if (typeof source === "string") {
      splitPointSelectTokens(source).forEach(pushToken);
      return;
    }
    if (Array.isArray(source)) {
      source.forEach((item) => {
        if (typeof item === "string") {
          splitPointSelectTokens(item).forEach(pushToken);
        } else if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          ingestSource(record.value);
          ingestSource(record.text);
          ingestSource(record.label);
        }
      });
      return;
    }
    if (typeof source === "object") {
      digestRawOptionRecord(source as Record<string, unknown>);
    }
  };

  function digestRawOptionRecord(record: Record<string, unknown>) {
    if (!record) return;
    const candidateKeys = [
      "value",
      "text",
      "label",
      "content",
      "option",
      "word",
      "词语",
      "选项",
    ];
    candidateKeys.forEach((key) => {
      const entry = record[key];
      if (typeof entry === "string") {
        splitPointSelectTokens(entry).forEach(pushToken);
      } else if (Array.isArray(entry)) {
        entry.forEach((item) => {
          if (typeof item === "string") {
            splitPointSelectTokens(item).forEach(pushToken);
          }
        });
      }
    });
  }

  const raw = question.raw;
  if (raw && typeof raw === "object") {
    const rawRecord = raw as Record<string, unknown>;
    const rawOptions =
      rawRecord.options ??
      rawRecord.choices ??
      rawRecord.选项 ??
      rawRecord.词库 ??
      rawRecord.words;

    ingestSource(rawOptions);

    const additionalKeys = Object.keys(rawRecord).filter((key) =>
      /^option/i.test(key)
    );
    additionalKeys.forEach((key) => ingestSource(rawRecord[key]));
  }

  for (const option of question.options) {
    if (option.text) {
      ingestSource(option.text);
    }
    if (option.value) {
      ingestSource(option.value);
    }
  }

  if (tokens.length === 0) {
    return question.options.map((option, index) => ({
      value: option.value || String.fromCharCode(65 + index),
      label: option.text || option.value || `选项${index + 1}`,
    }));
  }

  return tokens.map((token) => ({
    value: token,
    label: token,
  }));
}

function normalizedToStandardQuestion(
  question: NormalizedQuestion
): StandardQuestion {
  const answers = Array.isArray(question.answer)
    ? question.answer.filter(Boolean)
    : [];

  let correctAnswer: string | string[] | undefined;
  if (answers.length === 1) {
    [correctAnswer] = answers;
  } else if (answers.length > 1) {
    correctAnswer = [...answers];
  }

  const mappedType = mapQuestionType(question.type);
  if (mappedType === "point-select") {
    const options = buildPointSelectOptions(question);
    const joinedAnswer =
      answers.length === 0
        ? undefined
        : answers.every((item) => item && item.length === 1)
        ? answers.join("")
        : answers[0] ?? "";
    return {
      id: question.id,
      title: question.content,
      type: "point-select",
      options,
      correctAnswer: joinedAnswer || undefined,
    };
  }
  if (mappedType === "matching") {
    const config = buildMatchingQuestion(question);
    return {
      id: question.id,
      title: config.prompt ?? question.content,
      type: "matching",
      options: config.right.map((item) => ({
        value: item.id,
        label: item.label,
      })),
      correctAnswer: config.correctPairs.length ? [...config.correctPairs] : undefined,
      matching: {
        prompt: config.prompt,
        left: config.left,
        right: config.right,
        maxMatchesPerLeft: config.maxMatchesPerLeft,
      },
    };
  }

  return {
    id: question.id,
    title: question.content,
    type: mappedType,
    options: question.options.map((option, index) => ({
      value: option.value || String.fromCharCode(65 + index),
      label: option.text || option.value || `选项${index + 1}`,
    })),
    correctAnswer,
  };
}

function buildMatchingQuestion(question: NormalizedQuestion): {
  prompt?: string;
  left: MatchingOption[];
  right: MatchingOption[];
  correctPairs: string[];
  maxMatchesPerLeft?: number;
} {
  const rawFields =
    question.raw && typeof question.raw === "object"
      ? (question.raw as Record<string, unknown>)
      : {};

  const { prompt, items: left } = parseMatchingStem(question.content);
  const right = ensureMatchingOptions(question.options);
  const answerSource =
    rawFields?.answer ?? rawFields?.答案 ?? rawFields?.correct ?? question.answer;
  const correctPairs = parseMatchingAnswer(answerSource);
  const maxMatchesPerLeft = parseMaxMatchesPerLeft(rawFields);

  return {
    prompt,
    left,
    right,
    correctPairs,
    maxMatchesPerLeft,
  };
}

function parseMatchingStem(stem?: string): {
  prompt?: string;
  items: MatchingOption[];
} {
  if (!stem) {
    return { items: [] };
  }

  const lines = stem
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const promptLines: string[] = [];
  const items: MatchingOption[] = [];

  for (const line of lines) {
    const match = line.match(/^(\d+)[\s\.\-:：、．，,)）]*(.*)$/);
    if (match) {
      const [, rawId, rawLabel] = match;
      const id = rawId?.trim() || String(items.length + 1);
      const label = rawLabel?.trim() || line;

      if (!label) continue;

      items.push({
        id,
        label,
      });
      continue;
    }

    if (items.length === 0) {
      promptLines.push(line);
      continue;
    }

    // Treat trailing non-numbered lines as continuation of previous label
    const previous = items[items.length - 1];
    if (previous) {
      previous.label = `${previous.label} ${line}`.trim();
    } else {
      promptLines.push(line);
    }
  }

  return {
    prompt: promptLines.length ? promptLines.join("\n") : undefined,
    items,
  };
}

function ensureMatchingOptions(
  options: Array<{ text: string; value: string }>
): MatchingOption[] {
  if (!Array.isArray(options) || options.length === 0) {
    return [];
  }

  return options.map((option, index) => {
    const fallback = String.fromCharCode(65 + index);
    return {
      id: option.value?.trim() || fallback,
      label: option.text?.trim() || option.value?.trim() || fallback,
    };
  });
}

function parseMatchingAnswer(raw: unknown): string[] {
  if (!raw) return [];

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseMatchingAnswer(parsed);
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Failed to parse matching answer JSON", error);
        }
      }
    }

    if (trimmed.includes(":")) {
      return trimmed
        .split(/[,，;；\s]+/)
        .map((item) => item.trim())
        .filter((item) => item.includes(":"));
    }
  }

  if (Array.isArray(raw)) {
    if (raw.every((item) => typeof item === "string" && item && !item.includes(":"))) {
      const pairs: string[] = [];
      for (let index = 0; index < raw.length; index += 2) {
        const left = raw[index];
        const right = raw[index + 1];
        if (typeof left === "string" && typeof right === "string") {
          const leftId = left.trim();
          const rightId = right.trim();
          if (leftId && rightId) {
            pairs.push(`${leftId}:${rightId}`);
          }
        }
      }
      if (pairs.length) {
        return pairs;
      }
    }

    const pairs = raw
      .map((entry) => {
        if (Array.isArray(entry) && entry.length >= 2) {
          const [left, right] = entry;
          return `${String(left).trim()}:${String(right).trim()}`;
        }

        if (typeof entry === "string") {
          const trimmed = entry.trim();
          return trimmed.includes(":") ? trimmed : "";
        }

        if (entry && typeof entry === "object") {
          const obj = entry as Record<string, unknown>;
          if (obj.left !== undefined && obj.right !== undefined) {
            return `${String(obj.left).trim()}:${String(obj.right).trim()}`;
          }
          const entries = Object.entries(obj);
          if (entries.length === 1) {
            const [left, right] = entries[0];
            return `${String(left).trim()}:${String(right).trim()}`;
          }
        }

        return "";
      })
      .filter(Boolean);

    return pairs;
  }

  if (raw && typeof raw === "object") {
    const entries = Object.entries(raw as Record<string, unknown>);
    return entries
      .map(([left, right]) => {
        const leftId = String(left).trim();
        const rightId = right !== undefined ? String(right).trim() : "";
        return leftId && rightId ? `${leftId}:${rightId}` : "";
      })
      .filter(Boolean);
  }

  return [];
}

function parseMaxMatchesPerLeft(raw: Record<string, unknown>): number | undefined {
  const candidateKeys = [
    "matchingMax",
    "maxMatchesPerLeft",
    "maxMatches",
    "maxMatch",
    "左列匹配上限",
  ];

  let candidate: unknown;
  for (const key of candidateKeys) {
    if (raw[key] !== undefined && raw[key] !== null) {
      candidate = raw[key];
      break;
    }
  }

  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return candidate > 0 ? candidate : undefined;
  }

  if (typeof candidate === "string") {
    const parsed = Number(candidate.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

function extractStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function normalizedToOceanQuestion(
  question: NormalizedQuestion
): CustomOceanQuestion {
  const optionPool = question.options.map((option, index) => ({
    id: option.value || String.fromCharCode(65 + index),
    label: option.text || option.value || `选项${index + 1}`,
    meta: { ...option },
  }));

  const categories = extractStringArray(
    question.raw && typeof question.raw === "object"
      ? (question.raw as Record<string, unknown>).categories
      : undefined
  );

  return {
    questionKey: question.id,
    stem: question.content,
    categories,
    correctBuckets: [],
    optionPool,
    extra:
      question.raw && typeof question.raw === "object"
        ? { ...question.raw }
        : undefined,
    correctAnswerIds: question.answer?.map((item) => String(item)) ?? [],
  };
}

function isStandardQuestion(
  question: QuizQuestion | undefined
): question is StandardQuestion {
  return Boolean(question && "id" in question);
}

function isOceanQuestion(
  question: QuizQuestion | undefined
): question is CustomOceanQuestion {
  return Boolean(question && "questionKey" in question && !("id" in question));
}

function resolvePenaltyQuestionId(question: QuizQuestion | undefined) {
  if (!question) return undefined;
  if (isStandardQuestion(question)) {
    return question.id;
  }
  if (isOceanQuestion(question)) {
    return question.questionKey;
  }
  return undefined;
}

export function useQuizRuntime(modeId: ModeIdInput): QuizRuntime {
  const router = useRouter();
  const meta = useMemo(() => resolveMode(modeId), [modeId]);
  const shouldEnforceHpElimination =
    meta.features.hasHp;

  const {
    user,
    clearAnswers,
    setAnswer,
    setCurrentQuestion: setAppCurrentQuestion,
  } = useAppStore(
    useShallow((state) => ({
      user: state.user,
      clearAnswers: state.clearAnswers,
      setAnswer: state.setAnswer,
      setCurrentQuestion: state.setCurrentQuestion,
    }))
  );

  const userId = user?.id;

  const {
    questions: storeQuestions,
    currentIndex: storeCurrentIndex,
    isLoading: quizLoading,
    waitingForStageStart,
    loadQuestions,
    loadStageQuestionsFromFusion,
    grabNextQuestion,
    setCurrentQuestionIndex,
    oceanRemainingCount,
    questionGateOpened,
  } = useQuizStore(
    useShallow((state) => ({
      questions: state.questions,
      currentIndex: state.currentIndex,
      isLoading: state.isLoading,
      waitingForStageStart: state.waitingForStageStart,
      loadQuestions: state.loadQuestions,
      loadStageQuestionsFromFusion: state.loadStageQuestionsFromFusion,
      grabNextQuestion: state.grabNextQuestion,
      setCurrentQuestionIndex: state.setCurrentQuestionIndex,
      oceanRemainingCount: state.oceanRemainingCount,
      questionGateOpened: state.questionGateOpened,
    }))
  );

  const [state, setState] = useState<QuizRuntimeState>(() =>
    createInitialState(meta)
  );
  const stateRef = useRef<QuizRuntimeState>(createInitialState(meta));

  const wrongCountRef = useRef(0);
  const globalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const globalDeadlineRef = useRef<number | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const perQuestionStartRef = useRef<number | null>(null);
  const timerInitializedRef = useRef(false);
  const questionListRef = useRef<QuizQuestion[]>([]);
  const questionIndexRef = useRef<number>(state.questionIndex);
  const currentQuestionRef = useRef<QuizQuestion | undefined>(undefined);
  const questionActivationRef = useRef(0);
  const questionActivationSignatureRef = useRef<string | null>(null);
  const questionPenaltyGuardKeyRef = useRef<string | undefined>(undefined);
  const localFetchInFlightRef = useRef(false);
  const pullFetchInFlightRef = useRef(false);
  const emptyPoolHandledRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const resetTimers = useCallback(() => {
    if (globalTimerRef.current) {
      clearInterval(globalTimerRef.current);
      globalTimerRef.current = null;
    }
    globalDeadlineRef.current = null;
    sessionStartRef.current = null;
    perQuestionStartRef.current = null;
  }, []);

  const stopAll = useCallback(() => {
    resetTimers();
    setState((prev) => ({
      ...prev,
      answeringEnabled: false,
    }));
  }, [resetTimers]);

  const handleQuestionPoolEmpty = useCallback(
    (options?: { notify?: boolean; message?: string }) => {
      if (emptyPoolHandledRef.current) return;
      emptyPoolHandledRef.current = true;
      if (options?.notify !== false) {
        const message =
          options?.message ??
          "【题目耗尽】题库已清空，请联系主持人确认下一步。";
        Toast.error(message);
      }
      stopAll();
      if (meta.id !== "ocean-adventure") {
        router.replace("/waiting");
        return;
      }
      setState((prev) => ({
        ...prev,
        awaitingHost: true,
        oceanEndReason: prev.oceanEndReason ?? "empty",
      }));
      setAppCurrentQuestion(null);
    },
    [meta.id, router, setAppCurrentQuestion, stopAll]
  );

  useEffect(() => {
    emptyPoolHandledRef.current = false;
  }, [meta.id]);

  const startGlobalTimer = useCallback(
    (seconds: number) => {
      if (!seconds || seconds <= 0) {
        resetTimers();
        return;
      }

      resetTimers();
      const now = Date.now();
      globalDeadlineRef.current = now + seconds * 1000;
      sessionStartRef.current = now;
      perQuestionStartRef.current = now;
      setState((prev) => ({
        ...prev,
        timeRemaining: seconds,
        timeElapsed: 0,
      }));

      globalTimerRef.current = setInterval(() => {
        const deadline = globalDeadlineRef.current;
        const startedAt = sessionStartRef.current;

        if (!deadline || !startedAt) {
          return;
        }

        const current = Date.now();
        const remainingSeconds = Math.max(
          Math.ceil((deadline - current) / 1000),
          0
        );
        const elapsedSeconds = Math.max(
          Math.floor((current - startedAt) / 1000),
          0
        );

        if (remainingSeconds <= 0) {
          const shouldLockOceanResult =
            meta.id === "ocean-adventure" && meta.features.hasHp;
          stopAll();
          setState((prev) => {
            const nextEndReason = shouldLockOceanResult
              ? prev.oceanEndReason ?? "timer"
              : prev.oceanEndReason;
            const nextSpeedRunReason =
              meta.id === "speed-run"
                ? prev.speedRunEndReason ?? "timer"
                : prev.speedRunEndReason;
            return {
              ...prev,
              timeRemaining: 0,
              timeElapsed: elapsedSeconds,
              answeringEnabled: false,
              hp: shouldLockOceanResult ? 0 : prev.hp,
              awaitingHost: shouldLockOceanResult ? true : prev.awaitingHost,
              oceanEndReason: nextEndReason,
              speedRunEndReason: nextSpeedRunReason,
            };
          });
          return;
        }

        setState((prev) => {
          if (
            prev.timeRemaining === remainingSeconds &&
            prev.timeElapsed === elapsedSeconds
          ) {
            return prev;
          }

          return {
            ...prev,
            timeRemaining: remainingSeconds,
            timeElapsed: elapsedSeconds,
          };
        });
      }, 250);
    },
    [meta.features.hasHp, meta.id, resetTimers, stopAll]
  );

  const markQuestionTime = useCallback(() => {
    perQuestionStartRef.current = Date.now();
  }, []);

  const resolveDuration = useCallback(() => {
    if (!perQuestionStartRef.current) return undefined;
    return Date.now() - perQuestionStartRef.current;
  }, []);

  const assignQuestion = useCallback(
    (
      nextQuestion: QuizQuestion | undefined,
      index: number,
      total: number,
      options?: { hold?: boolean }
    ) => {
      const isSpeedRun = meta.id === "speed-run";
      const shouldHold =
        options?.hold ??
        ((meta.questionFlow === "push" || isSpeedRun) && !questionGateOpened);
      const isUltimate = meta.id === "ultimate-challenge";
      const hasHp = meta.features.hasHp;
      const remainingHp = hasHp
        ? state.hp ?? meta.features.initialHp ?? 0
        : undefined;
      const isEliminated = shouldEnforceHpElimination
        ? (remainingHp ?? 0) <= 0
        : false;
      const gatedQuestion = shouldHold ? undefined : nextQuestion;
      const effectiveQuestion = isEliminated ? undefined : gatedQuestion;
      const effectiveIndex = shouldHold ? -1 : index;

      questionIndexRef.current = effectiveIndex;
      const effectiveQuestionId = resolvePenaltyQuestionId(effectiveQuestion);
      const nextActivationSignature =
        effectiveQuestion && effectiveQuestionId
          ? `${effectiveQuestionId}:${effectiveIndex}`
          : null;

      if (!nextActivationSignature) {
        questionActivationSignatureRef.current = null;
        questionPenaltyGuardKeyRef.current = undefined;
      } else {
        if (questionActivationSignatureRef.current !== nextActivationSignature) {
          questionActivationRef.current += 1;
          questionActivationSignatureRef.current = nextActivationSignature;
        }
        questionPenaltyGuardKeyRef.current = createPenaltyGuardKey(
          effectiveQuestionId,
          questionActivationRef.current
        );
      }

      setState((prev) => ({
        ...prev,
        mode: meta.id,
        question: effectiveQuestion,
        questionIndex: effectiveIndex,
        totalQuestions: total,
        answeringEnabled: isUltimate ? false : !!effectiveQuestion,
        awaitingHost:
          meta.questionFlow !== "local"
            ? shouldHold || !effectiveQuestion
            : isSpeedRun
              ? shouldHold
              : false,
        delegationTargetId: null,
        phase: isUltimate
          ? effectiveQuestion
            ? "buzz"
            : "waiting"
          : prev.phase,
        oceanEndReason:
          meta.id === "ocean-adventure" && effectiveQuestion
            ? undefined
            : prev.oceanEndReason,
        speedRunEndReason:
          isSpeedRun && effectiveQuestion ? undefined : prev.speedRunEndReason,
      }));

      if (!effectiveQuestion) {
        return;
      }

      if (isUltimate) {
        perQuestionStartRef.current = null;
      } else {
        markQuestionTime();
      }
    },
    [
      markQuestionTime,
      meta.features.hasHp,
      meta.features.initialHp,
      meta.id,
      meta.questionFlow,
      questionGateOpened,
      shouldEnforceHpElimination,
      state.hp,
    ]
  );

  const resetRuntime = useCallback(() => {
    resetTimers();
    wrongCountRef.current = 0;
    timerInitializedRef.current = false;
    questionListRef.current = [];
    questionIndexRef.current = meta.questionFlow === "push" ? -1 : 0;
    currentQuestionRef.current = undefined;
    questionActivationRef.current = 0;
    questionActivationSignatureRef.current = null;
    questionPenaltyGuardKeyRef.current = undefined;
    setState(createInitialState(meta));
  }, [meta, resetTimers]);

  const quizQuestions = useMemo(() => {
    return storeQuestions.map((question) =>
      meta.questionFormat === "custom"
        ? normalizedToOceanQuestion(question)
        : normalizedToStandardQuestion(question)
    );
  }, [meta.questionFormat, storeQuestions]);

  useEffect(() => {
    clearAnswers();
    resetRuntime();
    setAppCurrentQuestion(null);
    localFetchInFlightRef.current = false;
    pullFetchInFlightRef.current = false;
  }, [clearAnswers, resetRuntime, setAppCurrentQuestion, meta.id]);

  useEffect(() => {
    const fetchedCount = quizQuestions.length;
    const sanitizedRemaining =
      meta.id === "ocean-adventure"
        ? Number.isFinite(oceanRemainingCount)
          ? Math.max(0, Math.floor(oceanRemainingCount))
          : DEFAULT_OCEAN_REMAINING_COUNT
        : 0;

    const total =
      meta.id === "ocean-adventure"
        ? Math.max(fetchedCount + sanitizedRemaining, fetchedCount)
        : quizQuestions.length;

    const index =
      fetchedCount === 0
        ? meta.questionFlow === "push"
          ? -1
          : -1
        : Math.min(Math.max(storeCurrentIndex, 0), Math.max(0, fetchedCount - 1));

    const holdQuestion =
      (meta.questionFlow === "push" || meta.id === "speed-run") &&
      !questionGateOpened;

    const nextQuestion =
      index >= 0 && index < quizQuestions.length ? quizQuestions[index] : undefined;

    const effectiveIndex = holdQuestion ? -1 : index;

    questionListRef.current = quizQuestions;
    questionIndexRef.current = effectiveIndex;
    currentQuestionRef.current = nextQuestion;

    assignQuestion(nextQuestion, index, total, { hold: holdQuestion });

    if (!holdQuestion && nextQuestion) {
      if ("id" in nextQuestion) {
        setAppCurrentQuestion(nextQuestion.id);
      } else {
        setAppCurrentQuestion(nextQuestion.questionKey);
      }
    } else {
      setAppCurrentQuestion(null);
    }
  }, [
    assignQuestion,
    meta.id,
    meta.questionFlow,
    questionGateOpened,
    quizQuestions,
    setAppCurrentQuestion,
    storeCurrentIndex,
    oceanRemainingCount,
  ]);

  useEffect(() => {
    if (meta.id === "speed-run") {
      if (!questionGateOpened) {
        timerInitializedRef.current = false;
        return;
      }
      if (quizQuestions.length > 0 && !timerInitializedRef.current) {
        timerInitializedRef.current = true;
        startGlobalTimer(SPEED_RUN_TIME_LIMIT);
      }
      return;
    }

    if (meta.id === "ocean-adventure") {
      if (quizQuestions.length > 0 && !timerInitializedRef.current) {
        timerInitializedRef.current = true;
        startGlobalTimer(OCEAN_TIME_LIMIT);
      }
      return;
    }

    timerInitializedRef.current = false;
  }, [meta.id, questionGateOpened, quizQuestions.length, startGlobalTimer]);

  const loadModeQuestions = useCallback(async () => {
    if (meta.id === "speed-run") {
      try {
        await loadStageQuestionsFromFusion();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "题目加载失败";
        console.error("争分夺秒题目加载失败", error);
        Toast.error(message);
        router.replace("/waiting");
      }
      return;
    }

    const endpoint = `${API_ENDPOINTS.QUESTIONS}?mode=${encodeURIComponent(meta.id)}`;
    try {
      await loadQuestions(endpoint, "default");
    } catch (error) {
      console.error("加载题目列表失败", error);
      Toast.error("题目加载失败");
    }
  }, [loadQuestions, loadStageQuestionsFromFusion, meta.id, router]);

  const fetchNextGrabQuestion = useCallback(async () => {
    if (!userId) return;
    try {
      const question = await grabNextQuestion(userId);
      if (!question) {
        handleQuestionPoolEmpty({
          notify: true,
        });
      }
    } catch (error) {
      if (error instanceof QuestionPoolEmptyError) {
        handleQuestionPoolEmpty({ notify: false });
        showQuizApiErrorToast(error, "获取题目");
        return;
      }
      console.error("题海遨游取题失败", error);
      showQuizApiErrorToast(error, "获取题目");
    }
  }, [grabNextQuestion, handleQuestionPoolEmpty, userId]);

  useEffect(() => {
    if (meta.questionFlow !== "local") return;
    if (quizQuestions.length > 0) return;
    if (quizLoading || localFetchInFlightRef.current) return;

    localFetchInFlightRef.current = true;
    loadModeQuestions().finally(() => {
      localFetchInFlightRef.current = false;
    });
  }, [
    loadModeQuestions,
    meta.questionFlow,
    quizLoading,
    quizQuestions.length,
  ]);

  useEffect(() => {
    if (meta.questionFlow !== "pull") return;
    if (meta.id === "ocean-adventure" && waitingForStageStart) return;
    if (quizQuestions.length > 0) return;
    if (!userId || pullFetchInFlightRef.current) return;

    pullFetchInFlightRef.current = true;
    fetchNextGrabQuestion().finally(() => {
      pullFetchInFlightRef.current = false;
    });
  }, [
    fetchNextGrabQuestion,
    meta.questionFlow,
    meta.id,
    quizQuestions.length,
    userId,
    waitingForStageStart,
  ]);

  const evaluateStandardQuestion = useCallback(
    (value: string | string[]) => {
      const current = currentQuestionRef.current;
      if (!isStandardQuestion(current) || !current.correctAnswer) {
        return undefined;
      }
      const correct = current.correctAnswer;
      const questionType = current.type;

      if (questionType === "wordbank") {
        if (!Array.isArray(correct) || !Array.isArray(value)) {
          return false;
        }
        if (correct.length !== value.length) return false;
        return correct.every((item, idx) => item === value[idx]);
      }

      if (questionType === "point-select") {
        const normalizeToken = (input: string | undefined): string =>
          input ? input.replace(/\s+/g, "").trim() : "";
        const correctJoined = Array.isArray(correct)
          ? normalizeToken(correct.join(""))
          : normalizeToken(typeof correct === "string" ? correct : undefined);
        if (!correctJoined) {
          return undefined;
        }
        const valueJoined = Array.isArray(value)
          ? normalizeToken(value.join(""))
          : normalizeToken(typeof value === "string" ? value : undefined);
        if (!valueJoined) {
          return false;
        }
        return valueJoined === correctJoined;
      }

      if (questionType === "multiple" || questionType === "indeterminate") {
        const correctValues = Array.isArray(correct) ? correct : [correct];
        const valueArray = Array.isArray(value)
          ? value
          : typeof value === "string" && value
          ? [value]
          : [];
        const sortedCorrect = [...correctValues].sort();
        const sortedValue = [...valueArray].sort();
        return (
          sortedCorrect.length === sortedValue.length &&
          sortedCorrect.every((item, idx) => item === sortedValue[idx])
        );
      }

      if (Array.isArray(correct)) {
        if (!Array.isArray(value)) return false;
        const sortedCorrect = [...correct].sort();
        const sortedValue = [...value].sort();
        return (
          sortedCorrect.length === sortedValue.length &&
          sortedCorrect.every((item, idx) => item === sortedValue[idx])
        );
      }
      if (Array.isArray(value)) return false;
      return value === correct;
    },
    []
  );

  const evaluateOceanQuestion = useCallback((value: string | string[]) => {
    const current = currentQuestionRef.current;
    if (!isOceanQuestion(current)) {
      return undefined;
    }
    const expected = current.correctAnswerIds ?? [];
    const valueArray = Array.isArray(value) ? value : [value];
    if (expected.length !== valueArray.length) return false;
    const sortedExpected = [...expected].sort();
    const sortedValue = [...valueArray].sort();
    return sortedExpected.every((item, idx) => item === sortedValue[idx]);
  }, []);

  const buildPenaltyGuardKey = useCallback(
    (questionId?: string) =>
      createPenaltyGuardKey(questionId, questionActivationRef.current),
    []
  );

  const applyHpPenalty = useCallback(
    (source: "answer" | "judgement") => {
      if (!meta.features.hasHp) {
        return undefined;
      }

      const latestQuestion = currentQuestionRef.current;
      const questionId = resolvePenaltyQuestionId(latestQuestion);
      const guardKey = questionPenaltyGuardKeyRef.current ?? buildPenaltyGuardKey(questionId);
      const currentHp = Math.trunc(
        stateRef.current.hp ?? meta.features.initialHp ?? 0
      );
      const result = applyHpPenaltyState({
        currentHp,
        deduction: Math.max(meta.features.hpLossPerWrong ?? 1, 0),
        latestPenalty: stateRef.current.lastHpPenalty,
        questionId,
        guardKey,
        source,
        enforceElimination: shouldEnforceHpElimination,
        modeId: meta.id,
      });

      if (result.reused && result.penaltyRecord) {
        stateRef.current = {
          ...stateRef.current,
          hp: result.nextHp,
          answeringEnabled:
            result.shouldDisableAnswering
              ? false
              : stateRef.current.answeringEnabled,
          lastHpPenalty: result.penaltyRecord,
        };
        setState((prev) => ({
          ...prev,
          hp: result.nextHp,
          answeringEnabled:
            result.shouldDisableAnswering
              ? false
              : prev.answeringEnabled,
          lastHpPenalty: result.penaltyRecord,
        }));
        return result.penaltyRecord;
      }

      stateRef.current = {
        ...stateRef.current,
        hp: result.nextHp,
        answeringEnabled: result.shouldDisableAnswering
          ? false
          : stateRef.current.answeringEnabled,
        oceanEndReason: result.oceanEndReason ?? stateRef.current.oceanEndReason,
        lastHpPenalty: result.penaltyRecord ?? stateRef.current.lastHpPenalty,
      };

      setState((prev) => ({
        ...prev,
        hp: result.nextHp,
        answeringEnabled: result.shouldDisableAnswering ? false : prev.answeringEnabled,
        oceanEndReason: result.oceanEndReason ?? prev.oceanEndReason,
        lastHpPenalty: result.penaltyRecord ?? prev.lastHpPenalty,
      }));

      return result.penaltyRecord;
    },
    [
      buildPenaltyGuardKey,
      meta.features.hasHp,
      meta.features.hpLossPerWrong,
      meta.features.initialHp,
      meta.id,
      shouldEnforceHpElimination,
    ]
  );

  const submitAnswer = useCallback(
    async (
      value: string | string[],
      options?: { requestId?: string; timeoutMs?: number }
    ): Promise<QuizSubmissionResult | undefined> => {
      const currentQuestion = currentQuestionRef.current;
      const currentIndex = questionIndexRef.current;

      if (!currentQuestion || currentIndex < 0) return undefined;

      let oceanSubmission: Awaited<ReturnType<typeof submitGrabbedAnswer>> | undefined;

      if (meta.id === "ocean-adventure" && isOceanQuestion(currentQuestion)) {
        if (!userId) {
          throw new Error("缺少选手 ID，无法提交答案");
        }
        const answerPayload: string | string[] =
          Array.isArray(value) && value.length === 1
            ? value[0] ?? ""
            : value;
        oceanSubmission = await submitGrabbedAnswer({
          userId,
          questionId: currentQuestion.questionKey,
          answer: answerPayload,
          timeoutMs: options?.timeoutMs,
        });
      }

      const durationMs = resolveDuration();
      let isCorrect: boolean | undefined;
      let hpAfterAnswer = meta.features.hasHp
        ? state.hp ?? meta.features.initialHp ?? 0
        : undefined;

      if (meta.id === "ocean-adventure" && oceanSubmission) {
        const rawResult =
          typeof oceanSubmission.result === "string"
            ? oceanSubmission.result.toLowerCase()
            : undefined;
        if (rawResult === "correct") {
          isCorrect = true;
        } else if (rawResult === "wrong") {
          isCorrect = false;
        }
      } else if (isStandardQuestion(currentQuestion)) {
        isCorrect = evaluateStandardQuestion(value);
      } else if (isOceanQuestion(currentQuestion)) {
        isCorrect = evaluateOceanQuestion(value);
      }

      const hpBeforeAnswer = hpAfterAnswer;

      const answerId = isStandardQuestion(currentQuestion)
        ? currentQuestion.id
        : currentQuestion.questionKey;

      setAnswer(answerId, {
        value,
        durationMs,
        metadata: {
          mode: meta.id,
          index: currentIndex,
          correct: isCorrect,
        },
      });

      if (meta.features.hasHp) {
        if (isCorrect === false) {
          wrongCountRef.current += 1;
          const penaltyRecord = applyHpPenalty("answer");
          hpAfterAnswer =
            penaltyRecord?.hpAfter ??
            hpBeforeAnswer ??
            state.hp ??
            meta.features.initialHp ??
            0;
          if (shouldEnforceHpElimination && hpAfterAnswer <= 0) {
            stopAll();
          }
        } else {
          setState((prev) => {
            if (!prev.lastHpPenalty) return prev;
            return {
              ...prev,
              lastHpPenalty: undefined,
            };
          });
        }
      }

      const submissionOutcome: QuizSubmissionResult = {
        correct: isCorrect,
        rawResult:
          typeof oceanSubmission?.result === "string"
            ? oceanSubmission.result
            : undefined,
        hpAfterAnswer:
          meta.features.hasHp && typeof hpAfterAnswer === "number"
            ? hpAfterAnswer
            : undefined,
        correctAnswer: oceanSubmission?.correctAnswer,
        score: oceanSubmission?.score,
        stats: oceanSubmission?.stats,
      };

      if (isQaVariantMode(meta.id) || meta.id === "last-stand" || meta.id === "last-stand-group") {
        setState((prev) => ({
          ...prev,
          awaitingHost: true,
          answeringEnabled: false,
        }));
        return submissionOutcome;
      }

      if (meta.id === "ultimate-challenge") {
        perQuestionStartRef.current = null;
        setState((prev) => ({
          ...prev,
          awaitingHost: true,
          answeringEnabled: false,
          phase: "waiting",
        }));
        return submissionOutcome;
      }

      if (meta.id === "speed-run") {
        const nextIndex = currentIndex + 1;
        if (nextIndex >= questionListRef.current.length) {
          stopAll();
          setState((prev) => ({
            ...prev,
            speedRunEndReason: prev.speedRunEndReason ?? "complete",
          }));
          return submissionOutcome;
        }
        setCurrentQuestionIndex(nextIndex);
        return submissionOutcome;
      }

      if (meta.id === "ocean-adventure") {
        const exhaustedHp =
          meta.features.hasHp && (hpAfterAnswer ?? 0) <= 0;
        setState((prev) => ({
          ...prev,
          awaitingHost: true,
          question: exhaustedHp ? undefined : prev.question,
        }));
        if (exhaustedHp) {
          stopAll();
        }
        return submissionOutcome;
      }

      return submissionOutcome;
    },
    [
      evaluateOceanQuestion,
      evaluateStandardQuestion,
      applyHpPenalty,
      meta.features.hasHp,
      meta.features.initialHp,
      meta.id,
      resolveDuration,
      setAnswer,
      setCurrentQuestionIndex,
      shouldEnforceHpElimination,
      state.hp,
      stopAll,
      userId,
    ]
  );

  const requestNextQuestion = useCallback(async () => {
    if (shouldEnforceHpElimination) {
      const remainingHp =
        state.hp ?? meta.features.initialHp ?? 0;
      if (remainingHp <= 0) {
        return;
      }
    }

    if (meta.questionFlow === "local") {
      const nextIndex = questionIndexRef.current + 1;
      if (nextIndex < questionListRef.current.length) {
        setCurrentQuestionIndex(nextIndex);
      }
      return;
    }

    if (meta.id === "ocean-adventure") {
      await fetchNextGrabQuestion();
    }
  }, [
    fetchNextGrabQuestion,
    meta.features.initialHp,
    meta.id,
    meta.questionFlow,
    setCurrentQuestionIndex,
    shouldEnforceHpElimination,
    state.hp,
  ]);

  const applyHostJudgement = useCallback(
    (result: "correct" | "wrong") => {
      if (!meta.features.hasHp) return;
      if (result === "correct") {
        setState((prev) => {
          if (!prev.lastHpPenalty) return prev;
          return {
            ...prev,
            lastHpPenalty: undefined,
          };
        });
        return;
      }
      applyHpPenalty("judgement");
    },
    [applyHpPenalty, meta.features.hasHp]
  );

  const recoverHp = useCallback(
    (targetHp: number) => {
      if (!meta.features.hasHp) return;
      const maxHp = Math.max(0, Math.trunc(meta.features.initialHp ?? 0));
      const normalizedTarget = Math.trunc(targetHp);
      const clamped = Math.max(0, Math.min(normalizedTarget, maxHp));
      const currentHp = Math.trunc(stateRef.current.hp ?? maxHp);
      const shouldClearPenalty = shouldClearRecoveredPenalty({
        currentHp,
        targetHp: clamped,
        latestPenalty: stateRef.current.lastHpPenalty,
      });
      stateRef.current = {
        ...stateRef.current,
        hp: clamped,
        answeringEnabled: shouldEnforceHpElimination
          ? clamped > 0
          : stateRef.current.answeringEnabled,
        lastHpPenalty: shouldClearPenalty
          ? undefined
          : stateRef.current.lastHpPenalty,
      };
      setState((prev) => {
        const previousHp = Math.trunc(prev.hp ?? maxHp);
        if (previousHp === clamped && prev.answeringEnabled) {
          return prev;
        }
        return {
          ...prev,
          hp: clamped,
          answeringEnabled: shouldEnforceHpElimination
            ? clamped > 0
            : prev.answeringEnabled,
          lastHpPenalty: shouldClearPenalty ? undefined : prev.lastHpPenalty,
        };
      });
    },
    [
      meta.features.hasHp,
      meta.features.initialHp,
      shouldEnforceHpElimination,
    ]
  );

  const delegateAnswerTo = useCallback(
    (targetId: string, options?: { isSelf?: boolean }) => {
      setState((prev) => {
        if (meta.id !== "ultimate-challenge") {
          return {
            ...prev,
            delegationTargetId: targetId,
          };
        }
        const isSelf = options?.isSelf ?? false;
        if (isSelf && !prev.answeringEnabled) {
          markQuestionTime();
        } else if (!isSelf) {
          perQuestionStartRef.current = null;
        }
        return {
          ...prev,
          delegationTargetId: targetId,
          awaitingHost: false,
          phase: isSelf ? "answer" : "locked",
          answeringEnabled: isSelf,
        };
      });
    },
    [markQuestionTime, meta.id]
  );

  const triggerBuzzer = useCallback(() => {
    if (meta.id !== "ultimate-challenge") {
      return;
    }
    setState((prev) => ({
      ...prev,
      awaitingHost: false,
    }));
  }, [meta.id]);

  const resetUltimateRound = useCallback(() => {
    if (meta.id !== "ultimate-challenge") {
      return;
    }
    perQuestionStartRef.current = null;
    setState((prev) => ({
      ...prev,
      awaitingHost: true,
      answeringEnabled: false,
      delegationTargetId: null,
      phase: prev.question ? "buzz" : "waiting",
    }));
  }, [meta.id]);

  const reset = useCallback(async () => {
    clearAnswers();
    resetRuntime();
    setAppCurrentQuestion(null);

    if (meta.questionFlow === "local") {
      await loadModeQuestions();
      return;
    }

    if (meta.questionFlow === "pull") {
      if (!waitingForStageStart) {
        await fetchNextGrabQuestion();
      }
      return;
    }
  }, [
    clearAnswers,
    fetchNextGrabQuestion,
    loadModeQuestions,
    meta.questionFlow,
    resetRuntime,
    setAppCurrentQuestion,
    waitingForStageStart,
  ]);

  const startLocalTimer = useCallback(() => {
    const limit =
      meta.id === "speed-run"
        ? SPEED_RUN_TIME_LIMIT
        : meta.id === "ocean-adventure"
          ? OCEAN_TIME_LIMIT
          : undefined;
    if (limit) {
      startGlobalTimer(limit);
    }
  }, [meta.id, startGlobalTimer]);

  const stopLocalTimer = useCallback(() => {
    resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    return () => {
      resetTimers();
    };
  }, [resetTimers]);

  return {
    state,
    controls: {
      submitAnswer,
      requestNextQuestion,
      reset,
      startLocalTimer,
      stopLocalTimer,
      recoverHp: meta.features.hasHp ? recoverHp : undefined,
      applyHostJudgement: meta.features.hasHp ? applyHostJudgement : undefined,
      delegateAnswerTo: meta.features.allowsDelegation ? delegateAnswerTo : undefined,
      triggerBuzzer: meta.features.requiresBuzzer ? triggerBuzzer : undefined,
      resetUltimateRound: meta.id === "ultimate-challenge" ? resetUltimateRound : undefined,
    },
    meta,
  };
}
