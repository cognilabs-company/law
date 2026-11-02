"use client";

import { useState, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { shortDateTime } from "@/lib/date";
import { notify } from "@/lib/toast";
import { addLeadActivity } from "@/lib/services/crm";
import { IcDoc, IcFeedback, IcTimeline, IcWave } from "../icons";
import type { NowJob } from "./feed";
import type { JobDetail } from "./useNow";

type TabKey = "history" | "notes" | "docs";
type Step = { id: string; at: string; title: string; sub: string };

const NOTE_TYPES = new Set(["note", "call_note", "message", "follow_up", "meeting"]);
const urlOf = (p: Record<string, unknown>) => String(p.url ?? p.file_url ?? p.download_url ?? "");

export default function NowTabs({ job, detail, steps, waiting, onNote }: { job: NowJob; detail: JobDetail | null; steps: Step[]; waiting: boolean; onNote: () => void }) {
  const t = useTranslations("admin.ccx.now");
  const locale = useLocale();
  const [tab, setTab] = useState<TabKey>("history");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const lead = detail?.lead;
  const urgent = detail?.urgent;
  const line = detail?.timeline ?? [];
  const notes = line.filter((a) => NOTE_TYPES.has(a.type)).slice().reverse();
  const docs = line.filter((a) => a.type === "document").slice().reverse();
  const files = urgent ? urgent.files : [];
  const voices = urgent ? urgent.voiceMessages : [];
  const tabs: TabKey[] = job.kind === "lead" ? ["history", "notes", "docs"] : job.kind === "urgent" ? ["history", "docs"] : ["history"];
  const current = tabs.includes(tab) ? tab : "history";
  const count: Record<TabKey, number> = { history: steps.length, notes: notes.length, docs: lead ? docs.length : files.length + voices.length };
  const shown = steps;
  const size = (bytes: number) => {
    const mb = bytes >= 1024 * 1024;
    return new Intl.NumberFormat(locale, { style: "unit", unit: mb ? "megabyte" : "kilobyte", unitDisplay: "short", maximumFractionDigits: mb ? 1 : 0 }).format(mb ? bytes / (1024 * 1024) : Math.max(1, Math.round(bytes / 1024)));
  };

  const onKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    e.stopPropagation();
    const i = tabs.indexOf(current);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    setTab(next);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();
  };

  const addNote = async () => {
    const body = text.trim();
    if (!lead || !body || busy) return;
    setBusy(true);
    try {
      await addLeadActivity(lead.id, { type: "note", body });
      setText("");
      notify.success(t("noteAdded"), { id: `ccx-note-${lead.id}` });
      onNote();
    } catch (e) {
      notify.error(t("noteFailed"), { id: `ccx-note-${lead.id}`, error: e });
    } finally {
      setBusy(false);
    }
  };

  const icon = (k: TabKey) => (k === "history" ? <IcTimeline size={17} /> : k === "notes" ? <IcFeedback size={17} /> : <IcDoc size={17} />);

  return (
    <div className="opx-ntabs">
      <div className="opx-ntabs__bar" role="tablist" aria-label={t("tabs.aria")} onKeyDown={onKeys}>
        {tabs.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`opx-ntab-${k}`}
            data-tab={k}
            aria-selected={current === k}
            aria-controls="opx-ntab-panel"
            tabIndex={current === k ? 0 : -1}
            className={`opx-ntab${current === k ? " is-on" : ""}`}
            onClick={() => setTab(k)}
          >
            {icon(k)}
            {t(`tabs.${k}`)}
            <b className="opx-num">{count[k]}</b>
          </button>
        ))}
      </div>

      <div className="opx-ntabs__panel" role="tabpanel" id="opx-ntab-panel" aria-labelledby={`opx-ntab-${current}`}>
        {waiting ? (
          <i className="opx-shim opx-shim--para" />
        ) : current === "history" ? (
          shown.length ? (
            <ol className="opx-hist__list">
              {shown.map((s, i) => (
                <li key={s.id} className={i === shown.length - 1 ? "is-last" : undefined}>
                  <time className="opx-num" dateTime={s.at}>
                    {shortDateTime(s.at, locale)}
                  </time>
                  <span>
                    <b>{s.title}</b>
                    {s.sub ? <small>{s.sub}</small> : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="opx-hist__none">{t("noHistory")}</p>
          )
        ) : current === "notes" ? (
          <div className="opx-nnotes">
            {lead ? (
              <div className="opx-nform">
                <label className="opx-sr" htmlFor="opx-nform-text">
                  {t("notePh")}
                </label>
                <textarea id="opx-nform-text" rows={2} maxLength={2000} value={text} placeholder={t("notePh")} onChange={(e) => setText(e.target.value)} />
                <button type="button" className="opx-nform__go" disabled={!text.trim() || busy} onClick={() => void addNote()} aria-busy={busy}>
                  {busy ? t("act.working") : t("addNote")}
                </button>
              </div>
            ) : null}
            {notes.length ? (
              <ul className="opx-nlist">
                {notes.slice(0, 5).map((n) => (
                  <li key={n.id}>
                    <span className="opx-nlist__meta">
                      <b>{n.actor?.name || t("system")}</b>
                      <time className="opx-num" dateTime={n.createdAt}>
                        {n.createdAt ? shortDateTime(n.createdAt, locale) : ""}
                      </time>
                    </span>
                    {n.title ? <strong>{n.title}</strong> : null}
                    {n.body ? <p>{n.body}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="opx-hist__none">{t("noNotes")}</p>
            )}
          </div>
        ) : lead ? (
          docs.length ? (
            <ul className="opx-ndocs">
              {docs.map((d) => {
                const url = urlOf(d.payload);
                return (
                  <li key={d.id}>
                    <IcDoc size={16} />
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        {d.title || d.body || t("tabs.docs")}
                      </a>
                    ) : (
                      <span>{d.title || d.body}</span>
                    )}
                    <time className="opx-num" dateTime={d.createdAt}>
                      {d.createdAt ? shortDateTime(d.createdAt, locale) : ""}
                    </time>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="opx-hist__none">{t("noDocs")}</p>
          )
        ) : files.length || voices.length ? (
          <ul className="opx-ndocs">
            {files.map((f) => (
              <li key={f.id || f.url}>
                <IcDoc size={16} />
                <a href={f.url} target="_blank" rel="noopener noreferrer">
                  {f.name || t("tabs.docs")}
                </a>
                {f.size ? <small className="opx-num">{size(f.size)}</small> : null}
              </li>
            ))}
            {voices.map((v) => (
              <li key={v.id || v.url} className="opx-ndocs__voice">
                <IcWave size={16} />
                <audio controls preload="none" src={v.url} aria-label={v.name || t("voice")} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="opx-hist__none">{t("noDocs")}</p>
        )}
      </div>
    </div>
  );
}
