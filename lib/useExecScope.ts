"use client";

import { useEffect, useState } from "react";
import { getToken } from "@/lib/client";
import { ApiError } from "@/lib/http";
import { permissionsOf } from "@/lib/permissions";
import type { Session } from "@/lib/auth";
import { getDepartmentDashboard, getItMonitoring } from "@/lib/services/executive";

// Who is the head of a unit, and who may read IT monitoring, is the
// backend's verdict (contract 2026-11-13 §2): a department head is known
// only by GET /internal/department/dashboard answering, IT monitoring by
// it.monitoring.view or that same kind of answer. One look per signed-in
// token; a menu item shows only once the backend has said yes.
export type ExecScope = { department: boolean | null; it: boolean | null };

let key = "";
let scope: ExecScope = { department: null, it: null };
let pending: Promise<ExecScope> | null = null;
const listeners = new Set<(s: ExecScope) => void>();

async function ask(probe: () => Promise<unknown>): Promise<boolean | null> {
  try {
    await probe();
    return true;
  } catch (e) {
    // 403/404: not for this account (or not deployed). Anything else (5xx,
    // offline) is unknown: hidden now, asked again on the next sign-in.
    if (e instanceof ApiError && (e.status === 403 || e.status === 404 || e.status === 401)) return false;
    return null;
  }
}

function load(session: Session): Promise<ExecScope> {
  const k = `${getToken() ?? ""}|${session.id}`;
  if (k !== key) {
    key = k;
    scope = { department: null, it: null };
    pending = null;
  }
  if (!pending) {
    const itByPermission = permissionsOf(session).includes("it.monitoring.view");
    const mine: Promise<ExecScope> = Promise.all([ask(() => getDepartmentDashboard()), itByPermission ? Promise.resolve(true) : ask(() => getItMonitoring())]).then(([department, it]) => {
      const next = { department: department ?? false, it: it ?? false };
      if (pending === mine) {
        scope = next;
        listeners.forEach((fn) => fn(next));
      }
      return next;
    });
    pending = mine;
  }
  return pending;
}

// Internal staff only: external marketplace lawyers never reach HRM.
export function useExecScope(session: Session | null, enabled: boolean): ExecScope {
  const [s, setS] = useState<ExecScope>(scope);
  useEffect(() => {
    if (!session || !enabled) return;
    let alive = true;
    const fn = (next: ExecScope) => alive && setS(next);
    listeners.add(fn);
    void load(session).then(fn);
    return () => {
      alive = false;
      listeners.delete(fn);
    };
  }, [session, enabled]);
  return session && enabled ? s : { department: false, it: false };
}
