"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RefreshWhileBuying() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setTimeout(() => router.refresh(), 3000);
    return () => window.clearTimeout(timer);
  }, [router]);
  return null;
}
