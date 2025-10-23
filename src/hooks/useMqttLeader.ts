import { useCallback, useEffect, useRef, useState } from "react";

const LEADER_STORAGE_KEY = "contestant-app:mqtt-leader";
const LEADER_LOCK_TTL = 3_000; // shorter TTL so stale locks expire quickly
const LEADER_RENEW_INTERVAL = 1_000;
const FOLLOWER_CHECK_INTERVAL = 1_500;

interface LeaderRecord {
  tabId: string;
  expiresAt: number;
}

function readLeaderRecord(): LeaderRecord | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LEADER_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LeaderRecord;
    if (
      typeof parsed === "object" &&
      typeof parsed.tabId === "string" &&
      typeof parsed.expiresAt === "number"
    ) {
      return parsed;
    }
  } catch {
    // ignore parse error
  }
  return null;
}

function writeLeaderRecord(record: LeaderRecord) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LEADER_STORAGE_KEY, JSON.stringify(record));
}

function removeLeaderRecord() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LEADER_STORAGE_KEY);
}

function generateTabId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tab-${Math.random().toString(36).slice(2)}`;
}

export function useMqttLeader(): boolean {
  const tabIdRef = useRef<string>(generateTabId());
  const [isLeader, setIsLeader] = useState(false);

  const renewLock = useCallback(() => {
    if (typeof window === "undefined") return false;
    const now = Date.now();
    writeLeaderRecord({
      tabId: tabIdRef.current,
      expiresAt: now + LEADER_LOCK_TTL,
    });
    return true;
  }, []);

  const tryAcquire = useCallback(
    (force = false) => {
      if (typeof window === "undefined") return false;
      const now = Date.now();
      const current = readLeaderRecord();
      if (
        force ||
        !current ||
        current.expiresAt < now ||
        current.tabId === tabIdRef.current
      ) {
        renewLock();
        setIsLeader(true);
        return true;
      }
      if (isLeader && current.tabId !== tabIdRef.current) {
        setIsLeader(false);
      }
      return current.tabId === tabIdRef.current;
    },
    [isLeader, renewLock]
  );

  useEffect(() => {
    let cancelled = false;
    const currentTabId = tabIdRef.current;

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        tryAcquire();
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LEADER_STORAGE_KEY) return;
      const record = readLeaderRecord();
      if (!record || record.tabId !== tabIdRef.current) {
        setIsLeader(record?.tabId === tabIdRef.current);
        if (!record) {
          tryAcquire(true);
        }
      }
    };

    const handleBeforeUnload = () => {
      if (isLeader) {
        const record = readLeaderRecord();
        if (record?.tabId === tabIdRef.current) {
          removeLeaderRecord();
        }
      }
    };

    const handlePageHide = () => {
      if (!isLeader) return;
      const record = readLeaderRecord();
      if (record?.tabId === tabIdRef.current) {
        removeLeaderRecord();
      }
    };

    tryAcquire();

    const interval = window.setInterval(() => {
      if (cancelled) return;
      if (isLeader) {
        renewLock();
      } else {
        const record = readLeaderRecord();
        if (!record || record.expiresAt < Date.now()) {
          tryAcquire(true);
        }
      }
    }, isLeader ? LEADER_RENEW_INTERVAL : FOLLOWER_CHECK_INTERVAL);

    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      if (isLeader) {
        const record = readLeaderRecord();
        if (record?.tabId === currentTabId) {
          removeLeaderRecord();
        }
      }
    };
  }, [isLeader, renewLock, tryAcquire]);

  return isLeader;
}
