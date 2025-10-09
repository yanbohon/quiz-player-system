import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { fetchQuestionsFromSource, QuestionSource } from "@/lib/api";
import {
  DatasheetRecord,
  FusionEventSummary,
  fetchDatasheetRecords,
  fetchFusionEvents,
  fetchGrabbedQuestion,
  fetchNormalizedDatasheetQuestions,
  patchDatasheetRecords,
} from "@/lib/fusionClient";
import { NormalizedQuestion } from "@/lib/normalizeQuestion";

const INITIAL_HP = 3;
const COMMAND_LOG_LIMIT = 30;

type StageKind =
  | "meta"
  | "standard"
  | "grab"
  | "unknown";

function normalizeAnswerValue(input: string | string[]): string[] {
  if (Array.isArray(input)) {
    return input.filter(Boolean);
  }
  if (!input) return [];
  return [input];
}

function countAnswered(answers: Record<string, string[]>): number {
  return Object.values(answers).reduce(
    (acc, current) => (current && current.length > 0 ? acc + 1 : acc),
    0
  );
}

function resolveStageKind(name?: string): StageKind {
  switch (name) {
    case "学校信息":
      return "meta";
    case "题海遨游":
      return "grab";
    case "有问必答":
    case "一站到底":
    case "争分夺秒":
    case "终极挑战":
      return "standard";
    default:
      return "unknown";
  }
}

interface StageConfig {
  order: number;
  stageId: string;
  recordId: string;
  name: string;
  questionSheetId?: string;
  scoreSheetId?: string;
  generalSheetId?: string;
  kind: StageKind;
  rawFields: Record<string, unknown>;
}

interface TeamProfile {
  recordId: string;
  identifier: string;
  displayName?: string;
  fields: Record<string, unknown>;
}

interface ScoreRecord {
  recordId: string;
  fields: Record<string, unknown>;
}

interface QuizState {
  // Question data
  questions: NormalizedQuestion[];
  currentIndex: number;
  answers: Record<string, string[]>;

  // Contest meta
  events: FusionEventSummary[];
  stages: StageConfig[];
  selectedEvent?: FusionEventSummary;
  currentStage?: StageConfig;
  teamProfile?: TeamProfile;
  scoreRecord?: ScoreRecord;

  // Health & timers
  hp: number;
  maxHp: number;

  // Async state
  isLoading: boolean;
  error?: string;

  // Progress
  progress: {
    total: number;
    answered: number;
  };

  // Command log
  commandLog: string[];
  waitingForStageStart: boolean;

  // Derived getters
  currentQuestion: () => NormalizedQuestion | undefined;

  // State mutators
  setLoading: (loading: boolean) => void;
  setError: (message?: string) => void;
  setQuestions: (
    list: NormalizedQuestion[],
    options?: { initialHp?: number; maxHp?: number }
  ) => void;
  pushQuestion: (question: NormalizedQuestion) => void;
  removeQuestion: (questionId: string) => void;
  setCurrentQuestionIndex: (index: number) => void;
  setAnswer: (questionId: string, answer: string | string[]) => void;
  nextQuestion: () => void;
  previousQuestion: () => void;
  reset: () => void;
  adjustHp: (delta: number) => void;
  logCommand: (command: string) => void;
  setWaitingForStageStart: (waiting: boolean) => void;

  // External interactions
  loadQuestions: (
    endpoint: string,
    source: QuestionSource,
    options?: RequestInit
  ) => Promise<NormalizedQuestion[]>;
  loadEvents: () => Promise<FusionEventSummary[]>;
  selectEventByOrdinal: (ordinal: number, userId?: string) => Promise<StageConfig[]>;
  activateStageById: (stageId: string, userId: string) => Promise<void>;
  refreshTeamProfile: (generalSheetId: string, userId: string) => Promise<TeamProfile | undefined>;
  refreshScoreRecord: (scoreSheetId: string, userId: string) => Promise<ScoreRecord | undefined>;
  submitAnswerChoice: (params: {
    datasheetId: string;
    recordId: string;
    userId: string;
    answer: string;
    fieldKey?: string;
  }) => Promise<void>;
  submitJudgeResult: (params: {
    datasheetId: string;
    recordId: string;
    questionId: string;
    answer: string;
    time?: number;
    light?: "0" | "1";
  }) => Promise<void>;
  grabNextQuestion: (userId: string) => Promise<NormalizedQuestion | undefined>;
}

function toStageConfig(record: DatasheetRecord, order: number): StageConfig | null {
  if (!record.fields) return null;
  const fields = record.fields;
  const stageId = String(fields.ID ?? order);
  const name = String(fields["环节名称"] ?? `环节${order}`);
  return {
    order,
    stageId,
    recordId: String(record.recordId ?? ""),
    name,
    questionSheetId:
      typeof fields["题库表ID"] === "string" ? fields["题库表ID"] : undefined,
    scoreSheetId:
      typeof fields["分数表ID"] === "string" ? fields["分数表ID"] : undefined,
    generalSheetId:
      typeof fields["通用表ID"] === "string" ? fields["通用表ID"] : undefined,
    kind: resolveStageKind(name),
    rawFields: { ...fields },
  };
}

function findRecordByIdentifier(
  records: DatasheetRecord[],
  identifier: string
): DatasheetRecord | undefined {
  const target = identifier.trim();
  const keysToCheck = [
    "ID",
    "id",
    "编号",
    "school",
    "学校",
    "city-id",
    "cityId",
    "选手ID",
    "选手编号",
  ];

  for (const record of records) {
    const fields = record.fields;
    if (!fields) continue;
    for (const key of keysToCheck) {
      const value = fields[key];
      if (value !== undefined && String(value).trim() === target) {
        return record;
      }
    }
    // Fallback: search any string field
    if (
      Object.values(fields).some(
        (value) =>
          typeof value === "string" && value.trim() === target
      )
    ) {
      return record;
    }
  }
  return undefined;
}

function extractDisplayName(fields: Record<string, unknown>): string | undefined {
  const candidates = ["名称", "name", "队伍名称", "school", "学校", "city"];
  for (const key of candidates) {
    const value = fields[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  const firstString = Object.values(fields).find(
    (value) => typeof value === "string" && value.trim()
  );
  return typeof firstString === "string" ? firstString.trim() : undefined;
}

export const useQuizStore = create<QuizState>()(
  immer((set, get) => ({
    questions: [],
    currentIndex: 0,
    answers: {},
    events: [],
    stages: [],
    selectedEvent: undefined,
    currentStage: undefined,
    teamProfile: undefined,
    scoreRecord: undefined,
    hp: INITIAL_HP,
    maxHp: INITIAL_HP,
    isLoading: false,
    error: undefined,
    progress: {
      total: 0,
      answered: 0,
    },
    commandLog: [],
    waitingForStageStart: false,

    currentQuestion: () => {
      const state = get();
      return state.questions[state.currentIndex];
    },

    setLoading: (loading) =>
      set((state) => {
        state.isLoading = loading;
      }),

    setError: (message) =>
      set((state) => {
        state.error = message;
      }),

    setQuestions: (list, options) =>
      set((state) => {
        state.questions = list;
        state.answers = {};
        state.currentIndex = 0;
        state.progress.total = list.length;
        state.progress.answered = 0;

        if (typeof options?.maxHp === "number") {
          state.maxHp = options.maxHp;
        } else if (state.maxHp < state.hp) {
          state.maxHp = state.hp;
        }

        if (typeof options?.initialHp === "number") {
          state.hp = options.initialHp;
        } else if (state.hp > state.maxHp) {
          state.hp = state.maxHp;
        }
      }),

    pushQuestion: (question) =>
      set((state) => {
        const existingIndex = state.questions.findIndex(
          (q) => q.id === question.id
        );

        if (existingIndex >= 0) {
          state.questions[existingIndex] = question;
          state.currentIndex = existingIndex;
        } else {
          state.questions.push(question);
          state.progress.total = state.questions.length;
          state.currentIndex = state.questions.length - 1;
        }

        state.waitingForStageStart = false;
      }),

    removeQuestion: (questionId) =>
      set((state) => {
        const removeIndex = state.questions.findIndex(
          (question) => question.id === questionId
        );

        if (removeIndex === -1) {
          return;
        }

        state.questions.splice(removeIndex, 1);
        delete state.answers[questionId];
        state.progress.total = state.questions.length;
        state.progress.answered = countAnswered(state.answers);

        if (state.currentIndex >= state.questions.length) {
          state.currentIndex = Math.max(state.questions.length - 1, 0);
        } else if (state.currentIndex > removeIndex) {
          state.currentIndex -= 1;
        }

        if (state.questions.length === 0) {
          state.currentIndex = 0;
          state.waitingForStageStart = true;
        }
      }),

    setCurrentQuestionIndex: (index) =>
      set((state) => {
        if (state.questions.length === 0) return;
        const clamped = Math.min(
          Math.max(index, 0),
          state.questions.length - 1
        );
        state.currentIndex = clamped;
        state.waitingForStageStart = false;
      }),

    setAnswer: (questionId, answer) =>
      set((state) => {
        state.answers[questionId] = normalizeAnswerValue(answer);
        state.progress.answered = countAnswered(state.answers);
      }),

    nextQuestion: () =>
      set((state) => {
        if (state.currentIndex < state.questions.length - 1) {
          state.currentIndex += 1;
        }
      }),

    previousQuestion: () =>
      set((state) => {
        if (state.currentIndex > 0) {
          state.currentIndex -= 1;
        }
      }),

    reset: () =>
      set((state) => {
        state.questions = [];
        state.answers = {};
        state.currentIndex = 0;
        state.progress = { total: 0, answered: 0 };
        state.hp = INITIAL_HP;
        state.maxHp = INITIAL_HP;
        state.isLoading = false;
        state.error = undefined;
        state.events = [];
        state.stages = [];
        state.selectedEvent = undefined;
        state.currentStage = undefined;
        state.teamProfile = undefined;
        state.scoreRecord = undefined;
        state.commandLog = [];
        state.waitingForStageStart = false;
      }),

    adjustHp: (delta) =>
      set((state) => {
        const nextHp = state.hp + delta;
        const upper = state.maxHp ?? INITIAL_HP;
        if (nextHp < 0) {
          state.hp = 0;
          return;
        }
        state.hp = nextHp > upper ? upper : nextHp;
      }),

    logCommand: (command) =>
      set((state) => {
        state.commandLog.push(command);
        if (state.commandLog.length > COMMAND_LOG_LIMIT) {
          state.commandLog.splice(0, state.commandLog.length - COMMAND_LOG_LIMIT);
        }
      }),

    setWaitingForStageStart: (waiting) =>
      set((state) => {
        state.waitingForStageStart = waiting;
      }),

    loadQuestions: async (endpoint, source, options) => {
      set((state) => {
        state.isLoading = true;
        state.error = undefined;
      });
      try {
        const list = await fetchQuestionsFromSource(endpoint, source, options);
        get().setQuestions(list);
        set((state) => {
          state.isLoading = false;
        });
        return list;
      } catch (error) {
        set((state) => {
          state.isLoading = false;
          state.error =
            error instanceof Error ? error.message : "题目加载失败";
        });
        throw error;
      }
    },

    loadEvents: async () => {
      set((state) => {
        state.isLoading = true;
        state.error = undefined;
      });
      try {
        const events = await fetchFusionEvents();
        set((state) => {
          state.events = events;
          state.isLoading = false;
        });
        return events;
      } catch (error) {
        set((state) => {
          state.isLoading = false;
          state.error =
            error instanceof Error ? error.message : "赛事列表获取失败";
        });
        throw error;
      }
    },

    selectEventByOrdinal: async (ordinal, userId) => {
      const state = get();
      const event = state.events[ordinal];
      if (!event) {
        throw new Error(`未找到编号为 ${ordinal} 的赛事`);
      }

      set((draft) => {
        draft.isLoading = true;
        draft.error = undefined;
      });

      try {
        const stageRecords = await fetchDatasheetRecords(event.id);
        const stages = stageRecords
          .map((record, index) => toStageConfig(record, index))
          .filter((item): item is StageConfig => Boolean(item));

        set((draft) => {
          draft.selectedEvent = event;
          draft.stages = stages;
          draft.currentStage = undefined;
          draft.teamProfile = undefined;
          draft.scoreRecord = undefined;
          draft.waitingForStageStart = false;
          draft.isLoading = false;
        });

        if (userId) {
          const generalStage = stages.find(
            (stage) => stage.stageId === "0" && stage.generalSheetId
          );
          if (generalStage?.generalSheetId) {
            await get().refreshTeamProfile(generalStage.generalSheetId, userId);
          }
        }

        return stages;
      } catch (error) {
        set((draft) => {
          draft.isLoading = false;
          draft.error =
            error instanceof Error ? error.message : "赛事配置获取失败";
        });
        throw error;
      }
    },

    activateStageById: async (stageId, userId) => {
      const state = get();
      const stage = state.stages.find((item) => item.stageId === stageId);
      if (!stage) {
        throw new Error(`未找到环节 ${stageId}`);
      }

      set((draft) => {
        draft.isLoading = true;
        draft.error = undefined;
        draft.currentStage = stage;
        draft.waitingForStageStart = stage.kind === "grab";
        draft.questions = [];
        draft.answers = {};
        draft.progress = { total: 0, answered: 0 };
      });

      try {
        if (stage.kind === "standard" && stage.questionSheetId) {
          const questions = await fetchNormalizedDatasheetQuestions(stage.questionSheetId);
          get().setQuestions(questions);
        }

        if (stage.kind === "grab") {
          set((draft) => {
            draft.isLoading = false;
          });
        } else {
          set((draft) => {
            draft.isLoading = false;
          });
        }

        if (stage.generalSheetId) {
          await get().refreshTeamProfile(stage.generalSheetId, userId);
        }

        if (stage.scoreSheetId) {
          await get().refreshScoreRecord(stage.scoreSheetId, userId);
        }
      } catch (error) {
        set((draft) => {
          draft.isLoading = false;
          draft.error =
            error instanceof Error ? error.message : "环节数据加载失败";
        });
        throw error;
      }
    },

    refreshTeamProfile: async (generalSheetId, userId) => {
      const records = await fetchDatasheetRecords(generalSheetId);
      const match = findRecordByIdentifier(records, userId);
      if (!match || !match.fields) return undefined;
      const profile: TeamProfile = {
        recordId: String(match.recordId ?? ""),
        identifier: userId,
        displayName: extractDisplayName(match.fields),
        fields: { ...match.fields },
      };
      set((state) => {
        state.teamProfile = profile;
      });
      return profile;
    },

    refreshScoreRecord: async (scoreSheetId, userId) => {
      const records = await fetchDatasheetRecords(scoreSheetId);
      const match = findRecordByIdentifier(records, userId);
      if (!match || !match.fields) return undefined;
      const scoreRecord: ScoreRecord = {
        recordId: String(match.recordId ?? ""),
        fields: { ...match.fields },
      };
      set((state) => {
        state.scoreRecord = scoreRecord;
      });
      return scoreRecord;
    },

    submitAnswerChoice: async ({
      datasheetId,
      recordId,
      userId,
      answer,
      fieldKey,
    }) => {
      const key = fieldKey ?? userId;
      const payload = {
        records: [
          {
            recordId,
            fields: {
              [key]: answer,
            },
          },
        ],
      };
      await patchDatasheetRecords(datasheetId, payload);
    },

    submitJudgeResult: async ({
      datasheetId,
      recordId,
      questionId,
      answer,
      time,
      light,
    }) => {
      const fields: Record<string, unknown> = {
        [questionId]: answer,
      };
      if (typeof time === "number") {
        fields.time = time;
      }
      if (light === "0" || light === "1") {
        fields.light = light;
      }
      const payload = {
        records: [
          {
            recordId,
            fields,
          },
        ],
      };
      await patchDatasheetRecords(datasheetId, payload);
    },

    grabNextQuestion: async (userId) => {
      const question = await fetchGrabbedQuestion(userId);
      if (question) {
        get().pushQuestion(question);
      }
      return question;
    },
  }))
);
