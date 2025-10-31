import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";

/**
 * Tracks whether the persisted Zustand store has finished hydrating from storage.
 */
export function useAppStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState<boolean>(false);

  useEffect(() => {
    if (hydrated) {
      return;
    }

    if (useAppStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }

    const unsub = useAppStore.persist.onFinishHydration?.(() => {
      setHydrated(true);
    });

    return () => {
      unsub?.();
    };
  }, [hydrated]);

  return hydrated;
}
