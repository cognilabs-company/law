"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getToken } from "@/lib/client";
import {
  canInternal,
  getEmployees,
  getOrgUnits,
  getPositions,
  normEmployee,
  normPosition,
  normUnit,
  type HrmEmployee,
  type HrmPosition,
  type HrmUnit,
} from "@/lib/services/internalHrm";
import type { SearchOption } from "@/components/SearchSelect";

// The people, units and positions every HRM page has to put a name to.
// Attendance days, KPI metrics, payroll entries and assignments only carry
// ids; resolving them here once means no page ever prints a UUID (the 10-08
// guide: "id UUID frontendda asosiy nom sifatida chiqmasin") and every form
// picks a person from a list instead of having one typed in (10-09 §11).
//
// One fetch per signed-in token, shared by every page that asks, and redone
// only after something was created or edited (refreshHrmDirectory).

type Data = { employees: HrmEmployee[]; units: HrmUnit[]; positions: HrmPosition[] };
const EMPTY: Data = { employees: [], units: [], positions: [] };

let cacheKey = "";
let cached: Data | null = null;
let pending: Promise<Data> | null = null;
const listeners = new Set<(d: Data) => void>();

type Access = { employees: boolean; org: boolean };

async function fetchAll(access: Access): Promise<Data> {
  // A list the account may not read answers 403; that list is simply empty
  // and every name falls back to its code, rather than the page failing.
  const [e, u, p] = await Promise.all([
    access.employees ? getEmployees({ limit: 100 }).catch(() => null) : null,
    access.org ? getOrgUnits({ limit: 100 }).catch(() => null) : null,
    access.org ? getPositions({ limit: 100 }).catch(() => null) : null,
  ]);
  return {
    employees: (e?.items ?? []).map(normEmployee).filter((x) => x.id),
    units: (u?.items ?? []).map(normUnit).filter((x) => x.id).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    positions: (p?.items ?? []).map(normPosition).filter((x) => x.id),
  };
}

function load(access: Access): Promise<Data> {
  const key = `${getToken() ?? ""}|${access.employees ? 1 : 0}${access.org ? 1 : 0}`;
  if (key !== cacheKey) {
    cacheKey = key;
    cached = null;
    pending = null;
  }
  if (!pending) {
    const mine = fetchAll(access).then((d) => {
      if (pending === mine) {
        cached = d;
        listeners.forEach((fn) => fn(d));
      }
      return d;
    });
    pending = mine;
  }
  return pending;
}

// After a create/edit the lists are stale: drop them, and every mounted page
// gets the fresh ones through its listener.
export function refreshHrmDirectory() {
  pending = null;
  cached = null;
  cacheKey = "";
  listeners.forEach((fn) => fn(cached ?? EMPTY));
}

export type HrmDirectory = Data & {
  ready: boolean;
  employee: (id: string) => HrmEmployee | undefined;
  unit: (id: string) => HrmUnit | undefined;
  position: (id: string) => HrmPosition | undefined;
  employeeName: (id: string) => string;
  userName: (userId: string) => string;
  unitName: (id: string) => string;
  positionTitle: (id: string) => string;
  employeeOptions: SearchOption[];
  userOptions: SearchOption[];
  unitOptions: SearchOption[];
  positionOptions: SearchOption[];
};

export function useHrmDirectory(): HrmDirectory {
  const { session } = useAuth();
  const access: Access = { employees: canInternal(session, "internal_hr.manage"), org: canInternal(session, "internal_org.manage") };
  const [data, setData] = useState<Data | null>(cached);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const listener = (d: Data) => {
      if (!alive) return;
      // refreshHrmDirectory hands out EMPTY while the reload is pending.
      if (d === EMPTY) setTick((n) => n + 1);
      else setData(d);
    };
    listeners.add(listener);
    void load(access).then((d) => alive && setData(d));
    return () => {
      alive = false;
      listeners.delete(listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.employees, access.org, tick]);

  return useMemo(() => {
    const d = data ?? EMPTY;
    const emp = new Map(d.employees.map((x) => [x.id, x]));
    const unit = new Map(d.units.map((x) => [x.id, x]));
    const pos = new Map(d.positions.map((x) => [x.id, x]));
    const byUser = new Map(d.employees.filter((x) => x.userId).map((x) => [x.userId, x]));
    return {
      ...d,
      ready: data !== null,
      employee: (id) => emp.get(id),
      unit: (id) => unit.get(id),
      position: (id) => pos.get(id),
      employeeName: (id) => emp.get(id)?.name || emp.get(id)?.code || "",
      userName: (userId) => byUser.get(userId)?.name || "",
      unitName: (id) => unit.get(id)?.name || "",
      positionTitle: (id) => pos.get(id)?.title || "",
      employeeOptions: d.employees.map((x) => ({ value: x.id, label: x.name || x.code, sub: [x.code, pos.get(x.positionId)?.title].filter(Boolean).join(" · ") })),
      // Messages go to a login, not to an employee record: only people who
      // have one can be written to.
      userOptions: d.employees.filter((x) => x.userId).map((x) => ({ value: x.userId, label: x.name || x.code, sub: [x.code, pos.get(x.positionId)?.title].filter(Boolean).join(" · ") })),
      unitOptions: d.units.map((x) => ({ value: x.id, label: x.name, sub: x.code })),
      positionOptions: d.positions.map((x) => ({ value: x.id, label: x.title, sub: [x.code, x.grade].filter(Boolean).join(" · ") })),
    };
  }, [data]);
}
