"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { subscribeUserEvents } from "@/lib/userSocket";
import { canInternal } from "@/lib/services/internalHrm";
import { FEEDBACK_STATUSES, FEEDBACK_TYPES, getFeedback, updateFeedback, type Feedback } from "@/lib/services/internalLive";
import Select from "@/components/Select";
import InternalField from "@/components/internal/InternalField";
import { IconCheck, IconInbox, IconLightbulb, IconPlus, IconRefresh } from "@/components/icons";
import { EntitySelect, HrmDrawer, HrmEmpty, HrmError, HrmHead, HrmKv, HrmLoading, HrmPanel, HrmSection, useHrmFormat } from "@/components/internal/HrmUi";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { ObjectLink, apiMessage } from "@/components/internal/live/bits";
import FeedbackDialog from "./FeedbackDialog";

type View = "mine" | "all";

// "Tizim bo'yicha murojaatlar" (guide §15): each employee's own bugs and
// suggestions with their status; admins see everything, filter by status and
// type, assign and resolve.
export default function FeedbackPage() {
  const t = useTranslations("internal.feedback");
  const f = useHrmFormat();
  const { session } = useAuth();
  const pathname = usePathname();
  const admin = canInternal(session, "internal_hr.manage") || canInternal(session, "internal_org.manage");
  const [view, setView] = useState<View>(admin ? "all" : "mine");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ key: string; rows: Feedback[]; err: string } | null>(null);
  const [noAll, setNoAll] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState("");
  const shownView: View = noAll ? "mine" : view;
  const key = `${shownView}|${status}|${type}|${tick}`;

  useEffect(() => {
    const c = new AbortController();
    getFeedback(shownView === "mine" ? { mine: true, status: status || undefined, type: type || undefined } : { status: status || undefined, type: type || undefined }, c.signal)
      .then((rows) => !c.signal.aborted && setState({ key, rows, err: "" }))
      .catch((e) => {
        if (c.signal.aborted) return;
        if (shownView === "all" && e instanceof ApiError && e.status === 403) setNoAll(true);
        setState({ key, rows: [], err: apiMessage(e, t("loadError")) });
      });
    return () => c.abort();
  }, [key, shownView, status, type, t]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => subscribeUserEvents((e) => /feedback/.test(e.event) && reload()), [reload]);

  const rows = state?.key === key ? state.rows : null;
  const err = state?.key === key ? state.err : "";
  const open = rows?.find((r) => r.id === openId) ?? null;

  return (
    <section className="hrm-page">
      <HrmHead
        kicker={t("kicker")}
        title={t("title")}
        lead={t("lead")}
        actions={
          <>
            <button className="btn btn--line btn--sm" type="button" onClick={reload}>
              <IconRefresh />
              {t("refresh")}
            </button>
            <button className="btn btn--pri btn--sm" type="button" onClick={() => setCreating(true)}>
              <IconPlus />
              {t("new")}
            </button>
          </>
        }
      />
      <div className="fb-bar">
        {admin && !noAll ? (
          <div className="hrm-tabs" role="tablist">
            {(["all", "mine"] as View[]).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
                {t(`views.${v}`)}
              </button>
            ))}
          </div>
        ) : null}
        <div className="fb-bar__sel">
          <Select value={status} onChange={setStatus} options={[{ value: "", label: t("allStatuses") }, ...FEEDBACK_STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))]} ariaLabel={t("status")} />
        </div>
        <div className="fb-bar__sel">
          <Select value={type} onChange={setType} options={[{ value: "", label: t("allTypes") }, ...FEEDBACK_TYPES.map((s) => ({ value: s, label: t(`types.${s}`) }))]} ariaLabel={t("type")} />
        </div>
      </div>
      {err ? <HrmError text={err} onRetry={reload} retryLabel={t("refresh")} /> : null}
      <HrmPanel flush>
        {!rows ? (
          <div style={{ padding: 16 }}>
            <HrmLoading rows={4} />
          </div>
        ) : rows.length ? (
          <ul className="fb-list">
            {rows.map((r) => (
              <li key={r.id}>
                <button type="button" className="fb-item" onClick={() => setOpenId(r.id)}>
                  <span className={`fb-type fb-type--${r.type} on`}>{t(`types.${r.type}`)}</span>
                  <span className="fb-item__t">
                    <b>{r.title}</b>
                    <small>{[r.module, r.author, r.createdAt ? f.dateTime(r.createdAt) : ""].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span className={`fb-sev fb-sev--${r.severity}`}>{t(`severities.${r.severity}`)}</span>
                  <FeedbackStatus value={r.status} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <HrmEmpty
            icon={IconInbox}
            title={shownView === "mine" ? t("emptyMine") : t("emptyAll")}
            text={t("emptyText")}
            action={
              <button className="btn btn--pri btn--sm" type="button" onClick={() => setCreating(true)}>
                <IconLightbulb />
                {t("new")}
              </button>
            }
          />
        )}
      </HrmPanel>
      {creating ? <FeedbackDialog open onClose={() => setCreating(false)} context={{ path: pathname, search: "" }} onSent={reload} /> : null}
      {open ? <FeedbackDrawer item={open} admin={admin && shownView === "all"} onClose={() => setOpenId("")} onSaved={reload} /> : null}
    </section>
  );
}

function FeedbackStatus({ value }: { value: string }) {
  const t = useTranslations("internal.feedback");
  const tone = value === "resolved" || value === "closed" ? "ok" : value === "rejected" ? "err" : value === "in_progress" || value === "triaged" ? "info" : "warn";
  return <span className={`hrm-st hrm-st--${tone}`}>{t.has(`statuses.${value}`) ? t(`statuses.${value}`) : value}</span>;
}

function FeedbackDrawer({ item, admin, onClose, onSaved }: { item: Feedback; admin: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("internal.feedback");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const [form, setForm] = useState({ status: item.status, assignee: item.assigneeUserId, resolution: item.resolution });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    setSaved(false);
    try {
      await updateFeedback(item.id, { status: form.status, assignee_user_id: form.assignee || null, resolution: form.resolution.trim() || null });
      setSaved(true);
      onSaved();
    } catch (cause) {
      setErr(apiMessage(cause, t("error")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <HrmDrawer open onClose={onClose} title={item.title} sub={[t(`types.${item.type}`), t(`severities.${item.severity}`)].join(" · ")}>
      <div className="hrm-chips">
        <FeedbackStatus value={item.status} />
        {item.module ? <span className="hrm-chip">{item.module}</span> : null}
      </div>
      <HrmSection label={t("description")}>
        <p className="fb-text">{item.description}</p>
      </HrmSection>
      {item.expected || item.actual ? (
        <HrmKv
          rows={[
            { label: t("expected"), value: item.expected },
            { label: t("actual"), value: item.actual },
          ]}
        />
      ) : null}
      {item.steps.length ? (
        <HrmSection label={t("steps")}>
          <ol className="fb-steps fb-steps--ro">
            {item.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </HrmSection>
      ) : null}
      <HrmSection label={t("context")}>
        <HrmKv
          rows={[
            { label: t("page"), value: item.pageUrl ? <ObjectLink href={item.pageUrl}>{item.pageUrl}</ObjectLink> : "—" },
            { label: t("object"), value: item.entityId ? `${item.entityType} · ${item.entityId.slice(0, 8)}` : "—" },
            { label: t("author"), value: item.author || "—" },
            { label: t("created"), value: f.dateTime(item.createdAt) },
          ]}
        />
      </HrmSection>
      {!admin && item.resolution ? (
        <HrmSection label={t("resolution")}>
          <p className="fb-text">{item.resolution}</p>
        </HrmSection>
      ) : null}
      {admin ? (
        <form className="hrm-form" onSubmit={submit}>
          <div className="hrm-form__grid">
            <InternalField label={t("status")}>
              <Select value={form.status} onChange={(v) => setForm((c) => ({ ...c, status: v }))} options={FEEDBACK_STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))} ariaLabel={t("status")} />
            </InternalField>
            <InternalField label={t("assignee")}>
              <EntitySelect value={form.assignee} onChange={(v) => setForm((c) => ({ ...c, assignee: v }))} options={dir.userOptions} placeholder={t("noAssignee")} ariaLabel={t("assignee")} />
            </InternalField>
            <InternalField label={t("resolution")}>
              <textarea value={form.resolution} onChange={(e) => setForm((c) => ({ ...c, resolution: e.target.value }))} rows={3} maxLength={2000} placeholder={t("resolutionPh")} />
            </InternalField>
          </div>
          {err ? <HrmError text={err} /> : saved ? <p className="hrm-form__note">{t("saved")}</p> : null}
          <div className="hrm-form__foot">
            <button className="btn btn--pri btn--sm" type="submit" disabled={busy}>
              <IconCheck />
              {busy ? t("saving") : t("save")}
            </button>
          </div>
        </form>
      ) : null}
    </HrmDrawer>
  );
}
