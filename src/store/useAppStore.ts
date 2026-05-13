import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { OceanGroupId, OceanPlayMode } from "@/features/quiz/oceanGroup";
import { isPublicEnvEnabled } from "@/config/env";

interface User {
  id: string;
  name: string;
  team?: string;
}

export interface HpPenaltyGuardRecord {
  eventId: string;
  stageId: string;
  questionId: string;
  userId: string;
  hpBefore: number;
  hpAfter: number;
  processedAt: number;
  source: "answer" | "judgement";
}

export interface AnswerRecord {
  value: string | string[];
  submittedAt: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

type AnswerInput = string | string[] | Omit<AnswerRecord, "submittedAt">;

const HP_PENALTY_GUARD_LIMIT = 200;
const E2E_APP_STATE_KEY = "contestant-app:e2e-app-state";

interface AppState {
  // 用户状态
  user: User | null;
  isAuthenticated: boolean;
  oceanPlayMode: OceanPlayMode | null;
  oceanGroupId: OceanGroupId | null;
  oceanGroupLocked: boolean;
  sprintTeamId: OceanGroupId | null;
  sprintTeamLocked: boolean;
  sprintTeamStageId: string | null;
  
  // 答题状态
  currentQuestionId: string | null;
  answers: Record<string, AnswerRecord>;
  hpPenaltyGuards: Record<string, HpPenaltyGuardRecord>;
  
  // 连接状态
  mqttConnected: boolean;
  
  // Actions
  setUser: (user: User | null) => void;
  setOceanPlayMode: (mode: OceanPlayMode | null) => void;
  setOceanGroupId: (groupId: OceanGroupId | null) => void;
  setOceanGroupLocked: (locked: boolean) => void;
  setSprintTeamId: (groupId: OceanGroupId | null) => void;
  setSprintTeamLocked: (locked: boolean) => void;
  setSprintTeamStageId: (stageId: string | null) => void;
  clearSprintTeamSelection: () => void;
  setCurrentQuestion: (questionId: string | null) => void;
  setAnswer: (questionId: string, answer: AnswerInput) => void;
  clearAnswers: () => void;
  markHpPenaltyGuard: (key: string, record: HpPenaltyGuardRecord) => void;
  clearHpPenaltyGuard: (key: string) => void;
  setMqttConnected: (connected: boolean) => void;
  logout: () => void;
}

function readE2EAppSeed(): Partial<AppState> {
  if (
    !isPublicEnvEnabled("E2E") ||
    typeof window === "undefined"
  ) {
    return {};
  }

  const raw = window.localStorage.getItem(E2E_APP_STATE_KEY);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as Partial<AppState>;
  } catch {
    window.localStorage.removeItem(E2E_APP_STATE_KEY);
    return {};
  }
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      immer((set) => {
        const e2eSeed = readE2EAppSeed();
        const initialUser =
          e2eSeed.user === undefined ? null : e2eSeed.user;
        const initialAuthenticated =
          e2eSeed.isAuthenticated ?? Boolean(initialUser);

        return {
        // Initial state
        user: initialUser,
        isAuthenticated: initialAuthenticated,
        oceanPlayMode: e2eSeed.oceanPlayMode ?? null,
        oceanGroupId: e2eSeed.oceanGroupId ?? null,
        oceanGroupLocked: e2eSeed.oceanGroupLocked ?? false,
        sprintTeamId: e2eSeed.sprintTeamId ?? null,
        sprintTeamLocked: e2eSeed.sprintTeamLocked ?? false,
        sprintTeamStageId: e2eSeed.sprintTeamStageId ?? null,
        currentQuestionId: e2eSeed.currentQuestionId ?? null,
        answers: e2eSeed.answers ?? {},
        hpPenaltyGuards: e2eSeed.hpPenaltyGuards ?? {},
        mqttConnected: e2eSeed.mqttConnected ?? false,

        // Actions
        setUser: (user) =>
          set((state) => {
            const previousUserId = state.user?.id;
            state.user = user;
            state.isAuthenticated = !!user;
            if (previousUserId && previousUserId !== user?.id) {
              state.oceanPlayMode = null;
              state.oceanGroupId = null;
              state.oceanGroupLocked = false;
              state.sprintTeamId = null;
              state.sprintTeamLocked = false;
              state.sprintTeamStageId = null;
              state.currentQuestionId = null;
              state.answers = {};
              state.hpPenaltyGuards = {};
            }
          }),

        setOceanPlayMode: (mode) =>
          set((state) => {
            state.oceanPlayMode = mode;
          }),

        setOceanGroupId: (groupId) =>
          set((state) => {
            state.oceanGroupId = groupId;
          }),

        setOceanGroupLocked: (locked) =>
          set((state) => {
            state.oceanGroupLocked = locked;
          }),

        setSprintTeamId: (groupId) =>
          set((state) => {
            state.sprintTeamId = groupId;
          }),

        setSprintTeamLocked: (locked) =>
          set((state) => {
            state.sprintTeamLocked = locked;
          }),

        setSprintTeamStageId: (stageId) =>
          set((state) => {
            state.sprintTeamStageId = stageId;
          }),

        clearSprintTeamSelection: () =>
          set((state) => {
            state.sprintTeamId = null;
            state.sprintTeamLocked = false;
            state.sprintTeamStageId = null;
          }),

        setCurrentQuestion: (questionId) =>
          set((state) => {
            state.currentQuestionId = questionId;
          }),

        setAnswer: (questionId, answer) =>
          set((state) => {
            if (typeof answer === "string" || Array.isArray(answer)) {
              state.answers[questionId] = {
                value: answer,
                submittedAt: Date.now(),
              };
              return;
            }
            state.answers[questionId] = {
              value: answer.value,
              durationMs: answer.durationMs,
              metadata: answer.metadata,
              submittedAt: Date.now(),
            };
          }),

        clearAnswers: () =>
          set((state) => {
            state.answers = {};
          }),

        markHpPenaltyGuard: (key, record) =>
          set((state) => {
            state.hpPenaltyGuards[key] = record;
            const entries = Object.entries(state.hpPenaltyGuards);
            if (entries.length <= HP_PENALTY_GUARD_LIMIT) {
              return;
            }
            entries
              .sort(
                (left, right) =>
                  left[1].processedAt - right[1].processedAt
              )
              .slice(0, entries.length - HP_PENALTY_GUARD_LIMIT)
              .forEach(([staleKey]) => {
                delete state.hpPenaltyGuards[staleKey];
              });
          }),

        clearHpPenaltyGuard: (key) =>
          set((state) => {
            delete state.hpPenaltyGuards[key];
          }),

        setMqttConnected: (connected) =>
          set((state) => {
            state.mqttConnected = connected;
          }),

        logout: () =>
          set((state) => {
            state.user = null;
            state.isAuthenticated = false;
            state.oceanPlayMode = null;
            state.oceanGroupId = null;
            state.oceanGroupLocked = false;
            state.sprintTeamId = null;
            state.sprintTeamLocked = false;
            state.sprintTeamStageId = null;
            state.currentQuestionId = null;
            state.answers = {};
            state.hpPenaltyGuards = {};
          }),
      }}),
      {
        name: "app-storage",
        partialize: (state) => ({
          user: state.user,
          isAuthenticated: state.isAuthenticated,
          oceanPlayMode: state.oceanPlayMode,
          oceanGroupId: state.oceanGroupId,
          oceanGroupLocked: state.oceanGroupLocked,
          sprintTeamId: state.sprintTeamId,
          sprintTeamLocked: state.sprintTeamLocked,
          sprintTeamStageId: state.sprintTeamStageId,
          answers: state.answers,
          hpPenaltyGuards: state.hpPenaltyGuards,
        }),
      }
    )
  )
);
