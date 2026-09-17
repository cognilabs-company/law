"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getLawyerById,
  getLawyerPrivateChat,
  demoPrivateChat,
  type BackendLawyer,
} from "@/lib/services/backend";
import { isDemoUnavailable, isProviderUnavailable } from "@/lib/http";
import { createCheckout, isDemoCheckout, type PaymentIntent } from "@/lib/services/checkout";
import { CheckoutIntent } from "./OrderMilestones";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { initials, humanizeSlug } from "@/lib/lawyers";
import { fmtUzs } from "@/lib/money";
import Modal from "@/components/admin/Modal";
import { Skeleton } from "./DataState";

const som = (n: number) => (n ? fmtUzs(n) : "—");

// Read-only advocate/lawyer profile shown from the matches list (and reusable
// elsewhere). No single-lawyer GET on the backend, so getLawyerById resolves
// the profile from the directory list by user id.
export default function LawyerProfileModal({
  userId,
  open,
  onClose,
}: {
  userId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("portal.client.lawyerProfile");
  const te = useTranslations("enums");
  const tcommon = useTranslations("common");
  const router = useRouter();
  const { session } = useAuth();
  const [data, setData] = useState<BackendLawyer | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "done">("loading");
  const [busy, setBusy] = useState(false);
  const [chooseErr, setChooseErr] = useState<string | null>(null);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);

  // Back to loading whenever a profile is (re)opened (during render, not in the effect).
  const reqKey = open && userId ? userId : null;
  const [prevReqKey, setPrevReqKey] = useState(reqKey);
  if (reqKey !== prevReqKey) {
    setPrevReqKey(reqKey);
    if (reqKey) {
      setStatus("loading");
      setData(null);
      setIntent(null);
    }
  }

  useEffect(() => {
    if (!open || !userId) return;
    let alive = true;
    getLawyerById(userId)
      .then((l) => {
        if (!alive) return;
        setData(l);
        setStatus(l ? "done" : "error");
      })
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, [open, userId]);

  // Back from the checkout page may restore this page from the bfcache with the
  // button still busy (it stays busy while the browser navigates away).
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // Same "choose" flow as the directory: reuse an existing private chat or pay
  // for one, then jump into the chat room.
  async function choose() {
    if (!data?.userId || busy) return;
    if (!session) {
      router.push("/login");
      return;
    }
    setBusy(true);
    setChooseErr(null);
    let leaving = false; // stay busy while the browser opens the checkout
    try {
      const existing = await getLawyerPrivateChat(data.userId);
      if (existing) {
        router.push(`/portal/chat/${existing.id}`);
        return;
      }
      if (!isDemoCheckout()) {
        // Real checkout: invoice for the private chat; the room opens once paid.
        setIntent(await createCheckout({ kind: "private_chat", sellerUserId: data.userId }));
        return;
      }
      const r = await demoPrivateChat({ lawyer_user_id: data.userId });
      if (r.chatRoomId) router.push(`/portal/chat/${r.chatRoomId}`);
      // Real checkout: same-tab navigation (a popup after an await is blocked).
      else if (r.paymentUrl) {
        leaving = true;
        window.location.assign(r.paymentUrl);
      }
    } catch (e) {
      setChooseErr(isProviderUnavailable(e) || isDemoUnavailable(e) ? tcommon("paymentUnavailable") : t("notFound"));
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  const kind = data && data.sellerType.toLowerCase().includes("advokat") ? "advocate" : "lawyer";
  const areaLabel = (s: string) => (te.has(`areas.${s}`) ? te(`areas.${s}`) : humanizeSlug(s));

  return (
    <Modal open={open} onClose={onClose} title={t("title")}>
      {status === "loading" ? (
        <Skeleton rows={4} />
      ) : status === "error" || !data ? (
        <p className="advmuted">{t("notFound")}</p>
      ) : (
        <div className="lprof">
          <div className="lprof__head">
            <div className="lprof__av">{initials(data.name || "—")}</div>
            <div className="lprof__id">
              <div className="lprof__n">
                {data.name || "—"}
                {data.verified ? <span className="lprof__vf">{t("verified")}</span> : <span className="lprof__vf lprof__vf--un">{t("unverified")}</span>}
              </div>
              <div className="lprof__tags">
                <span className={`advcard__kind advcard__kind--${kind}`}>{t(`kind.${kind}`)}</span>
                {data.publicId ? <span className="lprof__pid">{data.publicId}</span> : null}
              </div>
            </div>
          </div>

          <div className="lprof__stats">
            <div>
              <b>{data.rating.toFixed(1)}</b>
              <span>{t("rating")}</span>
            </div>
            <div>
              <b>{data.reviews}</b>
              <span>{t("reviews")}</span>
            </div>
            <div>
              <b>{data.experienceYears}</b>
              <span>{t("experience")}</span>
            </div>
            <div>
              <b>{data.totalCases}</b>
              <span>{t("totalCases")}</span>
            </div>
          </div>

          <div className="lprof__wins">
            <div>
              <b>{data.winsCount}</b>
              <span>{t("fullWin")}</span>
            </div>
            <div>
              <b>{data.partialWins}</b>
              <span>{t("partialWin")}</span>
            </div>
            <div>
              <b>{data.successRate ? `${data.successRate.toFixed(0)}%` : "—"}</b>
              <span>{t("successRate")}</span>
            </div>
          </div>

          {data.specializations.length ? (
            <div className="lprof__row">
              <span className="lprof__lbl">{t("specializations")}</span>
              <div className="lprof__chips">
                {data.specializations.map((s, i) => (
                  <span className="lprof__chip" key={i}>
                    {areaLabel(s)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {data.languages.length ? (
            <div className="lprof__row">
              <span className="lprof__lbl">{t("languages")}</span>
              <div className="lprof__chips">
                {data.languages.map((s, i) => (
                  <span className="lprof__chip" key={i}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {data.region ? (
            <div className="lprof__row">
              <span className="lprof__lbl">{t("region")}</span>
              <span>{[data.region, data.district].filter(Boolean).join(" · ")}</span>
            </div>
          ) : null}
          {data.barAssociation ? (
            <div className="lprof__row">
              <span className="lprof__lbl">{t("bar")}</span>
              <span>{data.barAssociation}</span>
            </div>
          ) : null}
          {data.licenseNumber ? (
            <div className="lprof__row">
              <span className="lprof__lbl">{t("license")}</span>
              <span>{data.licenseNumber}</span>
            </div>
          ) : null}
          {data.organizationName ? (
            <div className="lprof__row">
              <span className="lprof__lbl">{t("organization")}</span>
              <span>{data.organizationName}</span>
            </div>
          ) : null}
          {data.education ? (
            <div className="lprof__row">
              <span className="lprof__lbl">{t("education")}</span>
              <span>{data.education}</span>
            </div>
          ) : null}
          {data.bio ? <p className="lprof__bio">{data.bio}</p> : null}

          <div className="lprof__ft">
            <div className="lprof__price">
              <b>{som(data.basePrice)}</b>
              <span>{t("priceNote")}</span>
            </div>
            <button className="btn btn--pri" type="button" onClick={choose} disabled={busy}>
              {busy ? t("opening") : t("choose")}
            </button>
          </div>
          {chooseErr ? <p className="lprof__err">{chooseErr}</p> : null}
          {intent ? <div style={{ marginTop: 14 }}><CheckoutIntent intent={intent} onCancel={() => setIntent(null)} /></div> : null}
        </div>
      )}
    </Modal>
  );
}
