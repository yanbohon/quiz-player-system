import { useAppStoreHydrated } from "./useAppStoreHydrated";

export function useSessionGuard(): boolean {
  const hydrated = useAppStoreHydrated();
  return hydrated;
}
