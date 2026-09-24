"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { listAuditTrail, exportAuditTrailCsv, listAdminSecurityEvents, searchUsers, type ActivityEntry, type AuditFilters, type ModuleRecord } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import Select from "@/components/Select";
import SearchSelect from "@/components/SearchSelect";
import { ApiError, parseServerTime } from "@/lib/http";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { Notice } from "@/components/admin/AdminBits";
import DatePicker from "@/components/DatePicker";
import { IconShieldCheck, IconLock, IconCheck, IconClipboardCheck, IconDownload, IconSearch } from "@/components/icons";
import { dateTimeFull } from "@/lib/date";

type TextFilters = Required<Pick<AuditFilters, "userId" | "action" | "targetType" | "targetId">>;
const NO_TEXT: TextFilters = { userId: "", action: "", targetType: "", targetId: "" };
// userId is picked via SearchSelect (search by name/phone, not typed as a raw
// id) — kept out of this generic text-input loop, but still lands in the same
// `draft.userId`/`applied.userId` string the rest of the filter plumbing uses.
const TEXT_KEYS = ["action", "targetType", "targetId"] as const;
const isForbidden = (e: unknown) => e instanceof ApiError && e.status === 403;

function fmt(s: string, locale: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : dateTimeFull(s, locale);
}

type ChainState = "linked" | "linkedFar" | "outside" | "genesis" | "none";
const normHash = (h?: string) => (h ?? "").trim().toLowerCase();
const isGenesis = (h: string) => !h || /^0+$/.test(h) || h === "genesis";
const shortHash = (h: string) => (h.length > 12 ? `${h.slice(0, 10)}…` : h);

// Chain continuity as far as this list can show it. It only confirms that a
// row's previous_hash equals the event_hash of another row actually received;
// hashes are never recomputed, so a missing link means "not verifiable in this
// view" (date filter, paging, a record outside the list), never "tampered".
function chainStates(rows: ActivityEntry[]) {
  const ev = rows.map((r) => normHash(r.eventHash));
  const prev = rows.map((r) => normHash(r.previousHash));
  // The list order isn't documented: pick the direction whose neighbours link
  // more often, and fall back to the timestamps on a tie.
  let down = 0;
  let up = 0;
  prev.forEach((p, i) => {
    if (!p) return;
    if (i + 1 < rows.length && p === ev[i + 1]) down++;
    if (i > 0 && p === ev[i - 1]) up++;
  });
  let newestFirst = down >= up;
  if (down === up && rows.length > 1) {
    const first = parseServerTime(rows[0].createdAt);
    const last = parseServerTime(rows[rows.length - 1].createdAt);
    if (Number.isFinite(first) && Number.isFinite(last)) newestFirst = first >= last;
  }
  // How many rows carry each event hash (per-user chains and interleaved
  // writers link to rows that aren't adjacent).
  const counts = new Map<string, number>();
  for (const h of ev) if (h) counts.set(h, (counts.get(h) ?? 0) + 1);
  const states: ChainState[] = rows.map((_, i) => {
    if (!ev[i]) return "none";
    if (isGenesis(prev[i])) return "genesis";
    const j = newestFirst ? i + 1 : i - 1;
    if (j >= 0 && j < rows.length && ev[j] === prev[i]) return "linked";
    const others = (counts.get(prev[i]) ?? 0) - (ev[i] === prev[i] ? 1 : 0);
    return others > 0 ? "linkedFar" : "outside";
  });
  const count = (...s: ChainState[]) => states.filter((x) => s.includes(x)).length;
  const hashed = rows.length - count("none");
  return { states, hashed, linked: count("linked", "linkedFar"), total: hashed - count("genesis") };
}

// T3-10: anomaly alerts (suspicious logins etc.) from /admin/security-events.
// `onReady` fires once, the first time this panel's own fetch settles — the
// page below uses it (together with the main audit list's own first load)
// to hold a single skeleton until everything is ready, instead of each
// panel popping in on its own.
function Anomalies({ onReady }: { onReady?: () => void }) {
  const locale = useLocale();
  const t = useTranslations("admin.audit.anomalies");
  const [status, setStatus] = useState("all");
  const res = useResource(() => listAdminSecurityEvents(status === "all" ? undefined : status), [status]);
  const firedRef = useRef(false);
  useEffect(() => {
    if (res.status === "loading" || firedRef.current) return;
    firedRef.current = true;
    onReady?.();
  }, [res.status, onReady]);
  const opts = ["all", "new", "reviewed", "resolved"].map((s) => ({ value: s, label: t(`status.${s}`) }));
  const rows: ModuleRecord[] = res.data;
  const label = (r: ModuleRecord) => (t.has(`types.${r.recordType}`) ? t(`types.${r.recordType}`) : r.title || r.recordType);
  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="audit__hact">
          <span className="advmuted">{res.status === "ready" ? rows.length : ""}</span>
          <Select value={status} onChange={setStatus} options={opts} ariaLabel={t("filter")} />
        </span>
      </div>
      <p className="ppanel__note">{t("lead")}</p>
      {res.status === "loading" ? (
        <Skeleton rows={2} />
      ) : res.status === "error" ? (
        <Notice ok={false} msg={t("error")} />
      ) : !rows.length ? (
        <EmptyState icon={<IconShieldCheck />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="alist">
          {rows.slice(0, 50).map((r) => {
            const p = r.payload as Record<string, unknown>;
            const meta = [p.previous_ip && p.current_ip ? `${String(p.previous_ip)} → ${String(p.current_ip)}` : "", r.ownerUserId ? `user ${r.ownerUserId.slice(0, 8)}…` : "", fmt(r.createdAt, locale)].filter(Boolean).join(" · ");
            return (
              <div className="aitem" key={r.id}>
                <div className="aitem__m">
                  <b>{label(r)}</b>
                  <span className="aitem__meta">{meta}</span>
                </div>
                <div className="aitem__r"><em className={`atag${r.status === "new" ? "" : " atag--muted"}`}>{t.has(`status.${r.status}`) ? t(`status.${r.status}`) : r.status}</em></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminAuditTrail() {
  const t = useTranslations("admin.audit");
  const locale = useLocale();
  const tc = useTranslations("chart");
  const tp = useTranslations("portal.common");
  // Date range (YYYY-MM-DD) applies at once; the text filters (user, action,
  // target type/id) apply on submit → GET /admin/audit-trail?…
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [draft, setDraft] = useState<TextFilters>(NO_TEXT);
  const [applied, setApplied] = useState<TextFilters>(NO_TEXT);
  const filters: AuditFilters = { dateFrom: from, dateTo: to, ...applied };
  const filterKey = JSON.stringify(filters);
  const [res, setRes] = useState<{ key: string; status: "ready" | "error" | "forbidden"; data: ActivityEntry[] } | null>(null);
  const current = res && res.key === filterKey ? res : null;
  useEffect(() => {
    let alive = true;
    const f = JSON.parse(filterKey) as AuditFilters;
    listAuditTrail(f)
      .then((data) => alive && setRes({ key: filterKey, status: "ready", data }))
      .catch((e) => alive && setRes({ key: filterKey, status: isForbidden(e) ? "forbidden" : "error", data: [] }));
    return () => {
      alive = false;
    };
  }, [filterKey]);
  const rows = useMemo(() => current?.data ?? [], [current]);
  const chain = useMemo(() => chainStates(rows), [rows]);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const hasText = applied.userId || draft.userId || TEXT_KEYS.some((k) => applied[k] || draft[k]);

  function apply(e: FormEvent) {
    e.preventDefault();
    setApplied({ userId: draft.userId.trim(), action: draft.action.trim(), targetType: draft.targetType.trim(), targetId: draft.targetId.trim() });
  }
  function resetText() {
    setDraft(NO_TEXT);
    setApplied(NO_TEXT);
  }

  // CSV of the filtered rows (GET …?export=csv, users.manage; the export itself is logged).
  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    setExportNote(null);
    try {
      const blob = await exportAuditTrailCsv(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lexgo-audit-trail.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setExportNote(isForbidden(e) ? t("forbiddenText") : t("exportError"));
    } finally {
      setExporting(false);
    }
  }
  const [copied, setCopied] = useState<string | null>(null);

  // Anomalies and the main log are two independently-fetched panels; without
  // this the page used to visibly assemble in two steps (whichever resolves
  // first pops in while the other still shows its own skeleton). Both stay
  // mounted throughout — so their fetches always run — but are hidden behind
  // one shared skeleton until each has settled at least once; after that,
  // each panel's own later refetches (e.g. changing a filter) behave exactly
  // as before.
  const [anomReady, setAnomReady] = useState(false);
  const handleAnomReady = useCallback(() => setAnomReady(true), []);
  const pageReady = anomReady && current !== null;

  function copy(key: string, hash: string) {
    navigator.clipboard?.writeText(hash).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  }

  return (
    <>
    {!pageReady ? (
      <div className="ppanel">
        <Skeleton rows={6} />
      </div>
    ) : null}
    <div style={pageReady ? undefined : { display: "none" }}>
    <Anomalies onReady={handleAnomReady} />
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="audit__hact">
          <span className="advmuted">{rows.length}</span>
          <button type="button" className="btn btn--line btn--sm" onClick={exportCsv} disabled={exporting || current?.status === "forbidden"}>
            <IconDownload />
            {exporting ? t("exporting") : t("export")}
          </button>
        </span>
      </div>
      <p className="ppanel__note">{t("lead")}</p>
      <p className="ppanel__note audit__append"><IconLock />{t("appendOnly")}</p>
      <div className="lfilters audit__dates">
        <DatePicker value={from} onChange={setFrom} max={to || undefined} placeholder={tc("from")} ariaLabel={tc("from")} clearLabel={tc("clear")} />
        <DatePicker value={to} onChange={setTo} min={from || undefined} placeholder={tc("to")} ariaLabel={tc("to")} clearLabel={tc("clear")} />
      </div>
      <form className="audit__filters" onSubmit={apply}>
        <SearchSelect
          value={draft.userId ? [draft.userId] : []}
          onChange={(v) => setDraft((d) => ({ ...d, userId: v[0] ?? "" }))}
          onSearch={(q) => searchUsers(q).then((list) => list.map((u) => ({ value: u.id, label: u.name || u.lexgoId || u.id, sub: u.phone })))}
          placeholder={t("userIdPh")}
          searchPlaceholder={t("userIdPh")}
          emptyText={t("noUsers")}
          ariaLabel={t("user")}
          removeLabel={t("reset")}
          single
        />
        {TEXT_KEYS.map((k) => (
          <input
            key={k}
            value={draft[k]}
            onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
            placeholder={t(`f.${k}`)}
            aria-label={t(`f.${k}`)}
          />
        ))}
        <button type="submit" className="btn btn--pri btn--sm"><IconSearch />{t("apply")}</button>
        {hasText ? <button type="button" className="btn btn--ghost btn--sm" onClick={resetText}>{t("reset")}</button> : null}
      </form>
      {exportNote ? <Notice ok={false} msg={exportNote} /> : null}
      {!current ? (
        <Skeleton rows={5} />
      ) : current.status === "forbidden" ? (
        <EmptyState icon={<IconLock />} title={t("forbidden")} text={t("forbiddenText")} />
      ) : current.status === "error" ? (
        <EmptyState icon={<IconShieldCheck />} title={tp("loadError")} text={tp("loadErrorText")} />
      ) : !rows.length ? (
        <EmptyState icon={<IconShieldCheck />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <>
          <p className="ppanel__note">
            {!chain.hashed
              ? t("noHashes")
              : chain.total
                ? `${t("chainSummary", { linked: chain.linked, total: chain.total })} ${t("chainNote")}`
                : t("chainNote")}
          </p>
          <div className="alist">
            {rows.map((a, i) => {
              const rowKey = a.id || a.eventHash || String(i);
              const state = chain.states[i];
              const hash = a.eventHash;
              return (
                <div className="creq audit__row" key={rowKey}>
                  <span className="creq__st" />
                  <div className="creq__m">
                    <b>{a.action || "—"}{locale === "uz" && a.titleUz ? <small className="advmuted"> · {a.titleUz}</small> : null}</b>
                    <span>{[(locale === "uz" && a.descriptionUz) || a.detail, a.ip, fmt(a.createdAt, locale)].filter(Boolean).join(" · ")}</span>
                    {a.userId || a.targetType || a.targetId ? (
                      <span className="audit__who">
                        {a.userId ? <span>{t("user")}: <code>{a.userId}</code></span> : null}
                        {a.targetType || a.targetId ? (
                          <span>{t("target")}: <code>{[a.targetType, a.targetId].filter(Boolean).join(" · ")}</code></span>
                        ) : null}
                      </span>
                    ) : null}
                    {hash ? (
                      <span className="audit__hash">
                        <code title={`${t("hash")}: ${hash}`}>#{shortHash(hash)}</code>
                        {a.previousHash ? <code title={`${t("prevHash")}: ${a.previousHash}`}>← {shortHash(a.previousHash)}</code> : null}
                        <button
                          type="button"
                          className="audit__copy"
                          onClick={() => copy(rowKey, hash)}
                          aria-label={t("copyHash")}
                          title={copied === rowKey ? t("copied") : t("copyHash")}
                        >
                          {copied === rowKey ? <IconCheck /> : <IconClipboardCheck />}
                        </button>
                      </span>
                    ) : null}
                  </div>
                  {(chain.hashed && state) || (a.outcome && a.outcome !== "success") ? (
                    <div className="creq__side">
                      {a.outcome && a.outcome !== "success" ? (
                        <span className={`creq__badge audit__outcome audit__outcome--${/fail|deni|error|block|reject/i.test(a.outcome) ? "bad" : "ok"}`}>
                          {t.has(`outcome.${a.outcome}`) ? t(`outcome.${a.outcome}`) : a.outcome}
                        </span>
                      ) : null}
                      {chain.hashed && state ? (
                        <span className={`creq__badge audit__chain audit__chain--${state}`} title={t(`chainHint.${state}`)}>
                          {t(`chain.${state}`)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
    </div>
    </>
  );
}
