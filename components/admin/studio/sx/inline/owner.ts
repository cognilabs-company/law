"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "@/i18n/navigation";
import { isDraftOwner, newDraftOwner, pathOwner } from "./model";
import { movePendingOwner, ownerHasPending } from "./pending";

type Left = { owner: string; code: string; title: string; at: number };

const ADOPT_MS = 30_000;
let left: Left | null = null;

export function leaveDraft(owner: string, code: string, title: string, now = Date.now()): void {
  const name = title.trim();
  if (!isDraftOwner(owner) || !name || !ownerHasPending(owner)) return;
  left = { owner, code: code.trim().toUpperCase(), title: name, at: now };
}

export function adoptDraft(owner: string, code: string, title: string, now = Date.now()): boolean {
  const l = left;
  if (!l || !owner || isDraftOwner(owner)) return false;
  if (now - l.at > ADOPT_MS) {
    left = null;
    return false;
  }
  if (l.code !== code.trim().toUpperCase() || l.title !== title.trim()) return false;
  left = null;
  movePendingOwner(l.owner, owner);
  return true;
}

export function useFormOwner(explicit: string | undefined, code: string, title: string): string {
  const pathname = usePathname();
  const [draft] = useState(newDraftOwner);
  const auto = !explicit;
  const owner = explicit || pathOwner(pathname || "") || draft;
  const titleRef = useRef(title);
  useEffect(() => {
    titleRef.current = title;
  });
  useEffect(() => {
    if (!auto) return;
    adoptDraft(owner, code, titleRef.current);
    return () => leaveDraft(owner, code, titleRef.current);
  }, [auto, owner, code]);
  return owner;
}
