"use client";

import { useCallback, useRef, useState } from "react";
import { Notify, Toast } from "@/lib/arco";
import { showQuizApiErrorToast } from "@/lib/quizApiError";
import type { NormalizedQuestion } from "@/lib/normalizeQuestion";
import type { OceanGroupId } from "@/features/quiz/oceanGroup";
import { resolveLastStandGroupStatusIndicator, resolveStatusFieldKey } from "@/features/quiz/status";
import type {
  ContestModeId,
  MatchingOption,
  QuizQuestion,
  QuizRuntimeControls,
  QuizRuntimeState,
  QuizSubmissionResult,
} from "@/features/quiz/types";
import type { PersistenceJob, PersistenceTask } from "@/features/quiz/hooks/useQuizPersistenceQueue";
import {
  canonicalizeWordbankValue,
  formatAnswerForQuestionSheet,
  isOceanQuestion,
  isStandardQuestion,
  matchingPairsToMap,
  matchingPairsToSheetAnswer,
  normalizeMatchingPairs,
  orderMatchingPairs,
  parseWordbankSelectionInput,
  parseWordbankTemplate,
  resolveQuestionId,
} from "@/features/quiz/utils/answering";

const SUBMIT_THROTTLE_INTERVAL_MS = 1000;
const SUBMIT_FREQUENT_TOAST_DURATION_MS = 500;
const SUBMISSION_TIMEOUT_MS = 5000;
const EMPTY_BOARD_PLACEHOLDER_URL = "space/2025/11/13/8df5e037ae084183bf23b2fcba675f6d";

type SubmitSource = "manual" | "command";

export interface QuizSubmitOptions {
  allowEmpty?: boolean;
  source?: SubmitSource;
}

type SubmissionStage = {
  questionSheetId?: string;
  scoreSheetId?: string;
  name?: string | null;
  displayName?: string | null;
};

type SubmissionScoreRecord = {
  recordId?: string;
  fields?: Record<string, unknown>;
};

type OceanStatsPatch = {
  total?: number;
  correct?: number;
  wrong?: number;
  score?: number;
  accuracy?: number;
  lastAnswerTime?: number;
};

export interface UseQuizSubmissionOptions {
  question?: QuizQuestion;
  selected: string | string[] | null;
  matchingPairs: string[];
  setMatchingPairs: (pairs: string[]) => void;
  controls: QuizRuntimeControls;
  runtimeState: Pick<QuizRuntimeState, "answeringEnabled" | "questionIndex" | "timeRemaining">;
  modeId: ContestModeId;
  normalizedQuestions: NormalizedQuestion[];
  currentStage?: SubmissionStage;
  scoreRecord?: SubmissionScoreRecord;
  userId?: string;
  sprintTeamId?: OceanGroupId | null;
  notifyOffset: number;
  shouldHandleSubmitCommand: boolean;
  isLastStandMode: boolean;
  isGroupedLastStand: boolean;
  shouldSyncLastStandStatus: boolean;
  enqueueJob: (job: PersistenceJob) => void;
  onCommandSubmissionStateChange: (params: {
    locked: boolean;
    overlayVisible: boolean;
    answerRevealActive?: boolean;
  }) => void;
  onOceanStatsPatch: (patch: OceanStatsPatch, options?: { finished?: boolean }) => void;
}

export interface UseQuizSubmissionResult {
  isSubmitting: boolean;
  submit: (
    options?: QuizSubmitOptions,
    overrideValue?: string | string[]
  ) => Promise<void>;
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function resolveScoreFieldKey(
  question: NormalizedQuestion | undefined,
  fallbackIndex: number
): string | undefined {
  const raw = question?.raw ?? {};
  const candidates = [
    (raw as Record<string, unknown>).number,
    (raw as Record<string, unknown>).Number,
    (raw as Record<string, unknown>).题号,
    (raw as Record<string, unknown>).序号,
    (raw as Record<string, unknown>).题目编号,
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

export function useQuizSubmission({
  question,
  selected,
  matchingPairs,
  setMatchingPairs,
  controls,
  runtimeState,
  modeId,
  normalizedQuestions,
  currentStage,
  scoreRecord,
  userId,
  sprintTeamId,
  notifyOffset,
  shouldHandleSubmitCommand,
  isLastStandMode,
  isGroupedLastStand,
  shouldSyncLastStandStatus,
  enqueueJob,
  onCommandSubmissionStateChange,
  onOceanStatsPatch,
}: UseQuizSubmissionOptions): UseQuizSubmissionResult {
  const [isSubmitting, setSubmitting] = useState(false);
  const lastManualSubmitAtRef = useRef(0);
  const submissionQueueTailRef = useRef<Promise<void>>(Promise.resolve());
  const activeSubmissionIdRef = useRef<string | null>(null);
  const inflightSubmissionSetRef = useRef<Set<string>>(new Set());

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

  const submit = useCallback(
    async (options: QuizSubmitOptions = {}, overrideValue?: string | string[]) => {
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
      if (activeSubmissionIdRef.current || isSubmitting) return;

      const currentQuestion = question;
      if (!currentQuestion || !runtimeState.answeringEnabled) {
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
            currentQuestion.matching?.left as MatchingOption[] | undefined
          );
          const pairMap = matchingPairsToMap(orderedPairs);
          const expectedPairs = currentQuestion.matching?.left?.length ?? 0;
          const hasPairs = pairMap.size > 0;
          const hasAllPairs = expectedPairs > 0 ? pairMap.size === expectedPairs : hasPairs;
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
          questionSheetAnswer = hasValue ? canonicalValues.join("") : "未选";
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
            canonicalValues.length > 0 ? labels.join("") || canonicalValues.join("") : "未选";
        } else if (currentQuestion.type === "fill") {
          const value = typeof resolvedSelection === "string" ? resolvedSelection.trim() : "";
          if (!allowEmpty && !value) {
            Toast.warn("请使用画板功能作答");
            return;
          }
          submissionValue = value;
          questionSheetAnswer = value || EMPTY_BOARD_PLACEHOLDER_URL;
        } else {
          const value = typeof resolvedSelection === "string" ? resolvedSelection : "";
          if (!allowEmpty && !value) {
            Toast.warn("请选择一个选项");
            return;
          }
          submissionValue = value;
          questionSheetAnswer = formatAnswerForQuestionSheet(currentQuestion, value || null);
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
        submissionValue = typeof resolvedSelection === "string" ? resolvedSelection : "";
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

      const currentQuestionIndex = runtimeState.questionIndex;
      const speedRunRemainingSeconds =
        modeId === "speed-run"
          ? Math.max(0, Math.round(runtimeState.timeRemaining ?? 0))
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
            (shouldHandleSubmitCommand || modeId === "speed-run") &&
            isStandardQuestion(currentQuestion)
          ) {
            const normalizedQuestion = normalizedQuestions.find(
              (item) => item.id === currentQuestion.id
            );
            const questionRecordId = normalizedQuestion?.recordId
              ? String(normalizedQuestion.recordId)
              : undefined;
            const answerForSheet = questionSheetAnswer || "未选";
            const correctness = isCorrect === true ? "1" : "0";
            const scoreAnswerValue = currentQuestion.type === "fill" ? "填空" : correctness;
            const lightValue: "0" | "1" = correctness === "1" ? "1" : "0";
            const scoreFieldKey = resolveScoreFieldKey(
              normalizedQuestion,
              currentQuestionIndex
            );
            const questionDisplayLabel =
              scoreFieldKey ??
              (currentQuestionIndex >= 0 ? String(currentQuestionIndex + 1) : resolveQuestionId(currentQuestion));
            const stageDisplayLabel =
              currentStage?.displayName?.trim() ||
              currentStage?.name?.trim() ||
              "当前环节";
            const answerFieldKey =
              modeId === "buzzer-sprint" ? sprintTeamId ?? undefined : userId;
            const persistenceTasks: PersistenceTask[] = [];
            const timeFieldValue =
              modeId === "speed-run" && speedRunRemainingSeconds !== undefined
                ? String(speedRunRemainingSeconds)
                : undefined;

            if (currentStage?.questionSheetId && questionRecordId && userId && answerFieldKey) {
              persistenceTasks.push({
                type: "answer-choice",
                params: {
                  datasheetId: currentStage.questionSheetId,
                  recordId: questionRecordId,
                  userId,
                  fieldKey: answerFieldKey,
                  answer: answerForSheet,
                },
              });
            }

            if (currentStage?.scoreSheetId && scoreRecord?.recordId && scoreFieldKey) {
              const statusFieldKey = isLastStandMode && shouldSyncLastStandStatus
                ? resolveStatusFieldKey(scoreRecord.fields)
                : undefined;
              let statusValue: string | undefined;
              if (
                isLastStandMode &&
                shouldSyncLastStandStatus &&
                typeof hpAfterAnswer === "number"
              ) {
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
                  datasheetId: currentStage.scoreSheetId,
                  recordId: scoreRecord.recordId,
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
              enqueueJob({
                id: `${requestId}-sync`,
                label: `${stageDisplayLabel} · ${
                  questionDisplayLabel ? `第 ${questionDisplayLabel} 题` : resolveQuestionId(currentQuestion)
                }`,
                createdAt: Date.now(),
                attempts: 0,
                details: {
                  stageLabel: stageDisplayLabel,
                  questionLabel: questionDisplayLabel ? `第 ${questionDisplayLabel} 题` : undefined,
                  answerLabel: answerForSheet || undefined,
                },
                tasks: persistenceTasks,
              });
            }
          }

          const showCorrectness = modeId === "speed-run" || modeId === "ocean-adventure";
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
            onCommandSubmissionStateChange({
              locked: true,
              overlayVisible: true,
              answerRevealActive: false,
            });
          } else {
            onCommandSubmissionStateChange({
              locked: false,
              overlayVisible: false,
            });
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
                    modeId === "ocean-adventure" ? "答案已提交" : "答案已记录，正在同步",
                  style: notifyStyle,
                  duration: 500,
                });
              }
            } else {
              Toast.success(
                shouldHandleSubmitCommand && isStandardQuestion(currentQuestion)
                  ? "答案已记录，正在同步"
                  : "答案已提交"
              );
            }
          }

          if (modeId === "ocean-adventure") {
            if (submissionResult?.stats || submissionResult?.score) {
              onOceanStatsPatch(
                {
                  total: submissionResult.stats?.total,
                  correct: submissionResult.stats?.correct,
                  wrong: submissionResult.stats?.wrong,
                  accuracy: submissionResult.stats?.accuracy,
                  lastAnswerTime: submissionResult.stats?.lastAnswerTime,
                  score: submissionResult.score?.total,
                },
                {
                  finished:
                    typeof hpAfterAnswer === "number" && hpAfterAnswer <= 0,
                }
              );
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
      enqueueJob,
      enqueueSubmission,
      isGroupedLastStand,
      isLastStandMode,
      isSubmitting,
      matchingPairs,
      modeId,
      normalizedQuestions,
      notifyOffset,
      onCommandSubmissionStateChange,
      onOceanStatsPatch,
      question,
      runtimeState.answeringEnabled,
      runtimeState.questionIndex,
      runtimeState.timeRemaining,
      scoreRecord,
      selected,
      setMatchingPairs,
      sprintTeamId,
      shouldHandleSubmitCommand,
      shouldSyncLastStandStatus,
      userId,
    ]
  );

  return {
    isSubmitting,
    submit,
  };
}
