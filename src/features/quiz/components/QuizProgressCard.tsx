import { createElement } from "react";
import { Progress } from "@arco-design/mobile-react";

import styles from "@/app/quiz/page.module.css";
import { ClockIcon, HeartIcon } from "@/features/quiz/components/QuizIcons";
import type { OceanGroupId, OceanPlayMode } from "@/features/quiz/oceanGroup";

type HpDisplay = {
  current: number;
  initial: number;
} | null;

export interface QuizProgressCardProps {
  hasQuestion: boolean;
  isOceanAdventure: boolean;
  oceanRemainingDisplay: number | null;
  defaultOceanRemainingCount: number;
  showProgress: boolean;
  totalQuestions?: number;
  questionOrdinal: number;
  progressValue: number;
  timeRemaining?: number;
  hpDisplay: HpDisplay;
  buzzerStatusLabel: string | null;
  progressUserLabel: string | null;
  oceanPlayMode: OceanPlayMode | null;
  highlightTeamId: OceanGroupId | null;
  formatSeconds: (seconds?: number) => string;
}

export function QuizProgressCard({
  hasQuestion,
  isOceanAdventure,
  oceanRemainingDisplay,
  defaultOceanRemainingCount,
  showProgress,
  totalQuestions,
  questionOrdinal,
  progressValue,
  timeRemaining,
  hpDisplay,
  buzzerStatusLabel,
  progressUserLabel,
  oceanPlayMode,
  highlightTeamId,
  formatSeconds,
}: QuizProgressCardProps) {
  const progressTotalValue = isOceanAdventure
    ? oceanRemainingDisplay ?? defaultOceanRemainingCount
    : showProgress && totalQuestions
    ? totalQuestions
    : null;

  const progressUserClassName = [
    styles.progressUser,
    isOceanAdventure && oceanPlayMode === "solo" ? styles.progressUserSolo : "",
    highlightTeamId === "red" ? styles.progressUserRed : "",
    highlightTeamId === "blue" ? styles.progressUserBlue : "",
  ]
    .filter(Boolean)
    .join(" ");

  const progressCounterChildren = [
    hasQuestion ? questionOrdinal : 0,
    progressTotalValue !== null
      ? createElement(
          "span",
          { className: styles.progressTotal, key: "progress-total" },
          " / ",
          progressTotalValue
        )
      : null,
  ];

  const progressRightChildren = [
    timeRemaining !== undefined
      ? createElement(
          "div",
          { className: styles.timerDisplay, key: "timer" },
          createElement(ClockIcon, { className: styles.timerIcon }),
          createElement(
            "span",
            {
              className: `${styles.timerText} ${
                timeRemaining <= 30 ? styles.statusDanger : ""
              }`,
            },
            formatSeconds(timeRemaining)
          )
        )
      : null,
    hpDisplay
      ? createElement(
          "div",
          {
            className: styles.hpDisplay,
            role: "img",
            "aria-label": `剩余血量 ${hpDisplay.current}，总血量 ${hpDisplay.initial}`,
            key: "hp",
          },
          Array.from({ length: hpDisplay.initial }).map((_, index) =>
            createElement(HeartIcon, {
              key: index,
              className: styles.heartIcon,
              filled: index < hpDisplay.current,
            })
          )
        )
      : null,
    buzzerStatusLabel
      ? createElement(
          "div",
          { className: styles.buzzerStatus, key: "buzzer-status" },
          buzzerStatusLabel
        )
      : null,
    progressUserLabel
      ? createElement(
          "span",
          { className: progressUserClassName, key: "progress-user" },
          progressUserLabel
        )
      : null,
  ];

  return createElement(
    "section",
    { className: styles.progressCard },
    createElement(
      "div",
      { className: styles.progressHead },
      createElement(
        "span",
        { className: styles.progressCounter },
        progressCounterChildren
      ),
      createElement(
        "div",
        { className: styles.progressRight },
        progressRightChildren
      )
    ),
    showProgress
      ? createElement(
          "div",
          { className: styles.progressBar },
          createElement(Progress, {
            percentage: progressValue,
            percentPosition: "innerLeft",
            mountedTransition: progressValue > 0,
          })
        )
      : null
  );
}
