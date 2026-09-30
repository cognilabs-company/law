"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { demoPrivateChat, getLawyerPrivateChat } from "@/lib/services/backend";
import { createCheckout, isDemoCheckout, type PaymentIntent } from "@/lib/services/checkout";
import { ApiError, errDetail, isDemoUnavailable, isProviderUnavailable } from "@/lib/http";
import { CheckoutIntent } from "@/components/portal/OrderMilestones";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { IconChat } from "@/components/icons";
import { setReturnTo } from "@/lib/returnTo";

export default function PrivateChatButton({ sellerUserId, returnPath }: { sellerUserId: string; returnPath: string }) {
  const t = useTranslations("marketplace.detail");
  const tc = useTranslations("common");
  const tpay = useTranslations("portal.payment");
  const { session } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [intent, setIntent] = useState<PaymentIntent | null>(null);

  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  async function open() {
    if (!session) {
      setReturnTo(returnPath);
      router.push("/login");
      return;
    }
    if (busy) return;
    setBusy(true);
    setErr("");
    let leaving = false;
    try {
      const existing = await getLawyerPrivateChat(sellerUserId);
      if (existing) {
        router.push(`/portal/chat/${existing.id}`);
        return;
      }
      if (!isDemoCheckout()) {
        setIntent(await createCheckout({ kind: "private_chat", sellerUserId }));
        return;
      }
      const r = await demoPrivateChat({ lawyer_user_id: sellerUserId });
      if (r.chatRoomId) router.push(`/portal/chat/${r.chatRoomId}`);
      else if (r.paymentUrl) {
        leaving = true;
        window.location.assign(r.paymentUrl);
      }
    } catch (e) {
      const demoClosed = e instanceof ApiError && e.status === 400 && /demo/i.test(e.detail || "");
      setErr(isProviderUnavailable(e) || isDemoUnavailable(e) || demoClosed ? tc("paymentUnavailable") : errDetail(e) || t("chatError"));
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn--line btn--sm mk-side__alt" onClick={() => void open()} disabled={busy} title={t("privateChatHint")}>
        <IconChat />
        {t("privateChat")}
      </button>
      {err ? <Notice ok={false} msg={err} /> : null}
      <Modal open={!!intent} onClose={() => setIntent(null)} title={tpay("intentTitle")}>
        {intent ? <CheckoutIntent intent={intent} onCancel={() => setIntent(null)} untitled /> : null}
      </Modal>
    </>
  );
}
