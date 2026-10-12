"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { listCcCalls, type CcCall } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { notify } from "@/lib/toast";
import { shortDateTime } from "@/lib/date";
import { useAiSelection } from "@/lib/ai/registry";
import { ErrorState, Skeleton } from "@/components/portal/DataState";
import Modal from "@/components/admin/Modal";
import FilterBar from "@/components/filters/FilterBar";
import ListPager, { PAGE_STEP, usePaged } from "@/components/ui/ListPager";
import CcCallForm from "./CcCallForm";
import { IconPhone, IconPlus, IconRefresh } from "@/components/icons";

type Dir = "" | "incoming" | "outgoing" | "missed";

const DIRS: Dir[] = ["", "incoming", "outgoing", "missed"];

const matchDir = (c: CcCall, d: Dir) => (d === "missed" ? c.status === "missed" : !d || c.direction === d);
const digits = (s: string) => s.replace(/\D/g, "");

// Recent calls of the call-center (GET /call-center/calls): direction, phone,
// topic, result, duration and next step; filterable; new calls are logged from
// here or from a client card. `reloadKey` lets a parent refresh the list.
export default function CcCallLog({ reloadKey = 0, loggedPhone = "" }: { reloadKey?: number; loggedPhone?: string }) {
  const t = useTranslations("admin.callCenter");
  const tl = useTranslations("admin.callCenter.calls");
  const tn = useTranslations("common.notify");
  const locale = useLocale();
  const res = useResource<CcCall>(listCcCalls, []);
  const [dir, setDir] = useState<Dir>("");
  const [formOpen, setFormOpen] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formSlot, setFormSlot] = useState<HTMLDivElement | null>(null);
  const [freshId, setFreshId] = useState("");
  const freshRow = useRef<HTMLDivElement>(null);
  const seenKey = useRef(reloadKey);
  const calls = res.data.filter((c) => matchDir(c, dir));
  const pager = usePaged(calls, PAGE_STEP, dir);
  const dur = (s: number) => (s >= 60 ? tl("min", { n: Math.round(s / 60) }) : s > 0 ? tl("sec", { n: s }) : "");
  const resultLabel = (r: string) => (r ? (tl.has(`results.${r}`) ? tl(`results.${r}`) : r) : "");
  const statusLabel = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : s);
  const dirLabel = (d: Dir) => (d === "" ? tl("all") : d === "missed" ? t("status.missed") : t(`dir.${d}`));
  const dirOpts = DIRS.map((d) => ({
    value: d,
    label: res.status === "ready" ? `${dirLabel(d)} (${res.data.filter((c) => matchDir(c, d)).length})` : dirLabel(d),
  }));
  useAiSelection("call_log_direction", dir);

  useEffect(() => {
    const el = freshRow.current;
    if (!freshId || !el || typeof el.animate !== "function") return;
    const tint = getComputedStyle(el).getPropertyValue("--dk-tint-ok").trim() || "#E3F6EE";
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const anim = el.animate(
      [
        { backgroundColor: tint, borderRadius: "10px" },
        { backgroundColor: tint, borderRadius: "10px", offset: 0.6 },
        { backgroundColor: "transparent", borderRadius: "10px" },
      ],
      { duration: 2400, easing: still ? "steps(1, end)" : "ease-out" },
    );
    return () => anim.cancel();
  }, [freshId]);

  async function reload(): Promise<CcCall[] | null> {
    try {
      const list = await listCcCalls();
      res.setData(list);
      return list;
    } catch (e) {
      if (res.status === "ready") notify.error(tl("refreshFailed"), { id: "cc-calls-refresh", error: e, action: { label: tn("retry"), onClick: () => void reload() } });
      return null;
    }
  }

  async function afterLog(phone: string) {
    const known = new Set(res.data.map((c) => c.id));
    const list = await reload();
    const added = list ? list.filter((c) => !known.has(c.id)) : [];
    const hit = added.find((c) => digits(c.phone) === digits(phone)) ?? added[0];
    if (!hit || !list) return;
    setFreshId(hit.id);
    pager.revealIndex(list.filter((c) => matchDir(c, dir)).findIndex((c) => c.id === hit.id));
  }

  const logged = useRef(afterLog);
  useEffect(() => {
    logged.current = afterLog;
  });
  useEffect(() => {
    if (reloadKey === seenKey.current) return;
    seenKey.current = reloadKey;
    void logged.current(loggedPhone);
  }, [reloadKey, loggedPhone]);

  return (
    <div className="ppanel" data-ai-target="callcenter:call-log">
      <div className="ppanel__h">
        <b>{t("recent")}</b>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="advmuted">{calls.length}</span>
          <button type="button" className="btn btn--line btn--sm" onClick={() => void reload()} aria-label={t("queue.refresh")}><IconRefresh /></button>
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
      ) : res.status === "error" ? (
        <ErrorState error={res.error} onRetry={res.refresh} title={tl("loadError")} compact />
      ) : !calls.length ? (
        <p className="advmuted">{t("noCalls")}</p>
      ) : (
        <>
          <div className="alist alist--flow">
            {pager.visible.map((c) => (
              <div className="creq" key={c.id} ref={c.id === freshId ? freshRow : undefined}>
                <span className={`creq__st${c.status === "missed" ? " creq__st--matching" : c.direction === "incoming" ? " creq__st--consultation" : ""}`} />
                <div className="creq__m">
                  <b><span style={{ whiteSpace: "nowrap" }}><IconPhone style={{ display: "inline-block", width: 13, height: 13, verticalAlign: "-2px", marginRight: 6 }} />{c.phone || "—"}</span>{c.topic ? ` — ${c.topic}` : ""}</b>
                  <span>{[t.has(`dir.${c.direction}`) ? t(`dir.${c.direction}`) : c.direction, resultLabel(c.result), dur(c.durationSec), shortDateTime(c.createdAt, locale)].filter(Boolean).join(" · ")}</span>
                  {c.nextAction ? <em className="creq__next">{tl("next")}: {c.nextAction}</em> : null}
                </div>
                <span className="creq__badge">{statusLabel(c.status)}</span>
              </div>
            ))}
          </div>
          <ListPager {...pager.bind} less aiId="call_center.calls.more" />
        </>
      )}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={t("logCall")}
        busy={formBusy}
        dirty={formDirty}
        footer={<div className="ccslot" ref={setFormSlot} />}
      >
        <CcCallForm
          footSlot={formSlot}
          onDirtyChange={setFormDirty}
          onBusyChange={setFormBusy}
          onCancel={() => setFormOpen(false)}
          onDone={(call) => { setFormOpen(false); void afterLog(call.phone); }}
        />
      </Modal>
    </div>
  );
}
