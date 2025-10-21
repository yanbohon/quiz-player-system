"use client";

import { useEffect, useRef } from "react";
import { Cell, Loading, NavBar, NoticeBar } from "@arco-design/mobile-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { ArcoClient } from "@/components/ArcoClient";
import { Toast } from "@/lib/arco";
import { mqttService } from "@/lib/mqtt/client";
import { useAppStore } from "@/store/useAppStore";
import { useQuizStore } from "@/store/quizStore";
import { CONTEST_MODES } from "@/features/quiz/modes";
import { resolveStatusFieldKey } from "@/features/quiz/status";
import { resolveModeForStage } from "@/features/quiz/useControlCommands";
import { MQTT_TOPICS } from "@/config/control";
import LogoutIcon from "@/components/icons/logout.svg";
import styles from "./page.module.css";
import IconNotice from '@arco-design/mobile-react/esm/icon/IconNotice';

export default function WaitingPage() {
  const router = useRouter();
  const { user, isAuthenticated, mqttConnected, logout } = useAppStore(
    useShallow((state) => ({
      user: state.user,
      isAuthenticated: state.isAuthenticated,
      mqttConnected: state.mqttConnected,
      logout: state.logout,
    }))
  );
  const { selectedEvent, teamProfile, currentStage, scoreRecord, updateScoreStatus } = useQuizStore(
    useShallow((state) => ({
      selectedEvent: state.selectedEvent,
      teamProfile: state.teamProfile,
      currentStage: state.currentStage,
      scoreRecord: state.scoreRecord,
      updateScoreStatus: state.updateScoreStatus,
    }))
  );
  const statusResetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      Toast.info("请先登录",500);
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (!currentStage || !scoreRecord) return;

    const mode = resolveModeForStage(currentStage);
    if (mode !== "last-stand") return;

    const scoreSheetId = currentStage.scoreSheetId;
    const recordId = scoreRecord.recordId;
    if (!scoreSheetId || !recordId) return;

    const statusFieldKey = resolveStatusFieldKey(scoreRecord.fields);
    if (!statusFieldKey) return;

    const initialHp =
      CONTEST_MODES["last-stand"].features.initialHp ?? 0;
    if (!Number.isFinite(initialHp) || initialHp <= 0) return;

    const statusValue = String(Math.max(0, Math.trunc(initialHp)));
    const cacheKey = `${recordId}:${statusValue}`;
    if (statusResetRef.current === cacheKey) return;

    const currentStatus = scoreRecord.fields[statusFieldKey];
    if (
      currentStatus !== undefined &&
      currentStatus !== null &&
      String(currentStatus) === statusValue
    ) {
      statusResetRef.current = cacheKey;
      return;
    }

    let cancelled = false;

    updateScoreStatus({
      datasheetId: scoreSheetId,
      recordId,
      fieldKey: statusFieldKey,
      status: statusValue,
    })
      .then(() => {
        if (!cancelled) {
          statusResetRef.current = cacheKey;
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("重置血量状态失败", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentStage, scoreRecord, updateScoreStatus]);

  const getInitial = () => {
    if (user?.name) {
      return user.name.slice(0, 1).toUpperCase();
    }
    return "?";
  };

  const handleLogout = () => {
    if (user?.id && mqttService.isConnected()) {
      try {
        mqttService.publish(MQTT_TOPICS.stateForClient(user.id), "offline", { qos: 0, retain: true });
      } catch (error) {
        console.warn("Failed to broadcast offline state before logout:", error);
      }
    }
    logout();
    router.push("/login");
  };

  return (
    <div className={styles.page}>
      <ArcoClient fallback={<div className={styles.fallback}>加载中...</div>}>
        <NavBar
          title="比赛等待区"
          leftContent={null}
          rightContent={
            <button type="button" className={styles.logoutButton} onClick={handleLogout}>
              <Image
                src={LogoutIcon}
                alt="退出登录"
                width={24}
                height={24}
                className={styles.logoutIcon}
                priority
              />
            </button>
          }
        />

        <div className={styles.body}>
          <NoticeBar className={styles.notice} marquee="none" leftContent={<IconNotice />}>
          请核对队伍信息是否正确，如有问题请举手反馈。
          </NoticeBar>

          <div className={styles.card}>
            <div className={styles.avatar}>{getInitial()}</div>
            <div className={styles.info}>
              <p className={styles.name}>{user?.name ?? "未登录选手"}</p>
              {user?.team ? <span className={styles.team}>{user.team}</span> : null}
            </div>

            <Cell.Group bordered={false} className={styles.statusList}>
              <Cell
                label="参赛账号"
                text={user?.id ?? "尚未登录"}
              />
              <Cell
                label="参赛队伍"
                text={teamProfile?.displayName ?? "尚未匹配"}
              />
              <Cell
                label="当前赛事"
                text={selectedEvent?.name ?? "尚未选择"}
              />
              <Cell
                label="连接状态"
                text={mqttConnected ? "实时连接正常" : "等待连接"}
              />
            </Cell.Group>

            <div className={styles.loading}>
              <Loading type="dot" stroke={3} />
              <p className={styles.loadingText}>等待开始比赛...</p>
            </div>
          </div>
        </div>
      </ArcoClient>
    </div>
  );
}
