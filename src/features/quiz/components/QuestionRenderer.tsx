"use client";

import type { ReactNode } from "react";
import { Tag } from "@arco-design/mobile-react";
import trashIcon from "@/components/icons/trash.svg";
import {
  isOceanQuestion,
  isStandardQuestion,
  type WordbankToken,
} from "@/features/quiz/utils/answering";
import { CommandSubmissionOverlay } from "@/features/quiz/components/QuizFeedbackPanels";
import {
  OceanQuestionOptions,
  type OceanQuestionOptionsProps,
} from "@/features/quiz/components/OceanQuestionOptions";
import {
  StandardQuestionOptions,
  type StandardQuestionOptionsProps,
} from "@/features/quiz/components/StandardQuestionOptions";
import type { QuizQuestion } from "@/features/quiz/types";
import styles from "@/app/quiz/page.module.css";

interface SelectionSummary {
  tokens: string[];
  emptyLabel?: string;
}

interface PointSelectDisplayToken {
  key: string;
  text: string;
}

export interface QuestionRendererProps {
  question: QuizQuestion;
  questionTags: string[];
  answerBadgeText: string | null;
  selectionSummary: SelectionSummary | null;
  isImageQuestion: boolean;
  illustrationNode: ReactNode;
  shouldShowCommandOverlay: boolean;
  isWordbankQuestion: boolean;
  wordbankTemplate: {
    tokens: WordbankToken[];
    blankIds: string[];
  } | null;
  wordbankOptionLabelMap: Map<string, string> | null;
  wordbankValues: string[];
  wordbankActiveIndex: number | null;
  onWordbankBlankClick: (index: number) => void;
  onWordbankClear: (index: number) => void;
  isMatchingQuestion: boolean;
  matchingPrompt?: string | null;
  matchingPairsCount: number;
  onClearMatchingPairs: () => void;
  isPointSelectQuestion: boolean;
  pointSelectValues: string[];
  pointSelectDisplayTokens: PointSelectDisplayToken[];
  onPointSelectClear: () => void;
  standardOptionsProps?: StandardQuestionOptionsProps;
  oceanOptionsProps?: OceanQuestionOptionsProps;
}

function QuestionMetaHeader({
  questionTags,
  answerBadgeText,
  selectionSummary,
  isImageQuestion,
}: {
  questionTags: string[];
  answerBadgeText: string | null;
  selectionSummary: SelectionSummary | null;
  isImageQuestion: boolean;
}) {
  return (
    <div className={styles.questionHeader}>
      <div className={styles.questionHeaderLeft}>
        {questionTags.map((tag) => (
          <span key={tag} className={styles.questionTag}>
            {tag}
          </span>
        ))}
        {answerBadgeText ? (
          <span className={`${styles.questionTag} ${styles.answerTag}`}>
            <span className={styles.answerTagLabel}>答案：</span>
            <span className={styles.answerTagValue}>{answerBadgeText}</span>
          </span>
        ) : null}
      </div>
      <div className={styles.questionHeaderRight}>
        {selectionSummary && !isImageQuestion ? (
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
              <Tag
                size="small"
                filleted
                type="hollow"
                className={styles.selectionTagMuted}
              >
                {selectionSummary.emptyLabel ?? "未选"}
              </Tag>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function QuestionRenderer({
  question,
  questionTags,
  answerBadgeText,
  selectionSummary,
  isImageQuestion,
  illustrationNode,
  shouldShowCommandOverlay,
  isWordbankQuestion,
  wordbankTemplate,
  wordbankOptionLabelMap,
  wordbankValues,
  wordbankActiveIndex,
  onWordbankBlankClick,
  onWordbankClear,
  isMatchingQuestion,
  matchingPrompt,
  matchingPairsCount,
  onClearMatchingPairs,
  isPointSelectQuestion,
  pointSelectValues,
  pointSelectDisplayTokens,
  onPointSelectClear,
  standardOptionsProps,
  oceanOptionsProps,
}: QuestionRendererProps) {
  if (isStandardQuestion(question)) {
    if (!standardOptionsProps) return null;

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
              const label = value ? wordbankOptionLabelMap?.get(value) ?? value : null;
              const hasAllFilled = wordbankValues.every((item) => item && item.trim());
              const isActive = !hasAllFilled && wordbankActiveIndex === blankIndex;

              return (
                <button
                  key={`wb-blank-${token.blankId}-${index}`}
                  type="button"
                  className={`${styles.wordbankBlank} ${
                    value ? styles.wordbankBlankFilled : styles.wordbankBlankEmpty
                  } ${isActive ? styles.wordbankBlankActive : ""}`}
                  onClick={() =>
                    value ? onWordbankClear(blankIndex) : onWordbankBlankClick(blankIndex)
                  }
                  disabled={
                    !standardOptionsProps.answeringEnabled ||
                    standardOptionsProps.isCommandSubmissionLocked
                  }
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
        const matchingTitleContent = matchingPrompt
          ? matchingPrompt.split(/\n+/).map((line, index, lines) => (
              <span key={`matching-prompt-${index}`}>
                {line}
                {index < lines.length - 1 ? <br /> : null}
              </span>
            ))
          : "请完成连线";
        const isClearDisabled =
          !standardOptionsProps.answeringEnabled ||
          standardOptionsProps.isCommandSubmissionLocked ||
          matchingPairsCount === 0;
        return (
          <div className={styles.questionTitleRow}>
            <h2 className={styles.questionTitle}>{matchingTitleContent}</h2>
            <button
              type="button"
              className={styles.questionTitleAction}
              onClick={onClearMatchingPairs}
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

      if (isPointSelectQuestion) {
        const isClearDisabled =
          !standardOptionsProps.answeringEnabled ||
          pointSelectValues.length === 0 ||
          standardOptionsProps.isCommandSubmissionLocked;
        return (
          <div className={styles.questionTitleRow}>
            <h2 className={styles.questionTitle}>{question.title}</h2>
            <button
              type="button"
              className={styles.pointSelectClear}
              onClick={onPointSelectClear}
              disabled={isClearDisabled}
            >
              <span
                aria-hidden="true"
                className={styles.pointSelectClearIcon}
                style={{
                  WebkitMaskImage: `url(${trashIcon.src})`,
                  maskImage: `url(${trashIcon.src})`,
                }}
              />
              清空
            </button>
          </div>
        );
      }

      return <h2 className={styles.questionTitle}>{question.title}</h2>;
    })();

    const pointSelectInputNode = isPointSelectQuestion ? (
      <div className={styles.pointSelectArea}>
        <div
          className={[
            styles.pointSelectInput,
            pointSelectValues.length ? styles.pointSelectInputFilled : "",
          ]
            .filter(Boolean)
            .join(" ")}
          role="textbox"
          aria-readonly="true"
          aria-label="已选择词语"
          tabIndex={0}
        >
          {pointSelectDisplayTokens.length ? (
            pointSelectDisplayTokens.map((token) => (
              <span key={token.key} className={styles.pointSelectToken}>
                {token.text}
              </span>
            ))
          ) : (
            <span className={styles.pointSelectPlaceholder}>点击下方词语拼成答案</span>
          )}
        </div>
      </div>
    ) : null;

    const shouldShowStandardOverlay =
      question.type !== "fill" && shouldShowCommandOverlay;

    return (
      <>
        <QuestionMetaHeader
          questionTags={questionTags}
          answerBadgeText={answerBadgeText}
          selectionSummary={selectionSummary}
          isImageQuestion={isImageQuestion}
        />
        {questionTitleNode}
        {illustrationNode}
        {pointSelectInputNode}
        <div className={styles.options}>
          <StandardQuestionOptions {...standardOptionsProps} />
          {shouldShowStandardOverlay ? <CommandSubmissionOverlay /> : null}
        </div>
      </>
    );
  }

  if (isOceanQuestion(question)) {
    if (!oceanOptionsProps) return null;

    return (
      <>
        <QuestionMetaHeader
          questionTags={questionTags}
          answerBadgeText={answerBadgeText}
          selectionSummary={selectionSummary}
          isImageQuestion={isImageQuestion}
        />
        <h2 className={styles.questionTitle}>{question.stem}</h2>
        {illustrationNode}
        <div className={styles.categories}>
          {question.categories.map((category) => (
            <Tag
              key={category}
              type="primary"
              size="small"
              filleted
              className={styles.categoryTag}
            >
              {category}
            </Tag>
          ))}
        </div>
        <div className={styles.options}>
          <OceanQuestionOptions {...oceanOptionsProps} />
          {shouldShowCommandOverlay ? <CommandSubmissionOverlay /> : null}
        </div>
      </>
    );
  }

  return null;
}
