"use client";

import { useId, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { SxButton } from "@/components/admin/studio/sx/Button";
import { SxDialog, SxDialogError, type SxDialogErrorText } from "@/components/admin/studio/sx/editor/SxDialog";
import { Field } from "@/components/admin/studio/sx/form/Field";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import ContactGuardNote, { useContactStrip } from "@/components/ui/ContactGuardNote";
import { findContacts } from "@/lib/contactGuard";
import { errDetail, logApiError } from "@/lib/http";
import { REGION_KEYS } from "@/lib/lawyers";
import { regionLabel } from "@/lib/labels";
import { createOrder } from "@/lib/services/backend";
import { useSameTickGuard } from "@/lib/useSameTickGuard";

// A service picked without a specialist: the client describes the problem
// and the backend chooses the suitable external advocate or lawyer
// (enterprise contract §4.1: POST /orders, source=marketplace, no
// lawyer_user_id). The client then follows the order; nothing here says a
// lawyer "is being searched", as the contract asks.

const PROBLEM_MIN = 15;

export default function ServiceRequestDialog({
  service,
  onClose,
  onChooseMyself,
}: {
  service: { id: string; title: string };
  onClose: () => void;
  onChooseMyself: () => void;
}): ReactElement {
  const t = useTranslations("marketplace.byService.request");
  const te = useTranslations("enums");
  const router = useRouter();
  const { session } = useAuth();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [problem, setProblem] = useState("");
  const [region, setRegion] = useState(() => (session?.profile?.region && (REGION_KEYS as readonly string[]).includes(session.profile.region) ? session.profile.region : ""));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SxDialogErrorText>(null);
  const once = useSameTickGuard();
  const strip = useContactStrip(setProblem);
  const hits = findContacts(problem);
  const problemErr = tried && problem.trim().length < PROBLEM_MIN ? t("problemShort", { n: PROBLEM_MIN }) : "";
  const regionErr = tried && !region ? t("pickRegion") : "";

  async function submit() {
    if (busy || !once()) return;
    setTried(true);
    if (problem.trim().length < PROBLEM_MIN || !region || hits.length) return;
    setBusy(true);
    setError(null);
    try {
      const order = await createOrder({ service_id: service.id, source: "marketplace", details: { region, problem: problem.trim(), selected_option_ids: [] } });
      if (order.id) router.push(`/portal/client/marketplace-orders/${encodeURIComponent(order.id)}`);
      else onClose();
    } catch (e) {
      logApiError("marketplace.service-request", e);
      setError({ title: t("failed"), text: errDetail(e) });
      setBusy(false);
    }
  }

  return (
    <SxDialog
      open
      onClose={onClose}
      title={service.title}
      description={t("lead")}
      busy={busy}
      dirty={!!problem.trim()}
      aiId="marketplace.by-service.request"
      footer={
        <>
          <SxButton variant="secondary" onClick={onChooseMyself} disabled={busy} aiId="marketplace.by-service.request.myself">
            {t("chooseMyself")}
          </SxButton>
          <SxButton variant="primary" busy={busy} onClick={() => void submit()} aiId="marketplace.by-service.request.submit">
            {busy ? t("sending") : t("submit")}
          </SxButton>
        </>
      }
    >
      <Field id={`${uid}-p`} label={t("problem")} required error={problemErr} help={t("problemHelp")}>
        {(a) => (
          <TextArea
            {...a}
            value={problem}
            onChange={(v) => strip.change(v)}
            onBlur={() => strip.blur(problem)}
            minRows={4}
            maxLength={2000}
            counter
            placeholder={t("problemPh")}
          />
        )}
      </Field>
      <ContactGuardNote id={`${uid}-g`} hits={hits} removed={strip.removed} verifiedLine={false} />
      <Field id={`${uid}-r`} label={t("region")} required error={regionErr}>
        {(a) => (
          <select id={a.id} aria-describedby={a["aria-describedby"]} aria-invalid={!!regionErr || undefined} className="mksv__select" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">{t("pickRegion")}</option>
            {REGION_KEYS.map((k) => (
              <option key={k} value={k}>
                {regionLabel(te, k)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <p className="mksv__note">{t("how")}</p>
      <SxDialogError error={error} />
    </SxDialog>
  );
}
