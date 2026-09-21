"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { listAdminUsers, type AdminUser } from "@/lib/services/users";
import { useResource } from "@/lib/useResource";
import { sendAdminNotification } from "@/lib/services/notify";
import { NOTIF_ROW_CATEGORIES, type NotifCategory } from "@/lib/notifications";
import { type NotificationDelivery } from "@/lib/services/backend";
import { humanizeSlug } from "@/lib/lawyers";
import Select from "@/components/Select";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton } from "@/components/portal/DataState";
import { DeliveryChips } from "@/components/portal/NotificationsPanel";
import { IconBell, IconCheck, IconSearch, IconSend } from "@/components/icons";

// Role tabs feed GET /admin/users?role=… (backend UserRole values).
const ROLE_TABS = ["all", "client", "yurist", "advokat", "advokat_tashkiloti", "call_center", "sales"] as const;
type RoleTab = (typeof ROLE_TABS)[number];
const CHANNELS = ["push", "telegram", "email", "sms"] as const;
// Parallel sends per batch: enough to be quick, few enough to stay polite.
const CONCURRENCY = 3;

type Recipient = { id: string; name: string };
type RecipientResult = { id: string; name: string; ok: boolean; deliveries: NotificationDelivery[] };
type SendSummary = { results: RecipientResult[]; stopped: boolean };
type SendMode = "individual" | "broadcast";
const BROADCAST_ROLES = ROLE_TABS.filter((r): r is Exclude<RoleTab, "all"> => r !== "all");

export default function AdminNotifications() {
  const t = useTranslations("admin");
  const tn = useTranslations("admin.notifications");
  const tp = useTranslations("portal.notifications");

  const [mode, setMode] = useState<SendMode>("individual");
  const [broadcastRole, setBroadcastRole] = useState<Exclude<RoleTab, "all">>("client");
  const [roleTab, setRoleTab] = useState<RoleTab>("all");
  const [q, setQ] = useState("");
  // Debounced and sent to the backend (GET /admin/users?q=) instead of only
  // filtering whatever page of users the role tab already happened to fetch
  // — a name outside that first batch used to read as "no results" even
  // though the person exists.
  const [qLive, setQLive] = useState("");
  useEffect(() => {
    const h = setTimeout(() => setQLive(q.trim()), 300);
    return () => clearTimeout(h);
  }, [q]);
  const users = useResource(() => listAdminUsers({ role: roleTab === "all" ? undefined : roleTab, q: qLive || undefined }), [roleTab, qLive]);
  // Selection survives role switches so one send can mix roles.
  const [selected, setSelected] = useState<Map<string, AdminUser>>(() => new Map());
  const [manualId, setManualId] = useState("");

  const [category, setCategory] = useState<NotifCategory>("system");
  const [channel, setChannel] = useState<string>("push");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<SendSummary | null>(null);
  const stopRef = useRef(false);

  const selectedInRole = (r: RoleTab) => [...selected.values()].filter((u) => r === "all" || u.role === r).length;

  function toggle(u: AdminUser) {
    setSelected((m) => {
      const next = new Map(m);
      if (next.has(u.id)) next.delete(u.id);
      else next.set(u.id, u);
      return next;
    });
  }
  function selectMany(list: AdminUser[]) {
    setSelected((m) => {
      const next = new Map(m);
      for (const u of list) if (u.id) next.set(u.id, u);
      return next;
    });
  }
  const roleLabel = (r: string) => (tn.has(`roles.${r}`) ? tn(`roles.${r}`) : t.has(`roleBadges.${r}`) ? t(`roleBadges.${r}`) : humanizeSlug(r));
  const userTitle = (u: AdminUser) => u.name || u.phone || u.lexgoId || u.id;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (progress) return;
    if (!title.trim() || !body.trim()) {
      setNote({ ok: false, msg: t("form.error") });
      return;
    }
    // A broadcast reaches an entire role in one shot — a much bigger blast
    // radius than hand-picked recipients, so it gets its own confirmation
    // instead of firing on the same single click.
    if (mode === "broadcast") {
      const roleName = tn(`roles.${broadcastRole}`);
      if (typeof window !== "undefined" && !window.confirm(tn("broadcastConfirm", { role: roleName }))) return;
    }
    setNote(null);
    setSummary(null);
    stopRef.current = false;

    // Broadcast: the backend fans out to the whole role, so one request.
    if (mode === "broadcast") {
      const roleName = tn(`roles.${broadcastRole}`);
      setProgress({ done: 0, total: 1 });
      try {
        const r = await sendAdminNotification({ audienceRole: broadcastRole, channel, title: title.trim(), body: body.trim(), category });
        setProgress(null);
        setSummary({ results: [{ id: broadcastRole, name: roleName, ok: true, deliveries: r.deliveries }], stopped: false });
        setNote({ ok: true, msg: tn("resultOk", { n: 1 }) });
        setTitle("");
        setBody("");
      } catch {
        setProgress(null);
        setSummary({ results: [{ id: broadcastRole, name: roleName, ok: false, deliveries: [] }], stopped: false });
        setNote({ ok: false, msg: t("form.error") });
      }
      return;
    }

    const recipients: Recipient[] = [...selected.values()].map((u) => ({ id: u.id, name: userTitle(u) }));
    const manual = manualId.trim();
    if (manual && !recipients.some((r) => r.id === manual)) recipients.push({ id: manual, name: manual });
    if (!recipients.length) {
      setNote({ ok: false, msg: tn("noRecipients") });
      return;
    }
    const total = recipients.length;
    setProgress({ done: 0, total });
    const results: RecipientResult[] = [];
    let done = 0;
    let idx = 0;
    // Fan out one POST per recipient (the endpoint takes a single user_id),
    // keeping every recipient's own outcome — not just whichever request
    // happened to resolve last — so the result list below can show exactly
    // who it reached and who it didn't.
    const worker = async () => {
      while (!stopRef.current) {
        const i = idx++;
        if (i >= total) return;
        const r = recipients[i];
        try {
          const res = await sendAdminNotification({ userId: r.id, channel, title: title.trim(), body: body.trim(), category });
          results.push({ id: r.id, name: r.name, ok: true, deliveries: res.deliveries });
        } catch {
          results.push({ id: r.id, name: r.name, ok: false, deliveries: [] });
        }
        done += 1;
        setProgress({ done, total });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
    const stopped = stopRef.current && done < total;
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    setProgress(null);
    setSummary({ results, stopped });
    if (stopped) setNote({ ok: failCount === 0, msg: tn("stopped", { done, total }) });
    else if (!failCount) setNote({ ok: true, msg: tn("resultOk", { n: okCount }) });
    else setNote({ ok: false, msg: tn("resultPartial", { ok: okCount, fail: failCount }) });
    if (okCount && !stopped && !failCount) {
      setTitle("");
      setBody("");
      setSelected(new Map());
      setManualId("");
    }
  }

  const catOpts = NOTIF_ROW_CATEGORIES.map((c) => ({ value: c, label: tp(`tabs.${c}`) }));
  const chOpts = CHANNELS.map((c) => ({ value: c, label: t(`notifications.${c}`) }));
  const broadcastRoleOpts = BROADCAST_ROLES.map((r) => ({ value: r, label: tn(`roles.${r}`) }));
  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;

  return (
    <div className="ppanel" style={{ maxWidth: 760 }}>
      <div className="ppanel__h"><b className="ppanel__t"><span className="pico"><IconBell /></span>{t("notifications.title")}</b></div>
      <p className="ppanel__note">{t("notifications.lead")}</p>

      <div className="segs segs--sm" role="tablist" aria-label={tn("mode")} style={{ marginBottom: 14 }}>
        <button type="button" role="tab" className="seg" aria-selected={mode === "individual"} onClick={() => setMode("individual")}>
          {tn("modeIndividual")}
        </button>
        <button type="button" role="tab" className="seg" aria-selected={mode === "broadcast"} onClick={() => setMode("broadcast")}>
          {tn("modeBroadcast")}
        </button>
      </div>

      {mode === "broadcast" ? (
        <section className="nrcp" aria-label={tn("broadcastRole")}>
          <div className="nrcp__lbl">{tn("broadcastRole")}</div>
          <p className="nrcp__hint">{tn("broadcastHint")}</p>
          <Select value={broadcastRole} onChange={(v) => setBroadcastRole(v as Exclude<RoleTab, "all">)} options={broadcastRoleOpts} ariaLabel={tn("broadcastRole")} />
        </section>
      ) : (
      /* Recipients: role tabs → searchable checkbox list (GET /admin/users?role=). */
      <section className="nrcp" aria-label={tn("recipients")}>
        <div className="nrcp__lbl">{tn("recipients")}</div>
        <p className="nrcp__hint">{tn("recipientsHint")}</p>
        <div className="segs segs--sm nrcp__tabs" role="tablist" aria-label={tn("roleTabs")}>
          {ROLE_TABS.map((r) => {
            const n = selectedInRole(r);
            return (
              <button key={r} type="button" role="tab" className="seg" aria-selected={roleTab === r} onClick={() => setRoleTab(r)}>
                {tn(`roles.${r}`)}
                {n ? <span className="ntab__n">{n}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="nrcp__bar">
          <div className="lsearch"><IconSearch /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tn("searchPh")} aria-label={tn("searchPh")} /></div>
          <button className="btn btn--soft btn--sm" type="button" onClick={() => selectMany(users.data)} disabled={!users.data.length}>
            {tn("selectAllRole")}
          </button>
          <button className="btn btn--line btn--sm" type="button" onClick={() => setSelected(new Map())} disabled={!selected.size}>
            {tn("clearSel")}
          </button>
        </div>
        {users.status === "loading" ? (
          <Skeleton rows={3} />
        ) : users.status === "error" ? (
          <Notice ok={false} msg={tn("usersError")} />
        ) : !users.data.length ? (
          <p className="advmuted">{tn("noUsers")}</p>
        ) : (
          <div className="nrcp__list" role="group" aria-label={tn("recipients")}>
            {users.data.map((u) => {
              const on = selected.has(u.id);
              return (
                <label key={u.id} className={`nrcp__row${on ? " on" : ""}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(u)} />
                  <span className="nrcp__cb" aria-hidden><IconCheck /></span>
                  <span className="nrcp__m">
                    <b>{userTitle(u)}</b>
                    <small>{[u.phone, u.lexgoId].filter(Boolean).join(" · ")}</small>
                  </span>
                  <i className="atag atag--muted">{roleLabel(u.role)}</i>
                </label>
              );
            })}
          </div>
        )}
        <div className="nrcp__sum">
          <span>{tn("shownN", { n: users.data.length })}</span>
          <b>{tn("selectedN", { n: selected.size })}</b>
        </div>
        {/* Always available, not only once the list above fails to load —
            the person you need may be outside the roles this list covers,
            or you may already know their id. */}
        <details className="nrcp__manual">
          <summary>{tn("manualId")}</summary>
          <input value={manualId} onChange={(e) => setManualId(e.target.value)} placeholder={tn("manualIdPh")} aria-label={tn("manualId")} />
        </details>
      </section>
      )}

      <form className="cform" style={{ maxWidth: "none" }} onSubmit={send}>
        <div className="cform__row2">
          <div>
            <label>{tn("category")}</label>
            <Select value={category} onChange={(v) => setCategory(v as NotifCategory)} options={catOpts} ariaLabel={tn("category")} />
          </div>
          <div>
            <label>{t("notifications.channel")}</label>
            <Select value={channel} onChange={setChannel} options={chOpts} ariaLabel={t("notifications.channel")} />
          </div>
        </div>
        <p className="advmuted nrcp__catnote">{tn("categoryNote")}</p>
        <div>
          <label>{t("form.title")}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label>{t("notifications.body")}</label>
          <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
        {progress ? (
          <div className="nsend" role="status">
            <span className="nsend__bar"><i style={{ width: `${pct}%` }} /></span>
            <span className="nsend__txt">{tn("progress", { done: progress.done, total: progress.total })}</span>
            <button type="button" className="btn btn--line btn--sm" onClick={() => { stopRef.current = true; }}>{tn("stop")}</button>
          </div>
        ) : null}
        <div>
          <button className="btn btn--pri" type="submit" disabled={!!progress}>
            <IconSend />
            {progress ? t("notifications.sending") : t("notifications.send")}
          </button>
        </div>
      </form>

      {summary?.results.length ? (
        <div className="nsend__results">
          <div className="ppanel__h" style={{ marginTop: 18 }}>
            <b className="ppanel__t">{tn("resultsTitle")}</b>
            <span className="advmuted">{tn("resultsCount", { ok: summary.results.filter((r) => r.ok).length, total: summary.results.length })}</span>
          </div>
          <div className="alist">
            {summary.results.map((r) => (
              <div className="aitem" key={r.id}>
                <div className="aitem__m">
                  <b>{r.name}</b>
                  {r.ok && r.deliveries.length ? <DeliveryChips items={r.deliveries} /> : null}
                </div>
                <em className={`atag${r.ok ? " atag--ok" : " atag--err"}`}>{r.ok ? tn("sent") : tn("sendFailed")}</em>
              </div>
            ))}
          </div>
          {summary.results.some((r) => r.ok && r.deliveries.some((x) => x.tone === "pending")) ? (
            <p className="advmuted" style={{ marginTop: 8 }}>{t("notifications.queuedNote")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
