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
  | "fill"
  | "wordbank"
  | "matching";

export interface MatchingOption {
  id: string;
  label: string;
}

export interface MatchingQuestionConfig {
  prompt?: string;
  left: MatchingOption[];
  right: MatchingOption[];
  maxMatchesPerLeft?: number;
}

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
  matching?: MatchingQuestionConfig;
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

export interface QuizSubmissionStats {
  total?: number;
  correct?: number;
  wrong?: number;
  accuracy?: number;
  lastAnswerTime?: number;
}

export interface QuizSubmissionScore {
  total?: number;
  increment?: number;
}

export interface QuizSubmissionResult {
  correct?: boolean;
  rawResult?: string;
  hpAfterAnswer?: number;
  correctAnswer?: string | string[];
  score?: QuizSubmissionScore;
  stats?: QuizSubmissionStats;
}

export interface QuizRuntimeControls {
  submitAnswer: (value: string | string[]) => Promise<QuizSubmissionResult | undefined>;
  requestNextQuestion: () => Promise<void>;
  reset: () => Promise<void>;
  startLocalTimer: () => void;
  stopLocalTimer: () => void;
  applyHostJudgement?: (result: "correct" | "wrong") => void;
  delegateAnswerTo?: (targetId: string, options?: { isSelf?: boolean }) => void;
  triggerBuzzer?: () => void;
  resetUltimateRound?: () => void;
}

export interface QuizRuntime {
  state: QuizRuntimeState;
  controls: QuizRuntimeControls;
  meta: ContestModeMeta;
}
