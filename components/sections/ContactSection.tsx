"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { createLead } from "@/lib/services/backend";
import { IconInfo, IconChat, IconClock } from "../icons";

export default function ContactSection() {
  const t = useTranslations("contactPage");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "error" | "ok" | "sending">("idle");

  const offices = t.raw("offices") as {
    city: string;
    address: string;
    phone: string;
  }[];
  const departments = t.raw("departments") as {
    title: string;
    text: string;
    contact: string;
  }[];

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
                  <a href="tel:+998787770000">{t("phoneValue")}</a> ·{" "}
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
                <IconClock />
              </span>
              <div>
                <b>{t("hours")}</b>
                <span>{t("hoursValue")}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="head" style={{ marginTop: 48 }}>
          <h2 className="h2">{t("officesTitle")}</h2>
        </div>
        <div className="offices">
          {offices.map((o, i) => (
            <div className="office" key={i}>
              <b>{o.city}</b>
              <p>{o.address}</p>
              <a href={`tel:${o.phone.replace(/[^+\d]/g, "")}`}>{o.phone}</a>
            </div>
          ))}
        </div>

        <div className="head" style={{ marginTop: 48 }}>
          <h2 className="h2">{t("departmentsTitle")}</h2>
        </div>
        <div className="offices">
          {departments.map((d, i) => (
            <div className="office" key={i}>
              <b>{d.title}</b>
              <p>{d.text}</p>
              <a href={`mailto:${d.contact}`}>{d.contact}</a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
