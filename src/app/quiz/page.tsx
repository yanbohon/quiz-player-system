"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  NavBar,
  Progress,
  Radio,
  Tag,
} from "@arco-design/mobile-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { ArcoClient } from "@/components/ArcoClient";
import { Toast, Notify } from "@/lib/arco";
import { mqttService } from "@/lib/mqtt/client";
import { useMqttSubscription } from "@/lib/mqtt/hooks";
import { MQTT_TOPICS } from "@/config/control";
import { useAppStore } from "@/store/useAppStore";
import { useQuizStore } from "@/store/quizStore";
import { useQuizRuntime } from "@/features/quiz/useQuizRuntime";
import { CONTEST_MODES, DEFAULT_MODE } from "@/features/quiz/modes";
import {
  ContestModeId,
  CustomOceanQuestion,
  MatchingOption,
  QuizQuestion,
  StandardQuestion,
  StandardQuestionOption,
} from "@/features/quiz/types";
import type { NormalizedQuestion } from "@/lib/normalizeQuestion";
import {
  FillDrawingBoard,
  type FillDrawingBoardHandle,
  FillDrawingBoardEmptyError,
} from "@/features/quiz/components/FillDrawingBoard";
import type { SmoothSerializedStroke } from "@/features/quiz/components/SmoothDrawingCanvas";
import trashIcon from "@/components/icons/trash.svg";
import styles from "./page.module.css";

const MODE_LIST = Object.values(CONTEST_MODES);
const DEFAULT_NOTIFY_OFFSET = 68;
const FILL_SKETCH_CACHE_LIMIT = 10;
const FILL_PREVIEW_STORAGE_KEY = "quiz-fill-preview-cache";

function formatSeconds(seconds?: number) {
  if (seconds === undefined) return "--:--";
  const safe = Math.max(seconds, 0);
  const mins = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const secs = (safe % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function resolveQuestionId(question: QuizQuestion) {
  return "id" in question ? question.id : question.questionKey;
}

function isStandardQuestion(question: QuizQuestion): question is StandardQuestion {
  return "type" in question;
}

function isOceanQuestion(question: QuizQuestion): question is CustomOceanQuestion {
  return "questionKey" in question && !("type" in question);
}

function resolveOptionLetter(question: StandardQuestion, value: string): string {
  const index = question.options.findIndex((option) => option.value === value);
  if (index >= 0) {
    return String.fromCharCode(65 + index);
  }
  return value.toUpperCase();
}

function formatAnswerForQuestionSheet(
  question: StandardQuestion,
  selection: string | string[] | null | undefined
): string {
  if (question.type === "fill") {
    return "填空";
  }

  if (question.type === "wordbank") {
    if (!Array.isArray(selection)) {
      return "未选";
    }
    const labelMap = new Map(
      question.options.map((option) => [option.value, option.label])
    );
    const labels = selection
      .map((item) => (item ? labelMap.get(String(item)) ?? String(item) : ""))
      .filter(Boolean);
    return labels.length > 0 ? labels.join("/") : "未选";
  }

  if (Array.isArray(selection)) {
    if (selection.length === 0) return "未选";
    const letters = selection
      .map((item) => resolveOptionLetter(question, String(item)))
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
      .sort();
    return letters.join("") || "未选";
  }

  if (question.type === "matching") {
    const pairs = normalizeMatchingPairs(selection);
    if (!pairs.length) return "未选";
    return matchingPairsToSheetAnswer(pairs);
  }

  if (!selection) {
    return "未选";
  }

  const letter = resolveOptionLetter(question, String(selection));
  const normalized = letter.trim().toUpperCase();
  return normalized || "未选";
}

function normalizeMatchingPairs(
  selection: string | string[] | null | undefined
): string[] {
  if (!selection) return [];
  if (Array.isArray(selection)) {
    return selection
      .map((item) => String(item))
      .map((item) => item.includes(":") ? item : "")
      .filter(Boolean);
  }
  if (typeof selection === "string" && selection.includes(":")) {
    return [selection];
  }
  return [];
}

function matchingPairsToMap(pairs: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of pairs) {
    const [left, right] = pair.split(":");
    if (left && right) {
      map.set(left.trim(), right.trim());
    }
  }
  return map;
}

function mapToMatchingPairs(map: Map<string, string>): string[] {
  return Array.from(map.entries()).map(([left, right]) => `${left}:${right}`);
}

function matchingPairsToSheetAnswer(pairs: string[]): string {
  const obj = Object.fromEntries(pairs.map((pair) => pair.split(":")));
  return Object.keys(obj).length > 0 ? JSON.stringify(obj) : "未选";
}

const TEAM_IDENTIFIER_KEYS = [
  "用户ID",
  "用户 ID",
  "参赛账号",
  "账号",
  "台号",
  "台号ID",
  "stationId",
  "station",
  "ID",
  "编号",
];

function loadPreviewFromStorage(token: string): string | null {
  if (!token || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FILL_PREVIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    const value = parsed?.[token];
    return typeof value === "string" ? value : null;
  } catch (error) {
    console.warn("Failed to load fill preview from storage", error);
    return null;
  }
}

function savePreviewToStorage(token: string, preview: string) {
  if (!token || !preview || typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(FILL_PREVIEW_STORAGE_KEY);
    const parsed = raw && raw.trim() ? (JSON.parse(raw) as Record<string, string>) : {};
    if (Object.prototype.hasOwnProperty.call(parsed, token)) {
      delete parsed[token];
    }
    parsed[token] = preview;
    const entries = Object.entries(parsed);
    const trimmedEntries = entries.length > FILL_SKETCH_CACHE_LIMIT
      ? entries.slice(entries.length - FILL_SKETCH_CACHE_LIMIT)
      : entries;
    const compact = Object.fromEntries(trimmedEntries);
    window.localStorage.setItem(FILL_PREVIEW_STORAGE_KEY, JSON.stringify(compact));
  } catch (error) {
    console.warn("Failed to persist fill preview to storage", error);
  }
}

function orderMatchingPairs(
  pairs: string[],
  leftOrder: MatchingOption[] | undefined
): string[] {
  if (!leftOrder || leftOrder.length === 0) {
    return [...pairs];
  }
  const map = matchingPairsToMap(pairs);
  const ordered: string[] = [];
  for (const item of leftOrder) {
    const right = map.get(item.id);
    if (right) {
      ordered.push(`${item.id}:${right}`);
    }
  }
  return ordered;
}

type SubmitSource = "manual" | "command";

interface SubmitOptions {
  allowEmpty?: boolean;
  source?: SubmitSource;
}

type BoardStatus = "idle" | "waiting" | "uploading" | "success" | "error";

interface MatchingLineSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
}

function resolveScoreFieldKey(
  question: NormalizedQuestion | undefined,
  fallbackIndex: number
): string | undefined {
  const raw = question?.raw ?? {};
  const candidates = [
    (raw as Record<string, unknown>)?.number,
    (raw as Record<string, unknown>)?.Number,
    (raw as Record<string, unknown>)?.题号,
    (raw as Record<string, unknown>)?.序号,
    (raw as Record<string, unknown>)?.题目编号,
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      const value = String(candidate).trim();
      if (value) {
        return value;
      }
    }
  }

  if (fallbackIndex >= 0) {
    return String(fallbackIndex + 1);
  }

  return undefined;
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      role="img"
      aria-label="倒计时"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path
        d="M12 7.5v4.2l3 1.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function HeartIcon({
  className,
  filled,
}: {
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      className={`${className ?? ""} ${filled ? styles.heartFilled : styles.heartEmpty}`}
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 21s-7.2-4.5-9.6-9A5.7 5.7 0 0 1 5.5 4.2 4.4 4.4 0 0 1 12 6.3a4.4 4.4 0 0 1 6.5-2.1 5.7 5.7 0 0 1 3.1 7.8c-2.4 4.5-9.6 9-9.6 9Z" />
    </svg>
  );
}

function EliminatedIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="m20 20 24 24M44 20 20 44"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function SuccessCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M20 33.5 28.8 42 44 23"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function ErrorBadgeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M20 20 44 44M44 20 20 44"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

interface WordbankToken {
  kind: "text" | "blank";
  content: string;
  blankId?: string;
}

function parseWordbankTemplate(template: string): {
  tokens: WordbankToken[];
  blankIds: string[];
} {
  const tokens: WordbankToken[] = [];
  const blankIds: string[] = [];
  if (!template) {
    return { tokens: [{ kind: "text", content: "" }], blankIds };
  }

  const pattern = /{{(.*?)}}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(template)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        kind: "text",
        content: template.slice(lastIndex, match.index),
      });
    }

    const rawId = (match[1] ?? "").trim();
    const blankId = rawId || `blank${blankIds.length + 1}`;
    tokens.push({
      kind: "blank",
      content: "",
      blankId,
    });
    blankIds.push(blankId);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < template.length) {
    tokens.push({
      kind: "text",
      content: template.slice(lastIndex),
    });
  }

  if (tokens.length === 0) {
    tokens.push({ kind: "text", content: template });
  }

  return { tokens, blankIds };
}

function asStringArray(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value) return [value];
  return [];
}

function arraysShallowEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

function canonicalizeWordbankValue(
  raw: unknown,
  options: StandardQuestionOption[]
): string {
  const token = raw === undefined || raw === null ? "" : String(raw).trim();
  if (!token) return "";

  const direct = options.find((option) => option.value === token);
  if (direct) return direct.value;

  const labelMatch = options.find((option) => option.label === token);
  if (labelMatch) return labelMatch.value;

  if (/^[a-z]$/i.test(token)) {
    const upper = token.toUpperCase();
    const upperMatch = options.find((option) => option.value === upper);
    return upperMatch ? upperMatch.value : upper;
  }

  return token;
}

function canonicalizeWordbankSelections(
  raw: string | string[] | null | undefined,
  blanks: number,
  options: StandardQuestionOption[]
): string[] {
  const base = asStringArray(raw);
  const length = blanks > 0 ? blanks : base.length;
  return Array.from({ length }, (_, index) =>
    canonicalizeWordbankValue(base[index], options)
  );
}

export default function QuizPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = (searchParams.get("mode") as ContestModeId | null) ?? DEFAULT_MODE.id;
  const [mode, setMode] = useState<ContestModeId>(initialMode);

  useEffect(() => {
    const fromQuery = searchParams.get("mode") as ContestModeId | null;
    if (fromQuery && CONTEST_MODES[fromQuery]) {
      setMode(fromQuery);
    }
  }, [searchParams]);

  const { user, isAuthenticated, answers, mqttConnected } = useAppStore(
    useShallow((state) => ({
      user: state.user,
      isAuthenticated: state.isAuthenticated,
      answers: state.answers,
      mqttConnected: state.mqttConnected,
    }))
  );

  const { state, controls, meta } = useQuizRuntime(mode);
  const delegateAnswerToControl = controls.delegateAnswerTo;
  const triggerBuzzerControl = controls.triggerBuzzer;
  const applyHostJudgementControl = controls.applyHostJudgement;
  const {
    currentStage,
    teamProfile,
    scoreRecord,
    submitAnswerChoice,
    submitJudgeResult,
    normalizedQuestions,
    teamProfiles,
    ensureTeamProfile,
  } = useQuizStore(
    useShallow((storeState) => ({
      currentStage: storeState.currentStage,
      teamProfile: storeState.teamProfile,
      scoreRecord: storeState.scoreRecord,
      submitAnswerChoice: storeState.submitAnswerChoice,
      submitJudgeResult: storeState.submitJudgeResult,
      normalizedQuestions: storeState.questions,
      teamProfiles: storeState.teamProfiles,
      ensureTeamProfile: storeState.ensureTeamProfile,
    }))
  );
  const [selected, setSelected] = useState<string | string[] | null>(null);
  const [matchingPairs, setMatchingPairs] = useState<string[]>([]);
  const [isSubmitting, setSubmitting] = useState(false);
  const [canBuzz, setCanBuzz] = useState(() => meta.id !== "ultimate-challenge");
  const progressUserLabel = useMemo(
    () => teamProfile?.displayName ?? user?.name ?? null,
    [teamProfile?.displayName, user?.name]
  );
  const controlMessage = useMqttSubscription(
    MQTT_TOPICS.control,
    meta.id === "ultimate-challenge"
  );
  const resultMessage = useMqttSubscription(
    MQTT_TOPICS.result,
    meta.id === "ultimate-challenge"
  );
  const shouldHandleSubmitCommand =
    meta.id === "qa" || meta.id === "last-stand" || meta.id === "ultimate-challenge";
  const commandMessage = useMqttSubscription(
    MQTT_TOPICS.command,
    shouldHandleSubmitCommand
  );
  const navWrapperRef = useRef<HTMLDivElement | null>(null);
  const [isBoardOpen, setBoardOpen] = useState(false);
  const boardRef = useRef<FillDrawingBoardHandle | null>(null);
  const [boardStatus, setBoardStatus] = useState<BoardStatus>("idle");
  const fillSketchCacheRef = useRef<
    Record<string, { preview?: string; paths?: SmoothSerializedStroke[] }>
  >({});
  const [fillPreview, setFillPreview] = useState<string | null>(null);
  const [cachedPaths, setCachedPaths] = useState<SmoothSerializedStroke[] | null>(null);
  const lastQuestionIdRef = useRef<string | null>(null);
  const lastSubmitCommandRef = useRef<number | null>(null);
  const [notifyOffset, setNotifyOffset] = useState(DEFAULT_NOTIFY_OFFSET);
  const [isCommandSubmissionLocked, setCommandSubmissionLocked] = useState(false);
  const [wordbankActiveIndex, setWordbankActiveIndex] = useState<number | null>(null);
  const [activeMatchingLeft, setActiveMatchingLeft] = useState<string | null>(null);
  const matchingBoardRef = useRef<HTMLDivElement | null>(null);
  const [matchingLines, setMatchingLines] = useState<MatchingLineSegment[]>([]);
  const [matchingOverlaySize, setMatchingOverlaySize] = useState<{ width: number; height: number }>(
    { width: 0, height: 0 }
  );
  const matchingLineRafRef = useRef<number | null>(null);
  const lastBuzzResultRef = useRef<{ questionId: string | null; timestamp: number }>({
    questionId: null,
    timestamp: 0,
  });
  const [lockedWinnerId, setLockedWinnerId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      Toast.info("请先登录");
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateOffset = () => {
      const rect = navWrapperRef.current?.getBoundingClientRect();
      if (rect) {
        setNotifyOffset(rect.bottom);
      }
    };

    updateOffset();

    const resizeObserver =
      typeof ResizeObserver !== "undefined" && navWrapperRef.current
        ? new ResizeObserver(updateOffset)
        : null;

    if (resizeObserver && navWrapperRef.current) {
      resizeObserver.observe(navWrapperRef.current);
    }

    window.addEventListener("resize", updateOffset);
    window.addEventListener("scroll", updateOffset, { passive: true });

    return () => {
      window.removeEventListener("resize", updateOffset);
      window.removeEventListener("scroll", updateOffset);
      resizeObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (meta.id !== "ultimate-challenge") {
      setLockedWinnerId(null);
    }
  }, [meta.id]);

  const question = state.question;
  const questionId = question ? resolveQuestionId(question) : null;
  const isWordbankQuestion =
    !!question && isStandardQuestion(question) && question.type === "wordbank";
  const isMatchingQuestion =
    !!question && isStandardQuestion(question) && question.type === "matching";
  const matchingConfig =
    question && isStandardQuestion(question) && question.type === "matching"
      ? question.matching ?? null
      : null;

  const wordbankTemplate = useMemo(() => {
    if (!isWordbankQuestion || !question || !isStandardQuestion(question)) {
      return null;
    }
    return parseWordbankTemplate(question.title);
  }, [isWordbankQuestion, question]);

  const wordbankOptions = useMemo(() => {
    if (!isWordbankQuestion || !question || !isStandardQuestion(question)) {
      return [] as StandardQuestionOption[];
    }
    return question.options;
  }, [isWordbankQuestion, question]);

  useEffect(() => {
    if (meta.id !== "ultimate-challenge") return;
    lastBuzzResultRef.current = {
      questionId,
      timestamp: 0,
    };
  }, [meta.id, questionId]);

  const wordbankOptionLabelMap = useMemo(() => {
    if (!isWordbankQuestion) {
      return null;
    }
    const map = new Map<string, string>();
    wordbankOptions.forEach((option) => map.set(option.value, option.label));
    return map;
  }, [isWordbankQuestion, wordbankOptions]);

  const wordbankValues = useMemo(() => {
    if (!isWordbankQuestion || !wordbankTemplate) return [];
    const blanks = wordbankTemplate.blankIds.length;
    return canonicalizeWordbankSelections(selected, blanks, wordbankOptions);
  }, [isWordbankQuestion, selected, wordbankOptions, wordbankTemplate]);

  const selectionSummary = useMemo<{
    tokens: string[];
    emptyLabel?: string;
  } | null>(() => {
    if (!question) return null;

    const dedupeTokens = (values: string[]): string[] => {
      const seen = new Set<string>();
      const result: string[] = [];
      for (const raw of values) {
        const token = raw.trim();
        if (!token || seen.has(token)) continue;
        seen.add(token);
        result.push(token);
      }
      return result;
    };

    const buildSummary = (tokens: string[], emptyLabel?: string) => ({
      tokens,
      emptyLabel: emptyLabel ?? (tokens.length ? undefined : "未选"),
    });

    if (isStandardQuestion(question)) {
      switch (question.type) {
        case "single":
        case "boolean": {
          const value =
            typeof selected === "string"
              ? selected
              : Array.isArray(selected) && selected.length > 0
              ? selected[0]
              : "";
          if (!value) return buildSummary([], "未选");
          const letter = resolveOptionLetter(question, String(value)).toUpperCase();
          return buildSummary([letter]);
        }
        case "multiple":
        case "indeterminate": {
          const values = Array.isArray(selected)
            ? selected
            : typeof selected === "string" && selected
            ? [selected]
            : [];
          const letters = dedupeTokens(
            values
              .map((value) => resolveOptionLetter(question, String(value)).trim().toUpperCase())
              .filter(Boolean)
          ).sort();
          return buildSummary(letters);
        }
        case "wordbank": {
          const letters = wordbankValues
            .map((value) => {
              const token = value?.trim?.() ?? "";
              if (!token) return "";
              const optionIndex = question.options.findIndex((option) => option.value === token);
              return optionIndex >= 0 ? String.fromCharCode(65 + optionIndex) : "";
            })
            .filter(Boolean);
          return buildSummary(letters);
        }
        case "matching": {
          if (!matchingPairs.length) return buildSummary([], "未选");
          const leftItems = matchingConfig?.left ?? [];
          const rightItems = matchingConfig?.right ?? [];
          const tokens = matchingPairs.map((pair) => {
            const [leftId, rightId] = pair.split(":");
            const leftIndex = leftItems.findIndex((item) => item.id === leftId);
            const rightIndex = rightItems.findIndex((item) => item.id === rightId);
            const leftLabel = leftIndex >= 0 ? String(leftIndex + 1) : leftId;
            const rightLetter = rightIndex >= 0 ? String.fromCharCode(65 + rightIndex) : rightId;
            return `${leftLabel}-${rightLetter}`;
          });
          return buildSummary(tokens);
        }
        case "fill": {
          return null;
        }
        default: {
          const value =
            typeof selected === "string"
              ? selected
              : Array.isArray(selected) && selected.length > 0
              ? selected.join(" ")
              : "";
          return value ? buildSummary([value]) : buildSummary([], "未选");
        }
      }
    }

    if (isOceanQuestion(question)) {
      const values = Array.isArray(selected)
        ? selected
        : typeof selected === "string" && selected
        ? [selected]
        : [];
      const letters = values
        .map((value) => {
          const index = question.optionPool.findIndex((option) => option.id === value);
          return index >= 0 ? String.fromCharCode(65 + index) : "";
        })
        .filter(Boolean);
      return buildSummary(letters);
    }

    return buildSummary([], "未选");
  }, [
    matchingConfig,
    matchingPairs,
    question,
    selected,
    wordbankValues,
  ]);

  const lockedWinnerProfile = useMemo(() => {
    if (!lockedWinnerId) return null;
    const normalized = lockedWinnerId.trim();
    if (!normalized) return null;
    const profiles = teamProfiles ?? {};
    const direct = profiles[normalized];
    if (direct) return direct;
    for (const profile of Object.values(profiles)) {
      if (!profile) continue;
      const identifier =
        typeof profile.identifier === "string" ? profile.identifier.trim() : "";
      if (identifier && identifier === normalized) {
        return profile;
      }
      const fields = profile.fields ?? {};
      for (const key of TEAM_IDENTIFIER_KEYS) {
        const value = fields?.[key];
        if (value !== undefined && value !== null) {
          if (String(value).trim() === normalized) {
            return profile;
          }
        }
      }
    }
    return null;
  }, [lockedWinnerId, teamProfiles]);

  const lockedWinnerLabel = useMemo(() => {
    if (!lockedWinnerId) {
      return "对方队伍";
    }
    const profile = lockedWinnerProfile;
    if (profile?.displayName) {
      return profile.displayName;
    }
    return `台号${lockedWinnerId}`;
  }, [lockedWinnerId, lockedWinnerProfile]);

  useEffect(() => {
    if (!lockedWinnerId) return;
    if (lockedWinnerProfile) return;
    void ensureTeamProfile(lockedWinnerId).catch((error) => {
      console.warn("Failed to ensure team profile for identifier", lockedWinnerId, error);
    });
  }, [ensureTeamProfile, lockedWinnerId, lockedWinnerProfile]);

  useEffect(() => {
    if (!isWordbankQuestion || !wordbankTemplate) return;
    const blanks = wordbankTemplate.blankIds.length;
    const normalized = canonicalizeWordbankSelections(
      selected,
      blanks,
      wordbankOptions
    );
    const base = asStringArray(selected);
    if (!arraysShallowEqual(normalized, base)) {
      setSelected(normalized);
    }
  }, [isWordbankQuestion, selected, wordbankOptions, wordbankTemplate]);

  const wordbankUsedValues = useMemo(
    () => new Set(wordbankValues.filter((item) => item)),
    [wordbankValues]
  );

  const matchingSelectionMap = useMemo(() => matchingPairsToMap(matchingPairs), [matchingPairs]);
  const matchingUsedRightIds = useMemo(() => {
    const used = new Set<string>();
    for (const rightId of matchingSelectionMap.values()) {
      used.add(rightId);
    }
    return used;
  }, [matchingSelectionMap]);
  const matchingRightToLeftMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const [leftId, rightId] of matchingSelectionMap.entries()) {
      map.set(rightId, leftId);
    }
    return map;
  }, [matchingSelectionMap]);
  const updateMatchingLines = useCallback(() => {
    if (!matchingBoardRef.current || !isMatchingQuestion) {
      setMatchingLines([]);
      setMatchingOverlaySize({ width: 0, height: 0 });
      return;
    }
    const container = matchingBoardRef.current;
    const containerRect = container.getBoundingClientRect();
    const escapeSelector = (value: string) => {
      if (typeof window !== "undefined" && window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(value);
      }
      return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
    };
    const segments: MatchingLineSegment[] = [];
    matchingSelectionMap.forEach((rightId, leftId) => {
      const leftSelector = escapeSelector(leftId);
      const rightSelector = escapeSelector(rightId);
      const leftEl = container.querySelector<HTMLElement>(`[data-left-id="${leftSelector}"]`);
      const rightEl = container.querySelector<HTMLElement>(`[data-right-id="${rightSelector}"]`);
      if (!leftEl || !rightEl) {
        return;
      }
      const leftRect = leftEl.getBoundingClientRect();
      const rightRect = rightEl.getBoundingClientRect();
      segments.push({
        id: `${leftId}:${rightId}`,
        x1: leftRect.right - containerRect.left,
        y1: leftRect.top + leftRect.height / 2 - containerRect.top,
        x2: rightRect.left - containerRect.left,
        y2: rightRect.top + rightRect.height / 2 - containerRect.top,
        active: activeMatchingLeft === leftId,
      });
    });
    setMatchingOverlaySize({
      width: containerRect.width,
      height: containerRect.height,
    });
    setMatchingLines(segments);
  }, [activeMatchingLeft, isMatchingQuestion, matchingSelectionMap]);

  useEffect(() => {
    if (!isMatchingQuestion) {
      setMatchingLines([]);
      setMatchingOverlaySize({ width: 0, height: 0 });
      return;
    }
    const raf = requestAnimationFrame(() => {
      updateMatchingLines();
    });
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [isMatchingQuestion, matchingPairs, updateMatchingLines]);

  useEffect(() => {
    if (!isMatchingQuestion) return;
    const handle = () => {
      if (matchingLineRafRef.current !== null) {
        cancelAnimationFrame(matchingLineRafRef.current);
      }
      matchingLineRafRef.current = requestAnimationFrame(() => {
        updateMatchingLines();
        matchingLineRafRef.current = null;
      });
    };
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
      if (matchingLineRafRef.current !== null) {
        cancelAnimationFrame(matchingLineRafRef.current);
        matchingLineRafRef.current = null;
      }
    };
  }, [isMatchingQuestion, updateMatchingLines]);

  useEffect(() => {
    if (!isMatchingQuestion) return;
    const container = matchingBoardRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      updateMatchingLines();
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [isMatchingQuestion, updateMatchingLines]);

  const ultimateStage =
    meta.id === "ultimate-challenge"
      ? state.phase ?? (question ? "buzz" : "waiting")
      : undefined;
  useEffect(() => {
    if (ultimateStage !== "locked") {
      setLockedWinnerId(null);
    }
  }, [ultimateStage]);

  useEffect(() => {
    if (meta.id !== "ultimate-challenge") {
      setCanBuzz(true);
      return;
    }
    setCanBuzz(false);
  }, [meta.id, questionId, ultimateStage]);

  useEffect(() => {
    if (!controlMessage || meta.id !== "ultimate-challenge") return;

    const rawPayload = controlMessage.payload?.trim();
    if (!rawPayload) return;

    let action: string | undefined;
    try {
      const parsed = JSON.parse(rawPayload) as {
        action?: unknown;
        type?: unknown;
        command?: unknown;
      };
      if (parsed && typeof parsed === "object") {
        const candidate =
          (parsed as Record<string, unknown>).action ??
          (parsed as Record<string, unknown>).type ??
          (parsed as Record<string, unknown>).command;
        if (typeof candidate === "string") {
          action = candidate;
        }
      }
    } catch {
      action = rawPayload;
    }

    const normalizedAction = (action ?? rawPayload).trim().toLowerCase();
    if (normalizedAction !== "start_buzzing") return;
    if (ultimateStage !== "buzz") return;

    lastBuzzResultRef.current = {
      questionId,
      timestamp: 0,
    };
    setCanBuzz(true);
    setLockedWinnerId(null);
  }, [controlMessage, meta.id, ultimateStage, questionId]);

  useEffect(() => {
    if (!resultMessage || meta.id !== "ultimate-challenge") return;
    if (ultimateStage !== "buzz") return;
    if (!questionId) return;

    const previous = lastBuzzResultRef.current;
    if (previous.questionId === questionId && resultMessage.timestamp <= previous.timestamp) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(resultMessage.payload);
    } catch (error) {
      console.warn("Failed to parse buzz result payload", error);
      return;
    }

    if (!parsed || typeof parsed !== "object") return;
    const winnerCandidate =
      (parsed as Record<string, unknown>).winnerId ??
      (parsed as Record<string, unknown>).winner_id ??
      (parsed as Record<string, unknown>).winnerID;
    if (winnerCandidate === undefined || winnerCandidate === null) return;

    const winnerId = String(winnerCandidate).trim();
    if (!winnerId) return;

    lastBuzzResultRef.current = {
      questionId,
      timestamp: resultMessage.timestamp,
    };
    setCanBuzz(false);

    const currentUserId = user?.id ? String(user.id) : null;
    if (currentUserId && winnerId === currentUserId) {
      if (!delegateAnswerToControl) {
        Toast.warn("当前不可进入作答阶段");
        return;
      }
      delegateAnswerToControl(currentUserId, { isSelf: true });
      setSelected(null);
      setLockedWinnerId(null);
      Toast.success("抢答成功，开始作答");
      return;
    }

    delegateAnswerToControl?.(winnerId, { isSelf: false });
    setLockedWinnerId(winnerId);
    Toast.info("本题由其他队伍抢答成功");
  }, [
    delegateAnswerToControl,
    meta.id,
    questionId,
    resultMessage,
    ultimateStage,
    user?.id,
  ]);

  useEffect(() => {
    if (!question || !questionId) {
      setSelected(null);
      setMatchingPairs([]);
      setActiveMatchingLeft(null);
      return;
    }

    const persisted = answers[questionId]?.value;
    if (isMatchingQuestion) {
      const nextPairs = normalizeMatchingPairs(
        Array.isArray(persisted) ? persisted : typeof persisted === "string" ? persisted : null
      );
      setMatchingPairs(nextPairs);
      setSelected(null);
      setActiveMatchingLeft(null);
      return;
    }

    if (Array.isArray(persisted)) {
      setSelected(persisted);
      return;
    }
    if (typeof persisted === "string") {
      setSelected(persisted);
      return;
    }

    if (
      isStandardQuestion(question) &&
      (question.type === "multiple" ||
        question.type === "indeterminate" ||
        question.type === "wordbank")
    ) {
      setSelected([]);
    } else if (
      isStandardQuestion(question) &&
      question.type === "matching"
    ) {
      setMatchingPairs([]);
      setSelected(null);
    } else if (isOceanQuestion(question)) {
      setSelected([]);
    } else {
      setSelected(null);
    }
  }, [answers, isMatchingQuestion, question, questionId]);

  useEffect(() => {
    if (questionId) {
      setBoardOpen(false);
      setBoardStatus("idle");
      lastSubmitCommandRef.current = null;
      setLockedWinnerId(null);
    }
  }, [questionId]);

  useEffect(() => {
    if (isBoardOpen && boardStatus === "idle") {
      setBoardStatus("waiting");
    }
  }, [isBoardOpen, boardStatus]);

  useEffect(() => {
    if (!isBoardOpen && boardStatus !== "success" && boardStatus !== "idle") {
      setBoardStatus("idle");
    }
  }, [isBoardOpen, boardStatus]);

  useEffect(() => {
    if (
      !questionId ||
      !question ||
      !isStandardQuestion(question) ||
      question.type !== "fill"
    ) {
      setFillPreview(null);
      setCachedPaths(null);
      return;
    }
    let cache = fillSketchCacheRef.current[questionId];
    let preview = cache?.preview ?? null;
    if (!preview) {
      const token = typeof selected === "string" ? selected.trim() : "";
      if (token) {
        const stored = loadPreviewFromStorage(token);
        if (stored) {
          preview = stored;
          fillSketchCacheRef.current[questionId] = {
            ...(cache ?? {}),
            preview: stored,
          };
          cache = fillSketchCacheRef.current[questionId];
        }
      }
    }
    setFillPreview(preview ?? null);
    setCachedPaths(cache?.paths ?? null);
  }, [question, questionId, selected]);

  useEffect(() => {
    const previousId = lastQuestionIdRef.current;
    if (questionId && questionId !== previousId) {
      setCommandSubmissionLocked(false);
      setWordbankActiveIndex(null);
      setActiveMatchingLeft(null);
      lastQuestionIdRef.current = questionId;
      return;
    }

    if (!questionId) {
      setCommandSubmissionLocked(false);
      setWordbankActiveIndex(null);
      setActiveMatchingLeft(null);
      lastQuestionIdRef.current = null;
    }
  }, [questionId]);

  const totalQuestions = state.totalQuestions;
  const currentIndex = state.questionIndex >= 0 ? state.questionIndex : 0;
  const showProgress = totalQuestions !== undefined && totalQuestions > 0;
  const progress = useMemo(() => {
    if (!showProgress) return 0;
    return Math.round(((currentIndex + 1) / (totalQuestions || 1)) * 100);
  }, [currentIndex, showProgress, totalQuestions]);

  const hpDisplay = meta.features.hasHp
    ? {
        current: state.hp ?? meta.features.initialHp ?? 0,
        initial: meta.features.initialHp ?? 0,
      }
    : null;

  const isEliminated = meta.id === "last-stand" && (hpDisplay?.current ?? 0) <= 0;

  const buzzerStatusLabel = useMemo(() => {
    if (!meta.features.requiresBuzzer) return null;
    if (meta.id !== "ultimate-challenge") {
      return state.awaitingHost ? "未抢答" : "等待裁决";
    }
    switch (ultimateStage) {
      case "waiting":
        return "等待主持人";
      case "buzz":
        return "等待抢答";
      case "decision":
        return "选择作答方";
      case "locked":
        return "等待对手";
      case "answer":
        return "本队作答中";
      default:
        return state.awaitingHost ? "未抢答" : "等待裁决";
    }
  }, [meta.features.requiresBuzzer, meta.id, state.awaitingHost, ultimateStage]);

  const handleModeChange = (nextMode: ContestModeId) => {
    setMode(nextMode);
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", nextMode);
    router.replace(`/quiz?${params.toString()}`);
  };

  const handleSelect = (value: string) => {
    setSelected(value);
  };

  const handleMultiSelect = (values: (string | number)[]) => {
    setSelected(values.map(String));
  };

  const handleWordbankBlankClick = useCallback(
    (index: number) => {
      if (!state.answeringEnabled) return;
      setWordbankActiveIndex(index);
    },
    [state.answeringEnabled]
  );

  const handleWordbankClear = useCallback(
    (index: number) => {
      if (!state.answeringEnabled) return;
      const next = [...wordbankValues];
      if (!next[index]) {
        setWordbankActiveIndex(index);
        return;
      }
      next[index] = "";
      setSelected([...next]);
      setWordbankActiveIndex(index);
    },
    [state.answeringEnabled, wordbankValues]
  );

  const handleWordbankSelectOption = useCallback(
    (optionValue: string, isUsed?: boolean) => {
      if (!state.answeringEnabled || !wordbankTemplate) return;
      if (isUsed) {
        return;
      }
      const safeValue = canonicalizeWordbankValue(optionValue, wordbankOptions);
      const next = [...wordbankValues];

      let targetIndex =
        wordbankActiveIndex !== null && wordbankActiveIndex >= 0
          ? wordbankActiveIndex
          : next.findIndex((item) => !item);
      if (targetIndex === -1) {
        targetIndex =
          wordbankActiveIndex !== null ? wordbankActiveIndex : next.length - 1;
      }
      if (targetIndex < 0) return;

      const existingIndex = next.findIndex(
        (item, idx) => item === safeValue && idx !== targetIndex
      );
      if (existingIndex !== -1) {
        next[existingIndex] = "";
      }

      next[targetIndex] = safeValue;
      const blanks = wordbankTemplate.blankIds.length;
      const sanitizedNext = canonicalizeWordbankSelections(
        next,
        blanks,
        wordbankOptions
      );
      setSelected(sanitizedNext);

      if (targetIndex < next.length - 1) {
        setWordbankActiveIndex(targetIndex + 1);
      } else {
        const hasEmpty = sanitizedNext.some((item) => !item);
        setWordbankActiveIndex(hasEmpty ? 0 : null);
      }
    },
    [
      state.answeringEnabled,
      wordbankOptions,
      wordbankTemplate,
      wordbankValues,
      wordbankActiveIndex,
    ]
  );

  const handleMatchingLeftClick = useCallback(
    (leftId: string) => {
      if (!state.answeringEnabled) return;
      setActiveMatchingLeft((prev) => (prev === leftId ? null : leftId));
    },
    [state.answeringEnabled]
  );

  const handleMatchingRightClick = useCallback(
    (rightId: string) => {
      if (!state.answeringEnabled) return;

      if (activeMatchingLeft) {
        setMatchingPairs((prev) => {
          const map = matchingPairsToMap(prev);
          const currentValue = map.get(activeMatchingLeft);
          for (const [leftKey, value] of map.entries()) {
            if (value === rightId) {
              map.delete(leftKey);
            }
          }
          if (currentValue === rightId) {
            map.delete(activeMatchingLeft);
          } else {
            map.set(activeMatchingLeft, rightId);
          }
          const nextPairs = mapToMatchingPairs(map);
          return orderMatchingPairs(nextPairs, matchingConfig?.left);
        });
        setActiveMatchingLeft(null);
        return;
      }

      for (const [leftKey, value] of matchingSelectionMap.entries()) {
        if (value === rightId) {
          setActiveMatchingLeft(leftKey);
          return;
        }
      }
    },
    [activeMatchingLeft, matchingConfig?.left, matchingSelectionMap, state.answeringEnabled]
  );

  const handleClearMatchingPairs = useCallback(() => {
    if (!state.answeringEnabled || matchingPairs.length === 0) {
      return;
    }
    setMatchingPairs([]);
    setActiveMatchingLeft(null);
  }, [matchingPairs, state.answeringEnabled]);

  const handleOpenBoard = useCallback(() => {
    if (isBoardOpen || boardStatus === "success") return;
    setBoardStatus("waiting");
    lastSubmitCommandRef.current = null;
    setBoardOpen(true);
  }, [boardStatus, isBoardOpen]);

  const handleBoardPathsChange = useCallback(
    (paths: SmoothSerializedStroke[]) => {
      if (!questionId) return;
      const cache = fillSketchCacheRef.current[questionId] ?? {};
      fillSketchCacheRef.current[questionId] = {
        ...cache,
        paths,
      };
      setCachedPaths(paths.length > 0 ? paths : null);
    },
    [questionId]
  );

  const handleBoardUploadSuccess = useCallback(
    ({
      token,
      preview,
      paths,
    }: {
      token: string;
      preview: string;
      paths: SmoothSerializedStroke[];
    }) => {
      if (
        !questionId ||
        !question ||
        !isStandardQuestion(question) ||
        question.type !== "fill"
      ) {
        return;
      }
      setSelected(token);
      fillSketchCacheRef.current[questionId] = {
        preview,
        paths,
      };
      savePreviewToStorage(token, preview);
      setFillPreview(preview);
      setCachedPaths(paths);
      setBoardStatus("success");
    },
    [question, questionId]
  );

  const handleSubmit = useCallback(
    async (options: SubmitOptions = {}, overrideValue?: string | string[]) => {
      const { allowEmpty = false, source = "manual" } = options;
      if (isSubmitting) return;

      const currentQuestion = question;
      if (!currentQuestion) {
        if (source === "manual") {
          Toast.warn("当前无法提交答案");
        }
        return;
      }

      if (!state.answeringEnabled) {
        if (source === "manual") {
          Toast.warn("当前无法提交答案");
        }
        return;
      }

      let resolvedSelection: string | string[] | null | undefined = overrideValue;
      if (resolvedSelection === undefined) {
        resolvedSelection =
          isStandardQuestion(currentQuestion) && currentQuestion.type === "matching"
            ? matchingPairs
            : selected;
      }

      let submissionValue: string | string[] = "";
      let questionSheetAnswer: string | undefined;

      if (isStandardQuestion(currentQuestion)) {
        if (currentQuestion.type === "matching") {
          const pairCandidates = Array.isArray(resolvedSelection)
            ? normalizeMatchingPairs(resolvedSelection)
            : normalizeMatchingPairs(
                typeof resolvedSelection === "string" ? resolvedSelection : null
              );
          const orderedPairs = orderMatchingPairs(
            pairCandidates,
            currentQuestion.matching?.left
          );
          const pairMap = matchingPairsToMap(orderedPairs);
          const expectedPairs = currentQuestion.matching?.left?.length ?? 0;
          const hasPairs = pairMap.size > 0;
          const hasAllPairs =
            expectedPairs > 0 ? pairMap.size === expectedPairs : hasPairs;
          const isSameOrder =
            matchingPairs.length === orderedPairs.length &&
            matchingPairs.every((pair, index) => pair === orderedPairs[index]);
          if (!isSameOrder) {
            setMatchingPairs(orderedPairs);
          }
          if (!allowEmpty && !hasAllPairs) {
            Toast.warn(expectedPairs > 0 ? "请完成全部连线" : "请至少完成一条连线");
            return;
          }
          submissionValue = orderedPairs;
          questionSheetAnswer = orderedPairs.length
            ? matchingPairsToSheetAnswer(orderedPairs)
            : "未选";
        } else if (
          currentQuestion.type === "multiple" ||
          currentQuestion.type === "indeterminate"
        ) {
          const values = Array.isArray(resolvedSelection)
            ? resolvedSelection.map(String)
            : typeof resolvedSelection === "string" && resolvedSelection
            ? [resolvedSelection]
            : [];
          if (!allowEmpty && values.length === 0) {
            Toast.warn("请至少选择一个选项");
            return;
          }
          submissionValue = values;
          questionSheetAnswer = formatAnswerForQuestionSheet(
            currentQuestion,
            values.length > 0 ? values : null
          );
        } else if (currentQuestion.type === "wordbank") {
          const { blankIds } = parseWordbankTemplate(currentQuestion.title);
          const values = Array.isArray(resolvedSelection)
            ? resolvedSelection.map(String)
            : typeof resolvedSelection === "string" && resolvedSelection
            ? [resolvedSelection]
            : [];
          const normalizedValues = blankIds.length
            ? blankIds.map((_, index) => values[index] ?? "")
            : values;
          const canonicalValues = normalizedValues.map((item) =>
            canonicalizeWordbankValue(item, currentQuestion.options)
          );
          const hasEmpty =
            blankIds.length > 0
              ? canonicalValues.some((item) => !item)
              : canonicalValues.length === 0 || canonicalValues.some((item) => !item);
          if (!allowEmpty && hasEmpty) {
            Toast.warn("请完成所有填空");
            return;
          }
          submissionValue = canonicalValues;
          const hasValue = canonicalValues.some((item) => item);
          questionSheetAnswer = hasValue
            ? JSON.stringify(canonicalValues)
            : "未选";
        } else if (currentQuestion.type === "fill") {
          const value =
            typeof resolvedSelection === "string"
              ? resolvedSelection.trim()
              : "";
          if (!allowEmpty && !value) {
            Toast.warn("请使用画板功能作答");
            return;
          }
          submissionValue = value;
          questionSheetAnswer = value || "空画板";
        } else {
          const value =
            typeof resolvedSelection === "string" ? resolvedSelection : "";
          if (!allowEmpty && !value) {
            Toast.warn("请选择一个选项");
            return;
          }
          submissionValue = value;
          questionSheetAnswer = formatAnswerForQuestionSheet(
            currentQuestion,
            value || null
          );
        }
      } else if (isOceanQuestion(currentQuestion)) {
        const values = Array.isArray(resolvedSelection)
          ? resolvedSelection.map(String)
          : typeof resolvedSelection === "string" && resolvedSelection
          ? [resolvedSelection]
          : [];
        if (!allowEmpty && values.length === 0) {
          Toast.warn("请至少选择一个选项");
          return;
        }
        submissionValue = values;
      } else {
        submissionValue =
          typeof resolvedSelection === "string" ? resolvedSelection : "";
      }

      setSubmitting(true);
      try {
        const result = await controls.submitAnswer(submissionValue);

        if (shouldHandleSubmitCommand && isStandardQuestion(currentQuestion)) {
          const questionKey = currentQuestion.id;
          const normalizedQuestion = normalizedQuestions.find(
            (item) => item.id === questionKey
          );
          const questionRecordId = normalizedQuestion?.recordId
            ? String(normalizedQuestion.recordId)
            : undefined;
          const questionSheetId = currentStage?.questionSheetId;
          const scoreSheetId = currentStage?.scoreSheetId;
          const scoreRecordId = scoreRecord?.recordId;
          const userId = user?.id ?? undefined;
          const answerForSheet = questionSheetAnswer || "未选";
          const correctness = result === true ? "1" : "0";
          const scoreAnswerValue =
            currentQuestion.type === "fill" ? "填空" : correctness;
          const lightValue: "0" | "1" = correctness === "1" ? "1" : "0";
          const durationMs = answers[questionKey]?.durationMs;
          const shouldReportTime = meta.id === "speed-run";
          const timeSeconds =
            shouldReportTime && typeof durationMs === "number"
              ? Math.round(durationMs / 1000)
              : undefined;
          const scoreFieldKey = resolveScoreFieldKey(
            normalizedQuestion,
            state.questionIndex
          );
          const persistenceTasks: Promise<unknown>[] = [];

          if (questionSheetId && questionRecordId && userId) {
            persistenceTasks.push(
              submitAnswerChoice({
                datasheetId: questionSheetId,
                recordId: questionRecordId,
                userId,
                fieldKey: userId,
                answer: answerForSheet,
              })
            );
          }

          if (scoreSheetId && scoreRecordId && scoreFieldKey) {
            persistenceTasks.push(
              submitJudgeResult({
                datasheetId: scoreSheetId,
                recordId: scoreRecordId,
                questionId: scoreFieldKey,
                answer: scoreAnswerValue,
                time: timeSeconds,
                light: lightValue,
              })
            );
          }

          if (persistenceTasks.length > 0) {
            try {
              await Promise.all(persistenceTasks);
            } catch (persistError) {
              console.error("同步答题记录失败", persistError);
              Toast.error("答题结果同步失败");
            }
          }
        }

        const showCorrectness =
          meta.id === "speed-run" || meta.id === "ocean-adventure";
        const notifyStyle = {
          position: "fixed" as const,
          top: notifyOffset,
          left: 0,
          right: 0,
          pointerEvents: "none" as const,
          display: "flex",
          justifyContent: "center",
          zIndex: 1200,
        };
        if (source === "command") {
          setCommandSubmissionLocked(true);
        } else {
          setCommandSubmissionLocked(false);
          if (showCorrectness) {
            if (result === true) {
              Notify.success({
                content: "回答正确",
                style: notifyStyle,
                duration: 500,
              });
            } else if (result === false) {
              Notify.error({
                content: "回答错误",
                style: notifyStyle,
                duration: 500,
              });
            } else {
              Notify.info({
                content: "答案已提交",
                style: notifyStyle,
                duration: 500,
              });
            }
          } else {
            Toast.success("答案已提交");
          }
        }

        if (meta.id === "ocean-adventure") {
          await controls.requestNextQuestion();
        }
      } catch (error) {
        Toast.error("提交失败，请稍后重试");
        console.error(error);
      } finally {
        setSubmitting(false);
      }
    },
    [
      answers,
      controls,
      currentStage,
      meta.id,
      normalizedQuestions,
      notifyOffset,
      scoreRecord,
      selected,
      matchingPairs,
      shouldHandleSubmitCommand,
      state.answeringEnabled,
      state.questionIndex,
      submitAnswerChoice,
      submitJudgeResult,
      question,
      user?.id,
      isSubmitting,
    ]
  );

  useEffect(() => {
    if (!commandMessage) return;
    if (boardStatus === "uploading" || boardStatus === "success") return;
    const rawPayload = commandMessage.payload.trim();

    if (/^\d+$/.test(rawPayload)) {
      setCommandSubmissionLocked(false);
    }

    if (!shouldHandleSubmitCommand) return;
    if (rawPayload.toLowerCase() !== "submit") return;
    if (commandMessage.timestamp === lastSubmitCommandRef.current) return;
    lastSubmitCommandRef.current = commandMessage.timestamp;

    const executeSubmission = async () => {
      if (question && isStandardQuestion(question) && question.type === "fill") {
        if (!boardRef.current) {
          Toast.warn("画板尚未打开，无法提交");
          return;
        }
        try {
          Toast.info("正在上传画板");
          setBoardStatus("uploading");
          const result = await boardRef.current.exportAndUpload();
          setBoardStatus("success");
          await handleSubmit(
            { allowEmpty: true, source: "command" },
            result.token
          );
          setBoardOpen(false);
        } catch (error) {
          if (error instanceof FillDrawingBoardEmptyError) {
            setBoardStatus("success");
            setBoardOpen(false);
            await handleSubmit({ allowEmpty: true, source: "command" });
            return;
          }
          console.error("画板上传失败", error);
          setBoardStatus("error");
        }
        return;
      }
      await handleSubmit({ allowEmpty: true, source: "command" });
    };

    void executeSubmission();
  }, [
    boardStatus,
    boardRef,
    commandMessage,
    handleSubmit,
    question,
    shouldHandleSubmitCommand,
  ]);

  const handleApplyJudgement = (result: "correct" | "wrong") => {
    applyHostJudgementControl?.(result);
  };

  const handleTriggerBuzzer = () => {
    if (!triggerBuzzerControl) {
      Toast.warn("当前不可抢答");
      return;
    }
    if (!canBuzz) {
      Toast.warn("主持人尚未开启抢答");
      return;
    }
    if (!user?.id) {
      Toast.warn("选手信息缺失，无法抢答");
      return;
    }
    if (!mqttService.isConnected()) {
      Toast.warn(
        mqttConnected
          ? "抢答服务暂时不可用，请稍后再试"
          : "尚未连接抢答服务，请稍后重试"
      );
      return;
    }

    const payload = JSON.stringify({ player_id: String(user.id) });
    try {
      mqttService.publish(MQTT_TOPICS.buzzIn, payload, { qos: 1 });
      triggerBuzzerControl();
      setCanBuzz(false);
      Toast.info("抢答中，请等待结果");
    } catch (error) {
      console.error("Failed to publish buzz-in message", error);
      Toast.error("抢答请求发送失败");
    }
  };

  const renderCommandSubmissionResult = () => (
    <div className={styles.commandSubmissionResult}>
      <div className={styles.commandSubmissionBadge}>
        <SuccessCheckIcon />
      </div>
      <p className={styles.commandSubmissionTitle}>提交成功</p>
      <p className={styles.commandSubmissionSubtitle}>主持人已锁定本题，请等待切题指令。</p>
    </div>
  );

  const renderEliminationState = () => (
    <div className={styles.commandSubmissionResult}>
      <div className={styles.commandSubmissionBadge}>
        <EliminatedIcon />
      </div>
      <p className={styles.commandSubmissionTitle}>您已淘汰</p>
      <p className={styles.commandSubmissionSubtitle}>血量已耗尽，本轮无法继续作答。</p>
    </div>
  );

  const sanitizeMatchingLabel = useCallback(
    (label: string) => label.replace(/^\s*\d+、\s*/, ""),
    []
  );

  const renderStandardOptions = (standard: StandardQuestion) => {
    if (standard.type === "matching") {
      const config = standard.matching;
      const leftOptions = config?.left ?? [];
      const rightOptions =
        config?.right ??
        standard.options.map((option) => ({
          id: option.value,
          label: option.label,
        }));
      const rightLabelMap = new Map(rightOptions.map((item) => [item.id, item.label]));
      const activeLeft = activeMatchingLeft;

      const overlayWidth = Math.max(1, matchingOverlaySize.width);
      const overlayHeight = Math.max(1, matchingOverlaySize.height);
      return (
        <div ref={matchingBoardRef} className={styles.matchingBoard}>
          <svg
            className={styles.matchingOverlay}
            width={overlayWidth}
            height={overlayHeight}
            viewBox={`0 0 ${overlayWidth} ${overlayHeight}`}
            preserveAspectRatio="none"
          >
            {matchingLines.map((line) => (
              <line
                key={line.id}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke="#2563eb"
                className={`${styles.matchingOverlayLine} ${
                  line.active ? styles.matchingOverlayLineActive : ""
                }`}
              />
            ))}
          </svg>
          <div className={styles.matchingColumn}>
            <div className={styles.matchingList}>
              {leftOptions.length === 0 ? (
                <div className={styles.matchingEmpty}>题目未提供左侧内容</div>
              ) : (
                leftOptions.map((leftItem, index) => {
                  const matchedRightId = matchingSelectionMap.get(leftItem.id);
                  const matchedRightLabel = matchedRightId
                    ? rightLabelMap.get(matchedRightId) ?? matchedRightId
                    : null;
                  const isActive = activeLeft === leftItem.id;
                  return (
                    <div key={leftItem.id} className={styles.matchingLeftRow}>
                      <button
                        type="button"
                        className={[
                          styles.matchingLeftItem,
                          isActive ? styles.matchingLeftItemActive : "",
                          matchedRightLabel ? styles.matchingLeftItemMatched : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => handleMatchingLeftClick(leftItem.id)}
                        disabled={!state.answeringEnabled}
                        data-left-id={leftItem.id}
                        data-active={isActive ? "true" : undefined}
                        data-match-right-id={matchedRightId ?? undefined}
                      >
                        <span className={styles.matchingLeftBadge}>
                          {leftItem.id || index + 1}
                        </span>
                        <span className={styles.matchingLeftLabel}>
                          {sanitizeMatchingLabel(leftItem.label)}
                        </span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div className={styles.matchingColumn}>
            <div className={styles.matchingList}>
              {rightOptions.length === 0 ? (
                <div className={styles.matchingEmpty}>题目未提供右侧选项</div>
              ) : (
                rightOptions.map((rightItem, index) => {
                  const assignedLeftId = matchingRightToLeftMap.get(rightItem.id);
                  const isUsed = matchingUsedRightIds.has(rightItem.id);
                  const isReassignTarget =
                    activeLeft &&
                    assignedLeftId &&
                    activeLeft !== assignedLeftId &&
                    state.answeringEnabled;

                  return (
                    <button
                      key={rightItem.id || index}
                      type="button"
                      className={[
                        styles.matchingRightItem,
                        isUsed ? styles.matchingRightItemUsed : "",
                        isReassignTarget ? styles.matchingRightItemReassign : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => handleMatchingRightClick(rightItem.id)}
                      disabled={!state.answeringEnabled}
                      data-right-id={rightItem.id}
                      data-assigned-left-id={assignedLeftId ?? undefined}
                      data-matched={isUsed ? "true" : undefined}
                    >
                      <span className={styles.matchingRightBadge}>
                        {rightItem.id || String.fromCharCode(65 + index)}
                      </span>
                      <span className={styles.matchingRightLabel}>{rightItem.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      );
    }

    if (standard.type === "multiple" || standard.type === "indeterminate") {
      const multipleValue = Array.isArray(selected) ? selected : [];
      return (
        <Checkbox.Group
          value={multipleValue}
          onChange={handleMultiSelect}
          layout="block"
          className={styles.optionGroup}
          icons={null}
        >
          {standard.options.map((option, index) => {
            const isActive = multipleValue.includes(option.value);
            const cardClass = `${styles.optionCard} ${isActive ? styles.optionCardActive : ""}`;
            const badgeClass = `${styles.optionBadge} ${isActive ? styles.optionBadgeActive : ""}`;
            return (
              <Checkbox key={option.value} value={option.value} className={styles.optionControl}>
                <div className={cardClass}>
                  <span className={badgeClass}>{String.fromCharCode(65 + index)}</span>
                  <div className={styles.optionContent}>
                    <span className={styles.optionLabel}>{option.label}</span>
                    {option.description ? (
                      <span className={styles.optionDesc}>{option.description}</span>
                    ) : null}
                  </div>
                </div>
              </Checkbox>
            );
          })}
        </Checkbox.Group>
      );
    }

    if (standard.type === "wordbank") {
      return (
        <div className={styles.wordbankOptions}>
          {standard.options.map((option) => {
            const isUsed = wordbankUsedValues.has(option.value);
            const active =
              wordbankActiveIndex !== null &&
              wordbankActiveIndex >= 0 &&
              option.value === wordbankValues[wordbankActiveIndex];
            const buttonClass = [
              styles.wordbankOption,
              isUsed ? styles.wordbankOptionUsed : "",
              active ? styles.wordbankOptionActive : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={option.value}
                type="button"
                className={buttonClass}
                onClick={() => handleWordbankSelectOption(option.value, isUsed)}
                disabled={!state.answeringEnabled}
              >
                <span className={styles.wordbankOptionBadge}>{option.value}</span>
                <span className={styles.wordbankOptionLabel}>{option.label}</span>
              </button>
            );
          })}
        </div>
      );
    }

    if (standard.type === "fill") {
      const hasToken =
        typeof selected === "string" && selected.trim().length > 0;
      return (
        <div className={styles.blankBoard}>
          {!fillPreview && boardStatus !== "success" ? (
            <Button
              type="primary"
              size="large"
              className={styles.boardButton}
              onClick={handleOpenBoard}
              disabled={
                !state.answeringEnabled ||
                isBoardOpen ||
                boardStatus === "uploading"
              }
            >
              打开画板
            </Button>
          ) : null}
          {fillPreview ? (
            <>
              <div className={styles.boardPreview}>
                <Image
                  src={fillPreview}
                  alt="画板作答预览"
                  className={styles.boardPreviewImage}
                  width={320}
                  height={240}
                  unoptimized
                  sizes="(max-width: 600px) 80vw, 320px"
                />
              </div>
              <div className={styles.boardSubmitted}>
                <SuccessCheckIcon className={styles.boardSubmittedIcon} />
                <div className={styles.boardSubmittedTexts}>
                  <span className={styles.boardSubmittedTitle}>提交成功</span>
                  <span className={styles.boardSubmittedSubtitle}>
                    填空画板提交成功
                  </span>
                </div>
              </div>
            </>
          ) : null}
          {fillPreview && hasToken ? (
            <span className={`${styles.boardStatus} ${styles.boardStatusReady}`}>
              已生成答案链接
            </span>
          ) : null}
        </div>
      );
    }

    const singleValue = typeof selected === "string" ? selected : null;
    return (
      <Radio.Group
        value={singleValue ?? undefined}
        onChange={(value) => handleSelect(String(value))}
        layout="block"
        className={styles.optionGroup}
        icons={null}
      >
        {standard.options.map((option, index) => {
          const isActive = singleValue === option.value;
          const cardClass = `${styles.optionCard} ${isActive ? styles.optionCardActive : ""}`;
          const badgeClass = `${styles.optionBadge} ${isActive ? styles.optionBadgeActive : ""}`;
          return (
            <Radio key={option.value} value={option.value} className={styles.optionControl}>
              <div className={cardClass}>
                <span className={badgeClass}>{String.fromCharCode(65 + index)}</span>
                <div className={styles.optionContent}>
                  <span className={styles.optionLabel}>{option.label}</span>
                  {option.description ? (
                    <span className={styles.optionDesc}>{option.description}</span>
                  ) : null}
                </div>
              </div>
            </Radio>
          );
        })}
      </Radio.Group>
    );
  };

  const renderOceanOptions = (ocean: CustomOceanQuestion) => {
    const values = Array.isArray(selected) ? selected : [];
    return (
      <Checkbox.Group
        value={values}
        onChange={handleMultiSelect}
        layout="block"
        className={styles.optionGroup}
        icons={null}
      >
        {ocean.optionPool.map((option, index) => {
          const isActive = values.includes(option.id);
          const cardClass = `${styles.optionCard} ${isActive ? styles.optionCardActive : ""}`;
          const badgeClass = `${styles.optionBadge} ${isActive ? styles.optionBadgeActive : ""}`;
          return (
            <Checkbox key={option.id} value={option.id} className={styles.optionControl}>
              <div className={cardClass}>
                <span className={badgeClass}>{String.fromCharCode(65 + index)}</span>
                <div className={styles.optionContent}>
                  <span className={styles.optionLabel}>{option.label}</span>
                  {option.meta?.note ? (
                    <span className={styles.optionDesc}>{String(option.meta.note)}</span>
                  ) : null}
                </div>
              </div>
            </Checkbox>
          );
        })}
      </Checkbox.Group>
    );
  };

  const renderQuestionContent = () => {
    if (isEliminated) {
      return renderEliminationState();
    }

    if (meta.id === "ultimate-challenge") {
      if (!question && ultimateStage === "waiting") {
        return (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>等待主持人推送题目</p>
            <p className={styles.emptyDesc}>抢答阶段即将开始，请留意主持人指令。</p>
          </div>
        );
      }

      if (ultimateStage === "buzz") {
        return (
          <div className={styles.ultimateWrapper}>
            <Button
              type="primary"
              className={styles.ultimateBuzzer}
              onClick={handleTriggerBuzzer}
              disabled={!triggerBuzzerControl || !canBuzz}
              needActive
            >
              <span className={styles.ultimateBuzzerText}>抢答</span>
            </Button>
            <p className={styles.ultimateHint}>抢答成功后将默认由本队作答。</p>
          </div>
        );
      }

      if (ultimateStage === "locked") {
        return (
          <div className={styles.ultimateWrapper}>
            <div className={`${styles.ultimateResultBadge} ${styles.ultimateResultBadgeError}`}>
              <ErrorBadgeIcon className={styles.ultimateResultIcon} />
            </div>
            <h2 className={`${styles.ultimateTitle} ${styles.ultimateTitleError}`}>未抢到答题权</h2>
            <p className={`${styles.ultimateHint} ${styles.ultimateHintEmphasis}`}>
              本题将由{lockedWinnerLabel}进行作答
            </p>
          </div>
        );
      }

      if (!question) {
        return (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>等待决策结果</p>
            <p className={styles.emptyDesc}>请保持在线，随时准备进入下一题。</p>
          </div>
        );
      }

      if (ultimateStage !== "answer") {
        return (
          <div className={styles.ultimateWrapper}>
            <p className={styles.ultimateHint}>等待主持人通知作答，请保持专注。</p>
          </div>
        );
      }
    }

    if (!question) {
      return (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>
            {state.awaitingHost ? "等待主持人推送下一题" : "当前没有可答题目"}
          </p>
          <p className={styles.emptyDesc}>
            {meta.questionFlow === "push"
              ? "请关注主持人指令，接收到题目后自动显示。"
              : "请尝试拉取下一题或重置赛段。"}
          </p>
        </div>
      );
    }

    if (isStandardQuestion(question)) {
      const questionTitleNode = (() => {
        if (isWordbankQuestion && wordbankTemplate) {
          let blankCursor = -1;
          return (
            <h2 className={`${styles.questionTitle} ${styles.wordbankTitle}`}>
              {wordbankTemplate.tokens.map((token, index) => {
                if (token.kind === "text") {
                  return (
                    <span key={`wb-text-${index}`} className={styles.wordbankText}>
                      {token.content}
                    </span>
                  );
                }

                blankCursor += 1;
                const blankIndex = blankCursor;
                const value = wordbankValues[blankIndex] ?? "";
                const label = value
                  ? wordbankOptionLabelMap?.get(value) ?? value
                  : null;
                const hasAllFilled = wordbankValues.every((item) => item && item.trim());
                const isActive =
                  !hasAllFilled && wordbankActiveIndex === blankIndex;

                return (
                  <button
                    key={`wb-blank-${token.blankId}-${index}`}
                    type="button"
                    className={`${styles.wordbankBlank} ${value ? styles.wordbankBlankFilled : styles.wordbankBlankEmpty} ${isActive ? styles.wordbankBlankActive : ""}`}
                    onClick={() =>
                      value
                        ? handleWordbankClear(blankIndex)
                        : handleWordbankBlankClick(blankIndex)
                    }
                    disabled={!state.answeringEnabled}
                  >
                    {label ? (
                      <span className={styles.wordbankBlankValue}>{label}</span>
                    ) : (
                      <span className={styles.wordbankBlankPlaceholder}>点击填空</span>
                    )}
                  </button>
                );
              })}
            </h2>
          );
        }

        if (isMatchingQuestion) {
          const prompt = matchingConfig?.prompt;
          const matchingTitleContent = prompt
            ? prompt.split(/\n+/).map((line, index, lines) => (
                <span key={`matching-prompt-${index}`}>
                  {line}
                  {index < lines.length - 1 ? <br /> : null}
                </span>
              ))
            : "请完成连线";
          const isClearDisabled = !state.answeringEnabled || matchingPairs.length === 0;
          return (
            <div className={styles.questionTitleRow}>
              <h2 className={styles.questionTitle}>{matchingTitleContent}</h2>
              <button
                type="button"
                className={styles.questionTitleAction}
                onClick={handleClearMatchingPairs}
                disabled={isClearDisabled}
              >
                <span
                  aria-hidden="true"
                  className={styles.questionTitleActionIcon}
                  style={{
                    WebkitMaskImage: `url(${trashIcon.src})`,
                    maskImage: `url(${trashIcon.src})`,
                  }}
                />
                清空连线
              </button>
            </div>
          );
        }

        return <h2 className={styles.questionTitle}>{question.title}</h2>;
      })();
      const optionsNode = renderStandardOptions(question);
      return (
        <>
          <div className={styles.questionHeader}>
            <div className={styles.questionHeaderLeft}>
              <span className={styles.questionTag}>
                {question.type === "single"
                  ? "单选题"
                  : question.type === "multiple"
                  ? "多选题"
                  : question.type === "indeterminate"
                  ? "不定项选择题"
                  : question.type === "boolean"
                  ? "判断题"
                  : question.type === "wordbank"
                  ? "点选题"
                  : question.type === "matching"
                  ? "连线题"
                  : question.type === "fill"
                  ? "填空题"
                  : "题目"}
              </span>
            </div>
            <div className={styles.questionHeaderRight}>
              {selectionSummary ? (
                <div
                  className={styles.selectionSummary}
                  title={
                    selectionSummary.tokens.length
                      ? selectionSummary.tokens.join(" ")
                      : selectionSummary.emptyLabel ?? "未选"
                  }
                >
                  <span className={styles.selectionSummaryLabel}>已选：</span>
                  {selectionSummary.tokens.length ? (
                    selectionSummary.tokens.map((token, index) => (
                      <Tag
                        key={`selection-${index}-${token}`}
                        size="small"
                        filleted
                        type="primary"
                        className={styles.selectionTag}
                      >
                        {token}
                      </Tag>
                    ))
                  ) : (
                    <Tag size="small" filleted={true} type="outline" className={styles.selectionTagMuted}>
                      {selectionSummary.emptyLabel ?? "未选"}
                    </Tag>
                  )}
                </div>
              ) : null}
              <span className={styles.questionIndex}>
                第 {state.questionIndex + 1}
                {showProgress && totalQuestions ? ` / ${totalQuestions}` : ""}
              </span>
            </div>
          </div>
          {questionTitleNode}
          {isCommandSubmissionLocked && question.type !== "fill" ? (
            renderCommandSubmissionResult()
          ) : (
            <div className={styles.options}>{optionsNode}</div>
          )}
        </>
      );
    }

    if (isOceanQuestion(question)) {
      return (
        <>
          <div className={styles.questionHeader}>
            <span className={styles.questionTag}>题海遨游</span>
            <div className={styles.questionHeaderRight}>
              {selectionSummary ? (
                <div
                  className={styles.selectionSummary}
                  title={
                    selectionSummary.tokens.length
                      ? selectionSummary.tokens.join(" ")
                      : selectionSummary.emptyLabel ?? "未选"
                  }
                >
                  <span className={styles.selectionSummaryLabel}>已选：</span>
                  {selectionSummary.tokens.length ? (
                    selectionSummary.tokens.map((token, index) => (
                      <Tag
                        key={`selection-${index}-${token}`}
                        size="small"
                        type="primary"
                        className={styles.selectionTag}
                      >
                        {token}
                      </Tag>
                    ))
                  ) : (
                    <Tag size="small" type="outline" className={styles.selectionTagMuted}>
                      {selectionSummary.emptyLabel ?? "未选"}
                    </Tag>
                  )}
                </div>
              ) : null}
              <span className={styles.questionIndex}>
                第 {state.questionIndex + 1} 题
                <span className={styles.oceanHint}> / 预计 600 题</span>
              </span>
            </div>
          </div>
          <h2 className={styles.questionTitle}>{question.stem}</h2>
          <div className={styles.categories}>
            {question.categories.map((category) => (
              <Tag key={category} type="primary" size="small" className={styles.categoryTag}>
                {category}
              </Tag>
            ))}
          </div>
          {isCommandSubmissionLocked ? (
            renderCommandSubmissionResult()
          ) : (
            <div className={styles.options}>{renderOceanOptions(question)}</div>
          )}
        </>
      );
    }

    return null;
  };

  const hasQuestion = Boolean(question);
  const shouldShowActionBar = meta.id === "speed-run" || meta.id === "ocean-adventure";
  const submitLabel =
    meta.id === "speed-run"
      ? "提交并进入下一题"
      : meta.id === "ocean-adventure"
      ? "提交并抢下一题"
      : meta.id === "qa" || meta.id === "last-stand"
      ? "提交等待主持人"
      : meta.id === "ultimate-challenge"
      ? "提交并等待裁决"
      : "提交";

  return (
    <div className={styles.page}>
      <ArcoClient fallback={<div className={styles.fallback}>加载中...</div>}>
        <div ref={navWrapperRef}>
          <NavBar
            title={meta.name || meta.id}
            leftContent={null}
          />
        </div>

        <div className={styles.modeSwitch}>
          {MODE_LIST.map((item) => (
            <Button
              key={item.id}
              type={item.id === mode ? "primary" : "default"}
              size="small"
              onClick={() => handleModeChange(item.id)}
            >
              {item.name}
            </Button>
          ))}
        </div>

        <div className={styles.body}>
          <section className={styles.progressCard}>
            <div className={styles.progressHead}>
              <span className={styles.progressCounter}>
                {hasQuestion ? state.questionIndex + 1 : 0}
                {showProgress && totalQuestions ? (
                  <span className={styles.progressTotal}> / {totalQuestions}</span>
                ) : null}
              </span>
              <div className={styles.progressRight}>
                {state.timeRemaining !== undefined ? (
                  <div className={styles.timerDisplay}>
                    <ClockIcon className={styles.timerIcon} />
                    <span
                      className={`${styles.timerText} ${
                        state.timeRemaining <= 30 ? styles.statusDanger : ""
                      }`}
                    >
                      {formatSeconds(state.timeRemaining)}
                    </span>
                  </div>
                ) : null}
                {hpDisplay ? (
                  <div
                    className={styles.hpDisplay}
                    role="img"
                    aria-label={`剩余血量 ${hpDisplay.current}，总血量 ${hpDisplay.initial}`}
                  >
                    {Array.from({ length: hpDisplay.initial }).map((_, index) => (
                      <HeartIcon
                        key={index}
                        className={styles.heartIcon}
                        filled={index < (hpDisplay?.current ?? 0)}
                      />
                    ))}
                  </div>
                ) : null}
                {buzzerStatusLabel ? (
                  <div className={styles.buzzerStatus}>{buzzerStatusLabel}</div>
                ) : null}
                {progressUserLabel ? (
                  <span className={styles.progressUser}>{progressUserLabel}</span>
                ) : null}
              </div>
            </div>
            {showProgress ? (
              <div className={styles.progressBar}>
                <Progress percentage={progress} percentPosition="innerLeft" />
              </div>
            ) : null}
          </section>

          <section className={styles.questionCard}>{renderQuestionContent()}</section>
          {meta.features.hasHp && meta.questionFlow === "push" && meta.id !== "last-stand" ? (
            <section className={styles.judgementPanel}>
              <h3 className={styles.panelTitle}>主持人判定</h3>
              <div className={styles.judgementActions}>
                <Button
                  type="primary"
                  size="small"
                  onClick={() => handleApplyJudgement("correct")}
                  disabled={!applyHostJudgementControl}
                >
                  判定正确
                </Button>
                <Button
                  type="default"
                  size="small"
                  onClick={() => handleApplyJudgement("wrong")}
                  disabled={!applyHostJudgementControl}
                >
                  判定错误
                </Button>
              </div>
            </section>
          ) : null}
        </div>

        {shouldShowActionBar ? (
          <div className={styles.actionBar}>
            <div className={styles.actionInner}>
              <Button
                type="primary"
                size="large"
                className={styles.nextButton}
                onClick={() => void handleSubmit()}
                disabled={
                  !hasQuestion || !state.answeringEnabled || isSubmitting || isCommandSubmissionLocked
                }
              >
                {submitLabel}
              </Button>
            </div>
          </div>
        ) : null}

        <FillDrawingBoard
          ref={boardRef}
          open={isBoardOpen}
          questionId={questionId}
          questionTitle={
            question && isStandardQuestion(question) ? question.title : undefined
          }
          questionSheetId={currentStage?.questionSheetId}
          onClose={() => setBoardOpen(false)}
          onUploadSuccess={handleBoardUploadSuccess}
          onPathsChange={handleBoardPathsChange}
          initialPaths={cachedPaths}
          disabled={!state.answeringEnabled}
          status={boardStatus}
        />
      </ArcoClient>
    </div>
  );
}
