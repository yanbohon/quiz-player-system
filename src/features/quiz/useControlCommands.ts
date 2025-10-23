"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { CONTEST_MODES } from "@/features/quiz/modes";
import type { ContestModeId } from "@/features/quiz/types";
import { MQTT_CONFIG, MQTT_TOPICS } from "@/config/control";
import { Toast } from "@/lib/arco";
import { ApiError } from "@/lib/api/client";
import { useMqtt } from "@/lib/mqtt/hooks";
import { mqttService } from "@/lib/mqtt/client";
import type { MqttConfig } from "@/lib/mqtt/client";
import { useAppStore } from "@/store/useAppStore";
import { useQuizStore } from "@/store/quizStore";

const HEARTBEAT_INTERVAL = 45_000;
const WILL_DELAY_SECONDS = 0;

type QuizStage = ReturnType<typeof useQuizStore.getState>["currentStage"];
type StageRawFields = NonNullable<QuizStage>["rawFields"];

const MODE_FIELD_KEYS = [
  "模式",
  "Mode",
  "mode",
  "模式ID",
  "ModeId",
  "modeId",
  "答题模式",
  "答题模式ID",
  "答题模式Id",
];

const MODE_ALIAS_MAP: Record<string, ContestModeId> = {
  qa: "qa",
  "有问必答": "qa",
  问答: "qa",
  "问答赛": "qa",
  "last-stand": "last-stand",
  laststand: "last-stand",
  "一站到底": "last-stand",
  "1v1": "last-stand",
  "speed-run": "speed-run",
  speedrun: "speed-run",
  "争分夺秒": "speed-run",
  "速答": "speed-run",
  "冲刺": "speed-run",
  "ocean-adventure": "ocean-adventure",
  oceanadventure: "ocean-adventure",
  "题海遨游": "ocean-adventure",
  题海: "ocean-adventure",
  "ultimate-challenge": "ultimate-challenge",
  ultimate: "ultimate-challenge",
  "终极挑战": "ultimate-challenge",
};

const MODE_IDS = new Set(Object.keys(CONTEST_MODES));

function resolveModeAlias(candidate: unknown): ContestModeId | undefined {
  if (typeof candidate !== "string") return undefined;
  const trimmed = candidate.trim();
  if (!trimmed) return undefined;

  if (MODE_IDS.has(trimmed)) {
    return trimmed as ContestModeId;
  }

  const direct = MODE_ALIAS_MAP[trimmed];
  if (direct) return direct;

  const lower = trimmed.toLowerCase();
  if (MODE_IDS.has(lower)) {
    return lower as ContestModeId;
  }

  const compact = lower.replace(/\s+/g, "");
  const compactMatch = MODE_ALIAS_MAP[compact];
  if (compactMatch) return compactMatch;

  return MODE_ALIAS_MAP[lower];
}

function resolveModeFromRaw(rawFields: StageRawFields | undefined): ContestModeId | undefined {
  if (!rawFields || typeof rawFields !== "object") return undefined;
  for (const key of MODE_FIELD_KEYS) {
    const value = (rawFields as Record<string, unknown>)[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        const resolved = resolveModeAlias(item);
        if (resolved) return resolved;
      }
    } else {
      const resolved = resolveModeAlias(value);
      if (resolved) return resolved;
    }
  }
  return undefined;
}

export function resolveModeForStage(stage: QuizStage): ContestModeId | undefined {
  if (!stage) return undefined;

  const rawMode = resolveModeFromRaw(stage.rawFields);
  if (rawMode) return rawMode;

  const aliasFromName = resolveModeAlias(stage.name);
  if (aliasFromName) return aliasFromName;

  const name = stage.name?.trim().toLowerCase() ?? "";
  if (!name) {
    if (stage.kind === "grab") return "ocean-adventure";
    return undefined;
  }

  if (name.includes("题海")) {
    return "ocean-adventure";
  }

  if (name.includes("终极")) {
    return "ultimate-challenge";
  }

  if (name.includes("争分") || name.includes("速答") || name.includes("冲刺")) {
    return "speed-run";
  }

  if (name.includes("一站")) {
    return "last-stand";
  }

  if (stage.kind === "grab") {
    return "ocean-adventure";
  }

  if (stage.kind === "standard") {
    return "qa";
  }

  return undefined;
}

function parseRaceCommand(command: string): number | null {
  const match = /^race-(\d+)$/i.exec(command);
  if (!match) return null;
  const ordinal = Number.parseInt(match[1], 10);
  if (Number.isNaN(ordinal) || ordinal <= 0) return null;
  return ordinal - 1;
}

function parseStageStartCommand(command: string): string | null {
  const match = /^(\d+)-start$/i.exec(command);
  if (!match) return null;
  return match[1];
}

function parseQuestionSelectCommand(command: string): number | null {
  const trimmed = command.trim();
  const match = /^(?:q(?:uestion)?)[-\s]?(\d+)$/i.exec(trimmed) ?? /^([0-9]+)$/.exec(trimmed);
  if (!match) return null;
  const ordinal = Number.parseInt(match[1], 10);
  if (Number.isNaN(ordinal) || ordinal <= 0) return null;
  return ordinal - 1;
}

export function useControlCommands(enabled: boolean, clientId?: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentModeParam = useMemo(() => searchParams.get("mode") ?? undefined, [searchParams]);
  const userId = useAppStore((state) => state.user?.id);

  const {
    events,
    loadEvents,
    selectEventByOrdinal,
    activateStageById,
    grabNextQuestion,
    logCommand,
    currentStage,
    waitingForStageStart,
    setWaitingForStageStart,
    setCurrentQuestionIndex,
    reset: resetQuizStore,
  } = useQuizStore(
    useShallow((state) => ({
      events: state.events,
      loadEvents: state.loadEvents,
      selectEventByOrdinal: state.selectEventByOrdinal,
      activateStageById: state.activateStageById,
      grabNextQuestion: state.grabNextQuestion,
      logCommand: state.logCommand,
      currentStage: state.currentStage,
      waitingForStageStart: state.waitingForStageStart,
      setWaitingForStageStart: state.setWaitingForStageStart,
      setCurrentQuestionIndex: state.setCurrentQuestionIndex,
      reset: state.reset,
    }))
  );

  const stateTopic = useMemo(
    () => (clientId ? MQTT_TOPICS.stateForClient(clientId) : undefined),
    [clientId]
  );

  const tabIdRef = useRef<string>("");
  if (!tabIdRef.current) {
    tabIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
  }

  const mqttConfig = useMemo<MqttConfig | undefined>(() => {
    if (!enabled || !clientId || !MQTT_CONFIG?.url || !stateTopic) {
      return undefined;
    }
    return {
      ...MQTT_CONFIG,
      url: MQTT_CONFIG.url,
      clientId,
      clean: false,
      keepalive: 1,
      connectTimeout: 5 * 1000,
      reconnectPeriod: 1000,
      will: {
        topic: stateTopic,
        payload: "offline",
        qos: 0,
        retain: true,
        properties:
          WILL_DELAY_SECONDS > 0
            ? {
                willDelayInterval: WILL_DELAY_SECONDS,
              }
            : undefined,
      },
    };
  }, [clientId, enabled, stateTopic]);
  const { isConnected, error, subscribe } = useMqtt(mqttConfig);

  const hasAnnouncedOnlineRef = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cleanupPendingRef = useRef(false);

  // Log MQTT connection status
  useEffect(() => {
    if (error) {
      console.warn("MQTT connection error - app will continue without real-time commands:", error.message);
    }
  }, [error]);

  useEffect(() => {
    if (!enabled || !isConnected) return;
    if (events.length > 0) return;
    loadEvents().catch((err) => {
      console.error("加载赛事列表失败", err);
      Toast.error("赛事列表获取失败");
    });
  }, [enabled, isConnected, events.length, loadEvents]);

  useEffect(() => {
    if (!isConnected) {
      hasAnnouncedOnlineRef.current = false;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    }
  }, [isConnected]);

  const publishPresence = useCallback(
    (status: "online" | "offline") => {
      if (!stateTopic || !clientId) return;
      if (!mqttService.isConnected()) {
        if (status === "offline") {
          hasAnnouncedOnlineRef.current = false;
        }
        return;
      }
      try {
        mqttService.publish(stateTopic, status, { qos: 0, retain: true });
        hasAnnouncedOnlineRef.current = status === "online";
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.warn(`Failed to publish ${status} presence payload:`, error);
      }
    },
    [clientId, stateTopic]
  );

  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) return;
    heartbeatRef.current = setInterval(() => {
      publishPresence("online");
    }, HEARTBEAT_INTERVAL);
  }, [publishPresence]);

  const stopHeartbeat = useCallback(() => {
    if (!heartbeatRef.current) return;
    clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
  }, []);

  useEffect(() => {
    if (!clientId || !isConnected || !stateTopic) return;

    const unsubscribe = subscribe(
      stateTopic,
      () => {
        // presence topic is retained; payload handled elsewhere
      },
      {
        qos: 0,
        onSuccess: () => {
          publishPresence("online");
          startHeartbeat();
        },
        onError: (err) => {
          console.error("状态频道订阅失败", err);
        },
      }
    );

    return () => {
      unsubscribe?.();
    };
  }, [clientId, isConnected, publishPresence, startHeartbeat, stateTopic, subscribe]);

  const handleCommand = useCallback(
    async (payload: string) => {
      const command = payload.trim();
      if (!command) return;
      logCommand(command);

      if (command.toLowerCase() === "refresh") {
        const appStore = useAppStore.getState();
        resetQuizStore();
        appStore.logout();
        appStore.setMqttConnected(false);
        Toast.success("选手端已重置");
        if (pathname !== "/waiting") {
          router.push("/waiting");
        } else {
          router.refresh();
        }
        return;
      }

      if (command.toLowerCase() === "home") {
        if (pathname !== "/waiting") {
          router.push("/waiting");
        }
        return;
      }

      const raceOrdinal = parseRaceCommand(command);
      if (raceOrdinal !== null) {
        try {
          if (!events.length) {
            await loadEvents();
          }
          await selectEventByOrdinal(raceOrdinal, userId ?? undefined);
          Toast.success(`已切换到赛事 ${raceOrdinal + 1}`);
        } catch (err) {
          console.error("处理赛事选择失败", err);
          Toast.error("赛事切换失败");
        }
        return;
      }

      const stageId = parseStageStartCommand(command);
      if (stageId && userId) {
        try {
          await activateStageById(stageId, userId);
          const stage = useQuizStore.getState().currentStage;
          const targetMode = resolveModeForStage(stage);
          const targetPath = targetMode ? `/quiz?mode=${encodeURIComponent(targetMode)}` : "/quiz";
          const onQuizPage = pathname === "/quiz";
          const sameMode =
            onQuizPage &&
            ((targetMode && currentModeParam === targetMode) ||
              (!targetMode && !currentModeParam));
          if (!sameMode) {
            router.push(targetPath);
          }
        } catch (err) {
          console.error("处理环节启动失败", err);
          Toast.error("环节启动失败");
        }
        return;
      }

      if (
        command.toLowerCase() === "pool-start" &&
        currentStage?.kind === "grab" &&
        waitingForStageStart &&
        userId
      ) {
        try {
          setWaitingForStageStart(false);
          await grabNextQuestion(userId);
        } catch (err) {
          if (
            err instanceof ApiError &&
            typeof err.message === "string" &&
            err.message.includes("题库已空")
          ) {
            return;
          }
          console.error("题海遨游取题失败", err);
          Toast.error("获取题目失败");
        }
        return;
      }

      const questionOrdinal = parseQuestionSelectCommand(command);
      if (questionOrdinal !== null) {
        setCurrentQuestionIndex(questionOrdinal);
        return;
      }
    },
    [
      activateStageById,
      currentStage?.kind,
      events.length,
      grabNextQuestion,
      loadEvents,
      logCommand,
      selectEventByOrdinal,
      setCurrentQuestionIndex,
      setWaitingForStageStart,
      pathname,
      router,
      currentModeParam,
      resetQuizStore,
      userId,
      waitingForStageStart,
    ]
  );

  useEffect(() => {
    if (!enabled || !isConnected) return;
    const unsubscribe = subscribe(MQTT_TOPICS.command, (message) => {
      void handleCommand(message);
    });

    return () => {
      unsubscribe?.();
    };
  }, [enabled, handleCommand, isConnected, subscribe]);

  useEffect(() => {
    if (!enabled || !clientId || !stateTopic || !isConnected) return undefined;

    cleanupPendingRef.current = false;

    const handleBeforeUnload = () => {
      publishPresence("offline");
      stopHeartbeat();
      hasAnnouncedOnlineRef.current = false;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      cleanupPendingRef.current = true;
      setTimeout(() => {
        if (!cleanupPendingRef.current) return;
        cleanupPendingRef.current = false;
        if (hasAnnouncedOnlineRef.current) {
          publishPresence("offline");
          stopHeartbeat();
          hasAnnouncedOnlineRef.current = false;
        }
      }, 0);
    };
  }, [clientId, enabled, isConnected, publishPresence, stateTopic, stopHeartbeat]);

  return {
    isConnected,
    error,
  };
}
