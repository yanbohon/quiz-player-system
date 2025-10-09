"use client";

import { useMemo } from "react";
import { Button, Cell, Divider, NoticeBar, Tag } from "@arco-design/mobile-react";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { ArcoClient } from "@/components/ArcoClient";
import { Toast } from "@/lib/arco";
import { useAppStore } from "@/store/useAppStore";
import styles from "./page.module.css";

export default function HomePage() {
  const router = useRouter();
  const { user, isAuthenticated, answers, logout } = useAppStore(
    useShallow((state) => ({
      user: state.user,
      isAuthenticated: state.isAuthenticated,
      answers: state.answers,
      logout: state.logout,
    }))
  );

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);

  const handleNavigate = (path: string) => {
    if (!isAuthenticated && path !== "/login") {
      Toast.info("请先登录");
      router.push("/login");
      return;
    }
    router.push(path);
  };

  const handleLogout = () => {
    logout();
    Toast.success("已退出登录");
    router.push("/login");
  };

  return (
    <div className={styles.page}>
      <ArcoClient fallback={<div className={styles.fallback}>加载中...</div>}>
        <div className={styles.header}>
          <h1 className={styles.title}>答题系统</h1>
          <p className={styles.subtitle}>选手端操作中心</p>
        </div>

        <NoticeBar className={styles.notice} marquee="none">
          登录后即可进入等待区，收到主持人指令再进入答题环节。
        </NoticeBar>

        <div className={styles.panel}>
          <div className={styles.card}>
            <Cell.Group bordered={false}>
              <Cell label="选手" text={isAuthenticated ? user?.name ?? "未设置" : "未登录"} />
              <Cell
                label="所属队伍"
                text={user?.team ? user.team : "未分配"}
                append={
                  user?.team ? (
                    <Tag type="primary" size="small">
                      {user.team}
                    </Tag>
                  ) : null
                }
              />
              <Cell label="答题进度" text={`${answeredCount} 题`} />
            </Cell.Group>
          </div>

          <Divider className={styles.divider}>快速入口</Divider>

          <div className={styles.actions}>
            <Button type="primary" onClick={() => handleNavigate("/login")}>
              登录 / 切换账号
            </Button>
            <Button type="default" onClick={() => handleNavigate("/waiting")}>
              前往等待页
            </Button>
            <Button type="default" onClick={() => handleNavigate("/quiz")}>
              进入答题页
            </Button>
            {isAuthenticated ? (
              <Button type="ghost" onClick={handleLogout} className={styles.logoutButton}>
                退出登录
              </Button>
            ) : null}
          </div>
        </div>
      </ArcoClient>
    </div>
  );
}
