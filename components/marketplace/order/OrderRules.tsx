"use client";

import { useId, type ReactElement } from "react";
import { SxPanel } from "@/components/admin/studio/sx/layout/Panel";
import type { RuntimeConfig } from "@/lib/services/marketRuntime";
import { rulesOf } from "../runtime/facts";
import { RuleList } from "../runtime/RuleList";
import type { OrderView } from "./types";

// The rules the order runs under, beside it for as long as it runs — each
// side its own: the client sees the client rules, the lawyer the executor
// rules they accepted when turning the service on. Never the other side's.
export default function OrderRules({ view, runtime, aiBase }: { view: OrderView; runtime: RuntimeConfig | null; aiBase: string }): ReactElement | null {
  const uid = useId();
  const side = view === "client" ? "client" : "executor";
  const rules = rulesOf(runtime, side);
  if (!rules.length) return null;
  return (
    <SxPanel className="mod-rules" as="section" aiId={`${aiBase}.rules`}>
      <RuleList rules={rules} side={side} idBase={`${uid}-rl`} level={3} limit={4} during />
    </SxPanel>
  );
}
