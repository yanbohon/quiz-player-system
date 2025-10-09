import { useCallback, useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { MQTT_CONFIG, MQTT_TOPICS } from "@/config/control";
import { Toast } from "@/lib/arco";
import { useMqtt } from "@/lib/mqtt/hooks";
import type { MqttConfig } from "@/lib/mqtt/client";
import { useAppStore } from "@/store/useAppStore";
import { useQuizStore } from "@/store/quizStore";

const HEARTBEAT_INTERVAL = 45_000;
const WILL_DELAY_SECONDS = 30;

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
    setCurrentQuestionIndex,
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
      setCurrentQuestionIndex: state.setCurrentQuestionIndex,
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
      keepalive: 5,
      connectTimeout: 5 * 1000,
      reconnectPeriod: 1000,
      will: {
        topic: stateTopic,
        payload: "offline",
        qos: 0,
        retain: true,
        properties: {
          willDelayInterval: WILL_DELAY_SECONDS,
        },
      },
    };
  }, [clientId, enabled, stateTopic]);
  const { isConnected, error, subscribe, publish } = useMqtt(mqttConfig);

  const publishRef = useRef(publish);
  useEffect(() => {
    publishRef.current = publish;
  }, [publish]);

  const hasAnnouncedOnlineRef = useRef(false);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
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
      const publishFn = publishRef.current;
      if (!publishFn) return;
      try {
        publishFn(stateTopic, status, { qos: 0, retain: true });
        if (status === "online") {
          hasAnnouncedOnlineRef.current = true;
        }
      } catch (err) {
        console.warn("Failed to publish presence payload:", err);
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
          Toast.success(`环节 ${stageId} 已启动`);
        } catch (err) {
          console.error("处理环节启动失败", err);
          Toast.error("环节启动失败");
        }
        return;
      }

      if (
        command.toLowerCase() === "start" &&
        currentStage?.kind === "grab" &&
        waitingForStageStart &&
        userId
      ) {
        try {
          await grabNextQuestion(userId);
        } catch (err) {
          console.error("题海遨游取题失败", err);
          Toast.error("获取题目失败");
        }
        return;
      }

      const questionOrdinal = parseQuestionSelectCommand(command);
      if (questionOrdinal !== null) {
        setCurrentQuestionIndex(questionOrdinal);
        Toast.success(`已切换到题目 ${questionOrdinal + 1}`);
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
