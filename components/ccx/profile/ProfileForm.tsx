"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { updateClientProfile } from "@/lib/services/backend";
import { notify } from "@/lib/toast";
import PhotoUpload from "@/components/register/PhotoUpload";
import { prettyPhone } from "../now/feed";
import { IcCheck } from "../icons";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type ProfileDraft = { name: string; email: string; photo: string };

export default function ProfileForm({ initial, phone, onSaved }: { initial: ProfileDraft; phone: string; onSaved: (p: ProfileDraft) => void }) {
  const t = useTranslations("admin.profile");
  const tc = useTranslations("common");
  const tp = useTranslations("admin.ccx.panel");
  const uid = useId();
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [photo, setPhoto] = useState(initial.photo);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<{ name?: string; email?: string }>({});
  const dirty = name !== initial.name || email !== initial.email || photo !== initial.photo;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const n = name.trim();
    const m = email.trim();
    const next = {
      name: !n ? tc("required") : n.length < 2 ? t("errors.nameShort") : undefined,
      email: m && !EMAIL.test(m) ? t("errors.emailInvalid") : undefined,
    };
    if (next.name || next.email) {
      setErrs(next);
      return;
    }
    setBusy(true);
    setErrs({});
    try {
      await updateClientProfile({ name: n, email: m, ...(photo !== initial.photo ? { avatar_url: photo } : {}) });
      notify.success(t("saved"), { id: "staff-profile-edit" });
      onSaved({ name: n, email: m, photo });
    } catch (err) {
      notify.error(t("saveFailed"), { id: "staff-profile-edit", error: err });
    } finally {
      setBusy(false);
    }
  }

  const reset = () => {
    setName(initial.name);
    setEmail(initial.email);
    setPhoto(initial.photo);
    setErrs({});
  };

  return (
    <form className="opx-pf-form" onSubmit={submit} noValidate data-ai-id="staff-profile.edit-modal" data-ai-type="form" data-ai-label={t("editTitle")} data-ai-private>
      <div className="opx-pf-photo">
        <PhotoUpload value={photo} name={name} onChange={setPhoto} label={t("photo")} hint={t("photoHint")} />
      </div>

      <div className="opx-pf-fields">
        <div className={`opx-field${errs.name ? " has-error" : ""}`}>
          <label htmlFor={`${uid}-name`}>
            {t("name")}
            <i aria-hidden="true">*</i>
          </label>
          <input
            id={`${uid}-name`}
            value={name}
            maxLength={80}
            autoComplete="name"
            required
            aria-invalid={errs.name ? true : undefined}
            aria-describedby={errs.name ? `${uid}-name-err` : undefined}
            data-ai-id="staff-profile.edit"
            onChange={(e) => {
              setName(e.target.value);
              if (errs.name) setErrs((x) => ({ ...x, name: undefined }));
            }}
          />
          {errs.name ? (
            <p className="opx-ferr" id={`${uid}-name-err`} role="alert">
              {errs.name}
            </p>
          ) : null}
        </div>

        <div className={`opx-field${errs.email ? " has-error" : ""}`}>
          <label htmlFor={`${uid}-email`}>{t("email")}</label>
          <input
            id={`${uid}-email`}
            value={email}
            maxLength={120}
            type="email"
            autoComplete="email"
            aria-invalid={errs.email ? true : undefined}
            aria-describedby={errs.email ? `${uid}-email-err` : undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errs.email) setErrs((x) => ({ ...x, email: undefined }));
            }}
          />
          {errs.email ? (
            <p className="opx-ferr" id={`${uid}-email-err`} role="alert">
              {errs.email}
            </p>
          ) : null}
        </div>

        <div className="opx-field opx-pf-ro">
          <label htmlFor={`${uid}-phone`}>{t("phone")}</label>
          <input id={`${uid}-phone`} value={phone ? prettyPhone(phone) : "—"} readOnly aria-describedby={`${uid}-phone-note`} />
          <small className="opx-pf-ro__note" id={`${uid}-phone-note`}>
            {t("phoneNote")}
          </small>
        </div>
      </div>

      <footer className="opx-pf-form__foot">
        {dirty ? (
          <button type="button" className="opx-pbtn opx-pbtn--ghost" onClick={reset} disabled={busy}>
            {tp("cancel")}
          </button>
        ) : null}
        <button type="submit" className="opx-pbtn opx-pbtn--main" disabled={busy || !dirty} aria-busy={busy}>
          <IcCheck size={16} />
          {busy ? t("saving") : t("save")}
        </button>
      </footer>
    </form>
  );
}
