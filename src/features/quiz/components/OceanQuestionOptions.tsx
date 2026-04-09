"use client";

import type { Dispatch, SetStateAction } from "react";
import { OptionCardButton } from "@/features/quiz/components/OptionCardButton";
import type { CustomOceanQuestion } from "@/features/quiz/types";
import {
  resolveOceanSelectionMode,
  sortOceanSelectionIds,
} from "@/features/quiz/utils/answering";
import styles from "@/app/quiz/page.module.css";

export interface OceanQuestionOptionsProps {
  question: CustomOceanQuestion;
  selected: string | string[] | null;
  setSelected: Dispatch<SetStateAction<string | string[] | null>>;
  answeringEnabled: boolean;
  isCommandSubmissionLocked: boolean;
  isAnswerRevealActive: boolean;
}

export function OceanQuestionOptions({
  question,
  selected,
  setSelected,
  answeringEnabled,
  isCommandSubmissionLocked,
  isAnswerRevealActive,
}: OceanQuestionOptionsProps) {
  const selectionMode = resolveOceanSelectionMode(question);
  const values =
    selectionMode === "single"
      ? (() => {
          if (typeof selected === "string" && selected) return [selected];
          if (Array.isArray(selected) && selected.length > 0) {
            const last = selected[selected.length - 1];
            return last ? [String(last)] : [];
          }
          return [];
        })()
      : sortOceanSelectionIds(
          Array.isArray(selected)
            ? selected
            : typeof selected === "string" && selected
              ? [selected]
              : [],
          question.optionPool
        );

  const normalizedSelectionSet = new Set(
    values.map((value) => String(value).trim()).filter(Boolean)
  );
  const normalizedCorrectSet =
    isAnswerRevealActive &&
    Array.isArray(question.correctAnswerIds) &&
    question.correctAnswerIds.length > 0
      ? new Set(question.correctAnswerIds.map((id) => String(id).trim()).filter(Boolean))
      : null;
  const resolveOptionStatus = (optionId: string): "correct" | "wrong" | undefined => {
    if (!normalizedCorrectSet) return undefined;
    const normalized = String(optionId).trim();
    if (!normalized) return undefined;
    if (normalizedCorrectSet.has(normalized)) {
      return "correct";
    }
    if (normalizedSelectionSet.has(normalized)) {
      return "wrong";
    }
    return undefined;
  };

  const handleOceanSelect = (optionId: string) => {
    if (!answeringEnabled || isCommandSubmissionLocked) {
      return;
    }
    if (selectionMode === "single") {
      setSelected((prev) => {
        const previousValue =
          typeof prev === "string"
            ? prev
            : Array.isArray(prev) && prev.length > 0
              ? String(prev[prev.length - 1])
              : null;
        if (previousValue === optionId) {
          return null;
        }
        return optionId;
      });
      return;
    }

    setSelected((prev) => {
      const base =
        Array.isArray(prev) && prev.length > 0
          ? prev.map(String)
          : typeof prev === "string" && prev
            ? [prev]
            : [];
      if (base.includes(optionId)) {
        return base.filter((item) => item !== optionId);
      }
      return sortOceanSelectionIds([...base, optionId], question.optionPool);
    });
  };

  const groupRole = selectionMode === "single" ? "radiogroup" : "group";

  return (
    <div className={styles.optionGroup} role={groupRole}>
      {question.optionPool.map((option, index) => {
        const isActive = values.includes(option.id);
        return (
          <OptionCardButton
            key={option.id}
            value={option.id}
            label={option.label}
            description={option.meta?.note ? String(option.meta.note) : undefined}
            badge={String.fromCharCode(65 + index)}
            active={isActive}
            disabled={!answeringEnabled || isCommandSubmissionLocked}
            onSelect={handleOceanSelect}
            role={selectionMode === "single" ? "radio" : "checkbox"}
            status={resolveOptionStatus(option.id)}
          />
        );
      })}
    </div>
  );
}
