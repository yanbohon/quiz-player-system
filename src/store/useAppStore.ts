import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

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

interface AppState {
  // 用户状态
  user: User | null;
  isAuthenticated: boolean;
  
  // 答题状态
  currentQuestionId: string | null;
  answers: Record<string, AnswerRecord>;
  hpPenaltyGuards: Record<string, HpPenaltyGuardRecord>;
  
  // 连接状态
  mqttConnected: boolean;
  
  // Actions
  setUser: (user: User | null) => void;
  setCurrentQuestion: (questionId: string | null) => void;
  setAnswer: (questionId: string, answer: AnswerInput) => void;
  clearAnswers: () => void;
  markHpPenaltyGuard: (key: string, record: HpPenaltyGuardRecord) => void;
  clearHpPenaltyGuard: (key: string) => void;
  setMqttConnected: (connected: boolean) => void;
  logout: () => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      immer((set) => ({
        // Initial state
        user: null,
        isAuthenticated: false,
        currentQuestionId: null,
        answers: {},
        hpPenaltyGuards: {},
        mqttConnected: false,

        // Actions
        setUser: (user) =>
          set((state) => {
            const previousUserId = state.user?.id;
            state.user = user;
            state.isAuthenticated = !!user;
            if (previousUserId && previousUserId !== user?.id) {
              state.currentQuestionId = null;
              state.answers = {};
              state.hpPenaltyGuards = {};
            }
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
            state.currentQuestionId = null;
            state.answers = {};
            state.hpPenaltyGuards = {};
          }),
      })),
      {
        name: "app-storage",
        partialize: (state) => ({
          user: state.user,
          isAuthenticated: state.isAuthenticated,
          answers: state.answers,
          hpPenaltyGuards: state.hpPenaltyGuards,
        }),
      }
    )
  )
);
