import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
} from "react";

import styles from "./OptionCardButton.module.css";

export interface OptionCardButtonProps {
  value: string;
  label: string;
  description?: string | null;
  badge: string;
  active: boolean;
  disabled?: boolean;
  onSelect: (value: string) => void;
  role?: "radio" | "checkbox";
  status?: "correct" | "wrong";
}

export function OptionCardButton({
  value,
  label,
  description,
  badge,
  active,
  disabled = false,
  onSelect,
  role,
  status,
}: OptionCardButtonProps) {
  const [isPressed, setPressed] = useState(false);
  const skipClickRef = useRef(false);
  const releaseTimerRef = useRef<number | null>(null);
  const skipResetTimerRef = useRef<number | null>(null);

  const clearPressTimer = useCallback(() => {
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
  }, []);

  const clearSkipResetTimer = useCallback(() => {
    if (skipResetTimerRef.current !== null) {
      window.clearTimeout(skipResetTimerRef.current);
      skipResetTimerRef.current = null;
    }
  }, []);

  const scheduleSkipReset = useCallback(() => {
    clearSkipResetTimer();
    skipResetTimerRef.current = window.setTimeout(() => {
      skipClickRef.current = false;
      skipResetTimerRef.current = null;
    }, 150);
  }, [clearSkipResetTimer]);

  const triggerSelection = useCallback(() => {
    onSelect(value);
  }, [onSelect, value]);

  const releasePressState = useCallback(() => {
    clearPressTimer();
    setPressed(false);
  }, [clearPressTimer]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      try {
        event.currentTarget.focus({ preventScroll: true });
      } catch {
        event.currentTarget.focus();
      }
      const isTouchLike = event.pointerType === "touch" || event.pointerType === "pen";
      skipClickRef.current = isTouchLike;
      clearSkipResetTimer();
      setPressed(true);
      if (isTouchLike) {
        triggerSelection();
      }
    },
    [clearSkipResetTimer, disabled, triggerSelection]
  );

  const handlePointerUp = useCallback(() => {
    releasePressState();
    if (skipClickRef.current) {
      scheduleSkipReset();
    }
  }, [releasePressState, scheduleSkipReset]);

  const handlePointerLeave = useCallback(() => {
    releasePressState();
    if (skipClickRef.current) {
      scheduleSkipReset();
    }
  }, [releasePressState, scheduleSkipReset]);

  const handleTouchStart = useCallback(
    (_event: ReactTouchEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (skipClickRef.current) {
        return;
      }
      skipClickRef.current = true;
      clearSkipResetTimer();
      setPressed(true);
      triggerSelection();
    },
    [clearSkipResetTimer, disabled, triggerSelection]
  );

  const handleTouchEnd = useCallback(() => {
    releasePressState();
    if (skipClickRef.current) {
      scheduleSkipReset();
    }
  }, [releasePressState, scheduleSkipReset]);

  const handleClick = useCallback(
    (_event: ReactMouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (skipClickRef.current) {
        skipClickRef.current = false;
        clearSkipResetTimer();
        releasePressState();
        return;
      }
      setPressed(true);
      triggerSelection();
      clearPressTimer();
      releaseTimerRef.current = window.setTimeout(() => {
        releasePressState();
      }, 120);
      scheduleSkipReset();
    },
    [
      clearPressTimer,
      clearSkipResetTimer,
      disabled,
      releasePressState,
      scheduleSkipReset,
      triggerSelection,
    ]
  );

  useEffect(() => {
    return () => {
      clearPressTimer();
      clearSkipResetTimer();
    };
  }, [clearPressTimer, clearSkipResetTimer]);

  const className = [
    styles.optionCard,
    active ? styles.optionCardActive : "",
    status === "correct" ? styles.optionCardCorrect : "",
    status === "wrong" ? styles.optionCardWrong : "",
  ]
    .filter(Boolean)
    .join(" ");

  const badgeClass = [
    styles.optionBadge,
    active ? styles.optionBadgeActive : "",
    status === "correct" ? styles.optionBadgeCorrect : "",
    status === "wrong" ? styles.optionBadgeWrong : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      role={role}
      aria-checked={role ? active : undefined}
      className={className}
      data-active={active ? "true" : undefined}
      data-pressed={isPressed ? "true" : undefined}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClick={handleClick}
    >
      <span className={badgeClass}>{badge}</span>
      <div className={styles.optionContent}>
        <span className={styles.optionLabel}>{label}</span>
        {description ? <span className={styles.optionDesc}>{description}</span> : null}
      </div>
    </button>
  );
}
