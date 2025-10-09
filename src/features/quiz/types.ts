// Quiz domain type definitions and shared enums

export type ContestModeId =
  | "qa"
  | "last-stand"
  | "speed-run"
  | "ocean-adventure"
  | "ultimate-challenge";

export interface ContestModeMeta {
  id: ContestModeId;
  name: string;
  description: string;
  channel: "mqtt" | "api" | "hybrid";
  questionFlow: "push" | "pull" | "local";
  answerFlow: "immediate" | "batched" | "external";
  questionFormat: "standard" | "custom";
  features: ContestModeFeatures;
}

export interface ContestModeFeatures {
  hasHp: boolean;
  initialHp?: number;
  hpLossPerWrong?: number;
  requiresBuzzer: boolean;
  allowsDelegation: boolean;
  supportsTimer: boolean;
  autoAdvance: boolean;
  localQuestionCache: boolean;
}

export type StandardQuestionType =
  | "single"
  | "multiple"
  | "indeterminate"
  | "boolean"
  | "fill";

export interface StandardQuestionOption {
  value: string;
  label: string;
  description?: string;
}

export interface StandardQuestion {
  id: string;
  title: string;
  type: StandardQuestionType;
  options: StandardQuestionOption[];
  timeLimitSeconds?: number;
  correctAnswer?: string | string[];
}

export interface CustomOceanQuestion {
  questionKey: string;
  stem: string;
  categories: string[];
  correctBuckets: string[];
  optionPool: Array<{
    id: string;
    label: string;
    meta?: Record<string, unknown>;
  }>;
  extra?: Record<string, unknown>;
  correctAnswerIds?: string[];
}

export type QuizQuestion = StandardQuestion | CustomOceanQuestion;

export type UltimatePhase =
  | "waiting"
  | "buzz"
  | "decision"
  | "locked"
  | "answer";

export interface QuizRuntimeState {
  mode: ContestModeId;
  question?: QuizQuestion;
  questionIndex: number;
  totalQuestions?: number;
  hp?: number;
  timeRemaining?: number;
  timeElapsed?: number;
  answeringEnabled: boolean;
  awaitingHost?: boolean;
  delegationTargetId?: string | null;
  phase?: UltimatePhase;
}

export interface QuizRuntimeControls {
  submitAnswer: (value: string | string[]) => Promise<boolean | undefined>;
  requestNextQuestion: () => Promise<void>;
  reset: () => Promise<void>;
  startLocalTimer: () => void;
  stopLocalTimer: () => void;
  applyHostJudgement?: (result: "correct" | "wrong") => void;
  delegateAnswerTo?: (targetId: string, options?: { isSelf?: boolean }) => void;
  triggerBuzzer?: () => void;
}

export interface QuizRuntime {
  state: QuizRuntimeState;
  controls: QuizRuntimeControls;
  meta: ContestModeMeta;
}
