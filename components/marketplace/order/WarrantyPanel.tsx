"use client";

import "./deal.css";
import { useEffect, useId, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { SxPanel } from "@/components/admin/studio/sx/layout/Panel";
import { SxButton } from "@/components/admin/studio/sx/Button";
import { SxDialog, SxDialogError, type SxDialogErrorText } from "@/components/admin/studio/sx/editor/SxDialog";
import { Field } from "@/components/admin/studio/sx/form/Field";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import { ChoiceCards, type ChoiceCard } from "@/components/admin/studio/sx/form/ChoiceCards";
import { useMarketError } from "@/components/marketplace/useMarketError";
import { requestOrderWarranty, warrantyResolutions, type OrderWarranty, type WarrantyResolution } from "@/lib/services/marketplace";
import { useSameTickGuard } from "@/lib/useSameTickGuard";
import { ApiError } from "@/lib/http";
import { LifeBuoyIcon } from "./icons";
import type { OrderSectionProps } from "./types";

// The LexGo guarantee on an order (enterprise contract §10): when the
// seller did not answer in time, broke the deadline, dropped the work, did
// not deliver, or was restricted, the client asks for a replacement seller
// or a full refund. The call center reviews every request; nothing is shown
// as done until its decision arrives.

const REASONS = ["no_response", "sla_breach", "abandoned", "not_delivered", "seller_restricted"] as const;
const REASON_MIN = 20;
const PENDING = new Set(["pending", "open", "submitted", "in_review", "under_review", "created", "new"]);

export default function WarrantyPanel({ o, view, phase, aiBase, onChanged }: OrderSectionProps): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail.warranty");
  const marketError = useMarketError();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState("");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const once = useSameTickGuard();
  const [error, setError] = useState<SxDialogErrorText>(null);
  const [sent, setSent] = useState<OrderWarranty | null>(null);
  const [resolutions, setResolutions] = useState<readonly WarrantyResolution[]>([]);
  useEffect(() => {
    let alive = true;
    void warrantyResolutions().then((r) => alive && setResolutions(r));
    return () => {
      alive = false;
    };
  }, []);

  const w = sent ?? o.warranty;
  const filed = !!w.status;
  if (view !== "client" || phase === "pending" || phase === "cancelled") return null;
  if (!filed && (!o.warranty.url || !resolutions.length)) return null;
  const ai = `${aiBase}.warranty`;

  if (filed) {
    const pending = PENDING.has(w.status);
    return (
      <SxPanel className="mcr mcr-review" title={t("title")} lead={pending ? t("pending") : t("decided")} aiId={ai}>
        {w.resolution && !pending ? (
          <p className="mcr-meta">
            {t("decision")}: <b>{t.has(`resolution.${w.resolution}`) ? t(`resolution.${w.resolution}`) : w.resolution}</b>
          </p>
        ) : null}
        {w.decision ? <blockquote className="mcr-quote">{w.decision}</blockquote> : null}
      </SxPanel>
    );
  }

  const reasonErr = tried && reason.trim().length < REASON_MIN ? t("reasonShort", { n: REASON_MIN }) : "";
  const pickErr = tried && !reasonCode ? t("pickReason") : "";
  const reasonCards: ChoiceCard[] = REASONS.map((r) => ({ value: r, title: t(`why.${r}`) }));

  async function submit() {
    if (busy || !once()) return;
    setTried(true);
    if (!reasonCode || reason.trim().length < REASON_MIN) return;
    setBusy(true);
    setError(null);
    try {
      const r = await requestOrderWarranty(o, { reasonCode, reason });
      setSent(r);
      setOpen(false);
      onChanged();
    } catch (e) {
      // One open claim per order: the existing one is shown instead.
      if (e instanceof ApiError && e.code === "warranty_already_open") {
        setSent({ ...o.warranty, status: "pending", resolution: "", reason, decision: "" });
        setOpen(false);
        onChanged();
        return;
      }
      const fallback = t("error");
      const msg = marketError(e, fallback);
      setError({ title: fallback, text: msg === fallback ? "" : msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SxPanel className="mcr" title={t("title")} lead={t("lead")} aiId={ai}>
      <SxButton variant="secondary" icon={LifeBuoyIcon} onClick={() => setOpen(true)} aiId={`${ai}.open`}>
        {t("open")}
      </SxButton>
      {open ? (
        <SxDialog
          open
          onClose={() => !busy && setOpen(false)}
          title={t("dialogTitle")}
          description={t("dialogLead")}
          busy={busy}
          aiId={`${ai}.dialog`}
          footer={
            <>
              <SxButton variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
                {t("cancel")}
              </SxButton>
              <SxButton variant="primary" busy={busy} onClick={() => void submit()} aiId={`${ai}.submit`}>
                {t("submit")}
              </SxButton>
            </>
          }
        >
          <Field id={`${uid}-why`} label={t("whyLabel")} as="fieldset" required error={pickErr}>
            {(a) => <ChoiceCards id={`${uid}-why`} value={reasonCode} onChange={setReasonCode} options={reasonCards} columns={1} required invalid={!!pickErr} aria-labelledby={a["aria-labelledby"]} aria-describedby={a["aria-describedby"]} aiId={`${ai}.why`} />}
          </Field>
          <p className="mcr-meta">{t("outcomes", { a: t("resolution.replacement"), b: t("resolution.full_refund") })}</p>
          <Field id={`${uid}-reason`} label={t("reasonLabel")} required error={reasonErr} help={t("reasonHelp")}>
            {(a) => <TextArea {...a} value={reason} onChange={setReason} minRows={4} maxLength={1000} placeholder={t("reasonPh")} />}
          </Field>
          <SxDialogError error={error} />
        </SxDialog>
      ) : null}
    </SxPanel>
  );
}
