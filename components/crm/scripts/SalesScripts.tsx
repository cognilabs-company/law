"use client";

import { useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { IconCheck, IconFileText, IconLock, IconPlus, IconRefresh, IconTrash } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ApiError, isForbidden, isRouteMissing } from "@/lib/http";
import { fmtDateTime } from "@/lib/date";
import { humanizeSlug } from "@/lib/lawyers";
import { notify } from "@/lib/toast";
import { useLoad } from "@/lib/useLoad";
import { createSalesScript, createScriptVersion, getSalesScript, listSalesScripts, publishScriptVersion, type SalesScript, type ScriptContent, type ScriptInput } from "@/lib/services/executive";
import CrmFrame from "../CrmFrame";
import { Empty } from "../bits";
import { CrmSelect } from "../fields";
import "./scripts.css";

// Versioned sales scripts (contract 2026-11-13 §8), for whoever holds
// sales_scripts.manage (ROP, superadmin). A new version goes back to draft;
// publishing one archives the version that was published before. A call
// that already started keeps the versions it began with.
const STATUSES = ["", "published", "draft", "archived"] as const;
const AUDIENCES = ["call_center", "sales", "duty_lawyer"] as const;
const LANGUAGES = ["uz_latn", "uz_cyrl", "ru"] as const;

export default function SalesScripts(): ReactElement {
  const t = useTranslations("exec.scripts");
  return <CrmFrame title={t("title")} sub={t("sub")}>{() => <Library />}</CrmFrame>;
}

function useLabels() {
  const t = useTranslations("exec.scripts");
  return {
    status: (s: string) => (s ? (t.has(`status.${s}`) ? t(`status.${s}`) : humanizeSlug(s)) : ""),
    audience: (s: string) => (t.has(`audience.${s}`) ? t(`audience.${s}`) : humanizeSlug(s)),
    language: (s: string) => (t.has(`lang.${s}`) ? t(`lang.${s}`) : s),
  };
}

function Library(): ReactElement {
  const t = useTranslations("exec.scripts");
  const L = useLabels();
  const { session } = useAuth();
  const manage = can(session, "sales_scripts.manage");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("");
  const res = useLoad((signal) => listSalesScripts(status || undefined, signal), [status, manage]);
  const [open, setOpen] = useState<SalesScript | null>(null);
  const [edit, setEdit] = useState<{ base: SalesScript | null } | null>(null);

  if (!manage || (res.status === "error" && !res.data && isForbidden(res.error))) {
    return (
      <div className="crm-card">
        <Empty icon={<IconLock />} title={t("denied")} text={t("deniedText")} />
      </div>
    );
  }
  const rows = res.data;
  return (
    <>
      <div className="crm-filters">
        <span className="crm-seg" role="group" aria-label={t("statusFilter")}>
          {STATUSES.map((s) => (
            <button key={s || "all"} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s ? L.status(s) : t("all")}
            </button>
          ))}
        </span>
        <button type="button" className="crm-btn" onClick={res.reload} disabled={res.refreshing} style={{ marginLeft: "auto" }}>
          <IconRefresh className={res.refreshing ? "mk-spin" : undefined} aria-hidden="true" />
          {t("refresh")}
        </button>
        <button type="button" className="crm-btn crm-btn--pri" onClick={() => setEdit({ base: null })}>
          <IconPlus aria-hidden="true" />
          {t("new")}
        </button>
      </div>
      <p className="crm-sub">{t("note")}</p>
      {res.status === "loading" ? (
        <span className="crm-sk crm-sk--block" />
      ) : res.status === "error" && !rows ? (
        <div className="crm-card">
          <Empty title={t("failed")} action={<button type="button" className="crm-btn" onClick={res.reload}><IconRefresh aria-hidden="true" />{t("refresh")}</button>} />
        </div>
      ) : !rows?.length ? (
        <div className="crm-card">
          <Empty icon={<IconFileText />} title={status ? t("emptyFiltered") : t("empty")} text={status ? undefined : t("emptyText")} />
        </div>
      ) : (
        <div className="crm-clist crm-rise">
          {rows.map((s) => (
            <button key={s.id} type="button" className="crm-ccard ssc-card" onClick={() => setOpen(s)}>
              <span className="ssc-card__top">
                <b>{s.title || s.code}</b>
                <span className={`ssc-pill is-${s.publishedVersion !== null ? "published" : s.status || "draft"}`}>{s.publishedVersion !== null ? t("publishedV", { v: s.publishedVersion }) : L.status(s.status || "draft")}</span>
              </span>
              <small className="crm-muted">{[s.code, L.audience(s.audience), L.language(s.language), s.serviceScope].filter(Boolean).join(" · ")}</small>
              {s.content.opening ? <p className="crm-sub ssc-open">{s.content.opening}</p> : null}
              <small className="crm-muted">
                {t("versionN", { v: s.currentVersion ?? "—" })}
                {s.updatedAt ? <> · <When at={s.updatedAt} /></> : null}
              </small>
            </button>
          ))}
        </div>
      )}
      {open ? (
        <Detail
          script={open}
          onClose={() => setOpen(null)}
          onNewVersion={(s) => {
            setOpen(null);
            setEdit({ base: s });
          }}
          onChanged={(s) => {
            setOpen(s);
            res.reload();
          }}
        />
      ) : null}
      {edit ? (
        <Editor
          base={edit.base}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            res.reload();
          }}
        />
      ) : null}
    </>
  );
}

function When({ at }: { at: string }): ReactElement {
  const locale = useLocale();
  return <>{fmtDateTime(at, locale)}</>;
}

function ContentView({ c }: { c: ScriptContent }): ReactElement {
  const t = useTranslations("exec.scripts");
  return (
    <div className="ssc-content">
      <section>
        <h4>{t("f.opening")}</h4>
        <p>{c.opening || "—"}</p>
      </section>
      <section>
        <h4>{t("f.questions")}</h4>
        {c.questions.length ? <ol>{c.questions.map((q, i) => <li key={i}>{q}</li>)}</ol> : <p>—</p>}
      </section>
      <section>
        <h4>{t("f.objections")}</h4>
        {c.objections.length ? <ul>{c.objections.map((q, i) => <li key={i}>{q}</li>)}</ul> : <p>—</p>}
      </section>
    </div>
  );
}

function Detail({ script, onClose, onNewVersion, onChanged }: { script: SalesScript; onClose: () => void; onNewVersion: (s: SalesScript) => void; onChanged: (s: SalesScript) => void }): ReactElement {
  const t = useTranslations("exec.scripts");
  const L = useLabels();
  // The full record when the backend serves it; the list row otherwise.
  const full = useLoad(
    (signal) =>
      getSalesScript(script.id, signal).catch((e: unknown) => {
        if (isRouteMissing(e)) return script;
        throw e;
      }),
    [script.id],
  );
  // The freshest of the two: the full record, or the row a publish returned.
  const s = full.data && !full.refreshing ? full.data : script;
  const [busy, setBusy] = useState(0);
  const publish = async (version: number) => {
    if (busy) return;
    setBusy(version);
    try {
      const next = await publishScriptVersion(s.id, version);
      notify.success(t("publishedToast", { v: version }));
      onChanged(next.id ? next : s);
      full.reload();
    } catch (e) {
      notify.error(e instanceof ApiError && e.status === 409 ? t("conflict") : t("publishFailed"));
      full.reload();
    } finally {
      setBusy(0);
    }
  };
  const versions = s.versions.length ? s.versions : s.currentVersion ? [{ version: s.currentVersion, status: s.status, content: s.content, changeNote: "", createdAt: s.updatedAt, publishedAt: "" }] : [];
  return (
    <Modal
      open
      onClose={onClose}
      variant="drawer"
      title={s.title || s.code}
      footer={
        <>
          <button type="button" className="crm-btn" onClick={onClose}>{t("close")}</button>
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => onNewVersion(s)}>
            <IconPlus aria-hidden="true" />
            {t("newVersion")}
          </button>
        </>
      }
    >
      <div className="crm-pop">
        <p className="crm-muted ssc-meta">{[s.code, L.audience(s.audience), L.language(s.language), s.serviceScope].filter(Boolean).join(" · ")}</p>
        <ContentView c={s.content} />
        <h4 className="ssc-h">{t("versions")}</h4>
        <ol className="ssc-versions">
          {versions.map((v) => (
            <li key={v.version}>
              <span className="ssc-v">v{v.version}</span>
              <span className="ssc-vbody">
                <span className={`ssc-pill is-${v.status || "draft"}`}>{L.status(v.status || "draft")}</span>
                {v.changeNote ? <small>{v.changeNote}</small> : null}
                {v.createdAt ? <small className="crm-muted"><When at={v.createdAt} /></small> : null}
              </span>
              {v.status !== "published" ? (
                <button type="button" className="crm-btn crm-btn--sm" onClick={() => void publish(v.version)} disabled={!!busy} aria-busy={busy === v.version || undefined}>
                  <IconCheck aria-hidden="true" />
                  {t("publish")}
                </button>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="crm-sub">{t("snapshotNote")}</p>
      </div>
    </Modal>
  );
}

function ListEditor({ label, items, onChange, placeholder, addLabel, removeLabel }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder: string; addLabel: string; removeLabel: string }): ReactElement {
  return (
    <div className="crm-field">
      <span>{label}</span>
      <div className="ssc-list">
        {items.map((q, i) => (
          <div key={i} className="ssc-list__row">
            <input className="crm-input" value={q} placeholder={placeholder} aria-label={`${label} ${i + 1}`} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            <button type="button" className="crm-btn crm-btn--sm crm-btn--icon" aria-label={removeLabel} title={removeLabel} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <IconTrash aria-hidden="true" />
            </button>
          </div>
        ))}
        <button type="button" className="crm-btn crm-btn--sm" onClick={() => onChange([...items, ""])} style={{ justifySelf: "start" }}>
          <IconPlus aria-hidden="true" />
          {addLabel}
        </button>
      </div>
    </div>
  );
}

function Editor({ base, onClose, onSaved }: { base: SalesScript | null; onClose: () => void; onSaved: () => void }): ReactElement {
  const t = useTranslations("exec.scripts");
  const L = useLabels();
  const [f, setF] = useState<ScriptInput>(() => ({
    code: base?.code ?? "",
    title: base?.title ?? "",
    audience: base?.audience || "call_center",
    serviceScope: base?.serviceScope ?? "",
    language: base?.language || "uz_latn",
    content: { opening: base?.content.opening ?? "", questions: base?.content.questions.length ? [...base.content.questions] : [""], objections: base?.content.objections.length ? [...base.content.objections] : [""] },
    changeNote: "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<ScriptInput>) => setF((c) => ({ ...c, ...patch }));
  const setContent = (patch: Partial<ScriptContent>) => setF((c) => ({ ...c, content: { ...c.content, ...patch } }));
  const ok = !!f.code.trim() && !!f.title.trim() && !!f.content.opening.trim() && !!f.changeNote.trim();
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError("");
    try {
      if (base) await createScriptVersion(base.id, f);
      else await createSalesScript(f);
      notify.success(base ? t("versionSaved") : t("saved"));
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setError(t("codeTaken"));
      else if (e instanceof ApiError && e.status === 422) setError(Object.values(e.fieldErrors)[0] || e.detail || t("invalid"));
      else if (isForbidden(e)) setError(t("denied"));
      else setError(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      variant="drawer"
      title={base ? t("newVersionOf", { title: base.title || base.code }) : t("new")}
      busy={busy}
      dirty
      footer={
        <>
          <button type="button" className="crm-btn" onClick={onClose}>{t("cancel")}</button>
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => void save()} disabled={!ok || busy} aria-busy={busy || undefined}>
            {base ? t("saveVersion") : t("save")}
          </button>
        </>
      }
    >
      <div className="crm-pop">
        {base ? <p className="crm-sub">{t("versionNote")}</p> : null}
        {error ? <p className="ssc-err" role="alert">{error}</p> : null}
        <div className="crm-row2">
          <label className="crm-field">
            <span>{t("f.title")}</span>
            <input className="crm-input" value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={160} />
          </label>
          <label className="crm-field">
            <span>{t("f.code")}</span>
            <input className="crm-input" value={f.code} onChange={(e) => set({ code: e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase() })} readOnly={!!base} placeholder="sos_initial_call" maxLength={80} />
          </label>
        </div>
        <div className="crm-row2">
          <div className="crm-field">
            <span>{t("f.audience")}</span>
            <CrmSelect value={f.audience} onChange={(v) => set({ audience: v })} label={t("f.audience")} options={AUDIENCES.map((a) => ({ value: a, label: L.audience(a) }))} />
          </div>
          <div className="crm-field">
            <span>{t("f.language")}</span>
            <CrmSelect value={f.language} onChange={(v) => set({ language: v })} label={t("f.language")} options={LANGUAGES.map((l) => ({ value: l, label: L.language(l) }))} />
          </div>
        </div>
        <label className="crm-field">
          <span>{t("f.scope")}</span>
          <input className="crm-input" value={f.serviceScope} onChange={(e) => set({ serviceScope: e.target.value })} placeholder={t("f.scopePh")} maxLength={80} />
        </label>
        <label className="crm-field">
          <span>{t("f.opening")}</span>
          <textarea className="crm-textarea" value={f.content.opening} onChange={(e) => setContent({ opening: e.target.value })} style={{ minHeight: 110 }} placeholder={t("f.openingPh")} />
        </label>
        <ListEditor label={t("f.questions")} items={f.content.questions} onChange={(questions) => setContent({ questions })} placeholder={t("f.questionPh")} addLabel={t("addQuestion")} removeLabel={t("remove")} />
        <ListEditor label={t("f.objections")} items={f.content.objections} onChange={(objections) => setContent({ objections })} placeholder={t("f.objectionPh")} addLabel={t("addObjection")} removeLabel={t("remove")} />
        <label className="crm-field">
          <span>{t("f.changeNote")}</span>
          <input className="crm-input" value={f.changeNote} onChange={(e) => set({ changeNote: e.target.value })} placeholder={base ? t("f.changeNotePh") : t("f.firstNote")} maxLength={240} />
        </label>
      </div>
    </Modal>
  );
}
