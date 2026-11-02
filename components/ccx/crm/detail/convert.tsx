"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { fmtUzs } from "@/lib/money";
import { toast } from "@/lib/toast";
import { crmCode, getCrmCustomer, leadCan, lookupPackages, lookupSellers, lookupServices, prepareConversion, type ConvOption, type CrmLead } from "@/lib/services/crm";
import Sheet from "../../panel/Sheet";
import { Note, PanelFoot } from "../../panel/bits";
import { IcDoc, IcLayers, IcUser } from "../../icons";
import { LookupField } from "./lookup";
import { IcCart } from "./glyphs";
import { Card, Pill, SheetHead, TextArea, TextInput } from "./kit";
import { useCrmErr } from "../leads/util";

export function ConvertCard({ lead, onDone }: { lead: CrmLead; onDone: () => void }) {
  const t = useTranslations("crm.conv");
  const ts = useTranslations("crm.side");
  const tps = useTranslations("crm.customer.payStatus");
  const tx = useTranslations("admin.ccx.crmDetail");
  const can = leadCan(lead, "prepare_conversion");
  const [service, setService] = useState<ConvOption | null>(null);
  const [pkg, setPkg] = useState<ConvOption | null>(null);
  const [seller, setSeller] = useState<ConvOption | null>(null);
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [review, setReview] = useState(false);
  const amount = price ? Math.round(Number(price.replace(/\D/g, ""))) : null;
  if (!can && !lead.order) return null;
  const pickService = (v: ConvOption | null) => {
    if (v?.id !== service?.id) {
      setSeller(null);
      setPkg(null);
    }
    setService(v);
  };
  const reset = () => {
    setService(null);
    setPkg(null);
    setSeller(null);
    setPrice("");
    setNote("");
  };
  const paid = lead.order?.paymentStatus === "paid";
  return (
    <Card icon={<IcCart size={17} />} title={t("title")} className="opx-cd-conv">
      {lead.order ? (
        <div className="opx-cd-order" data-paid={paid || undefined}>
          <IcDoc size={18} />
          <span>
            <small>{ts("order")}</small>
            {lead.order.workId ? <b className="opx-num">{lead.order.workId}</b> : null}
          </span>
          <Pill tone={paid ? "ok" : "warn"}>{tps.has(lead.order.paymentStatus) ? tps(lead.order.paymentStatus) : ts("orderPrepared")}</Pill>
        </div>
      ) : null}
      {can ? (
        <>
          <p className="opx-cd-sub">{t("lead")}</p>
          <div className="opx-cd-conv__grid">
            <LookupField<ConvOption>
              label={t("service")}
              value={service}
              onChange={pickService}
              load={(q, offset, signal) => lookupServices(q, offset, signal)}
              title={(o) => o.title}
              sub={(o) => o.sub}
              text={{ placeholder: t("pickService"), searchPh: t("findService"), empty: t("noService") }}
              clearLabel={t("clear")}
            />
            <LookupField<ConvOption>
              key={`pkg-${service?.id ?? ""}`}
              label={t("package")}
              value={pkg}
              onChange={setPkg}
              load={(q, _offset, signal) => lookupPackages(service?.id ?? "", q, signal)}
              title={(o) => o.title}
              sub={(o) => o.sub}
              icon={<IcLayers size={16} />}
              text={{ placeholder: t("pickPackage"), searchPh: t("findPackage"), empty: t("noPackage") }}
              clearLabel={t("clear")}
            />
            <LookupField<ConvOption>
              key={`seller-${service?.id ?? ""}`}
              label={t("seller")}
              value={seller}
              onChange={setSeller}
              load={(q, offset, signal) => lookupSellers(service?.id ?? "", q, offset, signal)}
              title={(o) => o.title}
              sub={(o) => o.sub}
              icon={<IcUser size={16} />}
              text={{ placeholder: t("pickSeller"), searchPh: t("findSeller"), empty: t("noSeller") }}
              hint={service ? t("sellerHelp") : t("sellerAny")}
              clearLabel={t("clear")}
            />
          </div>
          <div className="opx-cd-conv__row">
            <TextInput label={t("price")} value={price} onChange={setPrice} inputMode="numeric" placeholder="100 000" />
            <TextArea label={t("note")} value={note} onChange={setNote} rows={1} />
            <div className="opx-cd-conv__sum" aria-live="polite">
              <small>{tx("estimate")}</small>
              <b className="opx-num">{amount !== null ? `${fmtUzs(amount)} ${t("som")}` : t("priceLater")}</b>
            </div>
            <button type="button" className="opx-pbtn opx-pbtn--main opx-cd-conv__go" onClick={() => setReview(true)}>
              <IcDoc size={16} />
              {t("review")}
            </button>
          </div>
        </>
      ) : null}
      {review ? (
        <ConvertSheet
          lead={lead}
          service={service}
          pkg={pkg}
          seller={seller}
          amount={amount}
          note={note}
          onDone={onDone}
          onClose={(done) => {
            setReview(false);
            if (done) reset();
          }}
        />
      ) : null}
    </Card>
  );
}

function ConvertSheet({ lead, service, pkg, seller, amount, note, onDone, onClose }: { lead: CrmLead; service: ConvOption | null; pkg: ConvOption | null; seller: ConvOption | null; amount: number | null; note: string; onDone: () => void; onClose: (done: boolean) => void }) {
  const t = useTranslations("crm.conv");
  const crmErr = useCrmErr();
  const [step, setStep] = useState<"review" | "done">("review");
  const [busy, setBusy] = useState(false);
  const [needAccount, setNeedAccount] = useState(false);
  const [linkHelp, setLinkHelp] = useState("");
  const [orderId, setOrderId] = useState("");
  const ok = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await prepareConversion(lead.id, { serviceId: service?.id, packageId: pkg?.id, sellerUserId: seller?.id, price: amount, note });
      const o = (r.converted_order ?? {}) as { work_id?: unknown };
      setOrderId(typeof o.work_id === "string" ? o.work_id : "");
      setStep("done");
      onDone();
    } catch (e) {
      if (crmCode(e) === "crm_customer_account_required") {
        setNeedAccount(true);
        if (lead.customer?.id)
          void getCrmCustomer(lead.customer.id).then(
            (c) => setLinkHelp(c.linking.requiredAction),
            () => undefined,
          );
      } else toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  const close = () => onClose(step === "done");
  const rows: [string, string][] = [
    [t("customer"), lead.customer?.name || "—"],
    [t("service"), service?.title || "—"],
    [t("package"), pkg?.title || "—"],
    [t("seller"), seller?.title || "—"],
  ];
  return (
    <Sheet label={t("title")} head={<SheetHead icon={<IcCart size={20} />} title={t("title")} sub={t("lead")} />} onClose={close}>
      <div className="opx-pscroll">
        <div className="opx-cd-draft" data-done={step === "done" || undefined}>
          <span className="opx-cd-draft__mark">{t("mark")}</span>
          <b className="opx-cd-draft__price opx-num">{amount !== null ? `${fmtUzs(amount)} ${t("som")}` : t("priceLater")}</b>
          <dl>
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            {note.trim() ? (
              <div>
                <dt>{t("note")}</dt>
                <dd>{note}</dd>
              </div>
            ) : null}
          </dl>
        </div>
        {step === "done" ? <Note tone="ok">{orderId ? t("doneText", { id: orderId }) : t("doneNoCode")}</Note> : <Note tone="info">{t("reviewText")}</Note>}
        {needAccount ? (
          <Note tone="warn">
            <b>{t("needAccount")}</b>
            {linkHelp || t("needAccountText")}
          </Note>
        ) : null}
      </div>
      {step === "done" ? (
        <PanelFoot primary={close} primaryLabel={t("close")} kbd={false} />
      ) : (
        <PanelFoot onCancel={close} cancelLabel={t("back")} primary={() => void ok()} primaryLabel={t("create")} busy={busy} disabled={needAccount} />
      )}
    </Sheet>
  );
}
