"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  NavBar,
  Progress,
  Radio,
  Tag,
} from "@arco-design/mobile-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { ArcoClient } from "@/components/ArcoClient";
import { Toast, Notify } from "@/lib/arco";
import { useMqttSubscription } from "@/lib/mqtt/hooks";
import { MQTT_TOPICS } from "@/config/control";
import { useAppStore } from "@/store/useAppStore";
import { useQuizStore } from "@/store/quizStore";
import { useQuizRuntime } from "@/features/quiz/useQuizRuntime";
import { CONTEST_MODES, DEFAULT_MODE } from "@/features/quiz/modes";
import {
  ContestModeId,
  CustomOceanQuestion,
  QuizQuestion,
  StandardQuestion,
} from "@/features/quiz/types";
import type { NormalizedQuestion } from "@/lib/normalizeQuestion";
import {
  FillDrawingBoard,
  type FillDrawingBoardHandle,
  FillDrawingBoardEmptyError,
} from "@/features/quiz/components/FillDrawingBoard";
import type { SmoothSerializedStroke } from "@/features/quiz/components/SmoothDrawingCanvas";
import styles from "./page.module.css";

const MODE_LIST = Object.values(CONTEST_MODES);

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

  if (question.type === "wordbank") {
    if (!Array.isArray(selection)) {
      return "未选";
    }
    const labelMap = new Map(
      question.options.map((option) => [option.value, option.label])
    );
    const labels = selection
      .map((item) => (item ? labelMap.get(String(item)) ?? String(item) : ""))
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

  if (!selection) {
    return "未选";
  }

  const letter = resolveOptionLetter(question, String(selection));
  const normalized = letter.trim().toUpperCase();
  return normalized || "未选";
}

type SubmitSource = "manual" | "command";

interface SubmitOptions {
  allowEmpty?: boolean;
  source?: SubmitSource;
}

type BoardStatus = "idle" | "waiting" | "uploading" | "success" | "error";

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

export default function QuizPage() {
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

  const { user, isAuthenticated, answers } = useAppStore(
    useShallow((state) => ({
      user: state.user,
      isAuthenticated: state.isAuthenticated,
      answers: state.answers,
    }))
  );

  const { state, controls, meta } = useQuizRuntime(mode);
  const {
    currentStage,
    scoreRecord,
    submitAnswerChoice,
    submitJudgeResult,
    normalizedQuestions,
  } = useQuizStore(
    useShallow((storeState) => ({
      currentStage: storeState.currentStage,
      scoreRecord: storeState.scoreRecord,
      submitAnswerChoice: storeState.submitAnswerChoice,
      submitJudgeResult: storeState.submitJudgeResult,
      normalizedQuestions: storeState.questions,
    }))
  );
  const [selected, setSelected] = useState<string | string[] | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [canBuzz, setCanBuzz] = useState(() => meta.id !== "ultimate-challenge");
  const controlMessage = useMqttSubscription(
    MQTT_TOPICS.control,
    meta.id === "ultimate-challenge"
  );
  const shouldHandleSubmitCommand =
    meta.id === "qa" || meta.id === "last-stand" || meta.id === "ultimate-challenge";
  const commandMessage = useMqttSubscription(
    MQTT_TOPICS.command,
    shouldHandleSubmitCommand
  );
  const navWrapperRef = useRef<HTMLDivElement | null>(null);
  const [isBoardOpen, setBoardOpen] = useState(false);
  const boardRef = useRef<FillDrawingBoardHandle | null>(null);
  const [boardStatus, setBoardStatus] = useState<BoardStatus>("idle");
  const fillSketchCacheRef = useRef<
    Record<string, { preview?: string; paths?: SmoothSerializedStroke[] }>
  >({});
  const [fillPreview, setFillPreview] = useState<string | null>(null);
  const [cachedPaths, setCachedPaths] = useState<SmoothSerializedStroke[] | null>(null);
  const lastQuestionIdRef = useRef<string | null>(null);
  const lastSubmitCommandRef = useRef<number | null>(null);
  const [notifyOffset, setNotifyOffset] = useState(44);
  const [isCommandSubmissionLocked, setCommandSubmissionLocked] = useState(false);
  const [wordbankActiveIndex, setWordbankActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      Toast.info("请先登录");
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

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

  const question = state.question;
  const questionId = question ? resolveQuestionId(question) : null;
  const isWordbankQuestion =
    !!question && isStandardQuestion(question) && question.type === "wordbank";

  const wordbankTemplate = useMemo(() => {
    if (!isWordbankQuestion || !question || !isStandardQuestion(question)) {
      return null;
    }
    return parseWordbankTemplate(question.title);
  }, [isWordbankQuestion, question]);

  const wordbankOptionLabelMap = useMemo(() => {
    if (!isWordbankQuestion || !question || !isStandardQuestion(question)) {
      return null;
    }
    const map = new Map<string, string>();
    question.options.forEach((option) => {
      map.set(option.value, option.label);
    });
    return map;
  }, [isWordbankQuestion, question]);

  const wordbankValues = useMemo(() => {
    if (!isWordbankQuestion || !wordbankTemplate) return [];
    const base = Array.isArray(selected)
      ? selected.map((item) => (item ? String(item) : ""))
      : [];
    return wordbankTemplate.blankIds.map((_, index) => base[index] ?? "");
  }, [isWordbankQuestion, selected, wordbankTemplate]);

  useEffect(() => {
    if (!isWordbankQuestion || !wordbankTemplate) return;
    const base = Array.isArray(selected)
      ? selected.map((item) => (item ? String(item) : ""))
      : [];
    const normalized = wordbankTemplate.blankIds.map((_, index) => base[index] ?? "");
    const hasDiff =
      normalized.length !== base.length ||
      normalized.some((value, index) => value !== base[index]);
    if (hasDiff) {
      setSelected(normalized);
    }
  }, [isWordbankQuestion, selected, wordbankTemplate]);

  const wordbankUsedValues = useMemo(
    () => new Set(wordbankValues.filter((item) => item)),
    [wordbankValues]
  );

  const ultimateStage =
    meta.id === "ultimate-challenge"
      ? state.phase ?? (question ? "buzz" : "waiting")
      : undefined;

  useEffect(() => {
    if (meta.id !== "ultimate-challenge") {
      setCanBuzz(true);
      return;
    }
    setCanBuzz(false);
  }, [meta.id, questionId, ultimateStage]);

  useEffect(() => {
    if (!controlMessage || meta.id !== "ultimate-challenge") return;
    if (controlMessage.payload.trim().toLowerCase() !== "start_buzzing") return;
    if (ultimateStage !== "buzz") return;
    setCanBuzz(true);
  }, [controlMessage, meta.id, ultimateStage]);

  useEffect(() => {
    if (!question || !questionId) {
      setSelected(null);
      return;
    }

    const persisted = answers[questionId]?.value;
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
        question.type === "wordbank")
    ) {
      setSelected([]);
    } else if (isOceanQuestion(question)) {
      setSelected([]);
    } else {
      setSelected(null);
    }
  }, [answers, question, questionId]);

  useEffect(() => {
    if (questionId) {
      setBoardOpen(false);
      setBoardStatus("idle");
      lastSubmitCommandRef.current = null;
    }
  }, [questionId]);

  useEffect(() => {
    if (isBoardOpen && boardStatus === "idle") {
      setBoardStatus("waiting");
    }
  }, [isBoardOpen, boardStatus]);

  useEffect(() => {
    if (!isBoardOpen && boardStatus !== "success" && boardStatus !== "idle") {
      setBoardStatus("idle");
    }
  }, [isBoardOpen, boardStatus]);

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
    const cache = fillSketchCacheRef.current[questionId];
    setFillPreview(cache?.preview ?? null);
    setCachedPaths(cache?.paths ?? null);
  }, [question, questionId]);

  useEffect(() => {
    const previousId = lastQuestionIdRef.current;
    if (questionId && questionId !== previousId) {
      setCommandSubmissionLocked(false);
      setWordbankActiveIndex(null);
      lastQuestionIdRef.current = questionId;
      return;
    }

    if (!questionId) {
      setCommandSubmissionLocked(false);
      setWordbankActiveIndex(null);
      lastQuestionIdRef.current = null;
    }
  }, [questionId]);

  const totalQuestions = state.totalQuestions;
  const currentIndex = state.questionIndex >= 0 ? state.questionIndex : 0;
  const showProgress = totalQuestions !== undefined && totalQuestions > 0;
  const progress = useMemo(() => {
    if (!showProgress) return 0;
    return Math.round(((currentIndex + 1) / (totalQuestions || 1)) * 100);
  }, [currentIndex, showProgress, totalQuestions]);

  const hpDisplay = meta.features.hasHp
    ? {
        current: state.hp ?? meta.features.initialHp ?? 0,
        initial: meta.features.initialHp ?? 0,
      }
    : null;

  const isEliminated = meta.id === "last-stand" && (hpDisplay?.current ?? 0) <= 0;

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

  const handleModeChange = (nextMode: ContestModeId) => {
    setMode(nextMode);
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", nextMode);
    router.replace(`/quiz?${params.toString()}`);
  };

  const handleSelect = (value: string) => {
    setSelected(value);
  };

  const handleMultiSelect = (values: (string | number)[]) => {
    setSelected(values.map(String));
  };

  const handleWordbankBlankClick = useCallback(
    (index: number) => {
      if (!state.answeringEnabled) return;
      setWordbankActiveIndex(index);
    },
    [state.answeringEnabled]
  );

  const handleWordbankClear = useCallback(
    (index: number) => {
      if (!state.answeringEnabled) return;
      const next = [...wordbankValues];
      if (!next[index]) {
        setWordbankActiveIndex(index);
        return;
      }
      next[index] = "";
      setSelected(next);
      setWordbankActiveIndex(index);
    },
    [state.answeringEnabled, wordbankValues]
  );

  const handleWordbankSelectOption = useCallback(
    (optionValue: string, isUsed?: boolean) => {
      if (!state.answeringEnabled || !wordbankTemplate) return;
      if (isUsed) {
        return;
      }
      const safeValue = String(optionValue);
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
      setSelected(next);

      if (targetIndex < next.length - 1) {
        setWordbankActiveIndex(targetIndex + 1);
      } else {
        const hasEmpty = next.some((item) => !item);
        setWordbankActiveIndex(hasEmpty ? 0 : null);
      }
    },
    [state.answeringEnabled, wordbankTemplate, wordbankValues, wordbankActiveIndex]
  );

  const handleOpenBoard = useCallback(() => {
    if (isBoardOpen || boardStatus === "success") return;
    setBoardStatus("waiting");
    lastSubmitCommandRef.current = null;
    setBoardOpen(true);
  }, [boardStatus, isBoardOpen]);

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
      setFillPreview(preview);
      setCachedPaths(paths);
      setBoardStatus("success");
    },
    [question, questionId]
  );

  const handleSubmit = useCallback(
    async (options: SubmitOptions = {}, overrideValue?: string | string[]) => {
      const { allowEmpty = false, source = "manual" } = options;
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

      const resolvedSelection =
        overrideValue !== undefined ? overrideValue : selected;

      let submissionValue: string | string[] = "";
      let questionSheetAnswer: string | undefined;

      if (isStandardQuestion(currentQuestion)) {
        if (
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
          const values = Array.isArray(resolvedSelection)
            ? resolvedSelection.map(String)
            : typeof resolvedSelection === "string" && resolvedSelection
            ? [resolvedSelection]
            : [];
          const normalizedValues = blankIds.length
            ? blankIds.map((_, index) => values[index] ?? "")
            : values;
          const hasEmpty =
            blankIds.length > 0
              ? normalizedValues.some((item) => !item)
              : normalizedValues.length === 0 || normalizedValues.some((item) => !item);
          if (!allowEmpty && hasEmpty) {
            Toast.warn("请完成所有填空");
            return;
          }
          submissionValue = normalizedValues;
          const labelMap = new Map(
            currentQuestion.options.map((option) => [option.value, option.label])
          );
          const readable = normalizedValues
            .map((item) => (item ? labelMap.get(item) ?? item : ""))
            .filter(Boolean);
          questionSheetAnswer = readable.length > 0 ? readable.join("/") : "未选";
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
          questionSheetAnswer = value || "空画板";
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

      setSubmitting(true);
      try {
        const result = await controls.submitAnswer(submissionValue);

        if (shouldHandleSubmitCommand && isStandardQuestion(currentQuestion)) {
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
          const correctness = result === true ? "1" : "0";
          const scoreAnswerValue =
            currentQuestion.type === "fill" ? "填空" : correctness;
          const lightValue: "0" | "1" = correctness === "1" ? "1" : "0";
          const durationMs = answers[questionKey]?.durationMs;
          const shouldReportTime = meta.id === "speed-run";
          const timeSeconds =
            shouldReportTime && typeof durationMs === "number"
              ? Math.round(durationMs / 1000)
              : undefined;
          const scoreFieldKey = resolveScoreFieldKey(
            normalizedQuestion,
            state.questionIndex
          );
          const persistenceTasks: Promise<unknown>[] = [];

          if (questionSheetId && questionRecordId && userId) {
            persistenceTasks.push(
              submitAnswerChoice({
                datasheetId: questionSheetId,
                recordId: questionRecordId,
                userId,
                fieldKey: userId,
                answer: answerForSheet,
              })
            );
          }

          if (scoreSheetId && scoreRecordId && scoreFieldKey) {
            persistenceTasks.push(
              submitJudgeResult({
                datasheetId: scoreSheetId,
                recordId: scoreRecordId,
                questionId: scoreFieldKey,
                answer: scoreAnswerValue,
                time: timeSeconds,
                light: lightValue,
              })
            );
          }

          if (persistenceTasks.length > 0) {
            try {
              await Promise.all(persistenceTasks);
            } catch (persistError) {
              console.error("同步答题记录失败", persistError);
              Toast.error("答题结果同步失败");
            }
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
        } else {
          setCommandSubmissionLocked(false);
          if (showCorrectness) {
            if (result === true) {
              Notify.success({
                content: "回答正确",
                style: notifyStyle,
                duration: 500,
              });
            } else if (result === false) {
              Notify.error({
                content: "回答错误",
                style: notifyStyle,
                duration: 500,
              });
            } else {
              Notify.info({
                content: "答案已提交",
                style: notifyStyle,
                duration: 500,
              });
            }
          } else {
            Toast.success("答案已提交");
          }
        }
      } catch (error) {
        Toast.error("提交失败，请稍后重试");
        console.error(error);
      } finally {
        setSubmitting(false);
      }
    },
    [
      answers,
      controls,
      currentStage,
      meta.id,
      normalizedQuestions,
      notifyOffset,
      scoreRecord,
      selected,
      shouldHandleSubmitCommand,
      state.answeringEnabled,
      state.questionIndex,
      submitAnswerChoice,
      submitJudgeResult,
      question,
      user?.id,
      isSubmitting,
    ]
  );

  useEffect(() => {
    if (!commandMessage) return;
    if (boardStatus === "uploading" || boardStatus === "success") return;
    const rawPayload = commandMessage.payload.trim();

    if (/^\d+$/.test(rawPayload)) {
      setCommandSubmissionLocked(false);
    }

    if (!shouldHandleSubmitCommand) return;
    if (rawPayload.toLowerCase() !== "submit") return;
    if (commandMessage.timestamp === lastSubmitCommandRef.current) return;
    lastSubmitCommandRef.current = commandMessage.timestamp;

    const executeSubmission = async () => {
      if (question && isStandardQuestion(question) && question.type === "fill") {
        if (!boardRef.current) {
          Toast.warn("画板尚未打开，无法提交");
          return;
        }
        try {
          Toast.info("正在上传画板");
          setBoardStatus("uploading");
          const result = await boardRef.current.exportAndUpload();
          setBoardStatus("success");
          await handleSubmit(
            { allowEmpty: true, source: "command" },
            result.token
          );
          setBoardOpen(false);
        } catch (error) {
          if (error instanceof FillDrawingBoardEmptyError) {
            setBoardStatus("success");
            setBoardOpen(false);
            await handleSubmit({ allowEmpty: true, source: "command" });
            return;
          }
          console.error("画板上传失败", error);
          setBoardStatus("error");
        }
        return;
      }
      await handleSubmit({ allowEmpty: true, source: "command" });
    };

    void executeSubmission();
  }, [
    boardStatus,
    boardRef,
    commandMessage,
    handleSubmit,
    question,
    shouldHandleSubmitCommand,
  ]);

  const handleApplyJudgement = (result: "correct" | "wrong") => {
    controls.applyHostJudgement?.(result);
  };

  const handleTriggerBuzzer = () => {
    if (!controls.triggerBuzzer) {
      Toast.warn("当前不可抢答");
      return;
    }
    if (!canBuzz) {
      Toast.warn("主持人尚未开启抢答");
      return;
    }
    controls.triggerBuzzer();
    Toast.info("正在抢答...");
  };

  const handleDelegate = (target: "self" | "opponent") => {
    const isSelf = target === "self";
    const targetId = isSelf ? (user?.id ?? "self") : "opponent-team";
    if (!controls.delegateAnswerTo) {
      Toast.warn("当前不可调整作答方");
      return;
    }
    controls.delegateAnswerTo(targetId, { isSelf });
    setSelected(null);
    Toast.info(isSelf ? "由本队作答" : "已指定对手作答");
  };

  const renderCommandSubmissionResult = () => (
    <div className={styles.commandSubmissionResult}>
      <div className={styles.commandSubmissionBadge}>
        <SuccessCheckIcon />
      </div>
      <p className={styles.commandSubmissionTitle}>提交成功</p>
      <p className={styles.commandSubmissionSubtitle}>主持人已锁定本题，请等待切题指令。</p>
    </div>
  );

  const renderEliminationState = () => (
    <div className={styles.commandSubmissionResult}>
      <div className={styles.commandSubmissionBadge}>
        <EliminatedIcon />
      </div>
      <p className={styles.commandSubmissionTitle}>您已淘汰</p>
      <p className={styles.commandSubmissionSubtitle}>血量已耗尽，本轮无法继续作答。</p>
    </div>
  );

  const renderStandardOptions = (standard: StandardQuestion) => {
    if (standard.type === "multiple" || standard.type === "indeterminate") {
      const multipleValue = Array.isArray(selected) ? selected : [];
      return (
        <Checkbox.Group
          value={multipleValue}
          onChange={handleMultiSelect}
          layout="block"
          className={styles.optionGroup}
          icons={null}
        >
          {standard.options.map((option, index) => {
            const isActive = multipleValue.includes(option.value);
            const cardClass = `${styles.optionCard} ${isActive ? styles.optionCardActive : ""}`;
            const badgeClass = `${styles.optionBadge} ${isActive ? styles.optionBadgeActive : ""}`;
            return (
              <Checkbox key={option.value} value={option.value} className={styles.optionControl}>
                <div className={cardClass}>
                  <span className={badgeClass}>{String.fromCharCode(65 + index)}</span>
                  <div className={styles.optionContent}>
                    <span className={styles.optionLabel}>{option.label}</span>
                    {option.description ? (
                      <span className={styles.optionDesc}>{option.description}</span>
                    ) : null}
                  </div>
                </div>
              </Checkbox>
            );
          })}
        </Checkbox.Group>
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
                disabled={!state.answeringEnabled}
              >
                <span className={styles.wordbankOptionBadge}>{option.value}</span>
                <span className={styles.wordbankOptionLabel}>{option.label}</span>
              </button>
            );
          })}
        </div>
      );
    }

    if (standard.type === "fill") {
      const hasToken =
        typeof selected === "string" && selected.trim().length > 0;
      return (
        <div className={styles.blankBoard}>
          {!fillPreview && boardStatus !== "success" ? (
            <Button
              type="primary"
              size="large"
              className={styles.boardButton}
              onClick={handleOpenBoard}
              disabled={
                !state.answeringEnabled ||
                isBoardOpen ||
                boardStatus === "uploading"
              }
            >
              打开画板
            </Button>
          ) : null}
          {fillPreview ? (
            <>
              <div className={styles.boardSubmitted}>
                <SuccessCheckIcon className={styles.boardSubmittedIcon} />
                <div className={styles.boardSubmittedTexts}>
                  <span className={styles.boardSubmittedTitle}>已提交画板</span>
                  <span className={styles.boardSubmittedSubtitle}>
                    最新画板已上传，主持人将收到本次作答
                  </span>
                </div>
              </div>
              <div className={styles.boardPreview}>
                <Image
                  src={fillPreview}
                  alt="画板作答预览"
                  className={styles.boardPreviewImage}
                  width={320}
                  height={240}
                  unoptimized
                  sizes="(max-width: 600px) 80vw, 320px"
                />
              </div>
            </>
          ) : null}
          <span className={styles.boardHint}>
            {fillPreview
              ? "如需重新提交，请等待主持人发起新的提交指令。"
              : "打开画板后请等待主持人提交指令，系统会自动上传画板内容。"}
          </span>
          {fillPreview && hasToken ? (
            <span className={`${styles.boardStatus} ${styles.boardStatusReady}`}>
              已生成答案链接
            </span>
          ) : null}
        </div>
      );
    }

    const singleValue = typeof selected === "string" ? selected : null;
    return (
      <Radio.Group
        value={singleValue ?? undefined}
        onChange={(value) => handleSelect(String(value))}
        layout="block"
        className={styles.optionGroup}
        icons={null}
      >
        {standard.options.map((option, index) => {
          const isActive = singleValue === option.value;
          const cardClass = `${styles.optionCard} ${isActive ? styles.optionCardActive : ""}`;
          const badgeClass = `${styles.optionBadge} ${isActive ? styles.optionBadgeActive : ""}`;
          return (
            <Radio key={option.value} value={option.value} className={styles.optionControl}>
              <div className={cardClass}>
                <span className={badgeClass}>{String.fromCharCode(65 + index)}</span>
                <div className={styles.optionContent}>
                  <span className={styles.optionLabel}>{option.label}</span>
                  {option.description ? (
                    <span className={styles.optionDesc}>{option.description}</span>
                  ) : null}
                </div>
              </div>
            </Radio>
          );
        })}
      </Radio.Group>
    );
  };

  const renderOceanOptions = (ocean: CustomOceanQuestion) => {
    const values = Array.isArray(selected) ? selected : [];
    return (
      <Checkbox.Group
        value={values}
        onChange={handleMultiSelect}
        layout="block"
        className={styles.optionGroup}
        icons={null}
      >
        {ocean.optionPool.map((option, index) => {
          const isActive = values.includes(option.id);
          const cardClass = `${styles.optionCard} ${isActive ? styles.optionCardActive : ""}`;
          const badgeClass = `${styles.optionBadge} ${isActive ? styles.optionBadgeActive : ""}`;
          return (
            <Checkbox key={option.id} value={option.id} className={styles.optionControl}>
              <div className={cardClass}>
                <span className={badgeClass}>{String.fromCharCode(65 + index)}</span>
                <div className={styles.optionContent}>
                  <span className={styles.optionLabel}>{option.label}</span>
                  {option.meta?.note ? (
                    <span className={styles.optionDesc}>{String(option.meta.note)}</span>
                  ) : null}
                </div>
              </div>
            </Checkbox>
          );
        })}
      </Checkbox.Group>
    );
  };

  const renderQuestionContent = () => {
    if (isEliminated) {
      return renderEliminationState();
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
              disabled={!controls.triggerBuzzer || !canBuzz}
              needActive
            >
              <span className={styles.ultimateBuzzerText}>抢答</span>
            </Button>
            <p className={styles.ultimateHint}>抢答成功后可选择由本队作答或指定对手。</p>
          </div>
        );
      }

      if (ultimateStage === "decision") {
        return (
          <div className={styles.ultimateWrapper}>
            <h2 className={styles.ultimateTitle}>抢答成功</h2>
            <p className={styles.ultimateHint}>请选择本题的作答方</p>
            <div className={styles.ultimateDecision}>
              <Button
                type="primary"
                size="large"
                onClick={() => handleDelegate("self")}
                disabled={!controls.delegateAnswerTo}
              >
                本队作答
              </Button>
              <Button
                type="default"
                size="large"
                onClick={() => handleDelegate("opponent")}
                disabled={!controls.delegateAnswerTo}
              >
                指定对手作答
              </Button>
            </div>
          </div>
        );
      }

      if (ultimateStage === "locked") {
        return (
          <div className={styles.ultimateWrapper}>
            <h2 className={styles.ultimateTitle}>已指定对手作答</h2>
            <p className={styles.ultimateHint}>请等待对手完成作答，主持人将给出下一步指令。</p>
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
                    disabled={!state.answeringEnabled}
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

        return <h2 className={styles.questionTitle}>{question.title}</h2>;
      })();
      return (
        <>
          <div className={styles.questionHeader}>
            <div className={styles.questionHeaderLeft}>
              <span className={styles.questionTag}>
                {question.type === "single"
                  ? "单选题"
                  : question.type === "multiple"
                  ? "多选题"
                  : question.type === "indeterminate"
                  ? "不定项选择题"
                  : question.type === "boolean"
                  ? "判断题"
                  : question.type === "wordbank"
                  ? "点选题"
                  : question.type === "fill"
                  ? "填空题"
                  : "题目"}
              </span>
              {meta.id === "ultimate-challenge" && ultimateStage === "answer" ? (
                <Tag type="primary" size="small" className={styles.answeringTag}>
                  本队作答中
                </Tag>
              ) : null}
            </div>
            <span className={styles.questionIndex}>
              第 {state.questionIndex + 1}
              {showProgress && totalQuestions ? ` / ${totalQuestions}` : ""}
            </span>
          </div>
          {questionTitleNode}
          {isCommandSubmissionLocked ? (
            renderCommandSubmissionResult()
          ) : (
            <div className={styles.options}>{renderStandardOptions(question)}</div>
          )}
        </>
      );
    }

    if (isOceanQuestion(question)) {
      return (
        <>
          <div className={styles.questionHeader}>
            <span className={styles.questionTag}>题海遨游</span>
            <span className={styles.questionIndex}>
              第 {state.questionIndex + 1} 题
              <span className={styles.oceanHint}> / 预计 600 题</span>
            </span>
          </div>
          <h2 className={styles.questionTitle}>{question.stem}</h2>
          <div className={styles.categories}>
            {question.categories.map((category) => (
              <Tag key={category} type="primary" size="small" className={styles.categoryTag}>
                {category}
              </Tag>
            ))}
          </div>
          {isCommandSubmissionLocked ? (
            renderCommandSubmissionResult()
          ) : (
            <div className={styles.options}>{renderOceanOptions(question)}</div>
          )}
        </>
      );
    }

    return null;
  };

  const hasQuestion = Boolean(question);
  const shouldShowActionBar = meta.id === "speed-run" || meta.id === "ocean-adventure";
  const submitLabel =
    meta.id === "speed-run"
      ? "提交并进入下一题"
      : meta.id === "ocean-adventure"
      ? "提交并抢下一题"
      : meta.id === "qa" || meta.id === "last-stand"
      ? "提交等待主持人"
      : meta.id === "ultimate-challenge"
      ? "提交并等待裁决"
      : "提交";

  return (
    <div className={styles.page}>
      <ArcoClient fallback={<div className={styles.fallback}>加载中...</div>}>
        <div ref={navWrapperRef}>
          <NavBar
            title={user?.name ? `${user.name} 的答题` : "答题"}
            onClickLeft={() => router.push("/waiting")}
          />
        </div>

        <div className={styles.modeSwitch}>
          {MODE_LIST.map((item) => (
            <Button
              key={item.id}
              type={item.id === mode ? "primary" : "default"}
              size="small"
              onClick={() => handleModeChange(item.id)}
            >
              {item.name}
            </Button>
          ))}
        </div>

        <div className={styles.body}>
          <section className={styles.progressCard}>
            <div className={styles.progressHead}>
              <span className={styles.progressCounter}>
                {hasQuestion ? state.questionIndex + 1 : 0}
                {showProgress && totalQuestions ? (
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
                {user?.name ? <span className={styles.progressUser}>{user.name}</span> : null}
              </div>
            </div>
            {showProgress ? (
              <div className={styles.progressBar}>
                <Progress percentage={progress} percentPosition="innerLeft" />
              </div>
            ) : null}
          </section>

          <section className={styles.questionCard}>{renderQuestionContent()}</section>
          {meta.features.hasHp && meta.questionFlow === "push" && meta.id !== "last-stand" ? (
            <section className={styles.judgementPanel}>
              <h3 className={styles.panelTitle}>主持人判定</h3>
              <div className={styles.judgementActions}>
                <Button
                  type="primary"
                  size="small"
                  onClick={() => handleApplyJudgement("correct")}
                  disabled={!controls.applyHostJudgement}
                >
                  判定正确
                </Button>
                <Button
                  type="default"
                  size="small"
                  onClick={() => handleApplyJudgement("wrong")}
                  disabled={!controls.applyHostJudgement}
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
          disabled={!state.answeringEnabled}
          status={boardStatus}
        />
      </ArcoClient>
    </div>
  );
}
