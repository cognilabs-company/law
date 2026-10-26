"use client";

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconChat, IconClock, IconFileText, IconHistory, IconLayers, IconPhone, IconSend, IconUsers } from "@/components/icons";
import { dateOnly, timeOnly } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { addLeadActivity, getLeadTimeline, leadCan, listCrmTemplates, type CrmActivity, type CrmLead, type CrmTemplate } from "@/lib/services/crm";
import { Empty, useCrmError } from "./bits";

const TYPE_ICON: Record<string, typeof IconChat> = { note: IconFileText, call_note: IconPhone, message: IconChat, meeting: IconUsers, follow_up: IconClock, document: IconFileText, system: IconLayers };
const WRITABLE = ["note", "call_note", "message", "meeting", "follow_up", "document"] as const;

// The audit rail: oldest first, never edited, never deleted (§4.8).
export function Timeline({ items, empty }: { items: CrmActivity[]; empty?: string }): ReactElement {
  const t = useTranslations("crm.tl");
  const locale = useLocale();
  if (!items.length) return <Empty icon={<IconHistory />} title={empty ?? t("empty")} />;
  let day = "";
  const out: ReactElement[] = [];
  for (const a of items) {
    const d = a.createdAt ? dateOnly(a.createdAt, locale) : "";
    if (d && d !== day) {
      day = d;
      out.push(
        <li key={`d-${d}`} className="crm-tl__day" role="separator">
          <span>{d}</span>
        </li>,
      );
    }
    const Icon = TYPE_ICON[a.type] ?? IconLayers;
    const payload = Object.keys(a.payload).length ? JSON.stringify(a.payload, null, 2) : "";
    out.push(
      <li key={a.id || `${a.createdAt}-${a.type}`} className="crm-tl__ev" data-t={a.type}>
        <span className="crm-tl__ico" aria-hidden="true">
          <Icon />
        </span>
        <article className="crm-tl__body">
          <header>
            <b>{a.title || (t.has(`type.${a.type}`) ? t(`type.${a.type}`) : a.type)}</b>
            <small>{a.actor?.name || (a.type === "system" || !a.actorId ? t("system") : t("someone"))}</small>
            <time dateTime={a.createdAt}>{a.createdAt ? timeOnly(a.createdAt, locale) : ""}</time>
          </header>
          {a.body ? <p>{a.body}</p> : null}
          {payload ? (
            <details>
              <summary>{t("payload")}</summary>
              <pre>{payload}</pre>
            </details>
          ) : null}
        </article>
      </li>,
    );
  }
  return (
    <ol className="crm-tl" aria-label={t("label")}>
      {out}
    </ol>
  );
}

export function LeadTimeline({ lead, refreshKey, onAdded }: { lead: CrmLead; refreshKey: number; onAdded: () => void }): ReactElement {
  const t = useTranslations("crm.tl");
  const crmErr = useCrmError();
  const [items, setItems] = useState<CrmActivity[] | null>(null);
  const [err, setErr] = useState("");
  const canView = leadCan(lead, "view_timeline");
  useEffect(() => {
    if (!canView) return;
    const ctl = new AbortController();
    getLeadTimeline(lead.id, ctl.signal).then(
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
  }, [lead.id, refreshKey, canView, crmErr]);
  return (
    <section className="crm-card" aria-labelledby="crm-tl-t" style={{ paddingBottom: 12 }}>
      <h3 className="crm-card__h" id="crm-tl-t">
        <IconHistory aria-hidden="true" />
        {t("title")}
        <small>{t("immutable")}</small>
      </h3>
      {!canView ? (
        <p className="crm-sub">{t("noAccess")}</p>
      ) : items === null ? (
        <>
          <span className="crm-sk crm-sk--block" style={{ height: 70 }} />
          <span className="crm-sk crm-sk--block" style={{ height: 70 }} />
        </>
      ) : (
        <>
          {err ? <p className="crm-err">{err}</p> : null}
          <Timeline items={items} />
        </>
      )}
      {leadCan(lead, "add_activity") ? <Composer lead={lead} onAdded={onAdded} /> : null}
    </section>
  );
}

// The sticky composer. "/" picks an operator template: it fills the
// editor, it never sends (§6).
function Composer({ lead, onAdded }: { lead: CrmLead; onAdded: () => void }): ReactElement {
  const t = useTranslations("crm.tl");
  const crmErr = useCrmError();
  const [type, setType] = useState<(typeof WRITABLE)[number]>("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [slash, setSlash] = useState<string | null>(null);
  const [templates, setTemplates] = useState<CrmTemplate[] | null>(null);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (slash === null || templates) return;
    const ctl = new AbortController();
    listCrmTemplates({}, ctl.signal).then(setTemplates, (e) => {
      if (!isAborted(e)) logApiError("crm.templates", e);
      setTemplates([]);
    });
    return () => ctl.abort();
  }, [slash, templates]);
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
      await addLeadActivity(lead.id, { type, title, body });
      setBody("");
      setTitle("");
      toast(t("added"), { tone: "ok" });
      onAdded();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="crm-composer">
      <div className="crm-composer__types" role="group" aria-label={t("typeLabel")}>
        {WRITABLE.map((k) => {
          const Icon = TYPE_ICON[k];
          return (
            <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)}>
              <Icon aria-hidden="true" />
              {t(`type.${k}`)}
            </button>
          );
        })}
      </div>
      <input className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePh")} aria-label={t("titlePh")} />
      <textarea
        ref={ref}
        className="crm-textarea"
        value={body}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("bodyPh")}
        aria-label={t("bodyPh")}
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
        style={{ minHeight: 70 }}
      />
      {slash !== null ? (
        <div className="crm-slash" role="listbox" aria-label={t("templates")}>
          {templates === null ? (
            <span className="crm-sk" />
          ) : matches.length ? (
            matches.map((m, i) => (
              <button key={m.id} type="button" role="option" aria-selected={i === sel} onMouseDown={(e) => e.preventDefault()} onClick={() => pickTemplate(m)}>
                <b>{m.title}</b>
                <small>{m.content}</small>
              </button>
            ))
          ) : (
            <small className="crm-muted" style={{ padding: 8 }}>
              {t("noTemplates")}
            </small>
          )}
        </div>
      ) : null}
      <div className="crm-composer__foot">
        <span className="crm-hint">{t.rich("composerHint", { k: (c) => <kbd>{c}</kbd> })}</span>
        <button type="button" className="crm-btn crm-btn--pri crm-btn--sm" onClick={() => void add()} disabled={!body.trim() || busy} aria-busy={busy || undefined}>
          <IconSend aria-hidden="true" />
          {t("add")}
        </button>
      </div>
    </div>
  );
}
