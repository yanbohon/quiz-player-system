import type { ReactNode } from "react";
import styles from "@/app/quiz/page.module.css";
import { ErrorBadgeIcon, SuccessCheckIcon } from "@/features/quiz/components/QuizIcons";

export interface QuestionLoadingStateProps {
  status: "idle" | "loading" | "success" | "error";
  attempts: number;
  error?: string;
  questionCount: number;
  topSlot?: ReactNode;
}

export function QuestionLoadingState({
  status,
  attempts,
  error,
  questionCount,
  topSlot,
}: QuestionLoadingStateProps) {
  if (status === "error") {
    const attemptCount = Math.max(attempts, 1);
    return (
      <div className={styles.questionLoading}>
        {topSlot ? <div className={styles.loadingTopSlot}>{topSlot}</div> : null}
        <div className={`${styles.statusBadge} ${styles.statusBadgeError}`}>
          <ErrorBadgeIcon className={styles.statusIcon} />
        </div>
        <div className={styles.loadingTexts}>
          <p className={styles.loadingPrimary}>题目加载出错</p>
          <p className={styles.loadingSecondary}>请举手示意，告知主持人重新进入环节</p>
          <p className={styles.loadingMeta}>已尝试 {attemptCount} 次加载</p>
          {error ? (
            <p className={styles.loadingMeta} title={error}>
              {error}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className={styles.questionLoading}>
        {topSlot ? <div className={styles.loadingTopSlot}>{topSlot}</div> : null}
        <div className={`${styles.statusBadge} ${styles.statusBadgeSuccess}`}>
          <SuccessCheckIcon className={styles.statusIcon} />
        </div>
        <div className={styles.loadingTexts}>
          <p className={styles.loadingPrimary}>题目加载完成</p>
          <p className={styles.loadingSecondary}>请做好准备 比赛即将开始</p>
          <p className={styles.loadingMeta}>
            已准备 {questionCount} 道题，等待主持人发出切题指令
          </p>
        </div>
      </div>
    );
  }

  const attemptLabel = attempts > 0 ? `第 ${attempts} 次尝试` : "准备加载题目数据";

  return (
    <div className={styles.questionLoading}>
      {topSlot ? <div className={styles.loadingTopSlot}>{topSlot}</div> : null}
      <div className={`${styles.statusBadge} ${styles.statusBadgePending}`}>
        <span className={styles.loadingSpinner} aria-hidden="true" />
      </div>
      <div className={styles.loadingTexts}>
        <p className={styles.loadingPrimary}>正在加载题目</p>
        <p className={styles.loadingSecondary}>{attemptLabel}</p>
        <p className={styles.loadingMeta}>请保持在线，留意主持人通知</p>
      </div>
    </div>
  );
}
