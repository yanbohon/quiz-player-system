import styles from "@/app/quiz/page.module.css";
import { SwitchArrowsIcon } from "@/features/quiz/components/QuizIcons";

type UltimatePkTeam = "affirmative" | "negative";

export interface UltimatePkPanelProps {
  team: UltimatePkTeam;
  stageLocked: boolean;
  throttleActive: boolean;
  sending: boolean;
  onTeamSelect: (team: UltimatePkTeam) => void;
  onSwitch: () => void;
}

export function UltimatePkPanel({
  team,
  stageLocked,
  throttleActive,
  sending,
  onTeamSelect,
  onSwitch,
}: UltimatePkPanelProps) {
  const teamOptions: Array<{
    id: UltimatePkTeam;
    label: string;
    toneClass: string;
  }> = [
    { id: "affirmative", label: "正方", toneClass: styles.ultimatePkTeamPositive },
    { id: "negative", label: "反方", toneClass: styles.ultimatePkTeamNegative },
  ];
  const buttonDisabled = stageLocked || throttleActive || sending;
  const statusText = stageLocked
    ? "等待主持人允许切换"
    : throttleActive
      ? "切换冷却中，请稍候"
      : sending
        ? "正在发送切换指令..."
        : "当前可切换发言队伍";
  const statusClass = stageLocked
    ? styles.ultimatePkStatusLocked
    : throttleActive || sending
      ? styles.ultimatePkStatusCooling
      : styles.ultimatePkStatusReady;

  return (
    <div className={styles.ultimatePkPanel}>
      <div className={styles.ultimatePkTeamSelector} role="radiogroup" aria-label="请选择发言队伍">
        {teamOptions.map((option) => {
          const active = team === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`${styles.ultimatePkTeamButton} ${option.toneClass} ${
                active ? styles.ultimatePkTeamButtonActive : ""
              }`}
              onClick={() => onTeamSelect(option.id)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div className={styles.ultimatePkSwitchWrapper}>
        <button
          type="button"
          className={`${styles.ultimatePkSwitchButton} ${
            buttonDisabled ? styles.ultimatePkSwitchButtonDisabled : ""
          }`}
          onClick={onSwitch}
          disabled={buttonDisabled}
          aria-busy={sending}
        >
          <SwitchArrowsIcon className={styles.ultimatePkSwitchIcon} />
          <span className={styles.ultimatePkSwitchLabel}>切换发言</span>
        </button>
      </div>
      <p className={styles.ultimatePkHint}>
        点击按钮进行切换发言
        <br />
        <span>1 秒内仅可切换一次</span>
      </p>
      <p className={`${styles.ultimatePkStatusText} ${statusClass}`} aria-live="polite">
        {statusText}
      </p>
    </div>
  );
}
