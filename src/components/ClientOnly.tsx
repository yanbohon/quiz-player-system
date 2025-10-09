"use client";

import { useEffect, useState } from "react";

/**
 * ClientOnly component to prevent hydration mismatches
 * Only renders children after client-side hydration is complete
 */
export function ClientOnly({ children }: { children: React.ReactNode }) {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return null;
  }

  return <>{children}</>;
}

