"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { claimGift } from "@/lib/services/backend";
import { ApiError, isConflict } from "@/lib/http";
import { IconGift, IconCheck } from "@/components/icons";

// Recipient landing for a gift share link (https://.../gift/LX-XXXX). Public;
// requires login to claim, which starts the recipient's subscription term.
export default function GiftClaim() {
  const t = useTranslations("portal.client.gifts.claim");
  const params = useParams();
  const code = String(params.code || "");
  const { session, ready } = useAuth();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [errKey, setErrKey] = useState<"error" | "alreadyClaimed" | "notReady" | "notFound">("error");

  async function claim() {
    if (busy) return;
    setBusy(true);
    try {
      await claimGift(code);
      setState("done");
    } catch (e) {
      // 409: already claimed, or not claimable yet (unpaid / cancelled / expired).
      if (isConflict(e)) setErrKey(/allaqachon|already|уже/i.test((e as ApiError).detail || "") ? "alreadyClaimed" : "notReady");
      else if (e instanceof ApiError && e.status === 404) setErrKey("notFound");
      else setErrKey("error");
      setState("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="giftclaim">
      <div className="giftclaim__card">
        <span className="giftclaim__ic"><IconGift /></span>
        {state === "done" ? (
          <>
            <h1>{t("claimedTitle")}</h1>
            <p>{t("claimedSub")}</p>
            <Link href="/portal/client" className="btn btn--grad btn--full btn--lg" style={{ marginTop: 8 }}>
              {t("goPortal")}
            </Link>
          </>
        ) : (
          <>
            <h1>{t("title")}</h1>
            <p>{t("sub")}</p>
            {state === "error" ? <p className="giftclaim__err">{t(errKey)}</p> : null}
            {!ready ? null : session ? (
              <button className="btn btn--grad btn--full btn--lg" type="button" onClick={claim} disabled={busy} style={{ marginTop: 8 }}>
                <IconCheck />
                {busy ? t("claiming") : t("claimCta")}
              </button>
            ) : (
              <>
                <p className="advmuted" style={{ marginTop: 4 }}>{t("loginFirst")}</p>
                <Link href="/login" className="btn btn--grad btn--full btn--lg">
                  {t("loginCta")}
                </Link>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
