"use client";

import "./WcDecide.css";
import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { shortDateTime } from "@/lib/date";
import { ApiError, errDetail, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { useSameTickGuard } from "@/lib/useSameTickGuard";
import { resolveWarrantyClaim, type WarrantyClaim, type WarrantyDecision } from "@/lib/services/mpComplaints";
import { CaseBox, Choice, FactStrip, Field, Note, PanelFoot, Section, Timeline, type Step } from "../../panel/bits";
import { IcCheck, IcClock, IcCoins, IcDoc, IcLayers, IcScale, IcShield } from "../../icons";
import Party from "./Party";
import SellerPick from "./SellerPick";
import { focusFirstError } from "./focus";
import WcSwitch from "./WcSwitch";
import type { DecideProps } from "./types";

const NOTE_MIN = 5;
const NOTE_MAX = 2000;

export default function WarrantyDecide({ job, item: claim, onDone, onClose, onDirty }: DecideProps<WarrantyClaim>) {
  const t = useTranslations("callCenter.warranty");
  const tp = useTranslations("marketplace.orderDetail.pricing");
  const tx = useTranslations("admin.ccx.panel");
  const tc = useTranslations("admin.ccx.cases");
  const none = useTranslations("common")("none");
  const locale = useLocale();
  const once = useSameTickGuard();
  const box = useRef<HTMLDivElement>(null);
  const [resolution, setResolution] = useState<WarrantyDecision | "">("");
  const [seller, setSeller] = useState("");
  const [note, setNote] = useState("");
  const [transfer, setTransfer] = useState(claim.filesConsent === true);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const label = (group: string, v: string) => (v && t.has(`${group}.${v}`) ? t(`${group}.${v}`) : v ? t("other") : none);
  const settled = !!claim.resolution;
  const order = claim.order;
  const errs = {
    resolution: resolution ? "" : t("err.resolution"),
    seller: resolution === "replacement" && !seller ? t("err.seller") : "",
    note: note.trim().length < NOTE_MIN ? t("err.note", { n: NOTE_MIN }) : "",
  };
  const shown = tried ? errs : { resolution: "", seller: "", note: "" };
  const consent = claim.filesConsent === false ? t("transferNoConsent") : claim.filesConsent === true ? t("transferConsent") : t("transferUnknown");
  const statusTone = claim.status === "rejected" ? "mute" : settled ? "ok" : "warn";

  const pickResolution = (v: string) => {
    const r = claim.resolutions.find((x) => x === v);
    if (!r) return;
    setResolution(r);
    onDirty(true);
  };

  const submit = async () => {
    if (busy || !once()) return;
    setTried(true);
    if (errs.resolution || errs.seller || errs.note || !resolution) {
      focusFirstError(box.current);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await resolveWarrantyClaim(claim.id, { resolution, note, sellerUserId: seller, transferMaterials: resolution === "replacement" && transfer });
      const files = r.transferred ? r.files : null;
      onDirty(false);
      onDone([t(`done.${resolution}`), files !== null ? t("filesMoved", { n: files }) : ""].filter(Boolean).join(" "));
    } catch (e) {
      logApiError("warranty.resolve", e);
      if (e instanceof ApiError && e.code === "material_transfer_consent_required") {
        setTransfer(false);
        setErr(t("err.noConsent"));
        return;
      }
      setErr(errDetail(e));
    } finally {
      setBusy(false);
    }
  };

  const steps: Step[] = [];
  if (claim.createdAt) steps.push({ id: "created", at: claim.createdAt, title: t("untitled"), sub: label("kind", claim.kind) });
  if (settled) steps.push({ id: "resolved", at: "", title: label("res", claim.resolution), sub: claim.note || undefined });

  return (
    <>
      <div className="opx-pscroll" ref={box}>
        <div className="opx-pgrid2">
          <Party role={t("f.client")} id={claim.client?.id} name={claim.client?.name} phone={claim.client?.phone} lexgoId={claim.client?.lexgoId} empty={tc("notSet")} />
          <Party role={t("f.seller")} id={claim.seller?.id} name={claim.seller?.name} phone={claim.seller?.phone} lexgoId={claim.seller?.lexgoId} empty={tc("noSeller")} />
        </div>
        <FactStrip
          facts={[
            ...(order.workId && order.workId !== job.code ? [{ icon: <IcDoc size={17} />, label: t("f.order"), value: order.workId }] : []),
            { icon: <IcCoins size={17} />, label: tx("amount"), value: order.price === null ? none : `${fmtUzs(order.price)} ${t("som")}` },
            { icon: <IcLayers size={17} />, label: t("f.settlement"), value: claim.settlement ? (tp.has(`settle.${claim.settlement.status}`) ? tp(`settle.${claim.settlement.status}`) : t("other")) : none },
            { icon: <IcClock size={17} />, label: tx("created"), value: claim.createdAt ? shortDateTime(claim.createdAt, locale) : none },
          ]}
        />
        <CaseBox
          icon={<IcShield size={18} />}
          label={t("f.reason")}
          title={label("kind", claim.kind)}
          aside={
            <>
              <small>{t("statusFilter")}</small>
              <span className="opx-pill" data-tone={statusTone}>
                {label("status", claim.status)}
              </span>
            </>
          }
        >
          <p>{claim.reason || none}</p>
        </CaseBox>
        <div className="opx-pcols">
          <Timeline steps={steps} empty={none} />
          {settled ? (
            <CaseBox icon={<IcCheck size={18} />} label={t("f.resolution")} title={label("res", claim.resolution)}>
              {claim.note ? <p>{claim.note}</p> : null}
            </CaseBox>
          ) : (
            <Section icon={<IcScale size={17} />} title={t("resolveTitle")}>
              <Choice
                label={t("resolution")}
                options={claim.resolutions.map((r) => ({ value: r, label: t(`res.${r}`), hint: t(`resHint.${r}`), danger: r === "full_refund" }))}
                value={resolution}
                onChange={pickResolution}
                error={shown.resolution}
              />
              {resolution === "replacement" ? (
                <>
                  <SellerPick
                    label={t("seller")}
                    required
                    hint={t("sellerHelp")}
                    error={shown.seller}
                    value={seller}
                    serviceId={order.serviceId}
                    excludeUserId={claim.seller?.id ?? ""}
                    onChange={(id) => {
                      setSeller(id);
                      onDirty(true);
                    }}
                  />
                  <WcSwitch
                    icon={<IcDoc size={18} />}
                    label={t("transfer")}
                    text={consent}
                    checked={transfer}
                    disabled={claim.filesConsent === false}
                    onChange={(v) => {
                      setTransfer(v);
                      onDirty(true);
                    }}
                  />
                </>
              ) : null}
              <Field
                label={t("note")}
                value={note}
                onChange={(v) => {
                  setNote(v);
                  onDirty(true);
                }}
                max={NOTE_MAX}
                required
                multiline
                error={shown.note}
              />
              {resolution === "full_refund" ? <Note tone="warn">{t("refundNote")}</Note> : null}
              {err !== null ? (
                <Note tone="bad">
                  <b>{t("err.failed")}</b>
                  {err ? ` ${err}` : null}
                </Note>
              ) : null}
            </Section>
          )}
        </div>
      </div>
      {settled ? (
        <PanelFoot onCancel={onClose} cancelLabel={tx("close")} />
      ) : (
        <PanelFoot onCancel={onClose} primary={() => void submit()} primaryLabel={resolution ? t(`confirm.${resolution}`) : t("confirmAny")} busy={busy} danger={resolution === "full_refund"} />
      )}
    </>
  );
}
