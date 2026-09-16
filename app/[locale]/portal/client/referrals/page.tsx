"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getMyReferral } from "@/lib/services/backend";
import { httpBlob } from "@/lib/http";
import { useResourceOne } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton } from "@/components/portal/DataState";
import { IconGift, IconUsers, IconCheck, IconArrowRight } from "@/components/icons";

const FALLBACK = {
  code: "LEXGO", link: "", qrUrl: "", invited: 0, joined: 0, rewardBalance: 0,
  discountUnlocked: false, discountPercent: 5, eligibleAfter: 5, remainingToUnlock: 5, appliesTo: "subscription",
  items: [],
};
const som = (n: number) => fmtUzs(n);

// Referral QR image: a data:/https URL is used as is; a backend-relative path
// is an authed route, fetched with the token as a blob. null = nothing to show.
function useQrSrc(qrUrl: string): string | null {
  const [src, setSrc] = useState<{ key: string; url: string | null } | null>(null);
  const direct = /^(data:image\/|https:\/\/)/i.test(qrUrl);
  useEffect(() => {
    if (!qrUrl || direct) return;
    let alive = true;
    let objectUrl = "";
    httpBlob(qrUrl.startsWith("/") ? qrUrl : `/${qrUrl}`, { headers: { Accept: "image/*" } })
      .then((b) => {
        if (!alive) return;
        if (!b.type.startsWith("image/")) {
          setSrc({ key: qrUrl, url: null });
          return;
        }
        objectUrl = URL.createObjectURL(b);
        setSrc({ key: qrUrl, url: objectUrl });
      })
      .catch(() => alive && setSrc({ key: qrUrl, url: null }));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [qrUrl, direct]);
  if (!qrUrl) return null;
  if (direct) return qrUrl;
  return src?.key === qrUrl ? src.url : null;
}

const fmtDate = (s: string) => {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU");
};

export default function ClientReferrals() {
  const t = useTranslations("portal.client.referrals");
  const res = useResourceOne(getMyReferral, []);
  const r = res.data ?? FALLBACK;
  const code = r.code || FALLBACK.code;
  const link = r.link || (typeof window !== "undefined" ? `${window.location.origin}/register?ref=${code}` : "");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const qrSrc = useQrSrc(r.qrUrl);
  const [qrBroken, setQrBroken] = useState(false);

  function copy(what: "code" | "link", text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  }
  function share() {
    if (navigator.share) navigator.share({ title: "LexGo", text: t("shareText"), url: link }).catch(() => {});
    else copy("link", link);
  }

  const steps = ["step1", "step2", "step3"] as const;

  return (
    <div className="ref">
      <div className="ref__hero">
        <span className="ref__ico"><IconGift /></span>
        <h1 className="ref__title">{t("title")}</h1>
        <p className="ref__sub">{t("subtitle")}</p>
        <div className="ref__code">
          <span className="ref__codeval">{code}</span>
          <button type="button" className="ref__copy" onClick={() => copy("code", code)}>
            {copied === "code" ? <IconCheck /> : null}
            {copied === "code" ? t("copied") : t("copy")}
          </button>
        </div>
        <div className="ref__linkrow">
          <input readOnly value={link} className="ref__link" aria-label={t("link")} />
          <button type="button" className="btn btn--pri btn--sm" onClick={share}>{t("share")}</button>
        </div>
        {qrSrc && !qrBroken ? (
          <div className="ref__qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt={t("qrAlt")} width={148} height={148} onError={() => setQrBroken(true)} />
            <span>{t("qrHint")}</span>
          </div>
        ) : null}
      </div>

      {res.status === "loading" ? (
        <Skeleton rows={2} />
      ) : (
        <div className="ref__stats">
          <div className="ref__stat"><b>{r.invited}</b><span>{t("invited")}</span></div>
          <div className="ref__stat"><b>{r.joined}</b><span>{t("joined")}</span></div>
          <div className="ref__stat ref__stat--reward"><b>{som(r.rewardBalance)}</b><span>{t("reward")}</span></div>
        </div>
      )}

      <div className={`ref__disc${r.discountUnlocked ? " ref__disc--on" : ""}`}>
        <span className="ref__disci"><IconGift /></span>
        <p>
          {r.discountUnlocked
            ? t("discountActive", { percent: r.discountPercent || 5 })
            : t("discountProgress", {
                remaining: r.remainingToUnlock || r.eligibleAfter || 5,
                percent: r.discountPercent || 5,
              })}
        </p>
      </div>

      <div className="ref__how">
        <h2 className="ref__h2">{t("howTitle")}</h2>
        <div className="ref__steps">
          {steps.map((s, i) => (
            <div className="ref__step" key={s}>
              <span className="ref__num">{i + 1}</span>
              <p>{t(s)}</p>
              {i < steps.length - 1 ? <IconArrowRight className="ref__arrow" /> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="ppanel">
        <div className="ppanel__h"><b>{t("invitesTitle")}</b></div>
        {r.items.length === 0 ? (
          <div className="ref__empty">
            <span className="ref__emptyi"><IconUsers /></span>
            <p>{t("empty")}</p>
          </div>
        ) : (
          <div className="alist">
            {r.items.map((it, i) => (
              <div className="creq" key={i}>
                <span className="creq__st" />
                <div className="creq__m">
                  <b>{it.name || it.phone || "—"}</b>
                  <span>
                    {[it.name ? it.phone : "", t.has(`status.${it.status}`) ? t(`status.${it.status}`) : it.status, fmtDate(it.joinedAt)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                {it.reward ? <span className="ref__badge">+{som(it.reward)}</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
