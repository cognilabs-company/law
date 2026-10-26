"use client";

import "./promos.css";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";
import IconButton from "@/components/ui/IconButton";
import { IconArrowRight, IconCalendar, IconCrown, IconHistory, IconInfo, IconMegaphone, IconPause, IconPlay, IconPlus, IconRefresh, IconTag } from "@/components/icons";
import { fmtUzs } from "@/lib/money";
import { dateOnly } from "@/lib/date";
import { toast } from "@/lib/toast";
import { ApiError, asArr, asDict, asStr, errDetail, http, isAborted, isForbidden, logApiError, type Dict } from "@/lib/http";
import { previewStudioDraft } from "@/lib/services/studio";
import { normCtorRecord, type CtorRecord } from "@/components/admin/studio/sx/ctorpage/recordsApi";
import { loadRowPayload, type RowPayload } from "@/components/admin/studio/sx/ctorpage/rowPayloads";
import { sxStatus } from "@/components/admin/studio/sx/status";
import { promoPreviewOf, promoTermsOf, promoTiming, type PromoBackendPreview, type PromoTerms } from "@/components/admin/studio/sx/ctor/mp09";

// Every promotion ("aksiya", TSK-537634) in one place: what it discounts,
// the backend's price per target, the period, how much of its limit is
// used, and where it stands (runtime_status, contract 2026-10-26 §2). A
// running promotion can be paused and resumed here with a reason; creating
// and changing one happens in Studio (constructor MP09).

const CODE = "MP09";
const NEW_HREF = `/admin/studio/o/new?new=${CODE}`;
const ACTION_PREFIX = "/admin/promotion-campaigns/";

type State = "running" | "scheduled" | "ended" | "exhausted" | "open" | "paused" | "pending" | "draft";
type Runtime = { status: string; used: number | null; limit: number | null; remaining: number | null; pausedAt: string; pauseReason: string; pause: string; resume: string };
type Row = { rec: CtorRecord; runtime: Runtime; payload: RowPayload; terms: PromoTerms | null; state: State };
type Filter = "all" | "advertising" | "subscription";

const STATE_ORDER: Record<State, number> = { running: 0, open: 0, scheduled: 1, paused: 2, pending: 3, draft: 4, exhausted: 5, ended: 6 };
const RUNTIME_STATE: Record<string, State> = { active: "running", scheduled: "scheduled", paused: "paused", expired: "ended", exhausted: "exhausted" };

const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const actionUrl = (v: unknown): string => {
  const u = asStr(v).trim();
  return u.startsWith(ACTION_PREFIX) && !u.includes("..") ? u : "";
};

function runtimeOf(raw: Dict): Runtime {
  const a = asDict(raw.actions);
  return {
    status: asStr(raw.runtime_status).toLowerCase(),
    used: numOrNull(raw.used_count),
    limit: numOrNull(raw.usage_limit),
    remaining: numOrNull(raw.remaining),
    pausedAt: asStr(raw.paused_at),
    pauseReason: asStr(raw.pause_reason),
    pause: actionUrl(a.pause),
    resume: actionUrl(a.resume),
  };
}

// The backend's runtime_status once the promotion is published; before
// that, its Studio stage (draft, in approval).
function stateOf(rec: CtorRecord, rt: Runtime, terms: PromoTerms | null, now: number): State {
  const s = sxStatus(rec.status, rec.source);
  if (!s.live && rec.source !== "runtime" && !rt.status) return s.key === "archived" ? "paused" : s.stage >= 1 ? "pending" : "draft";
  if (rt.status && RUNTIME_STATE[rt.status]) return RUNTIME_STATE[rt.status];
  if (s.key === "archived" || s.key === "paused") return "paused";
  if (!terms) return "open";
  const timing = promoTiming(terms, now);
  return timing === "ended" ? "ended" : timing === "scheduled" ? "scheduled" : timing === "running" ? "running" : "open";
}

const editHref = (r: CtorRecord) => (r.source === "studio" && r.studioObjectId ? `/admin/studio/o/${encodeURIComponent(r.studioObjectId)}` : `/admin/studio/c/${CODE}`);

export default function PromotionsAdmin(): ReactElement {
  const t = useTranslations("admin.promos");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const [failure, setFailure] = useState<unknown>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [reload, setReload] = useState(0);
  const [now] = useState(() => Date.now());
  const [acting, setActing] = useState<{ row: Row; kind: "pause" | "resume" } | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    void (async () => {
      try {
        const d = asDict(await http(`/studio/constructors/${CODE}/records?source=all&limit=100&offset=0`, { signal: ctl.signal }));
        const raws = asArr(d.items).map(asDict);
        const recs = raws.map(normCtorRecord);
        const payloads = await Promise.all(recs.map((r) => loadRowPayload(r).catch((): RowPayload => null)));
        if (ctl.signal.aborted) return;
        setRows(
          recs
            .map((rec, i) => {
              const p = payloads[i];
              const terms = p && (p.target_type || p.discount_type) ? promoTermsOf(p) : null;
              const runtime = runtimeOf(raws[i]);
              return { rec, runtime, payload: p, terms, state: stateOf(rec, runtime, terms, now) };
            })
            .filter((r) => r.rec.id),
        );
        setState("ready");
      } catch (e) {
        if (isAborted(e)) return;
        if (isForbidden(e)) return setState("forbidden");
        logApiError("promos.list", e);
        setFailure(e);
        setState("error");
      }
    })();
    return () => ctl.abort();
  }, [reload, now]);

  const shown = useMemo(
    () => (rows ?? []).filter((r) => filter === "all" || r.terms?.targetType === filter).sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.rec.updatedAt.localeCompare(a.rec.updatedAt)),
    [rows, filter],
  );
  const count = (s: State[]) => (rows ?? []).filter((r) => s.includes(r.state)).length;

  return (
    <div className="ppanel prm">
      <header className="prm-hero">
        <span className="prm-hero__ico" aria-hidden="true">
          <IconTag />
        </span>
        <div className="prm-hero__txt">
          <h2>{t("title")}</h2>
          <p>{t("lead")}</p>
        </div>
        <div className="prm-hero__acts">
          <IconButton label={t("refresh")} icon={<IconRefresh />} tipAlign="end" onClick={() => setReload((n) => n + 1)} />
          <Link href={NEW_HREF} className="btn btn--pri btn--sm" data-ai-target="button:new-promotion">
            <IconPlus aria-hidden="true" />
            {t("new")}
          </Link>
        </div>
        <dl className="prm-meta">
          <div data-tone="ok">
            <dt>{t("kpi.running")}</dt>
            <dd>{rows ? count(["running", "open"]) : "—"}</dd>
          </div>
          <div data-tone="info">
            <dt>{t("kpi.scheduled")}</dt>
            <dd>{rows ? count(["scheduled"]) : "—"}</dd>
          </div>
          <div data-tone="warn">
            <dt>{t("kpi.pending")}</dt>
            <dd>{rows ? count(["pending", "draft", "paused"]) : "—"}</dd>
          </div>
          <div>
            <dt>{t("kpi.ended")}</dt>
            <dd>{rows ? count(["ended", "exhausted"]) : "—"}</dd>
          </div>
        </dl>
        <ol className="prm-how" aria-label={t("howTitle")}>
          {(["how1", "how2", "how3"] as const).map((k, i) => (
            <li key={k}>
              <span aria-hidden="true">{i + 1}</span>
              {t(k)}
            </li>
          ))}
        </ol>
      </header>

      <section className="prm-sec" aria-labelledby="prm-list">
        <div className="prm-sec__h">
          <h3 id="prm-list">{t("listTitle")}</h3>
          <div className="prm-seg" role="tablist" aria-label={t("filter")}>
            {(["all", "advertising", "subscription"] as Filter[]).map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>
                {f === "advertising" ? <IconMegaphone aria-hidden="true" /> : f === "subscription" ? <IconCrown aria-hidden="true" /> : null}
                {t(`filters.${f}`)}
              </button>
            ))}
          </div>
        </div>

        {state === "loading" ? (
          <Skeleton rows={4} />
        ) : state === "forbidden" ? (
          <EmptyState icon={<IconTag />} title={t("noAccess")} />
        ) : state === "error" ? (
          <ErrorState error={failure} onRetry={() => setReload((n) => n + 1)} title={t("loadFailed")} compact />
        ) : !shown.length ? (
          <EmptyState
            icon={<IconTag />}
            title={filter === "all" ? t("empty") : t("emptyFilter")}
            text={t("emptyText")}
            action={
              <Link href={NEW_HREF} className="btn btn--pri btn--sm">
                <IconPlus aria-hidden="true" />
                {t("new")}
              </Link>
            }
          />
        ) : (
          <ul className="prm-grid">
            {shown.map((row) => (
              <PromoCard key={`${row.rec.source}:${row.rec.id}`} row={row} onAct={(kind) => setActing({ row, kind })} />
            ))}
          </ul>
        )}
      </section>

      <aside className="prm-rules" aria-labelledby="prm-rules-t">
        <span className="prm-rules__ico" aria-hidden="true">
          <IconInfo />
        </span>
        <div>
          <b id="prm-rules-t">{t("rulesTitle")}</b>
          <ul>
            {(["rule1", "rule2", "rule3", "rule4"] as const).map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        </div>
      </aside>

      {acting ? (
        <PauseDialog
          row={acting.row}
          kind={acting.kind}
          onClose={() => setActing(null)}
          onDone={() => {
            setActing(null);
            setReload((n) => n + 1);
          }}
        />
      ) : null}
    </div>
  );
}

// Backend prices for one card's targets, a few at a time across the page.
const PREVIEW_CONCURRENCY = 3;
let previewRunning = 0;
const previewWaiting: (() => void)[] = [];
function queued<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      previewRunning += 1;
      job()
        .then(resolve, reject)
        .finally(() => {
          previewRunning -= 1;
          previewWaiting.shift()?.();
        });
    };
    if (previewRunning < PREVIEW_CONCURRENCY) run();
    else previewWaiting.push(run);
  });
}

function PromoCard({ row, onAct }: { row: Row; onAct: (kind: "pause" | "resume") => void }): ReactElement {
  const t = useTranslations("admin.promos");
  const ts = useTranslations("studio");
  const locale = useLocale();
  const { rec, runtime: rt, terms, state: st, payload } = row;
  const [preview, setPreview] = useState<PromoBackendPreview | null | "failed">(null);
  const hasTargets = !!terms && terms.targetIds.length > 0 && !!terms.type;

  useEffect(() => {
    if (!hasTargets || !payload) return;
    const ctl = new AbortController();
    queued(() => previewStudioDraft(CODE, payload as Dict, "", ctl.signal)).then(
      (p) => setPreview(promoPreviewOf(p.raw)),
      (e) => {
        if (isAborted(e)) return;
        logApiError("promos.preview", e);
        setPreview("failed");
      },
    );
    return () => ctl.abort();
  }, [hasTargets, payload]);

  const som = (n: number) => `${fmtUzs(n)} ${t("som")}`;
  const info = sxStatus(rec.status, rec.source);
  const studioLabel = info.labelKey && ts.has(info.labelKey) ? ts(info.labelKey) : rec.status;
  const off = terms?.type && terms.value ? (terms.type === "percent" ? `−${terms.value}%` : `−${som(terms.value)}`) : "";
  const period = terms?.startsAt || terms?.endsAt ? [terms.startsAt ? dateOnly(terms.startsAt, locale) : "…", terms.endsAt ? dateOnly(terms.endsAt, locale) : "…"].join(" — ") : t("noPeriod");
  const limit = rt.limit ?? terms?.usageLimit ?? null;
  const used = rt.used;
  const pct = limit && used !== null ? Math.min(100, Math.round((used / limit) * 100)) : null;
  const canPause = !!rt.pause && (st === "running" || st === "scheduled" || st === "open");
  const canResume = !!rt.resume && st === "paused";

  return (
    <li className="prm-card" data-state={st}>
      <div className="prm-card__h">
        <span className="prm-card__ico" aria-hidden="true">
          {terms?.targetType === "subscription" ? <IconCrown /> : <IconMegaphone />}
        </span>
        <span className="prm-card__t">
          <b>{rec.title || t("untitled")}</b>
          <small>
            {terms?.targetType ? t(`filters.${terms.targetType === "subscription" ? "subscription" : "advertising"}`) : t("legacy")} · {studioLabel}
          </small>
        </span>
        {off ? <span className="prm-off">{off}</span> : null}
      </div>
      <span className="prm-state" data-state={st}>
        <i aria-hidden="true" />
        {t(`state.${st}`)}
      </span>
      {st === "paused" && rt.pauseReason ? <p className="prm-paused">{t("pausedWhy", { reason: rt.pauseReason, date: rt.pausedAt ? dateOnly(rt.pausedAt, locale) : "—" })}</p> : null}

      {hasTargets ? (
        <ul className="prm-targets" aria-busy={preview === null || undefined}>
          {preview === null ? (
            terms.targetIds.map((id) => (
              <li key={id}>
                <span className="prm-sk" aria-hidden="true" />
                <span className="prm-sk prm-sk--sm" aria-hidden="true" />
              </li>
            ))
          ) : preview === "failed" ? (
            <li className="prm-targets__err">{t("previewFailed")}</li>
          ) : (
            preview.targets.map((x) => (
              <li key={x.id || x.label}>
                <span>{x.label || t("unknownTarget")}</span>
                <span className="prm-price">
                  {x.finalPrice !== x.basePrice ? <s>{x.basePrice ? som(x.basePrice) : t("free")}</s> : null}
                  <b>{x.finalPrice ? som(x.finalPrice) : t("free")}</b>
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}

      <dl className="prm-facts">
        <div>
          <dt>
            <IconCalendar aria-hidden="true" />
            {t("period")}
          </dt>
          <dd>{period}</dd>
        </div>
        <div>
          <dt>
            <IconHistory aria-hidden="true" />
            {t("limit")}
          </dt>
          <dd>
            {used !== null && limit ? t("usedOf", { used, limit }) : used !== null ? t("usedN", { n: used }) : limit ? t("limitN", { n: limit }) : t("noLimit")}
            {pct !== null ? (
              <i className="prm-bar" data-full={pct >= 100 || undefined} aria-hidden="true">
                <b style={{ width: `${pct}%` }} />
              </i>
            ) : null}
          </dd>
        </div>
      </dl>
      <div className="prm-card__acts">
        <Link href={editHref(rec)} className="prm-open">
          {t("open")}
          <IconArrowRight aria-hidden="true" />
        </Link>
        {canPause ? (
          <button type="button" className="btn btn--line btn--sm" onClick={() => onAct("pause")}>
            <IconPause aria-hidden="true" />
            {t("pause")}
          </button>
        ) : canResume ? (
          <button type="button" className="btn btn--pri btn--sm" onClick={() => onAct("resume")}>
            <IconPlay aria-hidden="true" />
            {t("resume")}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function PauseDialog({ row, kind, onClose, onDone }: { row: Row; kind: "pause" | "resume"; onClose: () => void; onDone: () => void }): ReactElement {
  const t = useTranslations("admin.promos");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ok = reason.trim().length >= 3;
  const url = kind === "pause" ? row.runtime.pause : row.runtime.resume;

  const submit = async () => {
    if (!ok || busy || !url) return;
    setBusy(true);
    setErr("");
    try {
      await http(url, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
      toast(kind === "pause" ? t("pausedToast") : t("resumedToast"), { tone: "ok" });
      onDone();
    } catch (e) {
      logApiError(`promos.${kind}`, e);
      const code = e instanceof ApiError ? (e.code ?? "") : "";
      setErr(code && t.has(`err.${code}`) ? t(`err.${code}`) : errDetail(e) || t("actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={kind === "pause" ? t("pauseTitle", { name: row.rec.title || t("untitled") }) : t("resumeTitle", { name: row.rec.title || t("untitled") })}
      description={kind === "pause" ? t("pauseText") : t("resumeText")}
      size="sm"
      busy={busy}
      dirty={!busy && !!reason.trim()}
      footer={
        <>
          <button type="button" className="btn btn--line" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
          <button type="button" className={`btn ${kind === "pause" ? "prm-danger" : "btn--pri"}`} onClick={() => void submit()} disabled={!ok || busy} aria-busy={busy || undefined}>
            {kind === "pause" ? <IconPause aria-hidden="true" /> : <IconPlay aria-hidden="true" />}
            {kind === "pause" ? t("pause") : t("resume")}
          </button>
        </>
      }
    >
      <label className="prm-field">
        <span>{t("reason")}</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={255} placeholder={kind === "pause" ? t("pauseReasonPh") : t("resumeReasonPh")} aria-invalid={reason && !ok ? true : undefined} />
        <small>{t("reasonHint")}</small>
      </label>
      {err ? (
        <p className="prm-err" role="alert">
          {err}
        </p>
      ) : null}
    </Modal>
  );
}
