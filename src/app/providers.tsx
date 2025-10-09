"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState, useEffect, useCallback, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { Toast } from "@/lib/arco";
import { useControlCommands } from "@/features/quiz/useControlCommands";
import { useAppStore } from "@/store/useAppStore";
import { useQuizStore } from "@/store/quizStore";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { useMqttLeader } from "@/hooks/useMqttLeader";

function ActiveControlCommands({
  clientId,
  onStatusChange,
}: {
  clientId: string;
  onStatusChange: (connected: boolean) => void;
}) {
  const { isConnected, error } = useControlCommands(true, clientId);

  useEffect(() => {
    onStatusChange(isConnected);
  }, [isConnected, onStatusChange]);

  useEffect(() => {
    if (error) {
      console.error("MQTT error", error);
      Toast.error("MQTT 连接异常");
    }
  }, [error]);

  return null;
}

function ControlCommandBridge() {
  const sessionReady = useSessionGuard();
  const isLeader = useMqttLeader();
  const [storeHydrated, setStoreHydrated] = useState(
    typeof window === "undefined" ? false : useAppStore.persist.hasHydrated()
  );

  useEffect(() => {
    if (storeHydrated) return;

    if (useAppStore.persist.hasHydrated()) {
      setStoreHydrated(true);
      return;
    }

    const unsub = useAppStore.persist.onFinishHydration?.(() => {
      setStoreHydrated(true);
    });

    return () => {
      unsub?.();
    };
  }, [storeHydrated]);

  const { isAuthenticated, userId, setMqttConnected } = useAppStore(
    useShallow((state) => ({
      isAuthenticated: state.isAuthenticated,
      userId: state.user?.id,
      setMqttConnected: state.setMqttConnected,
    }))
  );
  const resetQuizStore = useQuizStore((state) => state.reset);
  const previousUserIdRef = useRef<string | null | undefined>(undefined);

  const shouldActivate =
    isLeader && sessionReady && storeHydrated && isAuthenticated && !!userId;

  useEffect(() => {
    if (!storeHydrated) return;
    const normalizedUserId = userId ?? null;
    if (previousUserIdRef.current === undefined) {
      previousUserIdRef.current = normalizedUserId;
      return;
    }
    if (previousUserIdRef.current !== normalizedUserId) {
      resetQuizStore();
    }
    previousUserIdRef.current = normalizedUserId;
  }, [resetQuizStore, storeHydrated, userId]);

  useEffect(() => {
    if (!shouldActivate) {
      setMqttConnected(false);
    }
  }, [setMqttConnected, shouldActivate]);

  const handleStatusChange = useCallback(
    (connected: boolean) => {
      setMqttConnected(connected);
    },
    [setMqttConnected]
  );

  if (!shouldActivate || !userId) {
    return null;
  }

  return (
    <ActiveControlCommands
      clientId={userId}
      onStatusChange={handleStatusChange}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1分钟
            gcTime: 5 * 60 * 1000, // 5分钟
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const showQueryDevtools =
    process.env.NEXT_PUBLIC_ENABLE_QUERY_DEVTOOLS === "true";

  return (
    <QueryClientProvider client={queryClient}>
      <ControlCommandBridge />
      {children}
      {showQueryDevtools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}
