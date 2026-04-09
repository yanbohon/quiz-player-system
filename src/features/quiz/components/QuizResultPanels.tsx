"use client";

import type { ReactNode } from "react";
import { Button } from "@arco-design/mobile-react";
import {
  EliminatedIcon,
  ErrorBadgeIcon,
  SuccessCheckIcon,
} from "@/features/quiz/components/QuizIcons";
import styles from "@/app/quiz/page.module.css";

export interface OceanStatsSummary {
  total?: number;
  correct?: number;
  wrong?: number;
  score?: number;
  accuracy?: number;
  lastAnswerTime?: number;
}

export interface SpeedRunResultPanelProps {
  isTimerExpired: boolean;
  isCompleted: boolean;
  total: number;
  answered: number;
  score: number;
  wrong: number;
  unanswered: number;
  timeRemaining?: number;
  formatSeconds: (seconds?: number) => string;
}

export interface OceanResultPanelProps {
  scoreFields?: Record<string, unknown>;
  stats: OceanStatsSummary | null;
  statsStatus: "idle" | "loading" | "success" | "error";
  statsError: string | null;
  isEliminated: boolean;
  isTimerExpired: boolean;
  isPoolExhausted: boolean;
  onRetry: () => void;
}

function resolvePrimaryScoreField(
  fields?: Record<string, unknown>
): { key: string; value: string | number } | undefined {
  if (!fields) return undefined;

  const preferredKeys = [
    "得分",
    "总分",
    "分数",
    "score",
    "Score",
    "当前得分",
    "总得分",
  ];

  for (const key of preferredKeys) {
    const raw = fields[key];
    if (
      raw !== undefined &&
      raw !== null &&
      (typeof raw === "string" || typeof raw === "number")
    ) {
      return { key, value: raw };
    }
  }

  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "number") {
      return { key, value };
    }
  }

  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string" && value.trim()) {
      return { key, value };
    }
  }

  return undefined;
}

function formatTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "";
  try {
    return new Date(timestamp).toLocaleString();
  } catch (error) {
    console.warn("Failed to format timestamp", error);
    return String(timestamp);
  }
}

function buildDisplayEntries(
  pairs: Array<[string, string | number | undefined]>
): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const [label, value] of pairs) {
    if (value === undefined || value === null) continue;
    if (typeof value === "number") {
      entries.push([label, value.toString()]);
      continue;
    }
    const text = value.trim();
    if (!text) continue;
    entries.push([label, text]);
  }
  return entries;
}

function ResultCard({
  badge,
  title,
  subtitle,
  currentScore,
  scoreHint,
  entries,
  statusMessage,
  isErrorMessage = false,
  action,
}: {
  badge: ReactNode;
  title: string;
  subtitle: string;
  currentScore: string;
  scoreHint?: string;
  entries: Array<[string, string]>;
  statusMessage?: string;
  isErrorMessage?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className={styles.oceanResultWrapper}>
      <div className={styles.commandSubmissionResult}>
        <div className={styles.commandSubmissionBadge}>{badge}</div>
        <p className={styles.commandSubmissionTitle}>{title}</p>
        <p className={styles.commandSubmissionSubtitle}>{subtitle}</p>
      </div>

      <div className={styles.oceanResultScoreCard}>
        <div className={styles.oceanResultScore}>
          <span className={styles.oceanResultLabel}>当前得分</span>
          <span className={styles.oceanResultValue}>{currentScore}</span>
          {scoreHint ? <span className={styles.oceanResultKeyHint}>{scoreHint}</span> : null}
        </div>

        {entries.length > 0 ? (
          <dl className={styles.oceanResultList}>
            {entries.map(([key, value]) => (
              <div key={key} className={styles.oceanResultItem}>
                <dt className={styles.oceanResultItemKey}>{key}</dt>
                <dd className={styles.oceanResultItemValue}>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {statusMessage ? (
          <p
            className={`${styles.oceanResultMessage} ${
              isErrorMessage ? styles.oceanResultMessageError : ""
            }`}
          >
            {statusMessage}
          </p>
        ) : null}

        {action ? <div className={styles.oceanResultActions}>{action}</div> : null}
      </div>
    </div>
  );
}

export function SpeedRunResultPanel({
  isTimerExpired,
  isCompleted,
  total,
  answered,
  score,
  wrong,
  unanswered,
  timeRemaining,
  formatSeconds,
}: SpeedRunResultPanelProps) {
  const badge = isTimerExpired ? <ErrorBadgeIcon /> : <SuccessCheckIcon />;
  const title = isTimerExpired ? "倒计时结束" : "全部题目完成";
  const subtitle = isTimerExpired
    ? "作答时间已用尽，本轮成绩已锁定，请等待主持人下一步指令。"
    : "已作答全部题目，本轮成绩已锁定，请等待主持人下一步指令。";
  const entries = buildDisplayEntries([
    ["总题数", total],
    ["已作答", answered],
    ["答对", score],
    ["答错", wrong],
    ["未作答", unanswered > 0 ? unanswered : undefined],
    ["剩余时间", isCompleted && typeof timeRemaining === "number" ? formatSeconds(timeRemaining) : undefined],
  ]);
  const statusMessage = isTimerExpired
    ? "倒计时已结束，本轮成绩已锁定，请等待主持人下一步指令。"
    : "成绩已锁定，请等待主持人下一步指令。";

  return (
    <ResultCard
      badge={badge}
      title={title}
      subtitle={subtitle}
      currentScore={String(score)}
      scoreHint="每题 1 分"
      entries={entries}
      statusMessage={statusMessage}
    />
  );
}

export function OceanResultPanel({
  scoreFields,
  stats,
  statsStatus,
  statsError,
  isEliminated,
  isTimerExpired,
  isPoolExhausted,
  onRetry,
}: OceanResultPanelProps) {
  const primary = resolvePrimaryScoreField(scoreFields);
  const statsScore = stats && typeof stats.score === "number" ? stats.score : undefined;
  const scoreInfo =
    statsScore !== undefined
      ? { value: statsScore, hint: "统计得分" }
      : primary
        ? { value: primary.value, hint: primary.key }
        : null;

  const displayEntries: Array<[string, string]> = [];
  const seenKeys = new Set<string>();

  if (stats) {
    displayEntries.push(
      ...buildDisplayEntries([
        ["作答题数", stats.total],
        ["答对", stats.correct],
        ["答错", stats.wrong],
        [
          "正确率",
          typeof stats.accuracy === "number"
            ? `${Math.round(stats.accuracy * 1000) / 10}%`
            : undefined,
        ],
        [
          "最后作答时间",
          typeof stats.lastAnswerTime === "number"
            ? formatTimestamp(stats.lastAnswerTime)
            : undefined,
        ],
      ])
    );
    for (const [label] of displayEntries) {
      seenKeys.add(label);
    }
  }

  if (scoreFields) {
    for (const [key, value] of Object.entries(scoreFields)) {
      if (primary && key === primary.key) continue;
      if (seenKeys.has(key)) continue;
      if (typeof value === "number" || (typeof value === "string" && value.trim())) {
        displayEntries.push([key, typeof value === "number" ? value.toString() : value.trim()]);
        seenKeys.add(key);
      }
    }
  }

  const isLoadingStats = statsStatus === "loading";
  const isErrorStats = statsStatus === "error";
  const canRetry = isErrorStats;

  const { resultTitle, resultSubtitle } = (() => {
    if (isEliminated) {
      return {
        resultTitle: "挑战结束",
        resultSubtitle: "血量已耗尽，本轮成绩已锁定，请等待主持人下一步指令。",
      };
    }
    if (isTimerExpired) {
      return {
        resultTitle: "倒计时结束",
        resultSubtitle: "作答时间已用尽，本轮成绩已锁定，请等待主持人下一步指令。",
      };
    }
    if (isPoolExhausted) {
      return {
        resultTitle: "全部题目完成",
        resultSubtitle: "题库已清空，本轮成绩已锁定，请等待主持人下一步指令。",
      };
    }
    return {
      resultTitle: "挑战结束",
      resultSubtitle: "本轮成绩已锁定，请等待主持人下一步指令。",
    };
  })();

  let statusMessage = "成绩正在同步中，请稍候查看最新得分。";
  if (isLoadingStats) {
    statusMessage = "正在获取最新成绩，请稍候...";
  } else if (isErrorStats) {
    statusMessage = statsError ?? "成绩同步失败，请稍后重试。";
  } else if (scoreInfo) {
    statusMessage = displayEntries.length === 0 ? "成绩已更新，请等待主持人下一步指令。" : "";
  }

  return (
    <ResultCard
      badge={<EliminatedIcon />}
      title={resultTitle}
      subtitle={resultSubtitle}
      currentScore={scoreInfo ? String(scoreInfo.value) : "--"}
      scoreHint={scoreInfo?.hint}
      entries={displayEntries}
      statusMessage={statusMessage}
      isErrorMessage={isErrorStats}
      action={
        canRetry ? (
          <Button type="ghost" size="small" onClick={onRetry}>
            重新获取成绩
          </Button>
        ) : undefined
      }
    />
  );
}
