import styles from "@/app/quiz/page.module.css";
import { EliminatedIcon, SuccessCheckIcon } from "@/features/quiz/components/QuizIcons";

export function CommandSubmissionResult() {
  return (
    <div className={styles.commandSubmissionResult}>
      <div className={styles.commandSubmissionBadge}>
        <SuccessCheckIcon />
      </div>
      <p className={`${styles.submissionFeedbackTitle} ${styles.submissionFeedbackToneSuccess}`}>
        提交成功
      </p>
      <p
        className={`${styles.submissionFeedbackSubtitle} ${styles.submissionFeedbackToneSuccess}`}
      >
        请等待大屏公示
      </p>
    </div>
  );
}

export function CommandSubmissionOverlay() {
  return (
    <div className={styles.commandSubmissionOverlay} role="status" aria-live="polite">
      <div className={styles.commandSubmissionOverlayInner}>
        <CommandSubmissionResult />
      </div>
    </div>
  );
}

export function EliminationStatePanel() {
  return (
    <div className={styles.commandSubmissionResult}>
      <div className={styles.commandSubmissionBadge}>
        <EliminatedIcon />
      </div>
      <p className={`${styles.submissionFeedbackTitle} ${styles.submissionFeedbackToneNeutral}`}>
        您已淘汰
      </p>
      <p
        className={`${styles.submissionFeedbackSubtitle} ${styles.submissionFeedbackToneNeutral}`}
      >
        血量已耗尽，无法继续作答。
      </p>
    </div>
  );
}
