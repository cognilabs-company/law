"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { listCcCalls, type CcCall } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { shortDateTime } from "@/lib/date";
import { Skeleton } from "@/components/portal/DataState";
import Modal from "@/components/admin/Modal";
import CcCallForm from "./CcCallForm";
import { IconPhone, IconPlus, IconRefresh } from "@/components/icons";

// Recent calls of the call-center (GET /call-center/calls): direction, phone,
// topic, result, duration and next step; filterable; new calls are logged from
// here or from a client card. `reloadKey` lets a parent refresh the list.
export default function CcCallLog({ reloadKey = 0 }: { reloadKey?: number }) {
  const t = useTranslations("admin.callCenter");
  const tl = useTranslations("admin.callCenter.calls");
  const locale = useLocale();
  const res = useResource<CcCall>(listCcCalls, [reloadKey]);
  const [dir, setDir] = useState<"" | "incoming" | "outgoing" | "missed">("");
  const [formOpen, setFormOpen] = useState(false);
  const calls = res.data.filter((c) => (dir === "missed" ? c.status === "missed" : !dir || c.direction === dir));
  const dur = (s: number) => (s >= 60 ? tl("min", { n: Math.round(s / 60) }) : s > 0 ? tl("sec", { n: s }) : "");
  const resultLabel = (r: string) => (r ? (tl.has(`results.${r}`) ? tl(`results.${r}`) : r) : "");
  const statusLabel = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : s);

  if (res.status === "error") return null;
  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("recent")}</b>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="advmuted">{calls.length}</span>
          <button type="button" className="btn btn--line btn--sm" onClick={() => void res.refresh()} aria-label={t("queue.refresh")}><IconRefresh /></button>
          <button type="button" className="btn btn--pri btn--sm" onClick={() => setFormOpen(true)}><IconPlus />{t("logCall")}</button>
        </div>
      </div>
      <div className="chiprow" style={{ marginInline: 0, paddingInline: 0, paddingTop: 0 }}>
        {([["", tl("all")], ["incoming", t("dir.incoming")], ["outgoing", t("dir.outgoing")], ["missed", t("status.missed")]] as const).map(([k, label]) => (
          <button key={k || "all"} type="button" className="fchip" aria-pressed={dir === k} onClick={() => setDir(k)}>{label}</button>
        ))}
      </div>
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
