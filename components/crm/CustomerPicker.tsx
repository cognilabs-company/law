"use client";

import { useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { IconCheck, IconUser } from "@/components/icons";
import { toast } from "@/lib/toast";
import { createCrmCustomer, optionOfCustomer, selectCrmCustomers, type ContactInput, type CrmCustomerDetail, type CrmMeta, type CustomerOption } from "@/lib/services/crm";
import { useCrmError } from "./bits";
import { CrmSelect } from "./fields";
import { LookupPicker } from "./LookupPicker";

// Contract 2026-10-27 (CRM customer/lead) §5–6: the lead form's one
// customer source — GET /crm/customers/select through the shared lookup;
// "new customer" opens a form above the lead form and the created customer
// comes back selected.
export function CustomerPicker({ value, onChange, onNew, invalid, labelId }: { value: CustomerOption | null; onChange: (c: CustomerOption | null) => void; onNew: () => void; invalid?: boolean; labelId?: string }): ReactElement {
  const t = useTranslations("crm.picker");
  return (
    <LookupPicker<CustomerOption>
      value={value}
      onChange={onChange}
      load={async (q, offset, signal) => selectCrmCustomers({ q, offset }, signal)}
      title={(c) => c.label}
      sub={(c) => [c.region, t("leadsN", { n: c.leadCount })].filter(Boolean).join(" · ")}
      badge={(c) => (c.isLexgoUser ? c.lexgoLabel || t("lexgoUser") : "")}
      icon={<IconUser aria-hidden="true" />}
      text={{ placeholder: t("placeholder"), search: t("search"), searchPh: t("searchPh"), empty: t("empty") }}
      action={{ label: t("newCustomer"), run: onNew }}
      invalid={invalid}
      labelId={labelId}
    />
  );
}

// Creating a customer: no LexGo account field — the backend links it by the
// verified phone and may answer with an existing customer for that contact.
export function NewCustomerModal({ meta, onClose, onCreated, nested }: { meta: CrmMeta; onClose: () => void; onCreated: (c: CrmCustomerDetail) => void; nested?: boolean }): ReactElement {
  const t = useTranslations("crm.newCustomer");
  const tl = useTranslations("crm.lang");
  const crmErr = useCrmError();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [telegram, setTelegram] = useState("");
  const [email, setEmail] = useState("");
  const [region, setRegion] = useState("");
  const [language, setLanguage] = useState(meta.languages[0] || "uz_latn");
  const [notes, setNotes] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const nameErr = tried && !name.trim() ? t("nameRequired") : "";
  const submit = async () => {
    setTried(true);
    if (!name.trim() || busy || sending.current) return;
    sending.current = true;
    setBusy(true);
    const contacts: ContactInput[] = [
      { type: "phone", value: phone, primary: true },
      { type: "telegram", value: telegram, primary: !phone.trim() },
      { type: "email", value: email, primary: !phone.trim() && !telegram.trim() },
    ].filter((c) => c.value.trim());
    try {
      const c = await createCrmCustomer({ name, region, language, notes, contacts, source: "manual" });
      // The backend answers with the existing customer when the contact is already one.
      const reused = c.leadCount > 0 || (!!c.createdAt && Date.parse(c.createdAt) < Date.now() - 60_000);
      toast(reused ? t("doneExisting", { id: c.publicId }) : t("done", { id: c.publicId }), { tone: "ok" });
      onCreated(c);
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      variant={nested ? undefined : "drawer"}
      title={t("title")}
      description={nested ? t("leadNested") : t("lead")}
      busy={busy}
      dirty={!!(name || phone || telegram || email || notes)}
      footer={
        <>
          <button type="button" className="crm-btn" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => void submit()} aria-busy={busy || undefined} disabled={busy}>
            <IconCheck aria-hidden="true" />
            {nested ? t("createAndPick") : t("create")}
          </button>
        </>
      }
    >
      <div className="crm-pop">
        <label className="crm-field" data-err={nameErr ? "" : undefined}>
          <span>{t("name")}</span>
          <input className="crm-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-invalid={!!nameErr} />
          {nameErr ? <em>{nameErr}</em> : null}
        </label>
        <div className="crm-row2">
          <label className="crm-field">
            <span>{t("phone")}</span>
            <input className="crm-input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998" />
            <small>{t("phoneHelp")}</small>
          </label>
          <label className="crm-field">
            <span>{t("telegram")}</span>
            <input className="crm-input" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@" />
          </label>
        </div>
        <div className="crm-row2">
          <label className="crm-field">
            <span>{t("email")}</span>
            <input className="crm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="crm-field">
            <span>{t("region")}</span>
            <input className="crm-input" value={region} onChange={(e) => setRegion(e.target.value)} />
          </label>
        </div>
        <div className="crm-field">
          <span>{t("language")}</span>
          <CrmSelect value={language} onChange={setLanguage} label={t("language")} options={meta.languages.map((l) => ({ value: l, label: tl.has(l) ? tl(l) : l }))} />
        </div>
        <label className="crm-field">
          <span>{t("notes")}</span>
          <textarea className="crm-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

export { optionOfCustomer };
