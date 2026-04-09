"use client";

import { useEffect, useLayoutEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useQuizStore } from "@/store/quizStore";

const APP_STORAGE_KEY = "app-storage";
const E2E_APP_STATE_KEY = "contestant-app:e2e-app-state";
const E2E_QUIZ_STATE_KEY = "contestant-app:e2e-quiz-state";

type AppStoreState = ReturnType<typeof useAppStore.getState>;
type QuizStoreState = ReturnType<typeof useQuizStore.getState>;

type AppStoreSeed = Partial<
  Pick<
    AppStoreState,
    | "user"
    | "isAuthenticated"
    | "oceanPlayMode"
    | "oceanGroupId"
    | "oceanGroupLocked"
    | "sprintTeamId"
    | "sprintTeamLocked"
    | "sprintTeamStageId"
    | "currentQuestionId"
    | "answers"
    | "hpPenaltyGuards"
    | "mqttConnected"
  >
>;

type QuizStoreSeed = Partial<Omit<QuizStoreState, "currentQuestion">>;

type E2EBridgeApi = {
  resetAll: () => void;
  resetAppState: () => void;
  resetQuizState: () => void;
  setAppState: (partial: AppStoreSeed) => void;
  setQuizState: (partial: QuizStoreSeed) => void;
  getAppState: () => AppStoreState;
  getQuizState: () => QuizStoreState;
};

declare global {
  interface Window {
    __E2E__?: E2EBridgeApi;
  }
}

const BASE_APP_STATE: AppStoreSeed = {
  user: null,
  isAuthenticated: false,
  oceanPlayMode: null,
  oceanGroupId: null,
  oceanGroupLocked: false,
  sprintTeamId: null,
  sprintTeamLocked: false,
  sprintTeamStageId: null,
  currentQuestionId: null,
  answers: {},
  hpPenaltyGuards: {},
  mqttConnected: false,
};

function normalizeAppSeed(seed?: AppStoreSeed): AppStoreSeed {
  const merged: AppStoreSeed = {
    ...BASE_APP_STATE,
    ...seed,
  };
  if (merged.user && seed?.isAuthenticated === undefined) {
    merged.isAuthenticated = true;
  }
  if (!merged.user) {
    merged.isAuthenticated = false;
  }
  return merged;
}

function persistAppSeed(seed: AppStoreSeed) {
  const normalized = normalizeAppSeed(seed);
  window.localStorage.setItem(E2E_APP_STATE_KEY, JSON.stringify(normalized));
  window.localStorage.setItem(
    APP_STORAGE_KEY,
    JSON.stringify({
      state: {
        user: normalized.user,
        isAuthenticated: normalized.isAuthenticated,
        oceanPlayMode: normalized.oceanPlayMode,
        oceanGroupId: normalized.oceanGroupId,
        oceanGroupLocked: normalized.oceanGroupLocked,
        sprintTeamId: normalized.sprintTeamId,
        sprintTeamLocked: normalized.sprintTeamLocked,
        sprintTeamStageId: normalized.sprintTeamStageId,
        answers: normalized.answers ?? {},
        hpPenaltyGuards: normalized.hpPenaltyGuards ?? {},
      },
      version: 0,
    })
  );
}

function clearAppSeedStorage() {
  window.localStorage.removeItem(E2E_APP_STATE_KEY);
  window.localStorage.removeItem(APP_STORAGE_KEY);
}

function persistQuizSeed(seed: QuizStoreSeed) {
  window.localStorage.setItem(E2E_QUIZ_STATE_KEY, JSON.stringify(seed));
}

function clearQuizSeedStorage() {
  window.localStorage.removeItem(E2E_QUIZ_STATE_KEY);
}

function readSeedFromStorage<T>(key: string): T | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    window.localStorage.removeItem(key);
    return undefined;
  }
}

function applySeededAppState(seed?: AppStoreSeed) {
  useAppStore.setState(normalizeAppSeed(seed));
}

function applySeededQuizState(seed?: QuizStoreSeed) {
  if (!seed) return;
  useQuizStore.setState(seed);
}

export function E2EBridge() {
  const enabled = process.env.NEXT_PUBLIC_E2E === "true";

  useLayoutEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const appSeed = readSeedFromStorage<AppStoreSeed>(E2E_APP_STATE_KEY);
    if (appSeed) {
      applySeededAppState(appSeed);
    }

    const quizSeed = readSeedFromStorage<QuizStoreSeed>(E2E_QUIZ_STATE_KEY);
    if (quizSeed) {
      applySeededQuizState(quizSeed);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const api: E2EBridgeApi = {
      resetAll() {
        api.resetQuizState();
        api.resetAppState();
      },
      resetAppState() {
        clearAppSeedStorage();
        useAppStore.setState(normalizeAppSeed());
        useAppStore.persist.clearStorage();
      },
      resetQuizState() {
        clearQuizSeedStorage();
        useQuizStore.getState().reset();
      },
      setAppState(partial) {
        const nextState = normalizeAppSeed({
          ...useAppStore.getState(),
          ...partial,
        });
        persistAppSeed(nextState);
        useAppStore.setState(nextState);
      },
      setQuizState(partial) {
        const nextState = {
          ...useQuizStore.getState(),
          ...partial,
        };
        persistQuizSeed(partial);
        useQuizStore.setState(nextState);
      },
      getAppState() {
        return useAppStore.getState();
      },
      getQuizState() {
        return useQuizStore.getState();
      },
    };

    window.__E2E__ = api;

    const appSeed = readSeedFromStorage<AppStoreSeed>(E2E_APP_STATE_KEY);
    if (appSeed) {
      applySeededAppState(appSeed);
    }

    const quizSeed = readSeedFromStorage<QuizStoreSeed>(E2E_QUIZ_STATE_KEY);
    if (quizSeed) {
      applySeededQuizState(quizSeed);
    }

    return () => {
      delete window.__E2E__;
    };
  }, [enabled]);

  return null;
}
