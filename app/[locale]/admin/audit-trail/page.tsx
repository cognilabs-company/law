"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { listAuditTrail, type ActivityEntry } from "@/lib/services/backend";
import { parseServerTime } from "@/lib/http";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import DatePicker from "@/components/DatePicker";
import { IconShieldCheck, IconLock, IconCheck, IconClipboardCheck } from "@/components/icons";

function fmt(s: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString("ru-RU");
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

export default function AdminAuditTrail() {
  const t = useTranslations("admin.audit");
  const tc = useTranslations("chart");
  const tp = useTranslations("portal.common");
  // Date range filter (YYYY-MM-DD) → GET /admin/audit-trail?date_from=&date_to=
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const res = useResource(() => listAuditTrail({ dateFrom: from, dateTo: to }), [from, to]);
  const chain = useMemo(() => chainStates(res.data), [res.data]);
  const [copied, setCopied] = useState<string | null>(null);

  function copy(key: string, hash: string) {
    navigator.clipboard?.writeText(hash).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h"><b>{t("title")}</b><span className="advmuted">{res.data.length}</span></div>
      <p className="ppanel__note">{t("lead")}</p>
      <p className="ppanel__note audit__append"><IconLock />{t("appendOnly")}</p>
      <div className="lfilters audit__dates">
        <DatePicker value={from} onChange={setFrom} max={to || undefined} placeholder={tc("from")} ariaLabel={tc("from")} clearLabel={tc("clear")} />
        <DatePicker value={to} onChange={setTo} min={from || undefined} placeholder={tc("to")} ariaLabel={tc("to")} clearLabel={tc("clear")} />
      </div>
      {res.status === "loading" ? (
        <Skeleton rows={5} />
      ) : res.status === "error" ? (
        <EmptyState icon={<IconShieldCheck />} title={tp("loadError")} text={tp("loadErrorText")} />
      ) : !res.data.length ? (
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
            {res.data.map((a, i) => {
              const rowKey = a.id || a.eventHash || String(i);
              const state = chain.states[i];
              const hash = a.eventHash;
              return (
                <div className="creq audit__row" key={rowKey}>
                  <span className="creq__st" />
                  <div className="creq__m">
                    <b>{a.action || "—"}</b>
                    <span>{[a.detail, a.ip, fmt(a.createdAt)].filter(Boolean).join(" · ")}</span>
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
                  {chain.hashed && state ? (
                    <div className="creq__side">
                      <span className={`creq__badge audit__chain audit__chain--${state}`} title={t(`chainHint.${state}`)}>
                        {t(`chain.${state}`)}
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
