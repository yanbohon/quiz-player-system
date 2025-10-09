import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

interface User {
  id: string;
  name: string;
  team?: string;
}

export interface AnswerRecord {
  value: string | string[];
  submittedAt: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

type AnswerInput = string | string[] | Omit<AnswerRecord, "submittedAt">;

interface AppState {
  // 用户状态
  user: User | null;
  isAuthenticated: boolean;
  
  // 答题状态
  currentQuestionId: string | null;
  answers: Record<string, AnswerRecord>;
  
  // 连接状态
  mqttConnected: boolean;
  
  // Actions
  setUser: (user: User | null) => void;
  setCurrentQuestion: (questionId: string | null) => void;
  setAnswer: (questionId: string, answer: AnswerInput) => void;
  clearAnswers: () => void;
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
        mqttConnected: false,

        // Actions
        setUser: (user) =>
          set((state) => {
            state.user = user;
            state.isAuthenticated = !!user;
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
          }),
      })),
      {
        name: "app-storage",
        partialize: (state) => ({
          user: state.user,
          isAuthenticated: state.isAuthenticated,
          answers: state.answers,
        }),
      }
    )
  )
);
