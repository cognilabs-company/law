"use client";

import "./docSettings.css";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";
import IconButton from "@/components/ui/IconButton";
import { IconFileText, IconPlus, IconRefresh } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { errDetail, isAborted, isForbidden, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import {
  DOC_FORMATS,
  DOC_MODES,
  createDocSettingsDraft,
  docSettingsIssues,
  getDocSettingsAdmin,
  getDocSettingsRuntime,
  publishDocSettings,
  rollbackDocSettings,
  type DocSettings,
  type DocSettingsVersion,
} from "@/lib/services/documentSettings";

// Document services' global settings (TSK-136097): what the services use
// now, the version history, and a draft editor. Publishing makes a draft
// the active version; rollback brings a published one back. Both ask first.

type Loaded = { runtime: Awaited<ReturnType<typeof getDocSettingsRuntime>>; admin: Awaited<ReturnType<typeof getDocSettingsAdmin>> };
type Confirm = { kind: "publish" | "rollback"; v: DocSettingsVersion } | null;

function Summary({ s }: { s: DocSettings }): ReactElement {
  const t = useTranslations("admin.docSettings");
  const som = (n: number) => `${fmtUzs(n)} ${t("som")}`;
  return (
    <div className="dss-sum">
      <div className="dss-tile">
        <small>{t("formats")}</small>
        <span className="dss-chips">
          {s.allowedFormats.map((f) => (
            <i key={f}>{f.toUpperCase()}</i>
          ))}
        </span>
      </div>
      <div className="dss-tile">
        <small>{t("maxFile")}</small>
        <b className="sx-num">{t("mb", { n: s.maxFileMb })}</b>
      </div>
      <div className="dss-tile">
        <small>{t("includedPages")}</small>
        <b className="sx-num">{t("pages", { n: s.includedPages })}</b>
      </div>
      <div className="dss-tile">
        <small>{t("extraPage")}</small>
        <b className="sx-num">{som(s.extraPagePrice)}</b>
      </div>
      <div className="dss-tile dss-tile--wide">
        <small>{t("modes")}</small>
        <span className="dss-chips">
          {s.modes.map((m) => (
            <i key={m}>{t.has(`mode.${m}`) ? t(`mode.${m}`) : m}</i>
          ))}
        </span>
      </div>
      <div className="dss-tile dss-tile--wide">
        <small>{t("tiers")}</small>
        {s.pagePricing.length ? (
          <ul className="dss-tiers">
            {s.pagePricing.map((r, i) => (
              <li key={i}>
                <span>{r.maxPages === null ? t("tierFrom", { from: r.minPages }) : t("tierRange", { from: r.minPages, to: r.maxPages })}</span>
                <b className="sx-num">{som(r.amount)}</b>
              </li>
            ))}
          </ul>
        ) : (
          <span className="dss-muted">{t("noTiers")}</span>
        )}
      </div>
    </div>
  );
}

function Editor({ start, onSaved, onCancel }: { start: DocSettings; onSaved: (v: DocSettingsVersion) => void; onCancel: () => void }): ReactElement {
  const t = useTranslations("admin.docSettings");
  const [s, setS] = useState<DocSettings>(start);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const sending = useRef(false);
  const issues = docSettingsIssues(s);
  const shown = tried ? issues : {};
  const num = (v: string) => (v === "" ? 0 : Number(v.replace(/[^\d]/g, "")));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const setTier = (i: number, patch: Partial<DocSettings["pagePricing"][number]>) => setS((x) => ({ ...x, pagePricing: x.pagePricing.map((r, k) => (k === i ? { ...r, ...patch } : r)) }));

  async function save() {
    setTried(true);
    if (Object.keys(issues).length || busy || sending.current) return;
    sending.current = true;
    setBusy(true);
    setErr("");
    try {
      onSaved(await createDocSettingsDraft(s));
    } catch (e) {
      sending.current = false;
      logApiError("docSettings.draft", e);
      setErr(errDetail(e) || t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dss-edit" aria-label={t("editTitle")}>
      <b className="dss-edit__h">{t("editTitle")}</b>
      <fieldset className="dss-field">
        <legend>{t("formats")}</legend>
        <div className="dss-toggles">
          {DOC_FORMATS.map((f) => (
            <button key={f} type="button" aria-pressed={s.allowedFormats.includes(f)} onClick={() => setS((x) => ({ ...x, allowedFormats: toggle(x.allowedFormats, f) }))}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        {shown.formats ? <small className="dss-bad">{t("issue.pickFormat")}</small> : null}
      </fieldset>
      <fieldset className="dss-field">
        <legend>{t("modes")}</legend>
        <div className="dss-toggles">
          {DOC_MODES.map((m) => (
            <button key={m} type="button" aria-pressed={s.modes.includes(m)} onClick={() => setS((x) => ({ ...x, modes: toggle(x.modes, m) }))}>
              {t(`mode.${m}`)}
            </button>
          ))}
        </div>
        {shown.modes ? <small className="dss-bad">{t("issue.pickMode")}</small> : null}
      </fieldset>
      <div className="dss-nums">
        <label data-bad={shown.maxFileMb ? "" : undefined}>
          <span>{t("maxFile")}</span>
          <input inputMode="numeric" value={s.maxFileMb || ""} onChange={(e) => setS((x) => ({ ...x, maxFileMb: num(e.target.value) }))} />
          <small>{t("maxFileHint")}</small>
        </label>
        <label data-bad={shown.includedPages ? "" : undefined}>
          <span>{t("includedPages")}</span>
          <input inputMode="numeric" value={s.includedPages || ""} onChange={(e) => setS((x) => ({ ...x, includedPages: num(e.target.value) }))} />
          <small>{t("includedHint")}</small>
        </label>
        <label data-bad={shown.extraPagePrice ? "" : undefined}>
          <span>{t("extraPage")}</span>
          <input inputMode="numeric" value={String(s.extraPagePrice)} onChange={(e) => setS((x) => ({ ...x, extraPagePrice: num(e.target.value) }))} />
          <small>{t("som")}</small>
        </label>
      </div>
      <fieldset className="dss-field">
        <legend>{t("tiers")}</legend>
        {s.pagePricing.map((r, i) => (
          <div key={i} className="dss-tier" data-bad={shown[`tier${i}`] ? "" : undefined}>
            <label>
              <span>{t("tierMin")}</span>
              <input inputMode="numeric" value={r.minPages || ""} onChange={(e) => setTier(i, { minPages: num(e.target.value) })} />
            </label>
            <label>
              <span>{t("tierMax")}</span>
              <input inputMode="numeric" placeholder={t("tierOpen")} value={r.maxPages ?? ""} onChange={(e) => setTier(i, { maxPages: e.target.value === "" ? null : num(e.target.value) })} />
            </label>
            <label>
              <span>{t("tierAmount")}</span>
              <input inputMode="numeric" value={String(r.amount)} onChange={(e) => setTier(i, { amount: num(e.target.value) })} />
            </label>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setS((x) => ({ ...x, pagePricing: x.pagePricing.filter((_, k) => k !== i) }))} aria-label={t("removeTier")}>
              ×
            </button>
            {shown[`tier${i}`] ? <small className="dss-bad">{t("issue.tier")}</small> : null}
          </div>
        ))}
        <button type="button" className="btn btn--line btn--sm dss-add" onClick={() => setS((x) => ({ ...x, pagePricing: [...x.pagePricing, { minPages: (x.pagePricing.at(-1)?.maxPages ?? 0) + 1, maxPages: null, amount: 0 }] }))}>
          <IconPlus aria-hidden="true" />
          {t("addTier")}
        </button>
      </fieldset>
      {err ? <Notice ok={false} msg={err} /> : null}
      <div className="dss-acts">
        <button type="button" className="btn btn--soft btn--sm" onClick={onCancel} disabled={busy}>
          {t("cancel")}
        </button>
        <button type="button" className="btn btn--pri btn--sm" onClick={() => void save()} disabled={busy}>
          {busy ? t("saving") : t("saveDraft")}
        </button>
      </div>
    </section>
  );
}

export default function DocumentSettingsPage(): ReactElement {
  const t = useTranslations("admin.docSettings");
  const locale = useLocale();
  const [data, setData] = useState<Loaded | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const [failure, setFailure] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [acting, setActing] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [runtime, admin] = await Promise.all([getDocSettingsRuntime(signal), getDocSettingsAdmin(signal)]);
      setData({ runtime, admin });
      setState("ready");
    } catch (e) {
      if (isAborted(e)) return;
      if (isForbidden(e)) return setState("forbidden");
      logApiError("docSettings.load", e);
      setFailure(e);
      setState((s) => (s === "ready" ? s : "error"));
    }
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    void Promise.resolve().then(() => load(ctl.signal));
    return () => ctl.abort();
  }, [load]);

  async function act() {
    if (!confirm || acting) return;
    setActing(true);
    try {
      if (confirm.kind === "publish") await publishDocSettings(confirm.v.id);
      else await rollbackDocSettings(confirm.v.id);
      setNote({ ok: true, msg: t(confirm.kind === "publish" ? "published" : "rolledBack", { n: confirm.v.version ?? "" }) });
      setConfirm(null);
      await load();
    } catch (e) {
      logApiError(`docSettings.${confirm.kind}`, e);
      setNote({ ok: false, msg: errDetail(e) || t("actionFailed") });
      setConfirm(null);
    } finally {
      setActing(false);
    }
  }

  const activeId = data?.admin.active?.id ?? data?.runtime.settingsId ?? "";
  const versions = data ? [...data.admin.versions].sort((a, b) => (b.version ?? 0) - (a.version ?? 0)) : [];
  const status = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : s);

  return (
    <section className="ppanel dss" data-ai-target="admin:document-settings">
      <div className="ppanel__h cch">
        <h2 className="ppanel__t cch__t">
          <span className="pico">
            <IconFileText />
          </span>
          <span className="cch__tt">{t("title")}</span>
        </h2>
        <div className="cch__a">
          {data ? <span className="dss-ver">{data.admin.active ? t("activeN", { n: data.admin.active.version ?? data.runtime.version ?? "" }) : t("defaults")}</span> : null}
          <IconButton
            label={t("refresh")}
            icon={<IconRefresh />}
            busy={refreshing}
            tipAlign="end"
            onClick={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        </div>
      </div>
      <p className="ppanel__note">{t("lead")}</p>
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}

      {state === "loading" ? (
        <Skeleton rows={4} />
      ) : state === "forbidden" ? (
        <EmptyState icon={<IconFileText />} title={t("noAccess")} />
      ) : state === "error" || !data ? (
        <ErrorState error={failure} onRetry={() => void load()} title={t("loadFailed")} compact />
      ) : (
        <>
          <div className="dss-block">
            <div className="dss-block__h">
              <b>{t("now")}</b>
              {!data.admin.active ? <small>{t("defaultsHint")}</small> : null}
              {!editing ? (
                <button type="button" className="btn btn--pri btn--sm" onClick={() => setEditing(true)}>
                  <IconPlus aria-hidden="true" />
                  {t("newVersion")}
                </button>
              ) : null}
            </div>
            <Summary s={data.runtime.settings} />
            {data.runtime.settings && data.runtime.version !== null ? <p className="dss-muted">{t("snapshotNote")}</p> : null}
          </div>

          {editing ? (
            <Editor
              start={data.admin.active?.settings ?? data.runtime.settings}
              onCancel={() => setEditing(false)}
              onSaved={(v) => {
                setEditing(false);
                setNote({ ok: true, msg: t("draftSaved", { n: v.version ?? "" }) });
                void load();
              }}
            />
          ) : null}

          <div className="dss-block">
            <div className="dss-block__h">
              <b>{t("history")}</b>
            </div>
            {versions.length ? (
              <ol className="dss-list">
                {versions.map((v) => {
                  const active = v.id === activeId;
                  return (
                    <li key={v.id} className="dss-v" data-status={v.status} data-active={active || undefined}>
                      <div className="dss-v__h">
                        <b>{t("versionN", { n: v.version ?? "?" })}</b>
                        <span className="dss-chip" data-status={active ? "active" : v.status}>
                          {active ? t("status.active") : status(v.status)}
                        </span>
                        <small>
                          {[v.publishedAt ? t("publishedAt", { date: shortDateTime(v.publishedAt, locale) }) : v.createdAt ? t("createdAt", { date: shortDateTime(v.createdAt, locale) }) : "", v.createdBy].filter(Boolean).join(" · ")}
                        </small>
                      </div>
                      <details>
                        <summary>{t("show")}</summary>
                        <Summary s={v.settings} />
                      </details>
                      {!active ? (
                        <div className="dss-acts">
                          {v.status === "draft" ? (
                            <button type="button" className="btn btn--pri btn--sm" onClick={() => setConfirm({ kind: "publish", v })}>
                              {t("publish")}
                            </button>
                          ) : v.status === "published" || v.status === "superseded" || v.status === "archived" ? (
                            <button type="button" className="btn btn--line btn--sm" onClick={() => setConfirm({ kind: "rollback", v })}>
                              {t("rollback")}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState size="sm" icon={<IconFileText />} title={t("noVersions")} text={t("noVersionsText")} />
            )}
          </div>
        </>
      )}

      <Modal
        open={!!confirm}
        onClose={() => (acting ? undefined : setConfirm(null))}
        title={confirm ? t(confirm.kind === "publish" ? "confirmPublish" : "confirmRollback", { n: confirm.v.version ?? "" }) : ""}
        busy={acting}
        footer={
          <>
            <button type="button" className="btn btn--line" onClick={() => setConfirm(null)} disabled={acting}>
              {t("cancel")}
            </button>
            <button type="button" className="btn btn--pri" onClick={() => void act()} disabled={acting}>
              {acting ? t("working") : confirm?.kind === "rollback" ? t("rollback") : t("publish")}
            </button>
          </>
        }
      >
        <p className="dss-confirm">{confirm?.kind === "rollback" ? t("rollbackText") : t("publishText")}</p>
      </Modal>
    </section>
  );
}
