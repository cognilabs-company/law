"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { dateOnly, shortDateTime, timeOnly } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { addLeadActivity, getLeadTimeline, leadCan, listCrmTemplates, updateCrmLead, type CrmActivity, type CrmContact, type CrmLead, type CrmMeta, type CrmTemplate } from "@/lib/services/crm";
import { IcLayers, IcMeeting, IcPhone, IcRefresh, IcTimeline } from "../../icons";
import { hasReadable, PayloadList } from "./detailList";
import { IcDots } from "../leads/icons";
import { IcBell, IcChat, IcClip, IcEdit, IcHistory, IcPlus, IcSend } from "./glyphs";
import { CallsPane } from "./leadCalls";
import type { LeadHistoryState } from "./leadCards";
import { SmsPane } from "./leadSms";
import { Card, DateTimeInput, Empty, Failed, Pill, Shim, StatusChip, StatusGlyph, fromLocal, inHours, useDismiss } from "./kit";
import type { LeadWrite } from "./types";
import { useCrmErr } from "../leads/util";

export type Pane = "timeline" | "history" | "calls" | "sms";
export const PANES: Pane[] = ["timeline", "history", "calls", "sms"];

const WRITABLE = ["call_note", "note", "message", "meeting", "follow_up", "document"] as const;
type Writable = (typeof WRITABLE)[number];

export function TypeGlyph({ type, size = 16 }: { type: string; size?: number }) {
  switch (type) {
    case "call_note":
      return <IcPhone size={size} />;
    case "note":
      return <IcChat size={size} />;
    case "message":
      return <IcSend size={size} />;
    case "meeting":
      return <IcMeeting size={size} />;
    case "follow_up":
      return <IcBell size={size} />;
    case "document":
      return <IcClip size={size} />;
    default:
      return <IcLayers size={size} />;
  }
}

function PaneGlyph({ pane }: { pane: Pane }) {
  if (pane === "timeline") return <IcTimeline size={16} />;
  if (pane === "history") return <IcRefresh size={16} />;
  if (pane === "calls") return <IcPhone size={16} />;
  return <IcChat size={16} />;
}

export function ActivityList({ items, empty }: { items: CrmActivity[]; empty?: string }) {
  const t = useTranslations("crm.tl");
  const locale = useLocale();
  if (!items.length) return <Empty icon={<IcHistory size={22} />} title={empty ?? t("empty")} />;
  const out: ReactElement[] = [];
  let day = "";
  for (const a of [...items].reverse()) {
    const d = a.createdAt ? dateOnly(a.createdAt, locale) : "";
    if (d && d !== day) {
      day = d;
      out.push(
        <li key={`d-${d}`} className="opx-cd-act__day" role="separator">
          <span>{d}</span>
        </li>,
      );
    }
    const who = a.actor?.name || (a.type === "system" || !a.actorId ? t("system") : t("someone"));
    out.push(
      <li key={a.id || `${a.createdAt}-${a.type}`} className="opx-cd-act" data-t={a.type}>
        <span className="opx-cd-act__ic" aria-hidden="true">
          <TypeGlyph type={a.type} />
        </span>
        <article>
          <header>
            <b>{a.title || (t.has(`type.${a.type}`) ? t(`type.${a.type}`) : a.type)}</b>
            <small>
              {who}
              <i aria-hidden="true">·</i>
              <time className="opx-num" dateTime={a.createdAt}>
                {a.createdAt ? timeOnly(a.createdAt, locale) : ""}
              </time>
            </small>
          </header>
          {a.body ? <p>{a.body}</p> : null}
          {hasReadable(a.payload) ? (
            <details className="opx-cd-act__more">
              <summary>{t("payload")}</summary>
              <PayloadList payload={a.payload} />
            </details>
          ) : null}
        </article>
      </li>,
    );
  }
  return (
    <ol className="opx-cd-acts" aria-label={t("label")}>
      {out}
    </ol>
  );
}

export type LeadTimelineState = { items: CrmActivity[] | null; err: string };

export function useLeadTimeline(leadId: string, refreshKey: number, canView: boolean): LeadTimelineState {
  const crmErr = useCrmErr();
  const [items, setItems] = useState<CrmActivity[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!leadId || !canView) return;
    const ctl = new AbortController();
    getLeadTimeline(leadId, ctl.signal).then(
      (x) => {
        setItems(x);
        setErr("");
      },
      (e) => {
        if (isAborted(e)) return;
        logApiError("crm.timeline", e);
        setErr(crmErr(e));
        setItems((cur) => cur ?? []);
      },
    );
    return () => ctl.abort();
  }, [leadId, refreshKey, canView, crmErr]);
  return { items, err };
}

export function FeedCard({
  meta,
  lead,
  write,
  pane,
  onPane,
  timeline,
  onAdded,
  onDrafting,
  callFocus,
  submitDraft,
  callLogged,
  history,
  phones,
  smsPreset,
  onPresetUsed,
}: {
  meta: CrmMeta;
  lead: CrmLead;
  write: LeadWrite;
  pane: Pane;
  onPane: (p: Pane) => void;
  timeline: LeadTimelineState;
  onAdded: () => void;
  onDrafting: (on: boolean) => void;
  callFocus: number;
  submitDraft: number;
  callLogged: boolean;
  history: LeadHistoryState;
  phones: CrmContact[] | null;
  smsPreset: string;
  onPresetUsed: () => void;
}) {
  const t = useTranslations("crm.lead");
  const tg = useTranslations("crm.glance");
  const tx = useTranslations("admin.ccx.crmDetail");
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setMenu(false), []);
  useDismiss(menu, close, box);
  const title = pane === "timeline" ? tx("activity") : t(`pane.${pane}`, { n: lead.cycleNumber });
  return (
    <Card
      icon={pane === "timeline" ? <IcTimeline size={17} /> : <PaneGlyph pane={pane} />}
      title={title}
      className="opx-cd-feed"
      aside={
        <div className="opx-cd-menu" ref={box}>
          <button type="button" className="opx-cd-ibtn opx-jr-more" aria-haspopup="menu" aria-expanded={menu} aria-label={t("panes")} title={tg("more")} onClick={() => setMenu((o) => !o)}>
            <IcDots size={18} />
          </button>
          {menu ? (
            <div className="opx-cd-pop opx-cd-pop--end" role="menu" aria-label={t("panes")}>
              {PANES.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="menuitemradio"
                  aria-checked={pane === k}
                  onClick={() => {
                    setMenu(false);
                    onPane(k);
                  }}
                >
                  <PaneGlyph pane={k} />
                  {t(`pane.${k}`, { n: lead.cycleNumber })}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      }
    >
      <div className="opx-cd-feed__body">
        {pane === "timeline" ? (
          <TimelinePane lead={lead} write={write} timeline={timeline} onAdded={onAdded} onDrafting={onDrafting} callFocus={callFocus} submitDraft={submitDraft} callLogged={callLogged} />
        ) : pane === "history" ? (
          <CyclesPane meta={meta} history={history} />
        ) : pane === "calls" ? (
          <CallsPane meta={meta} lead={lead} phones={phones} onDrafting={onDrafting} />
        ) : (
          <SmsPane meta={meta} lead={lead} phones={phones} preset={smsPreset} onPresetUsed={onPresetUsed} onDrafting={onDrafting} />
        )}
      </div>
    </Card>
  );
}

function TimelinePane({ lead, write, timeline, onAdded, onDrafting, callFocus, submitDraft, callLogged }: { lead: CrmLead; write: LeadWrite; timeline: LeadTimelineState; onAdded: () => void; onDrafting: (on: boolean) => void; callFocus: number; submitDraft: number; callLogged: boolean }) {
  const t = useTranslations("crm.tl");
  const { items, err } = timeline;
  const canView = leadCan(lead, "view_timeline");
  return (
    <>
      {leadCan(lead, "add_activity") ? <Composer lead={lead} write={write} onAdded={onAdded} onDrafting={onDrafting} callFocus={callFocus} submitDraft={submitDraft} callLogged={callLogged} /> : null}
      {!canView ? (
        <p className="opx-cd-sub">{t("noAccess")}</p>
      ) : items === null ? (
        <>
          <Shim />
          <Shim />
        </>
      ) : (
        <>
          {err ? <p className="opx-cd-err">{err}</p> : null}
          <ActivityList items={items} />
        </>
      )}
    </>
  );
}

function Composer({ lead, write, onAdded, onDrafting, callFocus, submitDraft, callLogged }: { lead: CrmLead; write: LeadWrite; onAdded: () => void; onDrafting: (on: boolean) => void; callFocus: number; submitDraft: number; callLogged: boolean }) {
  const t = useTranslations("crm.tl");
  const crmErr = useCrmErr();
  // Until a call is on record, the only form is the call's result; afterwards a
  // plain note. Every other kind of entry waits behind the "+".
  const [picked, setPicked] = useState<Writable | null>(null);
  const type: Writable = picked ?? (callLogged ? "note" : "call_note");
  const [moreTypes, setMoreTypes] = useState(false);
  const [title, setTitle] = useState("");
  const [withTitle, setWithTitle] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [slash, setSlash] = useState<string | null>(null);
  const [templates, setTemplates] = useState<CrmTemplate[] | null>(null);
  const [sel, setSel] = useState(0);
  const [remindAt, setRemindAt] = useState("");
  const [chip, setChip] = useState<number | null>(null);
  const canRemind = type === "follow_up" && leadCan(lead, "set_next_action");
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const slashOpen = slash !== null;
  const typed = !!body.trim();
  useEffect(() => {
    onDrafting(typed);
    return () => onDrafting(false);
  }, [typed, onDrafting]);
  useEffect(() => {
    if (!callFocus) return;
    const id = window.setTimeout(() => {
      setPicked("call_note");
      boxRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      ref.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(id);
  }, [callFocus]);
  useEffect(() => {
    if (!slashOpen || templates) return;
    const ctl = new AbortController();
    listCrmTemplates({}, ctl.signal).then(setTemplates, (e) => {
      if (isAborted(e)) return;
      logApiError("crm.templates", e);
      setTemplates([]);
    });
    return () => ctl.abort();
  }, [slashOpen, templates]);
  const matches = useMemo(() => {
    const q = (slash ?? "").toLowerCase();
    return (templates ?? []).filter((x) => x.status !== "archived" && (!q || x.title.toLowerCase().includes(q) || x.content.toLowerCase().includes(q))).slice(0, 8);
  }, [slash, templates]);
  const pickTemplate = (tpl: CrmTemplate) => {
    setBody((cur) => cur.replace(/(^|\s)\/[^\s]*$/, "$1") + tpl.content);
    if (!title) setTitle(tpl.title);
    setSlash(null);
    ref.current?.focus();
  };
  const onChange = (v: string) => {
    setBody(v);
    const m = /(^|\s)\/([^\s]*)$/.exec(v);
    setSlash(m ? m[2] : null);
    setSel(0);
  };
  const add = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      const at = canRemind ? fromLocal(remindAt) : "";
      if (at && !(await write((l) => updateCrmLead(l, { nextActionAt: at })))) return;
      await addLeadActivity(lead.id, { type, title, body, payload: at ? { remind_at: at } : undefined });
      setBody("");
      setTitle("");
      setWithTitle(false);
      setRemindAt("");
      setChip(null);
      toast(at ? t("addedReminder") : t("added"), { tone: "ok" });
      onAdded();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  const addRef = useRef(add);
  useEffect(() => {
    addRef.current = add;
  });
  useEffect(() => {
    if (submitDraft) void addRef.current();
  }, [submitDraft]);
  return (
    <div className="opx-cd-comp" ref={boxRef}>
      <div className="opx-cd-comp__head">
        <span className="opx-cd-comp__kind">
          <TypeGlyph type={type} size={16} />
          {t(`type.${type}`)}
        </span>
        <button type="button" className="opx-cd-ibtn opx-cd-comp__plus" aria-expanded={moreTypes} aria-label={t("typeLabel")} title={t("typeLabel")} onClick={() => setMoreTypes((o) => !o)}>
          <IcPlus size={17} />
        </button>
      </div>
      {moreTypes ? (
        <div className="opx-cd-comp__types" role="group" aria-label={t("typeLabel")}>
          {WRITABLE.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={type === k}
              onClick={() => {
                setPicked(k);
                setMoreTypes(false);
              }}
            >
              <TypeGlyph type={k} size={15} />
              {t(`type.${k}`)}
            </button>
          ))}
          {withTitle || title ? null : (
            <button
              type="button"
              onClick={() => {
                setWithTitle(true);
                setMoreTypes(false);
              }}
            >
              {t("addTitle")}
            </button>
          )}
        </div>
      ) : null}
      <div className="opx-cd-comp__grid">
        <div className="opx-cd-comp__main">
          {withTitle || title ? <input className="opx-cd-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePh")} aria-label={t("titlePh")} autoFocus={!title} /> : null}
          <div className="opx-cd-comp__box">
            <textarea
              ref={ref}
              className="opx-cd-input opx-cd-comp__text"
              value={body}
              rows={2}
              onChange={(e) => onChange(e.target.value)}
              placeholder={t("bodyShort")}
              aria-label={t("bodyShort")}
              onKeyDown={(e) => {
                if (slash !== null && matches.length) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSel((s) => Math.min(matches.length - 1, s + 1));
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSel((s) => Math.max(0, s - 1));
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    pickTemplate(matches[sel]);
                    return;
                  }
                  if (e.key === "Escape") {
                    setSlash(null);
                    return;
                  }
                }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void add();
                }
              }}
            />
            {slash !== null ? (
              <div className="opx-cd-slash" role="listbox" aria-label={t("templates")}>
                {templates === null ? (
                  <Shim h={40} />
                ) : matches.length ? (
                  matches.map((m, i) => (
                    <button key={m.id} type="button" role="option" aria-selected={i === sel} onMouseDown={(e) => e.preventDefault()} onClick={() => pickTemplate(m)}>
                      <b>{m.title}</b>
                      <small>{m.content}</small>
                    </button>
                  ))
                ) : (
                  <small className="opx-cd-sub">{t("noTemplates")}</small>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <div className="opx-cd-comp__side">
          {canRemind ? (
            <div className="opx-cd-remind" role="group" aria-label={t("remindLabel")}>
              <div className="opx-cd-chips">
                {[1, 3, 24, 72].map((h) => (
                  <button
                    key={h}
                    type="button"
                    className="opx-cd-chip"
                    aria-pressed={chip === h}
                    onClick={() => {
                      setRemindAt(inHours(h));
                      setChip(h);
                    }}
                  >
                    {t("remindIn", { n: h })}
                  </button>
                ))}
              </div>
              <DateTimeInput
                label={t("remindLabel")}
                value={remindAt}
                onChange={(v) => {
                  setRemindAt(v);
                  setChip(null);
                }}
              />
            </div>
          ) : null}
          <button type="button" className="opx-pbtn" onClick={() => void add()} disabled={!typed || busy} aria-busy={busy || undefined}>
            <IcEdit size={16} />
            {t("add")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CyclesPane({ meta, history }: { meta: CrmMeta; history: LeadHistoryState }) {
  const t = useTranslations("crm.history");
  const tsrc = useTranslations("crm.source");
  const locale = useLocale();
  const { h, err, load } = history;
  if (!h && err) return <Failed text={err} retry={t("retry")} onRetry={() => void load()} />;
  if (!h)
    return (
      <>
        <Shim h={90} />
        <Shim h={120} />
      </>
    );
  return (
    <>
      {err ? <p className="opx-cd-err">{err}</p> : null}
      {h.cycles.length ? (
        <ol className="opx-cd-cycles">
          {h.cycles.map((c) => {
            const current = c.id === h.currentCycleId;
            const end = c.terminalStatus;
            return (
              <li key={c.id} data-current={current || undefined}>
                <span className="opx-cd-cycles__ic" aria-hidden="true">
                  {end ? <StatusGlyph status={end} /> : <IcHistory size={16} />}
                </span>
                <span className="opx-cd-cycles__txt">
                  <b>
                    {t("cycleN", { n: c.sequence })}
                    {current ? <Pill tone="info">{t("current")}</Pill> : null}
                  </b>
                  <small>{[c.source ? (tsrc.has(c.source) ? tsrc(c.source) : tsrc("other")) : "", c.openedAt ? t("opened", { at: shortDateTime(c.openedAt, locale) }) : "", c.closedAt ? t("closed", { at: shortDateTime(c.closedAt, locale) }) : ""].filter(Boolean).join(" · ")}</small>
                  {c.inquiry ? <p>{c.inquiry}</p> : null}
                  {c.reason ? <small className="opx-cd-mute">{t("reason", { text: c.reason })}</small> : null}
                </span>
                {end ? <StatusChip meta={meta} status={end} /> : <Pill tone="ok">{t("open")}</Pill>}
              </li>
            );
          })}
        </ol>
      ) : (
        <Empty icon={<IcRefresh size={22} />} title={t("noCycles")} />
      )}
    </>
  );
}
