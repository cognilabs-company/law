"use client";

import { useCallback, useRef } from "react";

// Two clicks in the same tick both pass an `if (busy) return;` check: the
// `busy` state lands on the next render. This lets only the first through
// and lets go on the next tick, after that render — so an early return
// (a validation message) never leaves the action stuck. For actions that
// move money or record a decision.
export function useSameTickGuard(): () => boolean {
  const held = useRef(false);
  return useCallback(() => {
    if (held.current) return false;
    held.current = true;
    setTimeout(() => {
      held.current = false;
    }, 0);
    return true;
  }, []);
}
