import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";

const LOGIN_PATHS = new Set(["/login", "/"]);

export function useSessionGuard(): boolean {
  const pathname = usePathname();
  const logout = useAppStore((state) => state.logout);
  const hasClearedRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (LOGIN_PATHS.has(pathname)) {
      if (!hasClearedRef.current) {
        logout();
        hasClearedRef.current = true;
      }
    } else {
      hasClearedRef.current = false;
    }

    if (!cancelled) {
      setReady(true);
    }

    return () => {
      cancelled = true;
    };
  }, [logout, pathname]);

  return ready;
}
