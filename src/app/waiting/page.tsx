"use client";

import { useEffect, useRef } from "react";
import { Loading, NavBar, NoticeBar } from "@arco-design/mobile-react";
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
import IconPicture from "@arco-design/mobile-react/esm/icon/IconPicture";
import IconNotice from "@arco-design/mobile-react/esm/icon/IconNotice";
import styles from "./page.module.css";

import type { FusionEventSummary } from "@/lib/fusionClient";

const STATION_FIELD_KEYS = ["台号", "台号ID", "station", "stationId"];

function resolveStationNumber(
  fields?: Record<string, unknown>
): string | undefined {
  if (!fields) return undefined;
  for (const key of STATION_FIELD_KEYS) {
    const value = fields[key];
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim();
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

function resolvePosterUrl(event?: FusionEventSummary): string | undefined {
  if (!event) return undefined;
  const candidate = event as FusionEventSummary & {
    posterUrl?: string;
    coverUrl?: string;
    poster?: string;
    banner?: string;
  };
  return (
    candidate.posterUrl ??
    candidate.coverUrl ??
    candidate.poster ??
    candidate.banner
  );
}

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

  const posterUrl = resolvePosterUrl(selectedEvent);
  const stationNumber = resolveStationNumber(teamProfile?.fields);

  const ticketFields = [
    {
      key: "station",
      label: "台号",
      value: stationNumber ?? "待分配",
      span: 2,
    },
    {
      key: "account",
      label: "参赛账号",
      value: user?.id ?? "尚未登录",
    },
    {
      key: "team",
      label: "参赛队伍",
      value: teamProfile?.displayName ?? "尚未匹配",
    },
    {
      key: "event",
      label: "当前赛事",
      value: selectedEvent?.name ?? "尚未选择",
    },
    {
      key: "connection",
      label: "连接状态",
      value: (
        <span
          className={
            mqttConnected ? styles.statusOnline : styles.statusOffline
          }
        >
          {mqttConnected ? "连接成功" : "等待连接"}
        </span>
      ),
    },
  ];

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

          <div className={styles.ticket}>
            <div className={styles.posterSection}>
              {posterUrl ? (
                <div className={styles.posterImageWrapper}>
                  <Image
                    src={posterUrl}
                    alt={`${selectedEvent?.name ?? "赛事"}海报`}
                    fill
                    priority
                    className={styles.posterImage}
                    sizes="(max-width: 768px) 100vw, 520px"
                  />
                </div>
              ) : (
                <div className={styles.posterPlaceholder}>
                  <IconPicture className={styles.posterIcon} />
                </div>
              )}
            </div>

            <div className={styles.ticketContent}>
              <div className={styles.identityRow}>
                <div className={styles.avatar}>{getInitial()}</div>
                <div className={styles.identityInfo}>
                  <p className={styles.name}>{user?.name ?? "未登录选手"}</p>
                  <span className={styles.identityMeta}>
                    {teamProfile?.displayName ?? "待匹配队伍"}
                  </span>
                </div>
              </div>

              <h2 className={styles.eventName}>
                {selectedEvent?.name ?? "当前暂无赛事"}
              </h2>

              <div className={styles.infoGrid}>
                {ticketFields.map(({ key, label, value, span }) => (
                  <div
                    key={key}
                    className={`${styles.ticketField} ${
                      span === 2 ? styles.ticketFieldFull : ""
                    }`}
                  >
                    <span className={styles.fieldLabel}>{label}</span>
                    <span className={styles.fieldValue}>{value}</span>
                  </div>
                ))}
              </div>

              <div className={styles.ticketDivider} aria-hidden="true" />

              <div className={styles.waitingArea}>
                <Loading type="dot" stroke={3} />
                <p className={styles.waitingText}>等待开始比赛...</p>
              </div>
            </div>
          </div>
        </div>
      </ArcoClient>
    </div>
  );
}
