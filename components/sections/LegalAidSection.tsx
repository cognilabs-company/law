"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { createLegalAidRequest } from "@/lib/services/backend";
import { IconShieldCheck } from "@/components/icons";

export default function LegalAidSection() {
  const t = useTranslations("legalAid");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">("idle");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    if (!name.trim() || !phone.trim() || !details.trim()) {
      setState("error");
      return;
    }
    setState("sending");
    try {
      await createLegalAidRequest({
        title: details.trim().slice(0, 80),
        payload: { name: name.trim(), phone: phone.trim(), details: details.trim() },
      });
      setState("ok");
      setName("");
      setPhone("");
      setDetails("");
    } catch {
      setState("error");
    }
  }

  return (
    <section className="sec">
      <div className="wrap" style={{ maxWidth: 720 }}>
        <div className="head">
          <span className="kick">
            <IconShieldCheck />
            {t("kicker")}
          </span>
          <h2 className="h2">{t("title")}</h2>
          <p className="lead">{t("lead")}</p>
        </div>
        <form className="cform" onSubmit={submit} noValidate>
          <div>
            <label htmlFor="la-name">{t("name")}</label>
            <input id="la-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePh")} />
          </div>
          <div>
            <label htmlFor="la-phone">{t("phone")}</label>
            <input id="la-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 __ ___ __ __" />
          </div>
          <div>
            <label htmlFor="la-details">{t("details")}</label>
            <textarea id="la-details" value={details} onChange={(e) => setDetails(e.target.value)} placeholder={t("detailsPh")} />
          </div>
          {state === "error" ? (
            <p className="disc" style={{ color: "var(--dk-txt-err, #C0392B)", borderTop: 0, padding: 0 }}>{t("required")}</p>
          ) : null}
          {state === "ok" ? <div className="cform__ok">{t("success")}</div> : null}
          <button className="btn btn--pri" type="submit" disabled={state === "sending"}>
            {state === "sending" ? t("sending") : t("submit")}
          </button>
        </form>
      </div>
    </section>
  );
}
