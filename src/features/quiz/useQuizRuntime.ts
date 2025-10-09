import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Toast } from "@/lib/arco";
import { API_ENDPOINTS } from "@/constants";
import { useAppStore } from "@/store/useAppStore";
import { useQuizStore } from "@/store/quizStore";
import type { NormalizedQuestion } from "@/lib/normalizeQuestion";
import { CONTEST_MODES, DEFAULT_MODE } from "./modes";
import {
  ContestModeId,
  ContestModeMeta,
  CustomOceanQuestion,
  QuizQuestion,
  QuizRuntime,
  QuizRuntimeState,
  StandardQuestion,
  StandardQuestionType,
} from "./types";

type ModeIdInput = ContestModeId | string | null | undefined;

const SPEED_RUN_TIME_LIMIT = 5 * 60; // 5 minutes
const OCEAN_TIME_LIMIT = 12 * 60; // 12 minutes

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
    case "wordbank":
    case "word-bank":
    case "word-bank-fill":
    case "wordbank-fill":
    case "pick":
    case "pick-fill":
    case "选词填空":
    case "点选题":
    case "点选填空":
    case "选词填空题":
      return "wordbank";
    case "single":
    case "single-choice":
    case "单选":
    case "单选题":
      return "single";
    default:
      return "single";
  }
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

  return {
    id: question.id,
    title: question.content,
    type: mapQuestionType(question.type),
    options: question.options.map((option, index) => ({
      value: option.value || String.fromCharCode(65 + index),
      label: option.text || option.value || `选项${index + 1}`,
    })),
    correctAnswer,
  };
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

export function useQuizRuntime(modeId: ModeIdInput): QuizRuntime {
  const meta = useMemo(() => resolveMode(modeId), [modeId]);

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
    loadQuestions,
    grabNextQuestion,
    setCurrentQuestionIndex,
  } = useQuizStore(
    useShallow((state) => ({
      questions: state.questions,
      currentIndex: state.currentIndex,
      isLoading: state.isLoading,
      loadQuestions: state.loadQuestions,
      grabNextQuestion: state.grabNextQuestion,
      setCurrentQuestionIndex: state.setCurrentQuestionIndex,
    }))
  );

  const [state, setState] = useState<QuizRuntimeState>(() =>
    createInitialState(meta)
  );

  const wrongCountRef = useRef(0);
  const globalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const globalDeadlineRef = useRef<number | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const perQuestionStartRef = useRef<number | null>(null);
  const timerInitializedRef = useRef(false);
  const questionListRef = useRef<QuizQuestion[]>([]);
  const questionIndexRef = useRef<number>(state.questionIndex);
  const currentQuestionRef = useRef<QuizQuestion | undefined>(undefined);
  const localFetchInFlightRef = useRef(false);
  const pullFetchInFlightRef = useRef(false);

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
          stopAll();
          setState((prev) => {
            if (
              prev.timeRemaining === 0 &&
              prev.timeElapsed === elapsedSeconds
            ) {
              return prev;
            }
            return {
              ...prev,
              timeRemaining: 0,
              timeElapsed: elapsedSeconds,
              answeringEnabled: false,
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
    [resetTimers, stopAll]
  );

  const markQuestionTime = useCallback(() => {
    perQuestionStartRef.current = Date.now();
  }, []);

  const resolveDuration = useCallback(() => {
    if (!perQuestionStartRef.current) return undefined;
    return Date.now() - perQuestionStartRef.current;
  }, []);

  const assignQuestion = useCallback(
    (nextQuestion: QuizQuestion | undefined, index: number, total: number) => {
      const isUltimate = meta.id === "ultimate-challenge";
      setState((prev) => ({
        ...prev,
        mode: meta.id,
        question: nextQuestion,
        questionIndex: index,
        totalQuestions: total,
        answeringEnabled: isUltimate ? false : !!nextQuestion,
        awaitingHost:
          meta.questionFlow !== "local" ? !nextQuestion : false,
        delegationTargetId: null,
        phase: isUltimate
          ? nextQuestion
            ? "buzz"
            : "waiting"
          : prev.phase,
      }));
      if (nextQuestion) {
        if (isUltimate) {
          perQuestionStartRef.current = null;
        } else {
          markQuestionTime();
        }
      }
    },
    [markQuestionTime, meta.id, meta.questionFlow]
  );

  const resetRuntime = useCallback(() => {
    resetTimers();
    wrongCountRef.current = 0;
    timerInitializedRef.current = false;
    questionListRef.current = [];
    questionIndexRef.current = meta.questionFlow === "push" ? -1 : 0;
    currentQuestionRef.current = undefined;
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
    const total = quizQuestions.length;
    const index =
      total === 0
        ? meta.questionFlow === "push"
          ? -1
          : 0
        : Math.min(Math.max(storeCurrentIndex, 0), total - 1);

    const nextQuestion =
      index >= 0 && index < total ? quizQuestions[index] : undefined;

    questionListRef.current = quizQuestions;
    questionIndexRef.current = index;
    currentQuestionRef.current = nextQuestion;

    assignQuestion(nextQuestion, index, total);

    if (nextQuestion) {
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
    meta.questionFlow,
    quizQuestions,
    setAppCurrentQuestion,
    storeCurrentIndex,
  ]);

  useEffect(() => {
    if (meta.id === "speed-run") {
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
  }, [meta.id, quizQuestions.length, startGlobalTimer]);

  const loadModeQuestions = useCallback(async () => {
    const endpoint = `${API_ENDPOINTS.QUESTIONS}?mode=${encodeURIComponent(meta.id)}`;
    try {
      await loadQuestions(endpoint, "default");
    } catch (error) {
      console.error("加载题目列表失败", error);
      Toast.error("题目加载失败");
    }
  }, [loadQuestions, meta.id]);

  const fetchNextGrabQuestion = useCallback(async () => {
    if (!userId) return;
    try {
      await grabNextQuestion(userId);
    } catch (error) {
      console.error("题海遨游取题失败", error);
      Toast.error("获取题目失败");
    }
  }, [grabNextQuestion, userId]);

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
    if (quizQuestions.length > 0) return;
    if (!userId || pullFetchInFlightRef.current) return;

    pullFetchInFlightRef.current = true;
    fetchNextGrabQuestion().finally(() => {
      pullFetchInFlightRef.current = false;
    });
  }, [
    fetchNextGrabQuestion,
    meta.questionFlow,
    quizQuestions.length,
    userId,
  ]);

  const evaluateStandardQuestion = useCallback(
    (value: string | string[]) => {
      const current = currentQuestionRef.current;
      if (!isStandardQuestion(current) || !current.correctAnswer) {
        return undefined;
      }
      const correct = current.correctAnswer;
      if (Array.isArray(correct)) {
        if (!Array.isArray(value)) return false;
        if (current.type === "wordbank") {
          if (correct.length !== value.length) return false;
          return correct.every((item, idx) => item === value[idx]);
        }
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

  const submitAnswer = useCallback(
    async (value: string | string[]): Promise<boolean | undefined> => {
      const currentQuestion = currentQuestionRef.current;
      const currentIndex = questionIndexRef.current;

      if (!currentQuestion || currentIndex < 0) return undefined;

      const durationMs = resolveDuration();
      let isCorrect: boolean | undefined;
      let hpAfterAnswer = state.hp ?? meta.features.initialHp;

      if (isStandardQuestion(currentQuestion)) {
        isCorrect = evaluateStandardQuestion(value);
      } else if (isOceanQuestion(currentQuestion)) {
        isCorrect = evaluateOceanQuestion(value);
      }

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

      if (meta.features.hasHp && isCorrect === false) {
        wrongCountRef.current += 1;
        const currentHp = state.hp ?? meta.features.initialHp ?? 0;
        const nextHp = Math.max(
          currentHp - (meta.features.hpLossPerWrong ?? 1),
          0
        );
        hpAfterAnswer = nextHp;
        setState((prev) => ({
          ...prev,
          hp: nextHp,
          answeringEnabled: nextHp > 0 ? prev.answeringEnabled : false,
        }));
        if (nextHp <= 0) {
          stopAll();
        }
      }

      if (meta.id === "qa" || meta.id === "last-stand") {
        setState((prev) => ({
          ...prev,
          awaitingHost: true,
          answeringEnabled: false,
        }));
        return isCorrect;
      }

      if (meta.id === "ultimate-challenge") {
        perQuestionStartRef.current = null;
        setState((prev) => ({
          ...prev,
          awaitingHost: true,
          answeringEnabled: false,
          phase: "waiting",
        }));
        return isCorrect;
      }

      if (meta.id === "speed-run") {
        const nextIndex = currentIndex + 1;
        if (nextIndex >= questionListRef.current.length) {
          stopAll();
          return isCorrect;
        }
        setCurrentQuestionIndex(nextIndex);
        return isCorrect;
      }

      if (meta.id === "ocean-adventure") {
        if (meta.features.hasHp && (hpAfterAnswer ?? 0) <= 0) {
          stopAll();
        }
        setState((prev) => ({
          ...prev,
          awaitingHost: true,
        }));
        return isCorrect;
      }

      return isCorrect;
    },
    [
      evaluateOceanQuestion,
      evaluateStandardQuestion,
      meta.features.hasHp,
      meta.features.hpLossPerWrong,
      meta.features.initialHp,
      meta.id,
      resolveDuration,
      setAnswer,
      setCurrentQuestionIndex,
      state.hp,
      stopAll,
    ]
  );

  const requestNextQuestion = useCallback(async () => {
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
  }, [fetchNextGrabQuestion, meta.id, meta.questionFlow, setCurrentQuestionIndex]);

  const applyHostJudgement = useCallback(
    (result: "correct" | "wrong") => {
      if (!meta.features.hasHp) return;
      if (result === "correct") return;
      setState((prev) => {
        const nextHp =
          (prev.hp ?? meta.features.initialHp ?? 0) -
          (meta.features.hpLossPerWrong ?? 1);
        const clamped = Math.max(nextHp, 0);
        return {
          ...prev,
          hp: clamped,
          answeringEnabled: clamped > 0 && prev.answeringEnabled,
        };
      });
    },
    [meta.features.hasHp, meta.features.hpLossPerWrong, meta.features.initialHp]
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
          phase: isSelf ? "answer" : "locked",
          answeringEnabled: isSelf,
        };
      });
    },
    [markQuestionTime, meta.id]
  );

  const triggerBuzzer = useCallback(() => {
    setState((prev) => {
      if (meta.id !== "ultimate-challenge") {
        return prev;
      }
      return {
        ...prev,
        awaitingHost: false,
        phase: "decision",
        answeringEnabled: false,
      };
    });
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
      await fetchNextGrabQuestion();
    }
  }, [
    clearAnswers,
    fetchNextGrabQuestion,
    loadModeQuestions,
    meta.questionFlow,
    resetRuntime,
    setAppCurrentQuestion,
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
      applyHostJudgement: meta.features.hasHp ? applyHostJudgement : undefined,
      delegateAnswerTo: meta.features.allowsDelegation ? delegateAnswerTo : undefined,
      triggerBuzzer: meta.features.requiresBuzzer ? triggerBuzzer : undefined,
    },
    meta,
  };
}
