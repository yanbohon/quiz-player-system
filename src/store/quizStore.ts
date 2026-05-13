import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { fetchQuestionsFromSource, QuestionSource } from "@/lib/api";
import {
  DatasheetRecord,
  FusionEventSummary,
  fetchDatasheetRecords,
  fetchFusionEvents,
  fetchGrabbedQuestion,
  fetchOceanStageConfig,
  fetchNormalizedDatasheetQuestions,
  OceanStageConfig,
  patchDatasheetRecords,
  QuestionPoolEmptyError,
} from "@/lib/fusionClient";
import { NormalizedQuestion } from "@/lib/normalizeQuestion";
import type { OceanGroupId } from "@/features/quiz/oceanGroup";
import { isPublicEnvEnabled } from "@/config/env";

const INITIAL_HP = 3;
const COMMAND_LOG_LIMIT = 30;
export const DEFAULT_OCEAN_REMAINING_COUNT = 600;
const E2E_QUIZ_STATE_KEY = "contestant-app:e2e-quiz-state";

type QuestionLoadStatus = "idle" | "loading" | "success" | "error";
type OceanStageConfigStatus = "idle" | "loading" | "success" | "error";

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
    case "火眼金睛":
    case "一站到底":
    case "争分夺秒":
    case "终极挑战":
    case "同分加题":
    case "抢答冲刺":
      return "standard";
    default:
      if (typeof name === "string") {
        const trimmed = name.trim();
        if (!trimmed) {
          return "unknown";
        }
        if (/^有问必答/u.test(trimmed)) {
          return "standard";
        }
        if (/^火眼金睛/u.test(trimmed)) {
          return "standard";
        }
        if (/^争分夺秒/u.test(trimmed)) {
          return "standard";
        }
        if (/^一站到底/u.test(trimmed)) {
          return "standard";
        }
        if (/^抢答冲刺/u.test(trimmed)) {
          return "standard";
        }
      }
      return "unknown";
  }
}

export interface StageConfig {
  order: number;
  stageId: string;
  recordId: string;
  name: string;
  displayName: string;
  questionSheetId?: string;
  scoreSheetId?: string;
  generalSheetId?: string;
  kind: StageKind;
  rawFields: Record<string, unknown>;
}

interface RankEntry {
  id: string;
  schoolName: string;
  score: number;
}

type WaitingTicketView = "default" | "rank";
type RankStatus = "idle" | "loading" | "success" | "error";

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
  oceanRemainingCount: number;
  oceanStageConfig?: OceanStageConfig;
  oceanStageConfigStatus: OceanStageConfigStatus;
  oceanStageConfigError?: string;
  questionLoadStatus: QuestionLoadStatus;
  questionLoadAttempts: number;
  questionLoadError?: string;
  questionGateOpened: boolean;

  // Contest meta
  events: FusionEventSummary[];
  stages: StageConfig[];
  selectedEvent?: FusionEventSummary;
  currentStage?: StageConfig;
  teamProfile?: TeamProfile;
  teamProfiles: Record<string, TeamProfile>;
  teamDirectorySheetId?: string;
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
  waitingTicketView: WaitingTicketView;
  rankStatus: RankStatus;
  rankEntries: RankEntry[];
  rankError?: string;

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
  setQuestionFieldValue: (
    questionId: string,
    fieldKey: string,
    value?: string
  ) => void;
  setAnswer: (questionId: string, answer: string | string[]) => void;
  nextQuestion: () => void;
  previousQuestion: () => void;
  reset: () => void;
  adjustHp: (delta: number) => void;
  logCommand: (command: string) => void;
  setWaitingForStageStart: (waiting: boolean) => void;
  resetWaitingTicketView: () => void;

  // External interactions
  loadQuestions: (
    endpoint: string,
    source: QuestionSource,
    options?: RequestInit
  ) => Promise<NormalizedQuestion[]>;
  loadStageQuestionsFromFusion: () => Promise<NormalizedQuestion[]>;
  loadEvents: () => Promise<FusionEventSummary[]>;
  selectEventByOrdinal: (ordinal: number, userId?: string) => Promise<StageConfig[]>;
  activateStageById: (stageId: string, userId: string) => Promise<void>;
  refreshTeamProfile: (generalSheetId: string, userId: string) => Promise<TeamProfile | undefined>;
  ensureTeamProfile: (identifier: string) => Promise<TeamProfile | undefined>;
  clearScoreRecord: () => void;
  refreshScoreRecord: (
    scoreSheetId: string,
    userId: string,
    options?: {
      fieldKeys?: string[];
      allowAnyFieldFallback?: boolean;
    }
  ) => Promise<ScoreRecord | undefined>;
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
    time?: number | string;
    light?: "0" | "1";
    statusFieldKey?: string;
    status?: string;
  }) => Promise<void>;
  updateScoreStatus: (params: {
    datasheetId: string;
    recordId: string;
    fieldKey: string;
    status: string;
  }) => Promise<void>;
  incrementScoreFieldByIdentifier: (params: {
    datasheetId: string;
    identifier: string;
    fieldKey: string;
    delta: number;
  }) => Promise<number>;
  grabNextQuestion: (
    userId: string,
    groupId?: OceanGroupId
  ) => Promise<NormalizedQuestion | undefined>;
  loadOceanStageConfig: () => Promise<OceanStageConfig>;
  fetchWaitingRankings: () => Promise<void>;
}

function readE2EQuizSeed(): Partial<QuizState> {
  if (
    !isPublicEnvEnabled("E2E") ||
    typeof window === "undefined"
  ) {
    return {};
  }

  const raw = window.localStorage.getItem(E2E_QUIZ_STATE_KEY);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as Partial<QuizState>;
  } catch {
    window.localStorage.removeItem(E2E_QUIZ_STATE_KEY);
    return {};
  }
}

const RANK_STAGE_NAME = "总分排名";
export const RANK_STAGE_MISSING_ERROR = "rank-stage-missing";
const RANK_ERROR_MESSAGE = "排行榜数据获取失败，请稍后再试";

const STAGE_FIELD_STRING_KEYS = ["text", "value", "label", "name", "title"];

function normalizeStageFieldText(source: unknown): string | undefined {
  if (source === undefined || source === null) return undefined;
  if (typeof source === "string") {
    const trimmed = source.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof source === "number" && Number.isFinite(source)) {
    return String(source);
  }
  if (Array.isArray(source)) {
    for (const item of source) {
      const normalized = normalizeStageFieldText(item);
      if (normalized) return normalized;
    }
    return undefined;
  }
  if (typeof source === "object") {
    const record = source as Record<string, unknown>;
    for (const key of STAGE_FIELD_STRING_KEYS) {
      if (key in record) {
        const normalized = normalizeStageFieldText(record[key]);
        if (normalized) return normalized;
      }
    }
  }
  return undefined;
}

function toStageConfig(record: DatasheetRecord, order: number): StageConfig | null {
  if (!record.fields) return null;
  const fields = record.fields;
  const stageId = normalizeStageFieldText(fields.ID) ?? String(order);
  const name = normalizeStageFieldText(fields["环节名称"]) ?? `环节${order}`;
  const displayName =
    normalizeStageFieldText(fields["显示名称"]) ?? name;
  const questionSheetId = normalizeStageFieldText(fields["题库表ID"]);
  const scoreSheetId = normalizeStageFieldText(fields["分数表ID"]);
  const generalSheetId = normalizeStageFieldText(fields["通用表ID"]);
  return {
    order,
    stageId,
    recordId: String(record.recordId ?? ""),
    name,
    displayName,
    questionSheetId: questionSheetId,
    scoreSheetId: scoreSheetId,
    generalSheetId: generalSheetId,
    kind: resolveStageKind(name),
    rawFields: { ...fields },
  };
}

const IDENTIFIER_FIELD_KEYS = [
  "用户ID",
  "用户 ID",
  "参赛账号",
  "账号",
  "台号",
  "台号ID",
  "stationId",
  "station",
  "ID",
  "id",
  "编号",
  "school",
  "School",
  "学校",
  "team_id",
  "teamId",
  "Team ID",
  "city-id",
  "cityId",
  "选手ID",
  "选手编号",
];

function collectIdentifiers(fields: Record<string, unknown>): Set<string> {
  const identifiers = new Set<string>();
  for (const key of IDENTIFIER_FIELD_KEYS) {
    const value = fields[key];
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim();
    if (normalized) {
      identifiers.add(normalized);
    }
  }
  return identifiers;
}

function buildTeamDirectory(records: DatasheetRecord[]): Record<string, TeamProfile> {
  const directory: Record<string, TeamProfile> = {};
  for (const record of records) {
    const fields = record.fields;
    if (!fields) continue;
    const identifiers = collectIdentifiers(fields);
    if (identifiers.size === 0) continue;
    const [primaryIdentifier] = Array.from(identifiers);
    const profile: TeamProfile = {
      recordId: String(record.recordId ?? ""),
      identifier: primaryIdentifier ?? String(record.recordId ?? ""),
      displayName: extractDisplayName(fields),
      fields: { ...fields },
    };
    for (const identifier of identifiers) {
      const normalized = identifier.trim();
      if (normalized) {
        directory[normalized] = profile;
      }
    }
  }
  return directory;
}

function findRecordByIdentifier(
  records: DatasheetRecord[],
  identifier: string,
  options?: {
    fieldKeys?: string[];
    allowAnyFieldFallback?: boolean;
  }
): DatasheetRecord | undefined {
  const target = identifier.trim();
  if (!target) {
    return undefined;
  }
  const fieldKeys = options?.fieldKeys ?? IDENTIFIER_FIELD_KEYS;
  for (const record of records) {
    const fields = record.fields;
    if (!fields) continue;
    for (const key of fieldKeys) {
      const value = fields[key];
      if (value !== undefined && String(value).trim() === target) {
        return record;
      }
    }
    if (options?.allowAnyFieldFallback !== false) {
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
  }
  return undefined;
}

function extractDisplayName(fields: Record<string, unknown>): string | undefined {
  const candidates = [
    "参赛队伍",
    "队伍名称",
    "名称",
    "name",
    "学校名",
    "schoolName",
    "school",
    "学校",
    "city",
  ];
  for (const key of candidates) {
    const value = fields[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value)) {
      const first = value.find((item) => typeof item === "string" && item.trim());
      if (typeof first === "string") {
        return first.trim();
      }
    }
  }
  const firstString = Object.values(fields).find(
    (value) =>
      (typeof value === "string" && value.trim()) ||
      (Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim()))
  );
  if (typeof firstString === "string") {
    return firstString.trim();
  }
  if (Array.isArray(firstString)) {
    const first = firstString.find((item) => typeof item === "string" && item.trim());
    if (typeof first === "string") {
      return first.trim();
    }
  }
  return undefined;
}

function extractFirstString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        const trimmed = item.trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
      }
    }
  }
  return undefined;
}

function toRankEntry(record: DatasheetRecord): RankEntry | undefined {
  const fields = record.fields ?? {};
  const idRaw =
    extractFirstString(fields.ID) ??
    extractFirstString(fields["参赛编号"]) ??
    (typeof record.recordId === "string" ? record.recordId : undefined);
  const schoolRaw =
    extractFirstString(fields["学校名"]) ??
    extractFirstString(fields["学校名称"]) ??
    extractFirstString(fields["学校"]);
  const scoreRaw =
    fields.score ??
    fields.Score ??
    fields["总分"] ??
    fields["totalScore"];

  const scoreValue =
    typeof scoreRaw === "number"
      ? scoreRaw
      : typeof scoreRaw === "string"
      ? Number.parseFloat(scoreRaw)
      : Number.NaN;

  if (!schoolRaw || !Number.isFinite(scoreValue)) {
    return undefined;
  }

  const trimmedName = schoolRaw.trim();

  return {
    id: idRaw ? String(idRaw) : trimmedName,
    schoolName: trimmedName,
    score: scoreValue,
  };
}

export const useQuizStore = create<QuizState>()(
  immer((set, get) => {
    const e2eSeed = readE2EQuizSeed();

    return {
    questions: [],
    currentIndex: 0,
    answers: {},
    oceanRemainingCount: DEFAULT_OCEAN_REMAINING_COUNT,
    oceanStageConfig: undefined,
    oceanStageConfigStatus: "idle",
    oceanStageConfigError: undefined,
    questionLoadStatus: "idle",
    questionLoadAttempts: 0,
    questionLoadError: undefined,
    questionGateOpened: true,
    events: [],
    stages: [],
    selectedEvent: undefined,
    currentStage: undefined,
    teamProfile: undefined,
    teamProfiles: {},
    teamDirectorySheetId: undefined,
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
    waitingTicketView: "default",
    rankStatus: "idle",
    rankEntries: [],
    rankError: undefined,
    ...e2eSeed,

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
        state.questionGateOpened = true;
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
        state.questionGateOpened = true;
      }),

    setQuestionFieldValue: (questionId, fieldKey, value) =>
      set((state) => {
        const target = state.questions.find((question) => question.id === questionId);
        if (!target) return;
        const nextRaw =
          target.raw && typeof target.raw === "object"
            ? { ...target.raw }
            : {};

        if (value === undefined) {
          delete nextRaw[fieldKey];
        } else {
          nextRaw[fieldKey] = value;
        }

        target.raw = nextRaw;
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
        state.teamProfiles = {};
        state.teamDirectorySheetId = undefined;
        state.scoreRecord = undefined;
        state.commandLog = [];
        state.waitingForStageStart = false;
        state.oceanRemainingCount = DEFAULT_OCEAN_REMAINING_COUNT;
        state.oceanStageConfig = undefined;
        state.oceanStageConfigStatus = "idle";
        state.oceanStageConfigError = undefined;
        state.questionLoadStatus = "idle";
        state.questionLoadAttempts = 0;
        state.questionLoadError = undefined;
        state.questionGateOpened = true;
        state.waitingTicketView = "default";
        state.rankStatus = "idle";
        state.rankEntries = [];
        state.rankError = undefined;
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

    resetWaitingTicketView: () =>
      set((state) => {
        state.waitingTicketView = "default";
        state.rankStatus = "idle";
        state.rankEntries = [];
        state.rankError = undefined;
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

    loadStageQuestionsFromFusion: async () => {
      const stage = get().currentStage;
      const isStandardStage = stage?.kind === "standard";
      if (!stage) {
        const error = new Error("当前未激活任何环节，无法加载题目");
        set((state) => {
          state.isLoading = false;
          state.error = error.message;
        });
        throw error;
      }

      if (!stage.questionSheetId) {
        const error = new Error("当前环节未配置题库，无法加载题目");
        set((state) => {
          state.isLoading = false;
          state.error = error.message;
        });
        throw error;
      }

      set((state) => {
        state.isLoading = true;
        state.error = undefined;
      });

      try {
        const list = await fetchNormalizedDatasheetQuestions(stage.questionSheetId);
        get().setQuestions(list);
        set((state) => {
          state.isLoading = false;
          if (isStandardStage) {
            state.waitingForStageStart = true;
            state.questionGateOpened = false;
          }
        });
        return list;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "题目加载失败";
        set((state) => {
          state.isLoading = false;
          state.error = message;
        });
        throw error instanceof Error ? error : new Error(message);
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
        const posterRecord = stageRecords.find((record) => {
          const name = record.fields?.["环节名称"];
          return typeof name === "string" && name.trim() === "赛事海报";
        });
        const posterUrlValue = posterRecord?.fields?.URL;
        const posterUrl =
          typeof posterUrlValue === "string" && posterUrlValue.trim().length > 0
            ? posterUrlValue.trim()
            : undefined;

        const stageRecordsForConfig = stageRecords.filter((record) => {
          const name = record.fields?.["环节名称"];
          return !(typeof name === "string" && name.trim() === "赛事海报");
        });

        const stages = stageRecordsForConfig
          .map((record, index) => toStageConfig(record, index))
          .filter((item): item is StageConfig => Boolean(item));

        set((draft) => {
          const nextEvent = { ...event, posterUrl };
          draft.selectedEvent = nextEvent;
          draft.events[ordinal] = nextEvent;
          draft.stages = stages;
          draft.currentStage = undefined;
          draft.teamProfile = undefined;
          draft.teamProfiles = {};
          draft.teamDirectorySheetId = undefined;
          draft.scoreRecord = undefined;
          draft.waitingForStageStart = false;
          draft.oceanStageConfig = undefined;
          draft.oceanStageConfigStatus = "idle";
          draft.oceanStageConfigError = undefined;
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

      const isStandardStage = stage.kind === "standard";
      const fallbackGeneralSheetId = stage.generalSheetId ?? state.teamDirectorySheetId;

      set((draft) => {
        draft.isLoading = true;
        draft.error = undefined;
        draft.currentStage = stage;
        draft.waitingForStageStart = stage.kind === "grab" || isStandardStage;
        draft.questions = [];
        draft.answers = {};
        draft.progress = { total: 0, answered: 0 };
        if (stage.generalSheetId) {
          draft.teamProfiles = {};
          draft.teamDirectorySheetId = stage.generalSheetId;
        }
        if (stage.kind === "grab") {
          draft.oceanRemainingCount = 0;
          draft.oceanStageConfig = undefined;
          draft.oceanStageConfigStatus = "loading";
          draft.oceanStageConfigError = undefined;
        } else {
          draft.oceanStageConfig = undefined;
          draft.oceanStageConfigStatus = "idle";
          draft.oceanStageConfigError = undefined;
        }
        draft.questionLoadStatus = isStandardStage ? "loading" : "idle";
        draft.questionLoadAttempts = 0;
        draft.questionLoadError = undefined;
        draft.questionGateOpened = !isStandardStage;
      });

      const sleep = (ms: number) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        });

      try {
        if (isStandardStage) {
          if (!stage.questionSheetId) {
            set((draft) => {
              draft.questionLoadStatus = "error";
              draft.questionLoadAttempts = 0;
              draft.questionLoadError = "缺少题库配置，无法加载题目";
              draft.waitingForStageStart = true;
            });
          } else {
            const maxAttempts = 3;
            const baseDelayMs = 1000;

            for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
              set((draft) => {
                draft.questionLoadStatus = "loading";
                draft.questionLoadAttempts = attempt;
                draft.questionLoadError = undefined;
              });

              try {
                const questions = await fetchNormalizedDatasheetQuestions(stage.questionSheetId!);
                get().setQuestions(questions);
                set((draft) => {
                  draft.questionLoadStatus = "success";
                  draft.questionLoadError = undefined;
                  draft.waitingForStageStart = true;
                });
                break;
              } catch (error) {
                const message =
                  error instanceof Error ? error.message : "题目加载失败";
                set((draft) => {
                  draft.questionLoadError = message;
                });

                if (attempt >= maxAttempts) {
                  set((draft) => {
                    draft.questionLoadStatus = "error";
                    draft.questionLoadError = message;
                    draft.waitingForStageStart = true;
                  });
                  throw error;
                }

                const delay = baseDelayMs * 2 ** (attempt - 1);
                await sleep(delay);
              }
            }
          }
        } else {
          set((draft) => {
            draft.questionLoadStatus = "idle";
            draft.questionLoadAttempts = 0;
            draft.questionLoadError = undefined;
          });
        }

        if (stage.kind === "grab") {
          try {
            await get().loadOceanStageConfig();
          } catch (error) {
            console.error("题海环节配置加载失败", error);
          }
        }

        set((draft) => {
          draft.isLoading = false;
        });

        if (fallbackGeneralSheetId) {
          await get().refreshTeamProfile(fallbackGeneralSheetId, userId);
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
      const directory = buildTeamDirectory(records);
      let matchedProfile: TeamProfile | undefined;

      if (userId) {
        matchedProfile = directory[userId];
        if (!matchedProfile) {
          matchedProfile = Object.values(directory).find((profile) => {
            const identifiers = collectIdentifiers(profile.fields);
            return identifiers.has(userId);
          });
        }
      }

      set((state) => {
        state.teamProfiles = directory;
        state.teamDirectorySheetId = generalSheetId;
        if (matchedProfile) {
          state.teamProfile = matchedProfile;
        }
      });

      return matchedProfile;
    },

    ensureTeamProfile: async (identifier) => {
      const target = identifier.trim();
      if (!target) return undefined;
      const state = get();
      if (state.teamProfiles[target]) {
        return state.teamProfiles[target];
      }

      const sheetId =
        state.currentStage?.generalSheetId ??
        state.teamDirectorySheetId ??
        state.stages.find((stage) => stage.generalSheetId)?.generalSheetId;

      if (!sheetId) {
        return undefined;
      }

      const records = await fetchDatasheetRecords(sheetId);
      const directory = buildTeamDirectory(records);
      const matched = directory[target];

      set((draft) => {
        draft.teamDirectorySheetId = sheetId;
        for (const [key, value] of Object.entries(directory)) {
          draft.teamProfiles[key] = value;
        }
      });

      return matched;
    },

    clearScoreRecord: () => {
      set((state) => {
        state.scoreRecord = undefined;
      });
    },

    refreshScoreRecord: async (scoreSheetId, userId, options) => {
      if (!userId || !userId.trim()) {
        get().clearScoreRecord();
        return undefined;
      }
      const records = await fetchDatasheetRecords(scoreSheetId);
      const match = findRecordByIdentifier(records, userId, options);
      if (!match || !match.fields) {
        get().clearScoreRecord();
        return undefined;
      }
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
      statusFieldKey,
      status,
    }) => {
      const fields: Record<string, unknown> = {
        [questionId]: answer,
      };
      if (typeof time === "number") {
        fields.time = time;
      } else if (typeof time === "string") {
        fields.time = time;
      }
      if (light === "0" || light === "1") {
        fields.light = light;
      }
      if (
        statusFieldKey &&
        (typeof status === "string" || typeof status === "number")
      ) {
        fields[statusFieldKey] =
          typeof status === "number" ? String(status) : status;
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

    updateScoreStatus: async ({ datasheetId, recordId, fieldKey, status }) => {
      const normalizedStatus = String(status);
      const payload = {
        records: [
          {
            recordId,
            fields: {
              [fieldKey]: normalizedStatus,
            },
          },
        ],
      };
      await patchDatasheetRecords(datasheetId, payload);
      set((draft) => {
        if (
          draft.scoreRecord?.recordId === recordId &&
          draft.scoreRecord.fields
        ) {
          draft.scoreRecord.fields[fieldKey] = normalizedStatus;
        }
      });
    },

    incrementScoreFieldByIdentifier: async ({
      datasheetId,
      identifier,
      fieldKey,
      delta,
    }) => {
      const records = await fetchDatasheetRecords(datasheetId);
      const match = findRecordByIdentifier(records, identifier, {
        allowAnyFieldFallback: false,
      });
      if (!match || !match.fields) {
        throw new Error(`未找到分数记录 ${identifier}`);
      }

      const recordId = String(match.recordId ?? "");
      const currentRaw = match.fields[fieldKey];
      const currentValue =
        typeof currentRaw === "number"
          ? currentRaw
          : typeof currentRaw === "string"
            ? Number.parseFloat(currentRaw)
            : 0;
      const safeCurrentValue = Number.isFinite(currentValue) ? currentValue : 0;
      const nextValue = safeCurrentValue + delta;

      const payload = {
        records: [
          {
            recordId,
            fields: {
              [fieldKey]: nextValue,
            },
          },
        ],
      };
      await patchDatasheetRecords(datasheetId, payload);

      set((draft) => {
        if (
          draft.scoreRecord?.recordId === recordId &&
          draft.scoreRecord.fields
        ) {
          draft.scoreRecord.fields[fieldKey] = nextValue;
        }
      });

      return nextValue;
    },

    grabNextQuestion: async (userId, groupId) => {
      try {
        const result = await fetchGrabbedQuestion(userId, groupId);
        if (typeof result.remainingCount === "number") {
          const remaining = result.remainingCount;
          set((draft) => {
            draft.oceanRemainingCount = Math.max(0, remaining);
          });
        }
        if (result.question) {
          get().pushQuestion(result.question);
        }
        return result.question;
      } catch (error) {
        if (error instanceof QuestionPoolEmptyError) {
          set((draft) => {
            draft.oceanRemainingCount = 0;
          });
        }
        throw error;
      }
    },

    loadOceanStageConfig: async () => {
      set((draft) => {
        draft.oceanStageConfigStatus = "loading";
        draft.oceanStageConfigError = undefined;
      });

      try {
        const config = await fetchOceanStageConfig();
        set((draft) => {
          draft.oceanStageConfig = config;
          draft.oceanStageConfigStatus = "success";
          draft.oceanStageConfigError = undefined;
          draft.oceanRemainingCount = config.questionCount;
        });
        return config;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "题海环节配置获取失败";
        set((draft) => {
          draft.oceanStageConfig = undefined;
          draft.oceanStageConfigStatus = "error";
          draft.oceanStageConfigError = message;
          draft.oceanRemainingCount = 0;
        });
        throw error;
      }
    },

    fetchWaitingRankings: async () => {
      const state = get();
      const stage = state.stages.find((item) => {
        if (!item?.name) return false;
        return item.name.trim() === RANK_STAGE_NAME && !!item.generalSheetId;
      });

      if (!stage?.generalSheetId) {
        console.warn("缺少总分排名通用表配置");
        throw new Error(RANK_STAGE_MISSING_ERROR);
      }

      set((draft) => {
        draft.waitingTicketView = "rank";
        draft.rankStatus = "loading";
        draft.rankError = undefined;
        draft.rankEntries = [];
      });

      try {
        const records = await fetchDatasheetRecords(stage.generalSheetId);
        const entries = records
          .map(toRankEntry)
          .filter((entry): entry is RankEntry => Boolean(entry));

        entries.sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          return a.schoolName.localeCompare(b.schoolName, "zh-Hans");
        });

        set((draft) => {
          draft.rankEntries = entries;
          draft.rankStatus = "success";
          draft.rankError = undefined;
        });
      } catch (error) {
        console.error("获取排行榜数据失败", error);
        set((draft) => {
          draft.rankStatus = "error";
          draft.rankError = RANK_ERROR_MESSAGE;
          draft.rankEntries = [];
        });
      }
    },
  }})
);
