"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Divider, Loading, NavBar, NoticeBar } from "@arco-design/mobile-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { ArcoClient } from "@/components/ArcoClient";
import { Toast } from "@/lib/arco";
import { mqttService } from "@/lib/mqtt/client";
import { useAppStore } from "@/store/useAppStore";
import { useQuizStore } from "@/store/quizStore";
import { CONTEST_MODES } from "@/features/quiz/modes";
import { resolveStatusFieldKey, resolveLastStandGroupStatusIndicator } from "@/features/quiz/status";
import { resolveModeForStage } from "@/features/quiz/useControlCommands";
import { FUSION_API_CONFIG, MQTT_TOPICS } from "@/config/control";
import LogoutIcon from "@/components/icons/logout.svg";
import IconPicture from "@arco-design/mobile-react/esm/icon/IconPicture";
import IconNotice from "@arco-design/mobile-react/esm/icon/IconNotice";
import IconUserFill from "@arco-design/mobile-react/esm/icon/IconUserFill";
import { useAppStoreHydrated } from "@/hooks/useAppStoreHydrated";
import styles from "./page.module.css";

import type { FusionEventSummary } from "@/lib/fusionClient";

const WAITING_PAGE_VERSION = "V2026.03.27.1";

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

function formatTeamDisplayName(name?: string): string {
  if (!name) return "待匹配队伍";
  const trimmed = name.trim();
  if (!trimmed) return "待匹配队伍";
  const normalized = trimmed.replace(/^\d+[\.\s]*/, "").trim();
  return normalized || trimmed;
}

const FUSION_ASSET_ORIGIN = (() => {
  try {
    const url = new URL(FUSION_API_CONFIG.baseUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return FUSION_API_CONFIG.baseUrl.replace(/\/+$/, "");
  }
})();

function normalizeAttachmentUrl(raw?: string): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  const normalized = trimmed.replace(/^\/*/, "");
  if (normalized.startsWith("assets/")) {
    return `${FUSION_ASSET_ORIGIN}/${normalized}`;
  }
  if (normalized.startsWith("space/")) {
    return `${FUSION_ASSET_ORIGIN}/assets/${normalized}`;
  }
  if (trimmed.startsWith("/assets/")) {
    return `${FUSION_ASSET_ORIGIN}${trimmed}`;
  }
  if (trimmed.startsWith("/space/")) {
    return `${FUSION_ASSET_ORIGIN}/assets${trimmed}`;
  }
  if (trimmed.startsWith("/")) {
    return `${FUSION_ASSET_ORIGIN}${trimmed}`;
  }
  return `${FUSION_ASSET_ORIGIN}/${normalized}`;
}

function resolveSchoolBadgeUrl(
  fields?: Record<string, unknown>
): string | undefined {
  if (!fields) return undefined;
  const raw = fields["校徽"];
  if (raw === undefined || raw === null) return undefined;

  const extractFromCandidate = (candidate: unknown): string | undefined => {
    if (!candidate || typeof candidate !== "object") return undefined;
    const candidateMap = candidate as Record<string, unknown>;
    const possibleKeys = [
      "url",
      "downloadUrl",
      "previewUrl",
      "thumbnailUrl",
      "permalink",
      "token",
    ];
    for (const key of possibleKeys) {
      const url = normalizeAttachmentUrl(
        typeof candidateMap[key] === "string" ? (candidateMap[key] as string) : undefined
      );
      if (url) return url;
    }
    return undefined;
  };

  const extractUrl = (input: unknown): string | undefined => {
    if (!input) return undefined;

    if (Array.isArray(input)) {
      for (const item of input) {
        const url = extractFromCandidate(item);
        if (url) return url;
      }
      return undefined;
    }

    if (typeof input === "object") {
      return extractFromCandidate(input);
    }

    if (typeof input === "string") {
      const trimmed = input.trim();
      if (!trimmed) return undefined;
      const normalized = normalizeAttachmentUrl(trimmed);
      if (normalized) {
        return normalized;
      }
      try {
        const parsed = JSON.parse(trimmed);
        return extractUrl(parsed);
      } catch {
        return undefined;
      }
    }

    return undefined;
  };

  return extractUrl(raw);
}

export default function WaitingPage() {
  const router = useRouter();
  const storeHydrated = useAppStoreHydrated();
  const { user, isAuthenticated, mqttConnected, logout } = useAppStore(
    useShallow((state) => ({
      user: state.user,
      isAuthenticated: state.isAuthenticated,
      mqttConnected: state.mqttConnected,
      logout: state.logout,
    }))
  );
  const {
    selectedEvent,
    teamProfile,
    currentStage,
    scoreRecord,
    updateScoreStatus,
    waitingTicketView,
    rankStatus,
    rankEntries,
    rankError,
  } = useQuizStore(
    useShallow((state) => ({
      selectedEvent: state.selectedEvent,
      teamProfile: state.teamProfile,
      currentStage: state.currentStage,
      scoreRecord: state.scoreRecord,
      updateScoreStatus: state.updateScoreStatus,
      waitingTicketView: state.waitingTicketView,
      rankStatus: state.rankStatus,
      rankEntries: state.rankEntries,
      rankError: state.rankError,
    }))
  );
  const statusResetRef = useRef<string | null>(null);
  const [badgeLoadError, setBadgeLoadError] = useState(false);

  useEffect(() => {
    if (!storeHydrated) return;
    if (!isAuthenticated) {
      Toast.info("请先登录",500);
      router.replace("/login");
    }
  }, [isAuthenticated, router, storeHydrated]);

  useEffect(() => {
    if (!currentStage || !scoreRecord) return;

    const mode = resolveModeForStage(currentStage);
    if (mode !== "last-stand" && mode !== "last-stand-group") return;

    const scoreSheetId = currentStage.scoreSheetId;
    const recordId = scoreRecord.recordId;
    if (!scoreSheetId || !recordId) return;

    const statusFieldKey = resolveStatusFieldKey(scoreRecord.fields);
    if (!statusFieldKey) return;

    let statusValue: string | undefined;
    if (mode === "last-stand-group") {
      statusValue = resolveLastStandGroupStatusIndicator(currentStage.name);
    } else {
      const initialHp = CONTEST_MODES["last-stand"].features.initialHp ?? 0;
      if (!Number.isFinite(initialHp) || initialHp <= 0) return;
      statusValue = String(Math.max(0, Math.trunc(initialHp)));
    }

    if (!statusValue) return;

    const cacheKey = `${recordId}:${mode}:${statusValue}`;
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

  const teamDisplayNameRaw =
    typeof teamProfile?.displayName === "string"
      ? teamProfile.displayName.trim()
      : "";
  const teamDisplayName = formatTeamDisplayName(teamProfile?.displayName);
  const schoolBadgeUrl = useMemo(
    () => resolveSchoolBadgeUrl(teamProfile?.fields),
    [teamProfile?.fields]
  );
  useEffect(() => {
    setBadgeLoadError(false);
  }, [schoolBadgeUrl]);
  const showBadgeImage = Boolean(schoolBadgeUrl && !badgeLoadError);
  const schoolBadgeAlt = teamDisplayNameRaw
    ? `${teamDisplayName}校徽`
    : "学校校徽";

  if (!storeHydrated) {
    return (
      <div className={styles.page}>
        <div className={styles.pageContent}>
          <div className={styles.fallback}>
            <Loading />
          </div>
        </div>
        <p className={styles.versionFooter}>{WAITING_PAGE_VERSION}</p>
      </div>
    );
  }

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
  const ticketFields = [
    {
      key: "account",
      label: "参赛账号",
      value: user?.id ?? "尚未登录",
      span: 1,
    },
    {
      key: "team",
      label: "参赛队伍",
      value: teamDisplayName,
      span: 1,
    },
    {
      key: "event",
      label: "当前赛事",
      value: selectedEvent?.name ?? "尚未匹配",
      span: 2,
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
      span: 2,
    },
  ];

  const isRankView = waitingTicketView === "rank";

  return (
    <div className={styles.page}>
      <div className={styles.pageContent}>
        <ArcoClient>
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
                {isRankView ? (
                  <div className={styles.rankArea}>
                    <p className={styles.rankTitle}>总分排行榜</p>
                    {rankStatus === "loading" ? (
                      <div className={styles.rankLoading}>
                        <Loading type="dot" stroke={3} />
                        <p className={styles.rankMessage}>正在获取排行榜...</p>
                      </div>
                    ) : rankStatus === "error" ? (
                      <p className={styles.rankMessage}>
                        {rankError ?? "排行榜数据获取失败，请稍后再试"}
                      </p>
                    ) : rankEntries.length === 0 ? (
                      <p className={styles.rankMessage}>暂无排行榜数据</p>
                    ) : (
                      <div className={styles.rankList}>
                        {rankEntries.map((entry, index) => (
                          <div key={`${entry.id}-${index}`} className={styles.rankRow}>
                            <div className={styles.rankItem}>
                              <span className={styles.rankLabel}>{index + 1}.</span>
                              <span className={styles.rankName}>{entry.schoolName}</span>
                              <span className={styles.rankScore}>{entry.score}分</span>
                            </div>
                            {index < rankEntries.length - 1 ? (
                              <Divider className={styles.rankDivider} />
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                    ) : (
                      <>
                        <div className={styles.identityRow}>
                          <div
                            className={
                              showBadgeImage
                                ? `${styles.avatar} ${styles.avatarHasImage}`
                                : styles.avatar
                            }
                          >
                            {showBadgeImage && schoolBadgeUrl ? (
                              <Image
                                src={schoolBadgeUrl}
                                alt={schoolBadgeAlt}
                                className={styles.avatarImage}
                                onError={() => setBadgeLoadError(true)}
                                loading="lazy"
                                width={100}
                                height={100}
                              />
                            ) : (
                              <IconUserFill className={styles.avatarIcon} aria-hidden="true" />
                            )}
                          </div>
                          <div className={styles.identityInfo}>
                            <p className={styles.name}>{user?.name ?? "未登录选手"}</p>
                            <span className={styles.identityMeta}>{teamDisplayName}</span>
                          </div>
                        </div>

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
                      <p className={styles.waitingText}>等待开始环节...</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </ArcoClient>
      </div>
      <p className={styles.versionFooter}>{WAITING_PAGE_VERSION}</p>
    </div>
  );
}
