"use client";

import { Button, NavBar, NoticeBar } from "@arco-design/mobile-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { ArcoClient } from "@/components/ArcoClient";
import { Toast } from "@/lib/arco";
import { useAppStore } from "@/store/useAppStore";
import styles from "./page.module.css";

const TOTAL_STATIONS = 20;
const PLAYER_ID_OFFSET = 1000;
const STATION_NUMBERS = Array.from({ length: TOTAL_STATIONS }, (_, index) => index + 1);

export default function LoginPage() {
  const router = useRouter();
  const { user, setUser, logout } = useAppStore(
    useShallow((state) => ({
      user: state.user,
      setUser: state.setUser,
      logout: state.logout,
    }))
  );

  useEffect(() => {
    logout();
  }, [logout]);

  const activeStation = (() => {
    if (!user?.id || !/^\d+$/.test(user.id)) {
      return null;
    }
    const stationNumber = Number(user.id) - PLAYER_ID_OFFSET;
    return stationNumber >= 1 && stationNumber <= TOTAL_STATIONS ? stationNumber : null;
  })();

  const handleSelectStation = (station: number) => {
    const identifier = (PLAYER_ID_OFFSET + station).toString();
    setUser({
      id: identifier,
      name: `${station}号台`,
    });
    Toast.success(`${station}号台登录成功`);
    router.replace("/waiting");
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <div className={styles.page}>
      <ArcoClient fallback={<div className={styles.fallback}>页面加载中...</div>}>
        <NavBar title="选手登录" onClickLeft={handleBack} />

        <div className={styles.body}>
          <NoticeBar className={styles.notice} marquee="none">
            请选择所属队伍的参赛台号，点击按钮即可登录。
          </NoticeBar>

          <div className={styles.grid}>
            {STATION_NUMBERS.map((station) => {
              const identifier = (PLAYER_ID_OFFSET + station).toString();
              const isActive = activeStation === station;
              return (
                <Button
                  key={identifier}
                  type="primary"
                  className={`${styles.stationButton} ${isActive ? styles.active : ""}`}
                  onClick={() => handleSelectStation(station)}
                >
                  <span className={styles.stationName}>{station}号台</span>
                  <span className={styles.stationId}>ID {identifier}</span>
                </Button>
              );
            })}
          </div>
        </div>
      </ArcoClient>
    </div>
  );
}
