"use client";

import "@/components/remoteAssist/remoteAssist.css";
import "./raAdmin.css";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RA_EMPTY_META, emergencyRevokeRemoteAssist, listRaSessions, loadRaMeta, raAudit, raErrorCode, raMonitoring, type RaAudit, type RaMeta, type RaMonitoring, type RaSession } from "@/lib/services/remoteAssist";
import { errorText } from "@/lib/errorText";
import { toast } from "@/lib/toast";
import { isForbidden, parseServerTime } from "@/lib/http";
import { shortDateTime, fmtInt } from "@/lib/date";
import Modal from "@/components/admin/Modal";
import { Skeleton, EmptyState, ErrorState } from "@/components/portal/DataState";
import { RaAuditList } from "@/components/remoteAssist/RaConsole";
import { IconAlert, IconChevronDown, IconClock, IconHistory, IconLock, IconMonitor, IconPause, IconRefresh, IconSearch, IconShield, IconUser, IconCircleX, IconCheck } from "@/components/icons";

// Supervisor view of remote assistance (contract §16): monitoring counters,
// live session summaries, the filterable session table, each session's audit
// timeline, and emergency revoke behind a confirmation with a required reason.

const STATUSES = ["", "pending_consent", "active", "paused", "denied", "revoked", "ended", "expired"] as const;
const PAGE = 50;

const TONE: Record<string, "ok" | "warn" | "bad" | "muted"> = {
  active: "ok",
  pending_consent: "warn",
  paused: "warn",
  denied: "bad",
  revoked: "bad",
  emergency_revoked: "bad",
  ended: "muted",
  expired: "muted",
};
const TAG: Record<string, string> = { ok: "live", warn: "wait", bad: "off", muted: "line" };

type Filters = { status: string; ticketId: string; operatorUserId: string; clientUserId: string };
const NO_FILTERS: Filters = { status: "", ticketId: "", operatorUserId: "", clientUserId: "" };

export default function RemoteAssistAdmin() {
  const t = useTranslations("remoteAssist");
  const locale = useLocale();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  const [offset, setOffset] = useState(0);
  const [mon, setMon] = useState<{ state: "loading" | "ready" | "error"; data: RaMonitoring | null }>({ state: "loading", data: null });
  // `key` is the query the list answers; a different key means it is loading.
  const [list, setList] = useState<{ key: string; state: "ready" | "error"; items: RaSession[]; count: number; error?: unknown } | null>(null);
  const [open, setOpen] = useState("");
  const [revoking, setRevoking] = useState<RaSession | null>(null);
  const [reload, setReload] = useState(0);
  const [meta, setMeta] = useState<RaMeta>(RA_EMPTY_META);
  const [denied, setDenied] = useState(false);

  // What this person may do here comes from the backend's capabilities.
  useEffect(() => {
    void loadRaMeta().then(setMeta);
  }, []);
  const canSupervise = meta.capabilities.supervise === true;
  const canRevoke = meta.capabilities.emergency_revoke === true;
  const allowed = !meta.loaded || canSupervise || canRevoke;

  useEffect(() => {
    if (!allowed) return;
    const c = new AbortController();
    raMonitoring(c.signal)
      .then((data) => setMon({ state: "ready", data }))
      .catch((e) => {
        if (c.signal.aborted) return;
        if (isForbidden(e)) setDenied(true);
        setMon((cur) => ({ state: "error", data: cur.data }));
      });
    return () => c.abort();
  }, [reload, allowed]);

  const listKey = `${JSON.stringify(filters)}|${offset}|${reload}`;
  useEffect(() => {
    if (!allowed) return;
    const c = new AbortController();
    listRaSessions({ ...filters, limit: PAGE, offset }, c.signal)
      .then((r) => setList({ key: listKey, state: "ready", items: r.items, count: r.count }))
      .catch((e) => {
        if (c.signal.aborted) return;
        if (isForbidden(e)) setDenied(true);
        setList({ key: listKey, state: "error", items: [], count: 0, error: e });
      });
    return () => c.abort();
  }, [filters, offset, listKey, allowed]);
  const listLoading = !list || list.key !== listKey;
  const items = list?.items ?? [];
  const count = list?.count ?? 0;

  // Live counters move by the second; refresh while the page is visible.
  useEffect(() => {
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") setReload((n) => n + 1);
    }, 20_000);
    return () => clearInterval(iv);
  }, []);

  const statusLabel = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : s.replace(/_/g, " "));
  const modeLabel = (m: string) => (t.has(`modes.${m}.title`) ? t(`modes.${m}.title`) : m);
  const m = mon.data;
  const tiles = [
    { key: "active", value: m?.active, tone: "ok", Icon: IconMonitor },
    { key: "pendingConsent", value: m?.pendingConsent, tone: "warn", Icon: IconClock },
    { key: "paused", value: m?.paused, tone: "warn", Icon: IconPause },
    { key: "todayTotal", value: m?.todayTotal, tone: "", Icon: IconCheck },
    { key: "todayRejected", value: m?.todayRejectedCommands, tone: "bad", Icon: IconCircleX },
  ];
  const apply = () => {
    setOffset(0);
    setFilters({ ...draft, ticketId: draft.ticketId.trim(), operatorUserId: draft.operatorUserId.trim(), clientUserId: draft.clientUserId.trim() });
  };

  if (denied || !allowed) {
    return (
      <div className="raa">
        <EmptyState icon={<IconLock />} title={t("admin.noAccess")} text={t("admin.noAccessText")} />
      </div>
    );
  }

  return (
    <div className="raa">
      <section className="raa-hero">
        <span className="raa-hero__ico" aria-hidden="true">
          <IconMonitor />
        </span>
        <div className="raa-hero__txt">
          <h2>{t("admin.title")}</h2>
          <p>{t("admin.lead")}</p>
        </div>
        <button type="button" className="btn btn--line btn--sm raa-hero__re" onClick={() => setReload((n) => n + 1)}>
          <IconRefresh aria-hidden="true" />
          {t("admin.refresh")}
        </button>
        <dl className="raa-tiles">
          {tiles.map((c) => (
            <div key={c.key} data-tone={c.tone}>
              <dt>
                <c.Icon aria-hidden="true" />
                {t(`admin.count.${c.key}`)}
              </dt>
              <dd>{mon.state === "loading" && !m ? <span className="raa-ghost" /> : c.value === undefined ? "—" : fmtInt(c.value, locale)}</dd>
            </div>
          ))}
        </dl>
        {mon.state === "error" ? <p className="raa-muted">{t("admin.monitoringFailed")}</p> : null}
      </section>

      {m?.sessions.length ? (
        <section className="raa-card">
          <h3 className="raa-h">
            <span className="raa-dot raa-dot--ok" aria-hidden="true" /> {t("admin.liveNow")}
          </h3>
          <ul className="raa-live">
            {m.sessions.map((s) => (
              <li key={s.id}>
                <span className="raa-live__who">
                  <b>{s.client.name || s.client.lexgoId || "—"}</b>
                  <small>{t("admin.byOperator", { name: s.operator.name || s.operator.lexgoId || "—" })}</small>
                </span>
                <span className="ra-tag ra-tag--soft">{modeLabel(s.mode)}</span>
                <span className={`ra-tag ra-tag--${TAG[TONE[s.status] ?? "muted"]}`}>{statusLabel(s.status)}</span>
                {s.currentPageId ? <code className="raa-mono">{s.currentPageId}</code> : null}
                {canRevoke ? (
                  <button type="button" className="btn btn--sm raa-revoke__btn" onClick={() => setRevoking(s)}>
                    <IconShield aria-hidden="true" />
                    {t("admin.revoke")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="raa-card">
        <div className="raa-filters">
          <div className="raa-seg" role="tablist" aria-label={t("admin.status")}>
            {STATUSES.map((s) => (
              <button
                key={s || "all"}
                type="button"
                role="tab"
                aria-selected={filters.status === s}
                className={filters.status === s ? "on" : ""}
                onClick={() => {
                  setOffset(0);
                  setDraft((d) => ({ ...d, status: s }));
                  setFilters((f) => ({ ...f, status: s }));
                }}
              >
                {s ? statusLabel(s) : t("admin.all")}
              </button>
            ))}
          </div>
          <form
            className="raa-search"
            onSubmit={(e) => {
              e.preventDefault();
              apply();
            }}
          >
            <IconSearch aria-hidden="true" />
            <input value={draft.ticketId} onChange={(e) => setDraft((d) => ({ ...d, ticketId: e.target.value }))} placeholder={t("admin.ticketPh")} aria-label={t("admin.ticket")} />
            <input value={draft.operatorUserId} onChange={(e) => setDraft((d) => ({ ...d, operatorUserId: e.target.value }))} placeholder={t("admin.operatorPh")} aria-label={t("admin.operator")} />
            <input value={draft.clientUserId} onChange={(e) => setDraft((d) => ({ ...d, clientUserId: e.target.value }))} placeholder={t("admin.clientPh")} aria-label={t("admin.client")} />
            <button type="submit" className="btn btn--line btn--sm">
              {t("admin.apply")}
            </button>
          </form>
        </div>

        {listLoading && !items.length ? (
          <Skeleton rows={5} />
        ) : list?.state === "error" ? (
          <ErrorState error={list.error} onRetry={() => setReload((n) => n + 1)} />
        ) : !items.length ? (
          <EmptyState icon={<IconMonitor />} title={t("admin.empty")} text={t("admin.emptyText")} />
        ) : (
          <ul className="raa-list">
            {items.map((s) => (
              <Row key={s.id} s={s} open={open === s.id} onToggle={() => setOpen((cur) => (cur === s.id ? "" : s.id))} onRevoke={canRevoke ? () => setRevoking(s) : undefined} statusLabel={statusLabel} modeLabel={modeLabel} locale={locale} />
            ))}
          </ul>
        )}

        {count > PAGE ? (
          <div className="raa-pager">
            <button type="button" className="btn btn--line btn--sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>
              {t("admin.prev")}
            </button>
            <span>
              {offset + 1}–{Math.min(offset + PAGE, count)} / {count}
            </span>
            <button type="button" className="btn btn--line btn--sm" disabled={offset + PAGE >= count} onClick={() => setOffset((o) => o + PAGE)}>
              {t("admin.next")}
            </button>
          </div>
        ) : null}
      </section>

      {revoking ? (
        <RevokeDialog
          s={revoking}
          onClose={() => setRevoking(null)}
          onDone={() => {
            setRevoking(null);
            setReload((n) => n + 1);
          }}
        />
      ) : null}
    </div>
  );
}

function Row({
  s,
  open,
  onToggle,
  onRevoke,
  statusLabel,
  modeLabel,
  locale,
}: {
  s: RaSession;
  open: boolean;
  onToggle: () => void;
  onRevoke?: () => void;
  statusLabel: (s: string) => string;
  modeLabel: (m: string) => string;
  locale: string;
}) {
  const t = useTranslations("remoteAssist");
  const [audit, setAudit] = useState<RaAudit[] | null>(null);
  const liveNow = s.phase !== "closed";
  const tone = TONE[s.status] ?? (liveNow ? "ok" : "muted");

  const loadAudit = useCallback(() => {
    raAudit(s.id)
      .then(setAudit)
      .catch(() => setAudit([]));
  }, [s.id]);
  useEffect(() => {
    if (open && audit === null) loadAudit();
  }, [open, audit, loadAudit]);

  const exp = s.expiresAt ? parseServerTime(s.expiresAt) : NaN;

  return (
    <li className={`raa-row${open ? " open" : ""}`}>
      <button type="button" className="raa-row__head" onClick={onToggle} aria-expanded={open}>
        <span className={`raa-dot raa-dot--${tone}`} aria-hidden="true" />
        <span className="raa-row__who">
          <b>
            <IconUser aria-hidden="true" /> {s.client.name || s.client.lexgoId || s.client.id || "—"}
          </b>
          <small>
            {t("admin.byOperator", { name: s.operator.name || s.operator.lexgoId || "—" })}
            {s.createdAt ? ` · ${shortDateTime(s.createdAt, locale)}` : ""}
          </small>
        </span>
        <span className="ra-tag ra-tag--soft">{modeLabel(s.mode)}</span>
        <span className={`ra-tag ra-tag--${TAG[tone]}`}>{statusLabel(s.status || s.phase)}</span>
        <IconChevronDown className="raa-row__chev" aria-hidden="true" />
      </button>
      {open ? (
        <div className="raa-row__body">
          <dl className="raa-kv">
            <div>
              <dt>{t("admin.reason")}</dt>
              <dd>{s.reason || "—"}</dd>
            </div>
            <div>
              <dt>{t("admin.requested")}</dt>
              <dd>{s.requestedScopes.map((x) => (t.has(`scopes.${x}`) ? t(`scopes.${x}`) : x)).join(", ") || "—"}</dd>
            </div>
            <div>
              <dt>{t("admin.granted")}</dt>
              <dd>{s.grantedScopes.map((x) => (t.has(`scopes.${x}`) ? t(`scopes.${x}`) : x)).join(", ") || "—"}</dd>
            </div>
            <div>
              <dt>{t("admin.ticket")}</dt>
              <dd className="raa-mono">{s.ticketId || "—"}</dd>
            </div>
            <div>
              <dt>{t("admin.call")}</dt>
              <dd className="raa-mono">{s.callId || "—"}</dd>
            </div>
            <div>
              <dt>{t("admin.page")}</dt>
              <dd className="raa-mono">{s.currentPageId ? `${s.currentPageId} · ${s.currentRoute} · r${s.clientUiRevision}` : "—"}</dd>
            </div>
            <div>
              <dt>{t("admin.expires")}</dt>
              <dd>{Number.isFinite(exp) ? shortDateTime(s.expiresAt, locale) : "—"}</dd>
            </div>
            {s.endReason ? (
              <div>
                <dt>{t("admin.endReason")}</dt>
                <dd>{s.endReason}</dd>
              </div>
            ) : null}
          </dl>

          {liveNow && onRevoke ? (
            <div className="raa-revoke">
              <IconAlert aria-hidden="true" />
              <span>{t("admin.revokeHint")}</span>
              <button type="button" className="btn btn--sm raa-revoke__btn" onClick={onRevoke}>
                <IconShield aria-hidden="true" />
                {t("admin.revoke")}
              </button>
            </div>
          ) : null}

          <div className="raa-audit">
            <b>
              <IconHistory aria-hidden="true" /> {t("op.tab.audit")}
            </b>
            <RaAuditList audit={audit} />
          </div>
        </div>
      ) : null}
    </li>
  );
}

function RevokeDialog({ s, onClose, onDone }: { s: RaSession; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("remoteAssist");
  const tc = useTranslations("common");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ok = reason.trim().length >= 3;

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setErr("");
    try {
      await emergencyRevokeRemoteAssist(s.id, reason.trim());
      toast(t("admin.revokedToast"), { tone: "ok" });
      onDone();
    } catch (e) {
      const code = raErrorCode(e);
      setErr(code && t.has(`errors.${code}`) ? t(`errors.${code}`) : errorText(e, tc) || t("admin.revokeFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t("admin.revokeTitle")}
      description={t("admin.revokeText", { client: s.client.name || "—", operator: s.operator.name || "—" })}
      size="sm"
      busy={busy}
      dirty={!busy && Boolean(reason.trim())}
      footer={
        <>
          <button className="btn btn--line" type="button" disabled={busy} onClick={onClose}>
            {t("admin.cancel")}
          </button>
          <button className="btn raa-revoke__btn" type="button" disabled={!ok || busy} aria-busy={busy || undefined} onClick={() => void submit()}>
            <IconShield aria-hidden="true" />
            {t("admin.revoke")}
          </button>
        </>
      }
    >
      <label className="ra-field">
        <span>{t("admin.revokeReason")}</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={255} placeholder={t("admin.revokeReasonPh")} required aria-invalid={reason && !ok ? true : undefined} />
      </label>
      {err ? (
        <p className="ra-err" role="alert">
          {err}
        </p>
      ) : null}
    </Modal>
  );
}
