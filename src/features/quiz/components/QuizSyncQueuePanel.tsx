import { Button } from "@arco-design/mobile-react";
import { Dialog } from "@/lib/arco";
import styles from "@/app/quiz/page.module.css";

export interface QuizSyncQueueItem {
  id: string;
  label: string;
  attempts: number;
  lastErrorMessage?: string;
  details?: {
    stageLabel?: string;
    questionLabel?: string;
    answerLabel?: string;
  };
}

export interface QuizSyncQueuePanelProps {
  pending: number;
  failed: number;
  failedItems: QuizSyncQueueItem[];
  showDetails: boolean;
  onToggleDetails: () => void;
  onRetry: () => void;
  onDeleteFailedItem: (jobId: string) => void;
}

export function QuizSyncQueuePanel({
  pending,
  failed,
  failedItems,
  showDetails,
  onToggleDetails,
  onRetry,
  onDeleteFailedItem,
}: QuizSyncQueuePanelProps) {
  const handleDeleteFailedItem = (item: QuizSyncQueueItem) => {
    const detailSummary = [
      item.details?.stageLabel ? `环节：${item.details.stageLabel}` : null,
      item.details?.questionLabel ? `题号：${item.details.questionLabel}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    Dialog.confirm({
      title: "确认删除失败任务？",
      children:
        detailSummary || item.label
          ? `删除后该任务不会再自动重试。\n${detailSummary || item.label}`
          : "删除后该任务不会再自动重试。",
      titleAlign: "center",
      contentAlign: "center",
      okText: "删除",
      cancelText: "取消",
      onOk: () => {
        onDeleteFailedItem(item.id);
      },
    });
  };

  return (
    <div className={styles.syncQueueWrapper}>
      <div className={styles.syncQueueIndicator}>
        <div className={styles.syncQueueLabelGroup}>
          <span className={styles.syncQueueLabel}>成绩上传队列</span>
          <span className={styles.syncQueueBadge}>待处理 {pending}</span>
          <span
            className={`${styles.syncQueueBadge} ${
              failed > 0 ? styles.syncQueueBadgeDanger : ""
            }`}
          >
            失败 {failed}
          </span>
        </div>
        <div className={styles.syncQueueControls}>
          <Button
            type="ghost"
            size="mini"
            className={styles.syncQueueActionButton}
            onClick={onToggleDetails}
          >
            {showDetails ? "收起" : "详情"}
          </Button>
          <Button
            type="ghost"
            size="mini"
            className={styles.syncQueueActionButton}
            onClick={onRetry}
            disabled={failed === 0}
          >
            重试
          </Button>
        </div>
      </div>
      {showDetails ? (
        <div className={styles.syncQueueDetails}>
          {failedItems.length === 0 ? (
            <p className={styles.syncQueueEmpty}>当前无失败任务</p>
          ) : (
            failedItems.map((item) => (
              <div key={item.id} className={styles.syncQueueRow}>
                <div className={styles.syncQueueRowHeader}>
                  <span className={styles.syncQueueRowLabel}>{item.label}</span>
                  <div className={styles.syncQueueRowActions}>
                    <span className={styles.syncQueueRowMeta}>尝试 {item.attempts}</span>
                    <button
                      type="button"
                      className={styles.syncQueueDeleteButton}
                      onClick={() => handleDeleteFailedItem(item)}
                    >
                      删除
                    </button>
                  </div>
                </div>
                {item.details?.stageLabel ? (
                  <div className={styles.syncQueueRowDetails}>
                    <span className={styles.syncQueueRowKey}>环节</span>
                    <span className={styles.syncQueueRowValue}>{item.details.stageLabel}</span>
                  </div>
                ) : null}
                {item.details?.questionLabel ? (
                  <div className={styles.syncQueueRowDetails}>
                    <span className={styles.syncQueueRowKey}>题号</span>
                    <span className={styles.syncQueueRowValue}>{item.details.questionLabel}</span>
                  </div>
                ) : null}
                {item.details?.answerLabel ? (
                  <div className={styles.syncQueueRowDetails}>
                    <span className={styles.syncQueueRowKey}>答案</span>
                    <span className={styles.syncQueueRowValue}>{item.details.answerLabel}</span>
                  </div>
                ) : null}
                {item.lastErrorMessage ? (
                  <p className={styles.syncQueueRowError}>{item.lastErrorMessage}</p>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
