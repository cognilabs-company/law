"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { createLead } from "@/lib/services/backend";
import { Link } from "@/i18n/navigation";
import { IconInfo, IconChat, IconBuilding, IconHelpCircle } from "../icons";

// The platform operator from the backend's public support info (GET
// /public/support); null hides the row.
export type ContactCompany = { name: string; address: string } | null;

export default function ContactSection({ company = null }: { company?: ContactCompany }) {
  const t = useTranslations("contactPage");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "error" | "ok" | "sending">("idle");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    if (!name.trim() || !contact.trim()) {
      setState("error");
      return;
    }
    setState("sending");
    try {
      await createLead({
        name: name.trim(),
        phone: contact.trim(),
        note: message.trim(),
      });
      setState("ok");
      setName("");
      setContact("");
      setMessage("");
    } catch {
      setState("error");
    }
  }

  return (
    <section className="sec">
      <div className="wrap">
        <div className="head">
          <span className="kick">{t("kicker")}</span>
          <h2 className="h2">{t("title")}</h2>
          <p className="lead">{t("lead")}</p>
        </div>

        <div className="contact__grid">
          <form className="cform" onSubmit={submit} noValidate>
            <div>
              <label htmlFor="c-name">{t("form.name")}</label>
              <input
                id="c-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("form.namePlaceholder")}
              />
            </div>
            <div>
              <label htmlFor="c-contact">{t("form.contact")}</label>
              <input
                id="c-contact"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder={t("form.contactPlaceholder")}
              />
            </div>
            <div>
              <label htmlFor="c-msg">{t("form.message")}</label>
              <textarea
                id="c-msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("form.messagePlaceholder")}
              />
            </div>
            {state === "error" ? (
              <p className="disc" style={{ color: "var(--dk-txt-err, #C0392B)", borderTop: 0, padding: 0 }}>
                {t("form.required")}
              </p>
            ) : null}
            {state === "ok" ? (
              <div className="cform__ok">{t("form.success")}</div>
            ) : null}
            <button className="btn btn--pri" type="submit" disabled={state === "sending"}>
              {state === "sending" ? t("form.sending") : t("form.submit")}
            </button>
          </form>

          <div className="contact__info">
            <div className="contact__row">
              <span className="card__i">
                <IconInfo />
              </span>
              <div>
                <b>{t("phone")}</b>
                <span>
                  <a href="tel:+998909338678">{t("phoneValue")}</a> ·{" "}
                  {t("phoneNote")}
                </span>
              </div>
            </div>
            <div className="contact__row">
              <span className="card__i">
                <IconChat />
              </span>
              <div>
                <b>{t("email")}</b>
                <span>
                  <a href={`mailto:${t("emailValue")}`}>{t("emailValue")}</a>
                </span>
              </div>
            </div>
            <div className="contact__row">
              <span className="card__i">
                <IconHelpCircle />
              </span>
              <div>
                <b>
                  <Link href="/support">{t("supportCenter")}</Link>
                </b>
                <span>{t("supportCenterText")}</span>
              </div>
            </div>
            {company ? (
              <div className="contact__row">
                <span className="card__i">
                  <IconBuilding />
                </span>
                <div>
                  <b>{t("operator")}</b>
                  <span>
                    {company.name}
                    {company.address ? <><br />{company.address}</> : null}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

      </div>
    </section>
  );
}
