"use client";

import { Suspense, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth, sessionRoles } from "@/lib/auth";
import { getClientProfile, updateClientProfile } from "@/lib/services/backend";
import { useResourceOne } from "@/lib/useResource";
import { useUrlTab } from "@/lib/useUrlTab";
import { notify } from "@/lib/toast";
import Tabs, { type TabItem } from "@/components/ui/Tabs";
import Modal from "@/components/admin/Modal";
import FieldError from "@/components/ui/FieldError";
import { ErrorState, Skeleton } from "@/components/portal/DataState";
import PhotoUpload from "@/components/register/PhotoUpload";
import TwoFactorCard from "@/components/portal/TwoFactorCard";
import TelegramLinkCard from "@/components/portal/TelegramLinkCard";
import NotificationPrefsCard from "@/components/portal/NotificationPrefsCard";
import AccountAudit from "@/components/portal/AccountAudit";
import { IconBell, IconEdit, IconMail, IconPhone, IconShieldCheck, IconUser } from "@/components/icons";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TABS = ["personal", "security", "notifications"] as const;
type StaffTab = (typeof TABS)[number];
const TAB_ICON: Record<StaffTab, typeof IconUser> = { personal: IconUser, security: IconShieldCheck, notifications: IconBell };
const TAB_REVEAL: Record<StaffTab, RegExp> = {
  personal: /^staff-profile[.:]account/,
  security: /^profile[.:](two-factor|telegram|sessions|security-events|account-audit)/,
  notifications: /^profile[.:]notification-prefs/,
};

export default function StaffProfile() {
  return (
    <Suspense
      fallback={
        <div className="ppanel">
          <Skeleton rows={3} />
        </div>
      }
    >
      <StaffProfileInner />
    </Suspense>
  );
}

function StaffProfileInner() {
  const t = useTranslations("admin.profile");
  const ta = useTranslations("admin");
  const { session, update } = useAuth();
  const [tab, pick] = useUrlTab(TABS, "personal");
  const [key, setKey] = useState(0);
  const prof = useResourceOne(getClientProfile, [key]);
  const [editOpen, setEditOpen] = useState(false);

  const p = prof.data;
  const name = p?.name || session?.name || "";
  const email = p?.email || "";
  const photo = p?.avatarUrl || "";
  const phone = p?.phone || session?.phone || "";
  const lexgoId = session?.lexgoId || "";
  const roles = sessionRoles(session);
  const roleLabel = (r: string) => (ta.has(`roleBadges.${r}`) ? ta(`roleBadges.${r}`) : r);
  const permCount = session?.permissions?.length ?? 0;

  const panels: Record<StaffTab, React.ReactNode> = {
    personal: (
      <div className="ppanel" data-ai-target="staff-profile:account" data-ai-id="staff-profile.account" data-ai-type="section">
        <div className="ppanel__h">
          <b className="ppanel__t">
            <span className="pico"><IconUser /></span>
            {t("accountTitle")}
          </b>
        </div>
        <div className="pkv pkv--cols" data-ai-private>
          <div className={`pkv__i${name ? "" : " pkv__i--empty"}`}><label>{t("name")}</label><b>{name || "—"}</b></div>
          <div className={`pkv__i${phone ? "" : " pkv__i--empty"}`}><label>{t("phone")}</label><b>{phone || "—"}</b></div>
          <div className={`pkv__i${email ? "" : " pkv__i--empty"}`}><label>{t("email")}</label><b>{email || "—"}</b></div>
          <div className={`pkv__i${lexgoId ? "" : " pkv__i--empty"}`}><label>{t("myId")}</label><b>{lexgoId || "—"}</b></div>
          <div className="pkv__i pkv__i--wide">
            <label>{t("roles")}</label>
            <b className="sprof__roles">
              {roles.length ? roles.map((r) => <span className="sprof__role" key={r}>{roleLabel(r)}</span>) : "—"}
            </b>
          </div>
          <div className="pkv__i"><label>{t("permissions")}</label><b>{t("permCount", { n: permCount })}</b></div>
        </div>
        <p className="ppanel__note sprof__note">{t("phoneNote")}</p>
      </div>
    ),
    security: (
      <div className="cprofile__stack">
        <div className="pgrid2">
          <TwoFactorCard />
          <TelegramLinkCard />
        </div>
        <AccountAudit />
      </div>
    ),
    notifications: <NotificationPrefsCard />,
  };
  const items: TabItem<StaffTab>[] = TABS.map((k) => {
    const Icon = TAB_ICON[k];
    return { key: k, label: t(`tabs.${k}`), icon: <Icon />, panel: panels[k], lazy: true };
  });

  return (
    <div className="cprofile">
      <section className="cprof" aria-label={t("title")}>
        {prof.status === "loading" && !p ? (
          <Skeleton rows={2} />
        ) : prof.status === "error" ? (
          <ErrorState onRetry={() => setKey((k) => k + 1)} title={t("loadError")} compact />
        ) : (
          <>
            <div className="cprof__av" data-ai-private>
              <PhotoUpload value={photo} name={name} onChange={() => {}} label="" hint="" readOnly />
            </div>
            <div className="cprof__main">
              <div className="cprof__name">
                <h2>{name || "—"}</h2>
                {roles.slice(0, 2).map((r) => (
                  <span className="cprof__role" key={r}>{roleLabel(r)}</span>
                ))}
                {roles.length > 2 ? <span className="cprof__role">+{roles.length - 2}</span> : null}
              </div>
              <ul className="cprof__meta" data-ai-private>
                {lexgoId ? (
                  <li className="cprof__id" title={t("myId")}>
                    <span>{t("myId")}</span>
                    <b>{lexgoId}</b>
                  </li>
                ) : null}
                {phone ? (
                  <li>
                    <IconPhone aria-hidden="true" />
                    {phone}
                  </li>
                ) : null}
                <li className={email ? undefined : "is-miss"}>
                  <IconMail aria-hidden="true" />
                  {email || t("emailMissing")}
                </li>
              </ul>
            </div>
            <button className="btn btn--soft btn--sm cprof__edit" type="button" onClick={() => setEditOpen(true)} data-ai-id="staff-profile.edit">
              <IconEdit />
              {t("edit")}
            </button>
          </>
        )}
      </section>

      <Tabs<StaffTab> items={items} value={tab} onChange={pick} label={t("tabsLabel")} aiId="staff-profile" className="cprofile__tabs" reveal={TAB_REVEAL} />

      <StaffEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={{ name, email, photo }}
        onSaved={(np) => {
          if (np.name && session) update({ name: np.name });
          setKey((k) => k + 1);
        }}
      />
    </div>
  );
}

function StaffEditModal({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: { name: string; email: string; photo: string };
  onSaved: (p: { name: string; email: string }) => void;
}) {
  const t = useTranslations("admin.profile");
  const tc = useTranslations("common");
  const uid = useId();
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [photo, setPhoto] = useState(initial.photo);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<{ name?: string; email?: string }>({});
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial.name !== prevInitial.name || initial.email !== prevInitial.email || initial.photo !== prevInitial.photo) {
    setPrevInitial(initial);
    setName(initial.name);
    setEmail(initial.email);
    setPhoto(initial.photo);
    setErrs({});
  }

  async function submit(e: React.FormEvent) {
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
      onSaved({ name: n, email: m });
      onClose();
    } catch (err) {
      notify.error(t("saveFailed"), { id: "staff-profile-edit", error: err });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("editTitle")}>
      <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit} noValidate data-ai-id="staff-profile.edit-modal" data-ai-type="modal" data-ai-label={t("editTitle")} data-ai-private>
        <PhotoUpload value={photo} name={name} onChange={setPhoto} label={t("photo")} hint={t("photoHint")} />
        <div>
          <label htmlFor={`${uid}-name`}>{t("name")}</label>
          <input
            id={`${uid}-name`}
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
              if (errs.name) setErrs((x) => ({ ...x, name: undefined }));
            }}
            autoComplete="name"
            aria-invalid={errs.name ? true : undefined}
            aria-describedby={errs.name ? `${uid}-name-err` : undefined}
          />
          <FieldError id={`${uid}-name-err`} msg={errs.name} />
        </div>
        <div>
          <label htmlFor={`${uid}-email`}>{t("email")}</label>
          <input
            id={`${uid}-email`}
            value={email}
            maxLength={120}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errs.email) setErrs((x) => ({ ...x, email: undefined }));
            }}
            type="email"
            autoComplete="email"
            aria-invalid={errs.email ? true : undefined}
            aria-describedby={errs.email ? `${uid}-email-err` : undefined}
          />
          <FieldError id={`${uid}-email-err`} msg={errs.email} />
        </div>
        <button className="btn btn--pri btn--full" type="submit" disabled={busy}>
          {busy ? t("saving") : t("save")}
        </button>
      </form>
    </Modal>
  );
}
