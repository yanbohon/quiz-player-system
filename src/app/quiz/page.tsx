"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, NavBar } from "@arco-design/mobile-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { ArcoClient } from "@/components/ArcoClient";
import { Dialog, Toast } from "@/lib/arco";
import { mqttService } from "@/lib/mqtt/client";
import { useMqttSubscription } from "@/lib/mqtt/hooks";
import { MQTT_TOPICS } from "@/config/control";
import { resolveTihaiUrl } from "@/config/api";
import { useAppStore } from "@/store/useAppStore";
import { useQuizStore, DEFAULT_OCEAN_REMAINING_COUNT } from "@/store/quizStore";
import { useQuizRuntime } from "@/features/quiz/useQuizRuntime";
import {
  CONTEST_MODES,
  DEFAULT_MODE,
  isQaVariantMode,
  isUltimateBuzzMode,
} from "@/features/quiz/modes";
import {
  getOceanGroupLabel,
  getOceanPlayModeLabel,
  isOceanGroupId,
  type OceanGroupId,
} from "@/features/quiz/oceanGroup";
import {
  isUltimateBuzzerWinnerSelf,
  resolveUltimateBuzzerIdentity,
  resolveUltimateBuzzerWinnerLabel,
} from "@/features/quiz/ultimateBuzzer";
import {
  ContestModeId,
  StandardQuestionOption,
} from "@/features/quiz/types";
import {
  FillDrawingBoard,
  FillDrawingBoardEmptyError,
  type FillDrawingBoardHandle,
} from "@/features/quiz/components/FillDrawingBoard";
import { QuestionImageGallery } from "@/features/quiz/components/QuestionImageGallery";
import { QuestionRenderer } from "@/features/quiz/components/QuestionRenderer";
import type { MatchingLineSegment } from "@/features/quiz/components/StandardQuestionOptions";
import {
  ErrorBadgeIcon,
  SuccessCheckIcon,
} from "@/features/quiz/components/QuizIcons";
import type { SmoothSerializedStroke } from "@/features/quiz/components/SmoothDrawingCanvas";
import {
  CommandSubmissionResult,
  EliminationStatePanel,
} from "@/features/quiz/components/QuizFeedbackPanels";
import { QuestionLoadingState } from "@/features/quiz/components/QuestionLoadingState";
import { QuizProgressCard } from "@/features/quiz/components/QuizProgressCard";
import {
  OceanResultPanel,
  SpeedRunResultPanel,
} from "@/features/quiz/components/QuizResultPanels";
import { QuizSyncQueuePanel } from "@/features/quiz/components/QuizSyncQueuePanel";
import { UltimatePkPanel } from "@/features/quiz/components/UltimatePkPanel";
import { useQuizPersistenceQueue } from "@/features/quiz/hooks/useQuizPersistenceQueue";
import { useQuizSubmission } from "@/features/quiz/hooks/useQuizSubmission";
import { resolveStatusFieldKey, resolveLastStandGroupStatusIndicator } from "@/features/quiz/status";
import { useAppStoreHydrated } from "@/hooks/useAppStoreHydrated";
import {
  arraysShallowEqual,
  asStringArray,
  canonicalizeWordbankSelections,
  canonicalizeWordbankValue,
  formatOceanQuestionAnswer,
  formatStandardQuestionAnswer,
  isOceanQuestion,
  isStandardQuestion,
  mapToMatchingPairs,
  matchingPairsToMap,
  normalizeMatchingPairs,
  orderMatchingPairs,
  parseWordbankSelectionInput,
  parseWordbankTemplate,
  resolveOceanTypeLabel,
  resolveOptionLetter,
  resolveQuestionId,
  resolveStandardTypeLabel,
  sortOceanSelectionIds,
} from "@/features/quiz/utils/answering";
import {
  findNormalizedQuestion,
  isImageTypeQuestion,
  resolveQuestionImageEntries,
} from "@/features/quiz/utils/questionImages";
import styles from "./page.module.css";

const DEFAULT_NOTIFY_OFFSET = 68;
const FILL_SKETCH_CACHE_LIMIT = 10;
const FILL_PREVIEW_STORAGE_KEY = "quiz-fill-preview-cache";

function promptSprintTeamSelection(): Promise<OceanGroupId | null> {
  return new Promise((resolve) => {
    let settled = false;
    let dialogInstance: { close: () => void } | undefined;
    const finish = (value: OceanGroupId | null, shouldClose = true) => {
      if (settled) return;
      settled = true;
      resolve(value);
      if (shouldClose) {
        dialogInstance?.close();
      }
    };

    dialogInstance = Dialog.open({
      title: "请选择抢答冲刺队伍",
      children: "进入抢答冲刺前，请先确认当前设备代表红队还是蓝队。",
      contentAlign: "center",
      titleAlign: "center",
      maskClosable: false,
      renderFooter: () => (
        <div className={styles.sprintTeamDialogFooter}>
          <button
            type="button"
            className={`${styles.sprintTeamDialogButton} ${styles.sprintTeamDialogButtonRed}`}
            onClick={() => finish("red")}
          >
            红队
          </button>
          <button
            type="button"
            className={`${styles.sprintTeamDialogButton} ${styles.sprintTeamDialogButtonBlue}`}
            onClick={() => finish("blue")}
          >
            蓝队
          </button>
        </div>
      ),
      onClose: () => {
        finish(null, false);
      },
    });
  });
}

function resolveLastStandHpFromStatus(params: {
  rawStatus: unknown;
  initialHp: number;
  isGroupedLastStand: boolean;
  stageName?: string | null;
}) {
  const initialHp = Math.max(0, Math.trunc(params.initialHp));
  if (params.isGroupedLastStand) {
    const indicator = resolveLastStandGroupStatusIndicator(params.stageName);
    if (!indicator) return undefined;
    const normalized = String(params.rawStatus ?? "").trim();
    if (!normalized) return undefined;
    if (normalized === "0") return 0;
    return normalized === indicator ? initialHp : undefined;
  }

  if (params.rawStatus === undefined || params.rawStatus === null) {
    return undefined;
  }

  const parsed = Number(String(params.rawStatus).trim());
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.max(0, Math.min(Math.trunc(parsed), initialHp));
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

function QuizPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeHydrated = useAppStoreHydrated();
  const initialMode = (searchParams.get("mode") as ContestModeId | null) ?? DEFAULT_MODE.id;
  const sprintEntryKey = searchParams.get("entry") ?? null;
  const [mode, setMode] = useState<ContestModeId>(initialMode);

  useEffect(() => {
    const fromQuery = searchParams.get("mode") as ContestModeId | null;
    if (fromQuery && CONTEST_MODES[fromQuery]) {
      setMode(fromQuery);
    }
  }, [searchParams]);

  const {
    user,
    isAuthenticated,
    answers,
    mqttConnected,
    oceanPlayMode,
    oceanGroupId,
    oceanGroupLocked,
    sprintTeamId,
    setOceanPlayMode,
    setOceanGroupId,
    setOceanGroupLocked,
    setSprintTeamId,
    setSprintTeamLocked,
    setSprintTeamStageId,
  } = useAppStore(
    useShallow((state) => ({
      user: state.user,
      isAuthenticated: state.isAuthenticated,
      answers: state.answers,
      mqttConnected: state.mqttConnected,
      oceanPlayMode: state.oceanPlayMode,
      oceanGroupId: state.oceanGroupId,
      oceanGroupLocked: state.oceanGroupLocked,
      sprintTeamId: state.sprintTeamId,
      setOceanPlayMode: state.setOceanPlayMode,
      setOceanGroupId: state.setOceanGroupId,
      setOceanGroupLocked: state.setOceanGroupLocked,
      setSprintTeamId: state.setSprintTeamId,
      setSprintTeamLocked: state.setSprintTeamLocked,
      setSprintTeamStageId: state.setSprintTeamStageId,
    }))
  );

  const { state, controls, meta } = useQuizRuntime(mode);
  const isQaMode = isQaVariantMode(meta.id);
  const isLastStandMode = meta.id === "last-stand" || meta.id === "last-stand-group";
  const shouldEnforceLastStandElimination = true;
  const shouldSyncLastStandStatus = true;
  const isGroupedLastStand = meta.id === "last-stand-group";
  const ultimateBuzzMode = isUltimateBuzzMode(meta.id);
  const isBuzzerSprintMode = meta.id === "buzzer-sprint";
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
    clearScoreRecord,
    refreshScoreRecord,
    oceanRemainingCount,
    oceanStageConfig,
    oceanStageConfigStatus,
    oceanStageConfigError,
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
      clearScoreRecord: storeState.clearScoreRecord,
      refreshScoreRecord: storeState.refreshScoreRecord,
      oceanRemainingCount: storeState.oceanRemainingCount,
      oceanStageConfig: storeState.oceanStageConfig,
      oceanStageConfigStatus: storeState.oceanStageConfigStatus,
      oceanStageConfigError: storeState.oceanStageConfigError,
      questionLoadStatus: storeState.questionLoadStatus,
      questionLoadAttempts: storeState.questionLoadAttempts,
      questionLoadError: storeState.questionLoadError,
      questionGateOpened: storeState.questionGateOpened,
      waitingForStageStart: storeState.waitingForStageStart,
    }))
  );
  const [selected, setSelected] = useState<string | string[] | null>(null);
  const [matchingPairs, setMatchingPairs] = useState<string[]>([]);
  const [canBuzz, setCanBuzz] = useState(() => !isUltimateBuzzMode(meta.id));
  const [sprintTeamDialogOpen, setSprintTeamDialogOpen] = useState(false);
  const resolvedOceanMode = oceanStageConfig?.mode ?? null;
  const oceanModeLabel = useMemo(
    () => getOceanPlayModeLabel(resolvedOceanMode),
    [resolvedOceanMode]
  );
  const oceanGroupLabel = useMemo(
    () => getOceanGroupLabel(oceanGroupId),
    [oceanGroupId]
  );
  const sprintTeamLabel = useMemo(
    () => getOceanGroupLabel(sprintTeamId),
    [sprintTeamId]
  );
  const progressUserLabel = useMemo(() => {
    if (meta.id === "ocean-adventure") {
      if (resolvedOceanMode === "solo") {
        return oceanModeLabel ?? "个人模式";
      }
      if (resolvedOceanMode === "group") {
        return oceanGroupLabel ?? "团队模式";
      }
      if (oceanStageConfigStatus === "loading" || oceanStageConfigStatus === "idle") {
        return "模式加载中";
      }
      if (oceanStageConfigStatus === "error") {
        return "配置异常";
      }
      return "未获取模式";
    }
    if (isBuzzerSprintMode) {
      return sprintTeamLabel ?? "未选队伍";
    }
    return teamProfile?.displayName ?? user?.name ?? null;
  }, [
    isBuzzerSprintMode,
    meta.id,
    oceanGroupLabel,
    oceanModeLabel,
    oceanStageConfigStatus,
    resolvedOceanMode,
    sprintTeamLabel,
    teamProfile?.displayName,
    user?.name,
  ]);
  const controlMessage = useMqttSubscription(
    MQTT_TOPICS.control,
    ultimateBuzzMode
  );
  const resultMessage = useMqttSubscription(
    MQTT_TOPICS.result,
    ultimateBuzzMode
  );
  const shouldHandleSubmitCommand =
    isQaMode || isLastStandMode || ultimateBuzzMode;
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
  const sprintTeamAutoPromptedEntryRef = useRef<string | null>(null);
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
  const [showPersistenceDetails, setShowPersistenceDetails] = useState(false);
  const [ultimatePkTeam, setUltimatePkTeam] = useState<"affirmative" | "negative">("affirmative");
  const [ultimatePkStageLocked, setUltimatePkStageLocked] = useState(true);
  const [ultimatePkThrottleActive, setUltimatePkThrottleActive] = useState(false);
  const [ultimatePkSending, setUltimatePkSending] = useState(false);
  const ultimatePkThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { stats: persistenceStats, enqueueJob, retryFailures, removeFailedJob } = useQuizPersistenceQueue({
    submitAnswerChoice,
    submitJudgeResult,
  });

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

  useEffect(() => {
    if (!storeHydrated) {
      return;
    }
    if (!isAuthenticated) {
      Toast.info("请先登录",500);
      router.replace("/login");
    }
  }, [isAuthenticated, router, storeHydrated]);

  useEffect(() => {
    return () => {
      clearUltimatePkThrottle();
    };
  }, [clearUltimatePkThrottle]);

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
    if (!ultimateBuzzMode) {
      setLockedWinnerId(null);
    }
  }, [ultimateBuzzMode]);

  useEffect(() => {
    if (!shouldSyncLastStandStatus) return;
    if (!isLastStandMode) return;
    const recoverControl = controls.recoverHp;
    if (!recoverControl) return;
    if (!currentStage || !scoreRecord) return;
    const recordId = scoreRecord.recordId;
    if (!recordId) return;

    const statusFieldKey = resolveStatusFieldKey(scoreRecord.fields);
    if (!statusFieldKey) return;

    const syncedHp = resolveLastStandHpFromStatus({
      rawStatus: scoreRecord.fields?.[statusFieldKey],
      initialHp: meta.features.initialHp ?? 0,
      isGroupedLastStand,
      stageName: currentStage.name,
    });
    if (syncedHp === undefined) return;

    const cacheKey = `${recordId}:${statusFieldKey}:${syncedHp}:${isGroupedLastStand ? "group" : "classic"}`;
    if (statusInitRef.current === cacheKey) return;

    recoverControl(syncedHp);
    statusInitRef.current = cacheKey;
  }, [
    controls.recoverHp,
    currentStage,
    isGroupedLastStand,
    isLastStandMode,
    meta.features.initialHp,
    scoreRecord,
    shouldSyncLastStandStatus,
  ]);

  const question = state.question;
  const ultimateStage =
    ultimateBuzzMode
      ? state.phase ?? (question ? "buzz" : "waiting")
      : undefined;
  const showQuestionLoading =
    !isUltimatePkMode && meta.questionFlow === "push" && !questionGateOpened;
  const sprintTeamSelectionAvailable =
    isBuzzerSprintMode &&
    !canBuzz &&
    ((showQuestionLoading && questionLoadStatus === "success") ||
      (!showQuestionLoading && ultimateBuzzMode && ultimateStage === "waiting" && !question));
  const sprintTeamActionLabel = sprintTeamId ? "切换当前队伍" : "选择当前队伍";
  const applySprintTeamSelection = useCallback(
    (teamId: OceanGroupId) => {
      setSprintTeamId(teamId);
      setSprintTeamLocked(true);
      setSprintTeamStageId(currentStage?.stageId ?? null);
    },
    [currentStage?.stageId, setSprintTeamId, setSprintTeamLocked, setSprintTeamStageId]
  );
  const openSprintTeamDialog = useCallback(async () => {
    if (!isBuzzerSprintMode || sprintTeamDialogOpen) return;
    setSprintTeamDialogOpen(true);
    try {
      const selectedTeamId = await promptSprintTeamSelection();
      if (selectedTeamId) {
        applySprintTeamSelection(selectedTeamId);
      }
    } finally {
      setSprintTeamDialogOpen(false);
    }
  }, [applySprintTeamSelection, isBuzzerSprintMode, sprintTeamDialogOpen]);
  const handleSprintTeamSwitch = useCallback(() => {
    if (!sprintTeamSelectionAvailable) return;
    void openSprintTeamDialog();
  }, [openSprintTeamDialog, sprintTeamSelectionAvailable]);

  useEffect(() => {
    if (!isBuzzerSprintMode) {
      sprintTeamAutoPromptedEntryRef.current = null;
      return;
    }
    if (!sprintTeamSelectionAvailable || sprintTeamId) {
      return;
    }
    const entryKey =
      sprintEntryKey ??
      (currentStage?.stageId ? `${currentStage.stageId}:${questionLoadStatus}` : null);
    if (!entryKey || sprintTeamAutoPromptedEntryRef.current === entryKey) {
      return;
    }
    sprintTeamAutoPromptedEntryRef.current = entryKey;
    void openSprintTeamDialog();
  }, [
    currentStage?.stageId,
    isBuzzerSprintMode,
    openSprintTeamDialog,
    questionLoadStatus,
    sprintEntryKey,
    sprintTeamId,
    sprintTeamSelectionAvailable,
  ]);

  useEffect(() => {
    if (!isBuzzerSprintMode || !currentStage?.scoreSheetId) {
      return;
    }
    if (!sprintTeamId) {
      clearScoreRecord();
      return;
    }
    void refreshScoreRecord(currentStage.scoreSheetId, sprintTeamId, {
      fieldKeys: ["team_id"],
      allowAnyFieldFallback: false,
    }).catch((error) => {
      console.warn("Failed to refresh sprint score record", error);
    });
  }, [
    clearScoreRecord,
    currentStage?.scoreSheetId,
    isBuzzerSprintMode,
    refreshScoreRecord,
    sprintTeamId,
  ]);

  const handleOceanGroupSelect = useCallback(
    (groupId: OceanGroupId) => {
      if (
        meta.id !== "ocean-adventure" ||
        oceanGroupLocked ||
        resolvedOceanMode !== "group"
      ) {
        return;
      }
      setOceanGroupId(groupId);
    },
    [meta.id, oceanGroupLocked, resolvedOceanMode, setOceanGroupId]
  );

  useEffect(() => {
    if (meta.id !== "ocean-adventure") {
      if (oceanPlayMode !== null) {
        setOceanPlayMode(null);
      }
      return;
    }

    if (oceanStageConfigStatus !== "success" || !oceanStageConfig) {
      if (oceanPlayMode !== null) {
        setOceanPlayMode(null);
      }
      return;
    }

    if (oceanPlayMode !== oceanStageConfig.mode) {
      setOceanPlayMode(oceanStageConfig.mode);
    }

    if (oceanStageConfig.mode === "solo" && oceanGroupId !== null) {
      setOceanGroupId(null);
    }
  }, [
    meta.id,
    oceanGroupId,
    oceanPlayMode,
    oceanStageConfig,
    oceanStageConfigStatus,
    setOceanGroupId,
    setOceanPlayMode,
  ]);

  useEffect(() => {
    if (meta.id !== "ocean-adventure") {
      return;
    }
    const shouldUnlock =
      waitingForStageStart &&
      !question &&
      normalizedQuestions.length === 0 &&
      oceanGroupLocked;
    if (shouldUnlock) {
      setOceanGroupLocked(false);
    }
  }, [
    meta.id,
    normalizedQuestions.length,
    oceanGroupLocked,
    question,
    setOceanGroupLocked,
    waitingForStageStart,
  ]);

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
    if (!ultimateBuzzMode) {
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
  }, [questionId, ultimateBuzzMode]);


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
    if (isOceanGroupId(lockedWinnerId)) return null;
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
    return resolveUltimateBuzzerWinnerLabel(
      lockedWinnerId,
      lockedWinnerProfile?.displayName
    );
  }, [lockedWinnerId, lockedWinnerProfile?.displayName]);

  useEffect(() => {
    if (!lockedWinnerId) return;
    if (isOceanGroupId(lockedWinnerId)) return;
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

  useEffect(() => {
    if (ultimateStage !== "locked") {
      setLockedWinnerId(null);
    }
  }, [ultimateStage]);

  useEffect(() => {
    if (!ultimateBuzzMode) {
      setCanBuzz(true);
      return;
    }
    setCanBuzz(false);
  }, [questionId, ultimateBuzzMode, ultimateStage]);

  useEffect(() => {
    if (!controlMessage || !ultimateBuzzMode) return;

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
  }, [controlMessage, questionId, ultimateBuzzMode, ultimateStage]);

  useEffect(() => {
    if (!resultMessage || !ultimateBuzzMode) return;
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
    const isSelfWinner = isUltimateBuzzerWinnerSelf({
      modeId: meta.id,
      winnerId,
      userId: currentUserId,
      sprintTeamId,
    });
    const buzzerIdentity = resolveUltimateBuzzerIdentity({
      modeId: meta.id,
      userId: currentUserId,
      sprintTeamId,
    });
    if (isSelfWinner && buzzerIdentity) {
      if (!delegateAnswerToControl) {
        Toast.warn("当前不可进入作答阶段");
        return;
      }
      delegateAnswerToControl(buzzerIdentity, { isSelf: true });
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
    sprintTeamId,
    ultimateStage,
    user?.id,
    ultimateBuzzMode,
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

  const isEliminated =
    shouldEnforceLastStandElimination &&
    isLastStandMode &&
    (state.hp ?? meta.features.initialHp ?? 0) <= 0;

  const oceanRemainingDisplay =
    meta.id === "ocean-adventure"
      ? Math.max(
          0,
          typeof oceanRemainingCount === "number" && Number.isFinite(oceanRemainingCount)
            ? Math.floor(oceanRemainingCount)
            : oceanStageConfig?.questionCount ?? DEFAULT_OCEAN_REMAINING_COUNT
        )
      : null;
  const oceanConfigReady =
    meta.id === "ocean-adventure" &&
    oceanStageConfigStatus === "success" &&
    !!oceanStageConfig;
  const oceanModeRequiresGroupSelection = oceanConfigReady && resolvedOceanMode === "group";
  const oceanConfigSummary = oceanConfigReady
    ? `共 ${oceanStageConfig?.questionCount ?? 0} 题，全局倒计时 ${formatSeconds(
        oceanStageConfig?.timeLimitSeconds
      )}。`
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
    if (!ultimateBuzzMode) {
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
  }, [meta.features.requiresBuzzer, state.awaitingHost, ultimateBuzzMode, ultimateStage]);

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

  const handleOceanStatsPatch = useCallback(
    (
      patch: {
        total?: number;
        correct?: number;
        wrong?: number;
        score?: number;
        accuracy?: number;
        lastAnswerTime?: number;
      },
      options?: { finished?: boolean }
    ) => {
      setOceanStats((prev) => ({
        total: patch.total ?? prev?.total,
        correct: patch.correct ?? prev?.correct,
        wrong: patch.wrong ?? prev?.wrong,
        accuracy: patch.accuracy ?? prev?.accuracy,
        lastAnswerTime: patch.lastAnswerTime ?? prev?.lastAnswerTime,
        score: patch.score ?? prev?.score,
      }));
      setOceanStatsError(null);
      if (options?.finished) {
        setOceanStatsStatus("success");
      }
    },
    []
  );

  const { isSubmitting, submit: handleSubmit } = useQuizSubmission({
    question,
    selected,
    matchingPairs,
    setMatchingPairs,
    controls,
    runtimeState: {
      answeringEnabled: state.answeringEnabled,
      questionIndex: state.questionIndex,
      timeRemaining: state.timeRemaining,
    },
    modeId: meta.id,
    normalizedQuestions,
    currentStage,
    scoreRecord,
    userId: user?.id ?? undefined,
    sprintTeamId,
    notifyOffset,
    shouldHandleSubmitCommand,
    isLastStandMode,
    isGroupedLastStand,
    shouldSyncLastStandStatus,
    enqueueJob,
    onCommandSubmissionStateChange: ({
      locked,
      overlayVisible,
      answerRevealActive,
    }) => {
      setCommandSubmissionLocked(locked);
      setCommandSubmissionOverlayVisible(overlayVisible);
      if (typeof answerRevealActive === "boolean") {
        setAnswerRevealActive(answerRevealActive);
      }
    },
    onOceanStatsPatch: handleOceanStatsPatch,
  });

  const handleRetractCommand = useCallback(async () => {
    if (retractHandlingRef.current) return;
    if (!shouldSyncLastStandStatus) return;
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
    shouldSyncLastStandStatus,
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
      if (ultimateBuzzMode) {
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
    question,
    resetUltimateRoundControl,
    shouldHandleSubmitCommand,
    ultimateBuzzMode,
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
    const buzzerIdentity = resolveUltimateBuzzerIdentity({
      modeId: meta.id,
      userId: user?.id ? String(user.id) : null,
      sprintTeamId,
    });
    if (!buzzerIdentity) {
      Toast.warn(
        isBuzzerSprintMode ? "请先确认当前代表队伍" : "选手信息缺失，无法抢答"
      );
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

    const payload = JSON.stringify({ player_id: buzzerIdentity });
    try {
      mqttService.publish(MQTT_TOPICS.buzzIn, payload, { qos: 1 });
      triggerBuzzerControl();
      setCanBuzz(false);
    } catch (error) {
      console.error("Failed to publish buzz-in message", error);
      Toast.error("抢答请求发送失败");
    }
  };

  const sprintTeamBadge = isBuzzerSprintMode ? (
    <div
      className={[
        styles.ultimateTeamBadge,
        sprintTeamId === "red" ? styles.ultimateTeamBadgeRed : "",
        sprintTeamId === "blue" ? styles.ultimateTeamBadgeBlue : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {sprintTeamLabel ?? "未选队伍"}
    </div>
  ) : null;

  const sprintTeamSelectionPanel =
    isBuzzerSprintMode && sprintTeamSelectionAvailable ? (
      <div className={styles.sprintTeamSelectionPanel}>
        <button
          type="button"
          className={styles.sprintTeamActionButton}
          onClick={handleSprintTeamSwitch}
          disabled={sprintTeamDialogOpen}
        >
          {sprintTeamActionLabel}
        </button>
      </div>
    ) : null;

  const renderQuestionContent = () => {
    const shouldShowCommandOverlay =
      isCommandSubmissionLocked && isCommandSubmissionOverlayVisible;
    const questionIllustrationNode = hasQuestionImages ? (
      <QuestionImageGallery entries={questionImageEntries} />
    ) : null;
    if (isUltimatePkMode) {
      return (
        <UltimatePkPanel
          team={ultimatePkTeam}
          stageLocked={ultimatePkStageLocked}
          throttleActive={ultimatePkThrottleActive}
          sending={ultimatePkSending}
          onTeamSelect={handleUltimatePkTeamSelect}
          onSwitch={handleUltimatePkSwitch}
        />
      );
    }

    if (meta.id === "speed-run" && isSpeedRunFinished) {
      return (
        <SpeedRunResultPanel
          isTimerExpired={isSpeedRunTimerExpired}
          isCompleted={isSpeedRunCompleted}
          total={speedRunTotal}
          answered={speedRunAnswered}
          score={speedRunScore}
          wrong={speedRunWrong}
          unanswered={speedRunUnanswered}
          timeRemaining={state.timeRemaining}
          formatSeconds={formatSeconds}
        />
      );
    }

    if (isOceanFinished) {
      return (
        <OceanResultPanel
          scoreFields={scoreRecord?.fields}
          stats={oceanStats}
          statsStatus={oceanStatsStatus}
          statsError={oceanStatsError}
          isEliminated={isOceanEliminated}
          isTimerExpired={isOceanTimerExpired}
          isPoolExhausted={isOceanPoolExhausted}
          onRetry={handleRetryOceanStats}
        />
      );
    }

    if (isEliminated) {
      return <EliminationStatePanel />;
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
      const oceanConfigBadgeClass =
        oceanStageConfigStatus === "error"
          ? styles.statusBadgeError
          : oceanConfigReady
            ? styles.statusBadgeSuccess
            : styles.statusBadgePending;
      const oceanLoadingPrimary =
        oceanStageConfigStatus === "error"
          ? "题海配置读取失败"
          : oceanConfigReady
            ? "题库准备就绪"
            : "正在同步题海配置";
      const oceanLoadingSecondary =
        oceanStageConfigStatus === "error"
          ? "当前环节无法开始，请稍后重试"
          : oceanConfigReady
            ? "请做好准备 比赛即将开始"
            : "正在读取当前题包的题量、时长与模式";
      const oceanLoadingMeta =
        oceanStageConfigStatus === "error"
          ? oceanStageConfigError ?? "配置读取失败，主持人开始后将不会发起抢题。"
          : oceanConfigReady
            ? "等待主持人发出开始指令"
            : "配置加载完成后等待主持人发出开始指令";
      const oceanConfigSubtitle = oceanConfigReady
        ? `${oceanConfigSummary ?? ""}${
            oceanStageConfig?.loadedPresetName
              ? ` 当前题包：${oceanStageConfig.loadedPresetName}。`
              : ""
          }`
        : oceanStageConfigStatus === "error"
          ? "未能同步当前题海环节配置，开始指令会被拦截。"
          : "题海模式会自动识别个人/团队模式，无需选手手动切换。";
      const oceanHint =
        oceanStageConfigStatus === "error"
          ? oceanStageConfigError ?? "题海环节配置加载失败，当前无法开始答题。"
          : oceanStageConfigStatus === "loading" || oceanStageConfigStatus === "idle"
            ? "正在读取当前环节配置，配置完成前无法开始答题。"
            : oceanGroupLocked
              ? resolvedOceanMode === "solo"
                ? "当前已锁定为个人模式，等待题目下发。"
                : oceanGroupLabel
                  ? `当前已锁定为${oceanGroupLabel}，等待题目下发。`
                  : "当前模式已锁定，等待题目下发。"
              : resolvedOceanMode === "solo"
                ? "当前环节为个人模式，主持人开始后将直接抢题。"
                : resolvedOceanMode === "group"
                  ? oceanGroupLabel
                    ? `当前已选择${oceanGroupLabel}，开始抢题后将自动锁定。`
                    : "当前环节为团队模式，请先选择红队或蓝队。"
                  : "未获取到答题模式。";
      return (
        <div className={styles.questionLoading}>
          <div className={`${styles.statusBadge} ${oceanConfigBadgeClass}`}>
            {oceanStageConfigStatus === "error" ? (
              <ErrorBadgeIcon className={styles.statusIcon} />
            ) : (
              <SuccessCheckIcon className={styles.statusIcon} />
            )}
          </div>
          <div className={styles.loadingTexts}>
            <p className={styles.loadingPrimary}>{oceanLoadingPrimary}</p>
            <p className={styles.loadingSecondary}>{oceanLoadingSecondary}</p>
            <p className={styles.loadingMeta}>{oceanLoadingMeta}</p>
          </div>
          <div className={styles.oceanGroupCard}>
            <div className={styles.oceanGroupHeader}>
              <p className={styles.oceanGroupTitle}>
                {oceanConfigReady
                  ? `当前答题模式：${oceanModeLabel ?? "未知模式"}`
                  : "当前环节信息"}
              </p>
              <p className={styles.oceanGroupSubtitle}>{oceanConfigSubtitle}</p>
            </div>
            {oceanModeRequiresGroupSelection ? (
              <>
                <div className={styles.oceanGroupDivider} />
                <div className={styles.oceanGroupHeader}>
                  <p className={styles.oceanGroupTitle}>请选择团队队伍</p>
                  <p className={styles.oceanGroupSubtitle}>
                    只有团队模式才需要选择红队或蓝队。
                  </p>
                </div>
                <div
                  className={styles.oceanGroupSelector}
                  role="radiogroup"
                  aria-label="请选择红队或蓝队"
                >
                  <button
                    type="button"
                    className={[
                      styles.oceanGroupButton,
                      styles.oceanGroupButtonRed,
                      oceanGroupId === "red" ? styles.oceanGroupButtonActive : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleOceanGroupSelect("red")}
                    disabled={oceanGroupLocked}
                    aria-pressed={oceanGroupId === "red"}
                  >
                    红队
                  </button>
                  <button
                    type="button"
                    className={[
                      styles.oceanGroupButton,
                      styles.oceanGroupButtonBlue,
                      oceanGroupId === "blue" ? styles.oceanGroupButtonActive : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleOceanGroupSelect("blue")}
                    disabled={oceanGroupLocked}
                    aria-pressed={oceanGroupId === "blue"}
                  >
                    蓝队
                  </button>
                </div>
              </>
            ) : null}
            <p className={styles.oceanGroupHint}>{oceanHint}</p>
          </div>
        </div>
      );
    }

    if (ultimateBuzzMode) {
      if (!question && ultimateStage === "waiting") {
        return (
          <div className={styles.emptyState}>
            {sprintTeamSelectionPanel}
            <div className={`${styles.statusBadge} ${styles.statusBadgeSuccess}`}>
              <SuccessCheckIcon className={styles.statusIcon} />
            </div>
            <p className={styles.emptyTitle}>等待主持人推送题目</p>
            <p className={styles.emptyDesc}>
              {isBuzzerSprintMode && sprintTeamId
                ? `当前已锁定为${sprintTeamLabel ?? "所选队伍"}，抢答阶段即将开始，请留意主持人指令。`
                : isBuzzerSprintMode
                ? "请先确认当前代表队伍，主持人开启抢答前可随时切换。"
                : "抢答阶段即将开始，请留意主持人指令。"}
            </p>
          </div>
        );
      }

      if (ultimateStage === "buzz") {
        return (
          <div className={styles.ultimateWrapper}>
            {sprintTeamBadge}
            <Button
              type="primary"
              className={styles.ultimateBuzzer}
              onClick={handleTriggerBuzzer}
              disabled={!triggerBuzzerControl || !canBuzz}
              needActive
            >
              <span className={styles.ultimateBuzzerText}>抢答</span>
            </Button>
            <p className={styles.ultimateHint}>
              {isBuzzerSprintMode && sprintTeamLabel
                ? `当前代表${sprintTeamLabel}抢答，抢答成功后将默认由本队作答。`
                : "抢答成功后将默认由本队作答。"}
            </p>
          </div>
        );
      }

      if (ultimateStage === "locked") {
        return (
          <div className={styles.ultimateWrapper}>
            {sprintTeamBadge}
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
            {sprintTeamBadge}
            <p className={styles.emptyTitle}>等待决策结果</p>
            <p className={styles.emptyDesc}>请保持在线，随时准备进入下一题。</p>
          </div>
        );
      }

      if (ultimateStage !== "answer") {
        if (isCommandSubmissionLocked) {
          return <CommandSubmissionResult />;
        }
        return (
          <div className={styles.ultimateWrapper}>
            {sprintTeamBadge}
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
    return (
      <QuestionRenderer
        question={question}
        questionTags={questionTags}
        answerBadgeText={answerBadgeText}
        selectionSummary={selectionSummary}
        isImageQuestion={isImageQuestion}
        illustrationNode={questionIllustrationNode}
        shouldShowCommandOverlay={shouldShowCommandOverlay}
        isWordbankQuestion={isWordbankQuestion}
        wordbankTemplate={wordbankTemplate}
        wordbankOptionLabelMap={wordbankOptionLabelMap}
        wordbankValues={wordbankValues}
        wordbankActiveIndex={wordbankActiveIndex}
        onWordbankBlankClick={handleWordbankBlankClick}
        onWordbankClear={handleWordbankClear}
        isMatchingQuestion={isMatchingQuestion}
        matchingPrompt={matchingConfig?.prompt}
        matchingPairsCount={matchingPairs.length}
        onClearMatchingPairs={handleClearMatchingPairs}
        isPointSelectQuestion={isPointSelectQuestion}
        pointSelectValues={pointSelectValues}
        pointSelectDisplayTokens={pointSelectDisplayTokens}
        onPointSelectClear={handlePointSelectClear}
        standardOptionsProps={
          isStandardQuestion(question)
            ? {
                question,
                selected,
                isAnswerRevealActive,
                answeringEnabled: state.answeringEnabled,
                isCommandSubmissionLocked,
                activeMatchingLeft,
                matchingSelectionMap,
                matchingRightToLeftMap,
                matchingUsedRightIds,
                matchingOverlaySize,
                matchingLines,
                matchingBoardRef,
                onSelect: handleSelect,
                onToggleMultiOption: toggleMultiOption,
                onMatchingLeftClick: handleMatchingLeftClick,
                onMatchingRightClick: handleMatchingRightClick,
                wordbankUsedValues,
                wordbankActiveIndex,
                wordbankValues,
                onWordbankSelectOption: handleWordbankSelectOption,
                pointSelectSelectedSet,
                onPointSelectOption: handlePointSelectOption,
                fillPreview,
                boardSubmitted,
                isBoardOpen,
                isBoardUploading,
                onOpenBoard: handleOpenBoard,
              }
            : undefined
        }
        oceanOptionsProps={
          isOceanQuestion(question)
            ? {
                question,
                selected,
                setSelected,
                answeringEnabled: state.answeringEnabled,
                isCommandSubmissionLocked,
                isAnswerRevealActive,
              }
            : undefined
        }
      />
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
  const submitLabel =
    meta.id === "speed-run"
      ? "提交并进入下一题"
      : meta.id === "ocean-adventure"
      ? "提交并抢下一题"
      : isQaMode || isLastStandMode
      ? "提交等待主持人"
      : ultimateBuzzMode
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
          <QuizSyncQueuePanel
            pending={persistenceStats.pending}
            failed={persistenceStats.failed}
            failedItems={persistenceStats.failedItems}
            showDetails={showPersistenceDetails}
            onToggleDetails={() => setShowPersistenceDetails((prev) => !prev)}
            onRetry={retryFailures}
            onDeleteFailedItem={removeFailedJob}
          />
          {!isUltimatePkMode ? (
            <QuizProgressCard
              hasQuestion={hasQuestion}
              isOceanAdventure={meta.id === "ocean-adventure"}
              oceanRemainingDisplay={oceanRemainingDisplay}
              defaultOceanRemainingCount={
                oceanStageConfig?.questionCount ?? DEFAULT_OCEAN_REMAINING_COUNT
              }
              showProgress={showProgress}
              totalQuestions={totalQuestions}
              questionOrdinal={questionOrdinal}
              progressValue={progressValue}
              timeRemaining={state.timeRemaining}
              hpDisplay={hpDisplay}
              buzzerStatusLabel={buzzerStatusLabel}
              progressUserLabel={progressUserLabel}
              oceanPlayMode={resolvedOceanMode}
              highlightTeamId={
                meta.id === "ocean-adventure" && resolvedOceanMode === "group"
                  ? oceanGroupId
                  : isBuzzerSprintMode
                  ? sprintTeamId
                  : null
              }
              formatSeconds={formatSeconds}
            />
          ) : null}

          <section
            className={
              isUltimatePkMode ? `${styles.questionCard} ${styles.ultimatePkCard}` : styles.questionCard
            }
          >
            {showQuestionLoading ? (
              <QuestionLoadingState
                status={questionLoadStatus}
                attempts={questionLoadAttempts}
                error={questionLoadError}
                questionCount={normalizedQuestions.length}
                topSlot={questionLoadStatus === "success" ? sprintTeamSelectionPanel : undefined}
              />
            ) : renderQuestionContent()}
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
