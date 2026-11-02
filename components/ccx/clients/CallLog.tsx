"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import CcCallForm from "@/components/admin/CcCallForm";
import PersonName from "@/components/ui/PersonName";
import { PAGE_STEP, usePaged } from "@/components/ui/ListPager";
import { listCcCalls, type CcCall } from "@/lib/services/backend";
import { isForbidden } from "@/lib/http";
import { useResource } from "@/lib/useResource";
import { notify } from "@/lib/toast";
import { fmtDuration, shortDateTime } from "@/lib/date";
import { labelOf } from "@/lib/labels";
import { useAiSelection } from "@/lib/ai/registry";
import { prettyPhone } from "../now/feed";
import { IcArrowRight, IcPhone, IcRefresh, IcShield, IcUser } from "../icons";
import { useCallText } from "./CallTimeline";
import { CallIcon, IcPlus, Pill, callKind, digits, type Tone } from "./parts";

type Dir = "" | "incoming" | "outgoing" | "missed";

const DIRS: Dir[] = ["", "incoming", "outgoing", "missed"];

const matchDir = (c: CcCall, d: Dir) => (d === "missed" ? c.status === "missed" : !d || c.direction === d);

const CALL_TONES: Readonly<Record<string, Tone>> = {
  completed: "ok",
  answered: "ok",
  missed: "hot",
  no_answer: "warn",
  busy: "warn",
  failed: "hot",
};

export default function CallLog({ reloadKey, loggedPhone, onOpen }: { reloadKey: number; loggedPhone: string; onOpen: (id: string, phone: string) => void }) {
  const t = useTranslations("admin.ccx.clients");
  const tc = useTranslations("admin.callCenter");
  const tl = useTranslations("admin.callCenter.calls");
  const tn = useTranslations("common.notify");
  const tpg = useTranslations("common.pager");
  const none = useTranslations("common")("none");
  const locale = useLocale();
  const text = useCallText();
  const res = useResource<CcCall>(listCcCalls, []);
  const [dir, setDir] = useState<Dir>("");
  const [formOpen, setFormOpen] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formSlot, setFormSlot] = useState<HTMLDivElement | null>(null);
  const [freshId, setFreshId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const seenKey = useRef(reloadKey);
  const calls = res.data.filter((c) => matchDir(c, dir));
  const pager = usePaged(calls, PAGE_STEP, dir);
  const dirLabel = (d: Dir) => (d === "" ? t("dirAll") : d === "missed" ? t("dirMissed") : d === "incoming" ? t("dirIn") : t("dirOut"));
  useAiSelection("call_log_direction", dir);

  useEffect(() => {
    if (!freshId) return;
    document.getElementById(`opx-cl-log-${freshId}`)?.scrollIntoView({ block: "nearest" });
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

  function refreshNow() {
    if (refreshing) return;
    setRefreshing(true);
    void reload().finally(() => setRefreshing(false));
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

  const denied = res.status === "error" && isForbidden(res.error);
  const rest = Math.max(0, pager.total - pager.count);

  return (
    <section className="opx-cl-log" aria-labelledby="opx-cl-log-h" data-ai-target="callcenter:call-log">
      <header className="opx-cl-log__head">
        <h3 id="opx-cl-log-h">
          {t("calls")}
          {res.status === "ready" ? <b className="opx-num">{calls.length}</b> : null}
        </h3>
        <div className="opx-cl-log__filters" data-ai-id="call_center.calls.filters">
          <div className="opx-cl-seg opx-cl-seg--sm" role="group" aria-label={tl("direction")} data-ai-id="call_center.calls.filters.direction">
            {DIRS.map((d) => (
              <button key={d || "all"} type="button" className={dir === d ? "is-on" : undefined} aria-pressed={dir === d} onClick={() => setDir(d)}>
                {d === "missed" ? <CallIcon kind="missed" size={15} /> : d === "incoming" ? <CallIcon kind="in" size={15} /> : d === "outgoing" ? <CallIcon kind="out" size={15} /> : null}
                {dirLabel(d)}
                {res.status === "ready" ? <b className="opx-num">{res.data.filter((c) => matchDir(c, d)).length}</b> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="opx-cl-log__tools">
          <button
            type="button"
            className={`opx-cl-icon${refreshing ? " is-spin" : ""}`}
            onClick={refreshNow}
            aria-label={tc("queue.refresh")}
            title={tc("queue.refresh")}
            aria-busy={refreshing || undefined}
            disabled={refreshing}
            data-ai-id="call_center.calls.refresh"
          >
            <IcRefresh size={18} />
          </button>
          <button type="button" className="opx-cl-btn opx-cl-btn--log opx-cl-btn--sm" onClick={() => setFormOpen(true)} data-ai-target="button:log-call">
            <IcPlus size={17} />
            {tc("logCall")}
          </button>
        </div>
      </header>

      {denied ? (
        <p className="opx-cl-note" data-tone="warn" role="status">
          <IcShield size={18} />
          <span>{tc("queue.noPermission")}</span>
        </p>
      ) : res.status === "loading" ? (
        <div className="opx-cl-log__wait" aria-busy="true">
          <i className="opx-shim" />
          <i className="opx-shim" />
          <i className="opx-shim" />
          <i className="opx-shim" />
        </div>
      ) : res.status === "error" ? (
        <div className="opx-cl-note" data-tone="bad" role="alert">
          <span>{tl("loadError")}</span>
          <button type="button" className="opx-cl-mini" onClick={() => void res.refresh()}>
            <IcRefresh size={15} />
            {tn("retry")}
          </button>
        </div>
      ) : !calls.length ? (
        <div className="opx-cl-empty">
          <span className="opx-cl-empty__orb" aria-hidden="true">
            <IcPhone size={26} />
          </span>
          <p>{tc("noCalls")}</p>
        </div>
      ) : (
        <>
          <ul className="opx-cl-log__rows">
            {pager.visible.map((c) => {
              const kind = callKind(c);
              const meta = [text.dir(c), text.result(c.result), fmtDuration(c.durationSec, locale), shortDateTime(c.createdAt, locale)].filter(Boolean).join(" · ");
              return (
                <li key={c.id} id={`opx-cl-log-${c.id}`} data-kind={kind} className={`opx-cl-log__row${c.id === freshId ? " is-fresh" : ""}`}>
                  <span className="opx-cl-tl__ic" aria-hidden="true">
                    <CallIcon kind={kind} size={17} />
                  </span>
                  <div className="opx-cl-log__main">
                    <b>
                      <span className="opx-num">{c.phone ? prettyPhone(c.phone) : none}</span>
                      {c.topic ? <span className="opx-cl-log__topic"> — {c.topic}</span> : null}
                    </b>
                    <small>{meta}</small>
                    {c.nextAction ? (
                      <em>
                        {tl("next")}: {c.nextAction}
                      </em>
                    ) : null}
                  </div>
                  <div className="opx-cl-log__who">
                    {c.clientUserId ? (
                      <button type="button" className="opx-cl-link" onClick={() => onOpen(c.clientUserId, c.phone)} title={t("openProfile")}>
                        <IcUser size={15} />
                        <PersonName id={c.clientUserId} />
                        <IcArrowRight size={14} />
                      </button>
                    ) : null}
                  </div>
                  {c.status ? <Pill tone={CALL_TONES[c.status] ?? "mute"}>{labelOf(tc, "status", c.status)}</Pill> : <span />}
                </li>
              );
            })}
          </ul>
          {rest > 0 || pager.count > pager.step ? (
            <div className="opx-cl-pager">
              {rest > 0 ? (
                <button type="button" className="opx-cl-mini" onClick={pager.more} data-ai-id="call_center.calls.more">
                  {tpg("more", { n: pager.next })}
                  <span className="opx-num">{tpg("count", { shown: pager.count, total: pager.total })}</span>
                </button>
              ) : (
                <span className="opx-cl-pager__all">{tpg("all", { total: pager.total })}</span>
              )}
              {pager.count > pager.step ? (
                <button type="button" className="opx-cl-mini opx-cl-mini--ghost" onClick={pager.less}>
                  {tpg("less")}
                </button>
              ) : null}
              <span className="opx-sr" role="status">
                {tpg("status", { shown: pager.count, total: pager.total })}
              </span>
            </div>
          ) : null}
        </>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={tc("logCall")} busy={formBusy} dirty={formDirty} footer={<div className="ccslot" ref={setFormSlot} />}>
        <CcCallForm
          footSlot={formSlot}
          onDirtyChange={setFormDirty}
          onBusyChange={setFormBusy}
          onCancel={() => setFormOpen(false)}
          onDone={(call) => {
            setFormOpen(false);
            void afterLog(call.phone);
          }}
        />
      </Modal>
    </section>
  );
}
