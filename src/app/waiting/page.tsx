"use client";

import { useEffect } from "react";
import { Button, Cell, Loading, NavBar, NoticeBar } from "@arco-design/mobile-react";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { ArcoClient } from "@/components/ArcoClient";
import { Toast } from "@/lib/arco";
import { mqttService } from "@/lib/mqtt/client";
import { useAppStore } from "@/store/useAppStore";
import { useQuizStore } from "@/store/quizStore";
import { MQTT_TOPICS } from "@/config/control";
import styles from "./page.module.css";

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
  const { selectedEvent, teamProfile } = useQuizStore(
    useShallow((state) => ({
      selectedEvent: state.selectedEvent,
      teamProfile: state.teamProfile,
    }))
  );

  useEffect(() => {
    if (!isAuthenticated) {
      Toast.info("请先登录");
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  const getInitial = () => {
    if (user?.name) {
      return user.name.slice(0, 1).toUpperCase();
    }
    return "?";
  };

  const handleStartQuiz = () => {
    router.push("/quiz");
  };

  const handleReturnToLogin = () => {
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
        <NavBar title="比赛等待区" onClickLeft={() => router.push("/")} />

        <div className={styles.body}>
          <NoticeBar className={styles.notice} marquee="none">
            请保持设备在线并关注主持人指令，答题开始后再点击进入答题页。
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
              <Loading type="spin" stroke={3} />
              <p className={styles.loadingText}>等待主持人开始比赛...</p>
            </div>
          </div>

          <div className={styles.actions}>
            <Button type="primary" onClick={handleStartQuiz}>
              主持人已宣布开始，进入答题
            </Button>
            <Button type="ghost" onClick={handleReturnToLogin}>
              返回登录修改信息
            </Button>
          </div>
        </div>
      </ArcoClient>
    </div>
  );
}
