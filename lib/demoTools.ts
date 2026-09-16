"use client";

import { useEffect, useState } from "react";
import { getTestOtps } from "@/lib/services/backend";
import { isDemoUnavailable } from "@/lib/http";

// Demo/test tools (showcase seed, Test OTP) exist only where the backend
// registers its demo routes (staging). Production doesn't register them, so
// /admin/test-otps answers a bare 404 there. Any other answer (data, 403)
// means the demo routes are on. Checked once per page load.
let probe: Promise<boolean> | null = null;

function demoToolsEnabled(): Promise<boolean> {
  probe ??= getTestOtps().then(
    () => true,
    (e) => !isDemoUnavailable(e),
  );
  return probe;
}

// null while checking, so callers render nothing until they know.
export function useDemoTools(enabled = true): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    demoToolsEnabled().then((v) => {
      if (alive) setOn(v);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return enabled ? on : false;
}
