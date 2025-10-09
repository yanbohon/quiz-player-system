"use client";

import { useEffect, useState } from "react";

/**
 * ArcoClient wrapper component
 * Prevents hydration mismatches with ArcoDesign Mobile React components
 * 
 * ArcoDesign Mobile detects platform (iOS/Android) on client-side only,
 * causing server-rendered HTML to differ from client-rendered HTML.
 * This wrapper ensures components only render after hydration is complete.
 * 
 * @example
 * ```tsx
 * import { Button } from "@arco-design/mobile-react";
 * import { ArcoClient } from "@/components/ArcoClient";
 * 
 * <ArcoClient>
 *   <Button type="primary">Click me</Button>
 * </ArcoClient>
 * ```
 */
export function ArcoClient({ 
  children,
  fallback = null 
}: { 
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

