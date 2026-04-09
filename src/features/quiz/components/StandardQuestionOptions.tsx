"use client";

import type { RefObject } from "react";
import { Button } from "@arco-design/mobile-react";
import NextImage from "next/image";
import { OptionCardButton } from "@/features/quiz/components/OptionCardButton";
import { SuccessCheckIcon } from "@/features/quiz/components/QuizIcons";
import type { StandardQuestion } from "@/features/quiz/types";
import styles from "@/app/quiz/page.module.css";

export interface MatchingLineSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
}

export interface StandardQuestionOptionsProps {
  question: StandardQuestion;
  selected: string | string[] | null;
  isAnswerRevealActive: boolean;
  answeringEnabled: boolean;
  isCommandSubmissionLocked: boolean;
  activeMatchingLeft: string | null;
  matchingSelectionMap: Map<string, string>;
  matchingRightToLeftMap: Map<string, string>;
  matchingUsedRightIds: Set<string>;
  matchingOverlaySize: { width: number; height: number };
  matchingLines: MatchingLineSegment[];
  matchingBoardRef: RefObject<HTMLDivElement | null>;
  onSelect: (value: string) => void;
  onToggleMultiOption: (value: string) => void;
  onMatchingLeftClick: (leftId: string) => void;
  onMatchingRightClick: (rightId: string) => void;
  wordbankUsedValues: Set<string>;
  wordbankActiveIndex: number | null;
  wordbankValues: string[];
  onWordbankSelectOption: (optionValue: string, isUsed?: boolean) => void;
  pointSelectSelectedSet: Set<string>;
  onPointSelectOption: (optionValue: string) => void;
  fillPreview: string | null;
  boardSubmitted: boolean;
  isBoardOpen: boolean;
  isBoardUploading: boolean;
  onOpenBoard: () => void;
}

function sanitizeMatchingLabel(label: string) {
  return label.replace(/^\s*\d+、\s*/, "");
}

export function StandardQuestionOptions({
  question,
  selected,
  isAnswerRevealActive,
  answeringEnabled,
  isCommandSubmissionLocked,
  activeMatchingLeft,
  matchingSelectionMap,
  matchingRightToLeftMap,
  matchingUsedRightIds,
  matchingOverlaySize,
  matchingLines,
  matchingBoardRef,
  onSelect,
  onToggleMultiOption,
  onMatchingLeftClick,
  onMatchingRightClick,
  wordbankUsedValues,
  wordbankActiveIndex,
  wordbankValues,
  onWordbankSelectOption,
  pointSelectSelectedSet,
  onPointSelectOption,
  fillPreview,
  boardSubmitted,
  isBoardOpen,
  isBoardUploading,
  onOpenBoard,
}: StandardQuestionOptionsProps) {
  const isRevealSupportedType = ["single", "multiple", "indeterminate", "boolean"].includes(
    question.type
  );
  const rawSelectionValues =
    Array.isArray(selected) && selected.length > 0
      ? selected
      : typeof selected === "string" && selected
        ? [selected]
        : [];
  const selectionValueSet = new Set(
    rawSelectionValues.map((value) => String(value).trim()).filter(Boolean)
  );
  const rawCorrectValues =
    isRevealSupportedType && isAnswerRevealActive
      ? Array.isArray(question.correctAnswer)
        ? question.correctAnswer
        : question.correctAnswer
          ? [question.correctAnswer]
          : []
      : [];
  const correctValueSet =
    rawCorrectValues.length > 0
      ? new Set(rawCorrectValues.map((value) => String(value).trim()).filter(Boolean))
      : null;
  const resolveOptionStatus = (optionValue: string): "correct" | "wrong" | undefined => {
    if (!correctValueSet) return undefined;
    const normalized = String(optionValue).trim();
    if (!normalized) return undefined;
    if (correctValueSet.has(normalized)) {
      return "correct";
    }
    if (selectionValueSet.has(normalized)) {
      return "wrong";
    }
    return undefined;
  };

  if (question.type === "matching") {
    const config = question.matching;
    const leftOptions = config?.left ?? [];
    const rightOptions =
      config?.right ??
      question.options.map((option) => ({
        id: option.value,
        label: option.label,
      }));
    const rightLabelMap = new Map(rightOptions.map((item) => [item.id, item.label]));

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
                const isActive = activeMatchingLeft === leftItem.id;
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
                      onClick={() => onMatchingLeftClick(leftItem.id)}
                      disabled={!answeringEnabled || isCommandSubmissionLocked}
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
                  activeMatchingLeft &&
                  assignedLeftId &&
                  activeMatchingLeft !== assignedLeftId &&
                  answeringEnabled &&
                  !isCommandSubmissionLocked;

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
                    onClick={() => onMatchingRightClick(rightItem.id)}
                    disabled={!answeringEnabled || isCommandSubmissionLocked}
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

  if (question.type === "multiple" || question.type === "indeterminate") {
    const multipleValue = Array.isArray(selected) ? selected : [];
    return (
      <div className={styles.optionGroup} role="group">
        {question.options.map((option, index) => {
          const isActive = multipleValue.includes(option.value);
          return (
            <OptionCardButton
              key={option.value}
              value={option.value}
              label={option.label}
              description={option.description}
              badge={String.fromCharCode(65 + index)}
              active={isActive}
              disabled={!answeringEnabled || isCommandSubmissionLocked}
              onSelect={onToggleMultiOption}
              role="checkbox"
              status={resolveOptionStatus(option.value)}
            />
          );
        })}
      </div>
    );
  }

  if (question.type === "wordbank") {
    return (
      <div className={styles.wordbankOptions}>
        {question.options.map((option) => {
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
              onClick={() => onWordbankSelectOption(option.value, isUsed)}
              disabled={!answeringEnabled || isCommandSubmissionLocked}
            >
              <span className={styles.wordbankOptionBadge}>{option.value}</span>
              <span className={styles.wordbankOptionLabel}>{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (question.type === "point-select") {
    return (
      <div className={styles.pointSelectOptions} role="group">
        {question.options.map((option) => {
          const isSelected = pointSelectSelectedSet.has(option.value);
          const buttonClass = [
            styles.pointSelectOption,
            isSelected ? styles.pointSelectOptionSelected : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={option.value}
              type="button"
              className={buttonClass}
              onClick={() => onPointSelectOption(option.value)}
              disabled={!answeringEnabled || isCommandSubmissionLocked}
              aria-pressed={isSelected}
            >
              <span className={styles.pointSelectOptionLabel}>{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (question.type === "fill") {
    return (
      <div className={styles.blankBoard}>
        {!fillPreview && !boardSubmitted ? (
          <Button
            type="primary"
            size="large"
            className={styles.boardButton}
            onClick={onOpenBoard}
            disabled={
              !answeringEnabled ||
              isCommandSubmissionLocked ||
              isBoardOpen ||
              isBoardUploading
            }
          >
            打开画板
          </Button>
        ) : null}
        {fillPreview ? (
          <>
            <div className={styles.boardPreview}>
              <NextImage
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
                <span className={styles.boardSubmittedSubtitle}>填空画板提交成功</span>
              </div>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  const singleValue = typeof selected === "string" ? selected : null;
  return (
    <div className={styles.optionGroup} role="radiogroup">
      {question.options.map((option, index) => {
        const isActive = singleValue === option.value;
        return (
          <OptionCardButton
            key={option.value}
            value={option.value}
            label={option.label}
            description={option.description}
            badge={String.fromCharCode(65 + index)}
            active={isActive}
            disabled={!answeringEnabled || isCommandSubmissionLocked}
            onSelect={onSelect}
            role="radio"
            status={resolveOptionStatus(option.value)}
          />
        );
      })}
    </div>
  );
}
