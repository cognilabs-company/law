"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { listCcCalls, type CcCall } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { shortDateTime } from "@/lib/date";
import { useAiSelection } from "@/lib/ai/registry";
import { Skeleton } from "@/components/portal/DataState";
import Modal from "@/components/admin/Modal";
import FilterBar from "@/components/filters/FilterBar";
import CcCallForm from "./CcCallForm";
import { IconPhone, IconPlus, IconRefresh } from "@/components/icons";

type Dir = "" | "incoming" | "outgoing" | "missed";

const DIRS: Dir[] = ["", "incoming", "outgoing", "missed"];

const matchDir = (c: CcCall, d: Dir) => (d === "missed" ? c.status === "missed" : !d || c.direction === d);

// Recent calls of the call-center (GET /call-center/calls): direction, phone,
// topic, result, duration and next step; filterable; new calls are logged from
// here or from a client card. `reloadKey` lets a parent refresh the list.
export default function CcCallLog({ reloadKey = 0 }: { reloadKey?: number }) {
  const t = useTranslations("admin.callCenter");
  const tl = useTranslations("admin.callCenter.calls");
  const locale = useLocale();
  const res = useResource<CcCall>(listCcCalls, [reloadKey]);
  const [dir, setDir] = useState<Dir>("");
  const [formOpen, setFormOpen] = useState(false);
  const calls = res.data.filter((c) => matchDir(c, dir));
  const dur = (s: number) => (s >= 60 ? tl("min", { n: Math.round(s / 60) }) : s > 0 ? tl("sec", { n: s }) : "");
  const resultLabel = (r: string) => (r ? (tl.has(`results.${r}`) ? tl(`results.${r}`) : r) : "");
  const statusLabel = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : s);
  const dirLabel = (d: Dir) => (d === "" ? tl("all") : d === "missed" ? t("status.missed") : t(`dir.${d}`));
  const dirOpts = DIRS.map((d) => ({
    value: d,
    label: res.status === "ready" ? `${dirLabel(d)} (${res.data.filter((c) => matchDir(c, d)).length})` : dirLabel(d),
  }));
  useAiSelection("call_log_direction", dir);

  if (res.status === "error") return null;
  return (
    <div className="ppanel" data-ai-target="callcenter:call-log">
      <div className="ppanel__h">
        <b>{t("recent")}</b>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="advmuted">{calls.length}</span>
          <button type="button" className="btn btn--line btn--sm" onClick={() => void res.refresh()} aria-label={t("queue.refresh")}><IconRefresh /></button>
          <button type="button" className="btn btn--pri btn--sm" onClick={() => setFormOpen(true)} data-ai-target="button:log-call"><IconPlus />{t("logCall")}</button>
        </div>
      </div>
      <FilterBar
        className="uf--tray uf--solo"
        fields={[
          {
            key: "direction",
            label: tl("direction"),
            icon: IconPhone,
            value: dir,
            onChange: (v) => setDir(DIRS.find((d) => d === v) ?? ""),
            options: dirOpts,
            chip: null,
            aiId: "call_center.calls.filters.direction",
          },
        ]}
        aiId="call_center.calls.filters"
      />
      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !calls.length ? (
        <p className="advmuted">{t("noCalls")}</p>
      ) : (
        <div className="alist">
          {calls.slice(0, 50).map((c) => (
            <div className="creq" key={c.id}>
              <span className={`creq__st${c.status === "missed" ? " creq__st--matching" : c.direction === "incoming" ? " creq__st--consultation" : ""}`} />
              <div className="creq__m">
                <b><IconPhone style={{ width: 13, height: 13, verticalAlign: "-2px", marginRight: 6 }} />{c.phone || "—"}{c.topic ? ` — ${c.topic}` : ""}</b>
                <span>{[t.has(`dir.${c.direction}`) ? t(`dir.${c.direction}`) : c.direction, resultLabel(c.result), dur(c.durationSec), shortDateTime(c.createdAt, locale)].filter(Boolean).join(" · ")}</span>
                {c.nextAction ? <em className="creq__next">{tl("next")}: {c.nextAction}</em> : null}
              </div>
              <span className="creq__badge">{statusLabel(c.status)}</span>
            </div>
          ))}
        </div>
      )}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={t("logCall")}>
        <CcCallForm onCancel={() => setFormOpen(false)} onDone={() => { setFormOpen(false); void res.refresh(); }} />
      </Modal>
    </div>
  );
}
