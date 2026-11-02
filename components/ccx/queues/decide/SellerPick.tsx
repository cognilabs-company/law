"use client";

import "./WcDecide.css";
import { useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fmtRating } from "@/lib/date";
import { isAborted } from "@/lib/http";
import { initials } from "@/lib/lawyers";
import { listAdminMarketplaceSellers, type MkmSeller } from "@/lib/services/adminMarketplace";
import { searchMarketplaceSellers, type MarketSeller } from "@/lib/services/marketplace";
import { mergeSellerCandidates, raceAbort, type SellerCandidate } from "@/components/admin/callcenter/cancellations/model";
import { IcCheck, IcSearch, IcShield } from "../../icons";

const LIMIT = 20;
const WAIT_MS = 250;
const SKELETONS = [0, 1, 2];

async function loadSellers(query: string, serviceId: string, signal: AbortSignal): Promise<SellerCandidate[]> {
  const [admin, pub] = await Promise.allSettled([
    raceAbort(listAdminMarketplaceSellers({ q: query, dateFrom: "", dateTo: "", limit: LIMIT }), signal),
    searchMarketplaceSellers(query, { limit: LIMIT, signal }),
  ]);
  if (admin.status === "rejected" && pub.status === "rejected") throw admin.reason;
  const adminItems: MkmSeller[] = admin.status === "fulfilled" ? admin.value.items : [];
  const pubItems: MarketSeller[] = pub.status === "fulfilled" ? pub.value.items : [];
  return mergeSellerCandidates(adminItems, pubItems, serviceId);
}

type Got = { key: string; rows: SellerCandidate[]; failed: boolean };

export type SellerPickProps = {
  label: string;
  value: string;
  onChange: (userId: string, name: string) => void;
  serviceId: string;
  excludeUserId: string;
  required?: boolean;
  hint?: string;
  error?: string;
};

export default function SellerPick({ label, value, onChange, serviceId, excludeUserId, required, hint, error }: SellerPickProps) {
  const t = useTranslations("admin.callCenter.cancellations");
  const tx = useTranslations("admin.ccx.cancellation");
  const troles = useTranslations("marketplace.roles");
  const locale = useLocale();
  const id = useId();
  const [query, setQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const [got, setGot] = useState<Got | null>(null);
  const [picked, setPicked] = useState<SellerCandidate | null>(null);
  const q = query.trim();
  const sid = serviceId.trim();
  const key = `${q}|${sid}|${retry}`;

  useEffect(() => {
    const ctl = new AbortController();
    const timer = window.setTimeout(
      () => {
        loadSellers(q, sid, ctl.signal).then(
          (rows) => {
            if (!ctl.signal.aborted) setGot({ key, rows, failed: false });
          },
          (e: unknown) => {
            if (!ctl.signal.aborted && !isAborted(e)) setGot({ key, rows: [], failed: true });
          },
        );
      },
      q ? WAIT_MS : 0,
    );
    return () => {
      window.clearTimeout(timer);
      ctl.abort();
    };
  }, [q, sid, key]);

  const loading = !got || got.key !== key;
  const failed = Boolean(got && got.key === key && got.failed);
  const rows = got?.rows ?? [];
  const pinned = picked && picked.userId === value && !rows.some((r) => r.userId === value) ? picked : null;
  const split = sid
    ? [
        { key: "offers", label: t("dialog.sellerGroupOffers"), rows: rows.filter((r) => r.offersService) },
        { key: "others", label: t("dialog.sellerGroupOthers"), rows: rows.filter((r) => !r.offersService) },
      ].filter((g) => g.rows.length)
    : [];
  const groups = split.length > 1 ? split : [{ key: "all", label: "", rows }];

  const describe = (c: SellerCandidate) =>
    [
      c.sellerType && troles.has(c.sellerType) ? troles(c.sellerType) : "",
      c.region,
      c.rating > 0 ? `${fmtRating(c.rating, locale)} ★` : "",
      c.verified ? t("dialog.sellerVerified") : "",
      c.offersService ? t("dialog.sellerOffers") : "",
    ]
      .filter(Boolean)
      .join(" · ");

  const pick = (c: SellerCandidate) => {
    setPicked(c);
    onChange(c.userId, c.name);
  };

  const row = (c: SellerCandidate) => {
    const on = c.userId === value;
    const off = Boolean(excludeUserId) && c.userId === excludeUserId;
    const desc = describe(c);
    return (
      <label key={c.userId} className={`opx-sp__row${on ? " is-on" : ""}${off ? " is-off" : ""}`}>
        <input type="radio" name={`${id}-s`} value={c.userId} checked={on} disabled={off} onChange={() => pick(c)} />
        <span className="opx-sp__av" aria-hidden="true">
          {initials(c.name)}
        </span>
        <span className="opx-sp__txt">
          <b>
            <span>{c.name}</span>
            {c.verified ? <IcShield size={14} /> : null}
          </b>
          {desc ? <small>{desc}</small> : null}
        </span>
        {c.lexgoId ? <span className="opx-sp__id opx-num">{c.lexgoId}</span> : null}
        {off ? (
          <span className="opx-pill" data-tone="mute">
            {t("dialog.sellerCurrent")}
          </span>
        ) : on ? (
          <IcCheck size={17} className="opx-sp__ok" />
        ) : null}
      </label>
    );
  };

  return (
    <div className={`opx-sp${error ? " has-error" : ""}`}>
      <div className={`opx-field${error ? " has-error" : ""}`}>
        <label htmlFor={`${id}-q`} id={`${id}-l`}>
          {label}
          {required ? <i aria-hidden="true">*</i> : null}
        </label>
        <div className="opx-sp__search">
          <IcSearch size={17} />
          <input
            id={`${id}-q`}
            type="search"
            value={query}
            autoComplete="off"
            spellCheck={false}
            placeholder={t("dialog.sellerPh")}
            aria-invalid={Boolean(error)}
            aria-describedby={[hint ? `${id}-h` : "", error ? `${id}-e` : ""].filter(Boolean).join(" ") || undefined}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape" || !query) return;
              e.preventDefault();
              setQuery("");
            }}
          />
          {loading && got ? <i className="opx-sp__spin" aria-hidden="true" /> : null}
        </div>
        {hint ? (
          <span className="opx-field__meta">
            <small id={`${id}-h`}>{hint}</small>
          </span>
        ) : null}
      </div>
      <div className="opx-sp__list" role="radiogroup" aria-labelledby={`${id}-l`} aria-required={required || undefined} aria-busy={loading || undefined}>
        {pinned ? row(pinned) : null}
        {!got ? (
          SKELETONS.map((i) => <i key={i} className="opx-shim opx-sp__sk" aria-hidden="true" />)
        ) : failed ? (
          <p className="opx-sp__msg" role="alert">
            <span>{tx("sellerFailed")}</span>
            <button type="button" className="opx-pbtn opx-cx-sm" onClick={() => setRetry((n) => n + 1)}>
              {t("retry")}
            </button>
          </p>
        ) : !rows.length ? (
          <p className="opx-sp__msg">{loading ? tx("sellerLoading") : t("dialog.sellerEmpty")}</p>
        ) : (
          groups.map((g) => (
            <div key={g.key} role="presentation" className="opx-sp__grp">
              {g.label ? <p className="opx-sp__group">{g.label}</p> : null}
              {g.rows.map(row)}
            </div>
          ))
        )}
      </div>
      {error ? (
        <p className="opx-ferr" id={`${id}-e`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
