"use client";

import { Suspense, useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { dateOnly, dateTimeFull } from "@/lib/date";
import { useAuth, hasStoredSession } from "@/lib/auth";
import {
  getClientProfile,
  updateClientProfile,
  listFamilyMembers,
  addFamilyMember,
  deleteFamilyMember,
  setFamilyMemberAccess,
  listPaymentMethods,
  addPaymentMethod,
  deletePaymentMethod,
  listSessions,
  revokeSession,
  apiMe,
  getIdentity,
  type MySubscription,
} from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import { useResource, useResourceOne } from "@/lib/useResource";
import { useAiModal } from "@/lib/ai/registry";
import { PROFILE_TABS, isProfileTab, type ProfileTab } from "@/lib/profileTabs";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";
import { notify } from "@/lib/toast";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import FieldError from "@/components/ui/FieldError";
import Tabs, { type TabItem } from "@/components/ui/Tabs";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import {
  IconBell,
  IconCard,
  IconCheck,
  IconClipboardCheck,
  IconClose,
  IconEdit,
  IconMail,
  IconMonitor,
  IconPhone,
  IconPlus,
  IconShieldCheck,
  IconSparkle,
  IconUser,
  IconUsers,
} from "@/components/icons";
import IdentityVerify from "@/components/portal/IdentityVerify";
import PhotoUpload from "@/components/register/PhotoUpload";
import TwoFactorCard from "@/components/portal/TwoFactorCard";
import TelegramLinkCard from "@/components/portal/TelegramLinkCard";
import NotificationPrefsCard from "@/components/portal/NotificationPrefsCard";
import AccountAudit from "@/components/portal/AccountAudit";
import ClientPayments from "@/components/portal/ClientPayments";
import ClientComplaints from "@/components/complaints/ClientComplaints";
import ClientWarranty from "@/components/portal/ClientWarranty";
import { statusLabel } from "@/lib/labels";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EXPIRES = /^(0[1-9]|1[0-2])\/(\d{2})$/;

const TAB_ICON: Record<ProfileTab, typeof IconUser> = {
  personal: IconUser,
  payments: IconCard,
  complaints: IconClipboardCheck,
  security: IconShieldCheck,
  notifications: IconBell,
};

const TAB_REVEAL: Record<ProfileTab, RegExp> = {
  personal: /^profile[.:](family|identity)/,
  payments: /^(payments|profile[.:](cards|subscription))/,
  complaints: /^(complaints|warranty|button:new-complaint)/,
  security: /^profile[.:](two-factor|telegram|sessions|security-events|account-audit)/,
  notifications: /^profile[.:]notification-prefs/,
};

function uzPhone(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 9) return `+998${d}`;
  if (d.length === 12 && d.startsWith("998")) return `+${d}`;
  return null;
}

function expiresProblem(raw: string): "" | "format" | "past" {
  const v = raw.trim();
  if (!v) return "";
  const m = EXPIRES.exec(v);
  if (!m) return "format";
  const end = new Date(2000 + Number(m[2]), Number(m[1]), 0, 23, 59, 59);
  return end.getTime() < Date.now() ? "past" : "";
}

export default function ClientProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="ppanel">
          <Skeleton rows={3} />
        </div>
      }
    >
      <ClientProfile />
    </Suspense>
  );
}

function ClientProfile() {
  const t = useTranslations("portal.client.profile");
  const params = useSearchParams();
  const fromUrl = params.get("tab");
  const tab: ProfileTab = isProfileTab(fromUrl) ? fromUrl : "personal";
  const { session, update } = useAuth();
  const [key, setKey] = useState(0);
  const reload = () => setKey((k) => k + 1);
  const prof = useResourceOne(getClientProfile, [key]);
  const ident = useResourceOne(() => getIdentity().catch(() => null), [key]);
  const [editOpen, setEditOpen] = useState(false);
  useAiModal("profile.personal.edit-modal", () => setEditOpen(true));

  const pick = (next: ProfileTab) => {
    const url = new URL(window.location.href);
    if (next === "personal") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  };

  const p = prof.data;
  const name = p?.name || session?.name || "";
  const email = p?.email || "";
  const avatarUrl = p?.avatarUrl || "";

  const panels: Record<ProfileTab, React.ReactNode> = {
    personal: <PersonalTab reloadKey={key} onChanged={reload} />,
    payments: <PaymentsTab reloadKey={key} sub={p?.subscription} loading={prof.status === "loading"} />,
    complaints: (
      <div className="cprofile__stack">
        <ClientComplaints />
        <ClientWarranty />
      </div>
    ),
    security: <SecurityTab />,
    notifications: <NotificationPrefsCard />,
  };
  const items: TabItem<ProfileTab>[] = PROFILE_TABS.map((k) => {
    const Icon = TAB_ICON[k];
    return { key: k, label: t(`tabs.${k}`), icon: <Icon />, panel: panels[k], lazy: true };
  });

  return (
    <div className="cprofile">
      <ProfileHead
        loading={prof.status === "loading"}
        failed={prof.status === "error"}
        onRetry={reload}
        name={name}
        phone={p?.phone || session?.phone || ""}
        email={email}
        avatarUrl={avatarUrl}
        lexgoId={session?.lexgoId || ""}
        verified={Boolean(ident.data?.verified)}
        provider={ident.data?.provider || ""}
        sub={p?.subscription}
        onEdit={() => setEditOpen(true)}
      />

      <Tabs<ProfileTab> items={items} value={tab} onChange={pick} label={t("tabsLabel")} aiId="profile" className="cprofile__tabs" reveal={TAB_REVEAL} />

      <EditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={{ name, email, photo: avatarUrl }}
        onSaved={(np) => {
          if (np.name && session) update({ name: np.name });
          reload();
        }}
      />
    </div>
  );
}

function ProfileHead({
  loading,
  failed,
  onRetry,
  name,
  phone,
  email,
  avatarUrl,
  lexgoId,
  verified,
  provider,
  sub,
  onEdit,
}: {
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  name: string;
  phone: string;
  email: string;
  avatarUrl: string;
  lexgoId: string;
  verified: boolean;
  provider: string;
  sub?: MySubscription;
  onEdit: () => void;
}) {
  const t = useTranslations("portal.client.profile");
  const tcm = useTranslations("portal.common");
  return (
    <section className="cprof" data-ai-target="profile:personal" data-ai-id="profile.personal" data-ai-type="section" aria-label={t("personal")}>
      {loading ? (
        <Skeleton rows={2} />
      ) : failed ? (
        <ErrorState onRetry={onRetry} title={t("loadError")} compact />
      ) : (
        <>
          <div className="cprof__av" data-ai-private>
            <PhotoUpload value={avatarUrl} name={name} onChange={() => {}} label="" hint="" readOnly />
          </div>
          <div className="cprof__main">
            <div className="cprof__name">
              <h2>{name || t("notSet")}</h2>
              {verified ? (
                <span className="tfa__on" title={provider.toUpperCase() || undefined}>
                  <IconShieldCheck />
                  {t("verifiedProfile")}
                </span>
              ) : null}
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
            {sub ? (
              <Link href="/portal/client/subscription" className="cprof__sub">
                <IconSparkle aria-hidden="true" />
                <b>{sub.planName}</b>
                <span>{statusLabel(tcm, sub.status)}</span>
              </Link>
            ) : null}
          </div>
          <button className="btn btn--soft btn--sm cprof__edit" type="button" onClick={onEdit} data-ai-id="profile.personal.edit">
            <IconEdit />
            {t("edit")}
          </button>
        </>
      )}
    </section>
  );
}

function PersonalTab({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) {
  const t = useTranslations("portal.client.profile");
  const [key, setKey] = useState(0);
  const family = useResource(() => listFamilyMembers(), [key, reloadKey]);
  const [famOpen, setFamOpen] = useState(false);
  useAiModal("profile.family.add-modal", () => setFamOpen(true));
  const reload = () => {
    setKey((k) => k + 1);
    onChanged();
  };

  async function toggleShare(id: string, next: boolean) {
    try {
      await setFamilyMemberAccess(id, next);
      reload();
    } catch (e) {
      notify.error(t("notify.shareFailed"), { id: `fam-share-${id}`, error: e, map: { 402: t("familyPlanRequired") } });
    }
  }

  async function remove(id: string, who: string) {
    const ok = await confirmDialog({ title: t("confirmFamilyTitle"), text: t("confirmFamilyText", { name: who }), confirmLabel: t("remove"), tone: "danger" });
    if (!ok) return;
    try {
      await deleteFamilyMember(id);
      reload();
    } catch (e) {
      notify.error(t("notify.removeFailed"), { id: `fam-remove-${id}`, error: e });
    }
  }

  return (
    <div className="pgrid2 cprofile__grid">
      <div className="ppanel" data-ai-target="profile:family" data-ai-id="profile.family" data-ai-type="section">
        <div className="ppanel__h">
          <b className="ppanel__t">
            <span className="pico">
              <IconUsers />
            </span>
            {t("family")}
          </b>
          {family.data.length ? (
            <button className="btn btn--soft btn--sm" type="button" onClick={() => setFamOpen(true)} data-ai-id="profile.family.add">
              <IconPlus />
              {t("addFamily")}
            </button>
          ) : null}
        </div>
        <p className="ppanel__note">{t("familyShareNote")}</p>
        {family.status === "loading" ? (
          <Skeleton rows={2} />
        ) : family.status === "error" ? (
          <ErrorState error={family.error} onRetry={reload} compact />
        ) : !family.data.length ? (
          <EmptyState size="sm" icon={<IconUsers />} title={t("noFamily")} text={t("noFamilyText")} action={{ label: t("addFamily"), onClick: () => setFamOpen(true), aiId: "profile.family.add" }} />
        ) : (
          <div className="alist" data-ai-private>
            {family.data.map((m) => (
              <div className="creq" key={m.id}>
                <span className="creq__st" />
                <div className="creq__m">
                  <b>{m.name}</b>
                  <span>{[m.phone, m.relation].filter(Boolean).join(" · ")}</span>
                </div>
                <button type="button" className={`famshare${m.sharedAccess ? " on" : ""}`} aria-pressed={m.sharedAccess} onClick={() => toggleShare(m.id, !m.sharedAccess)}>
                  {m.sharedAccess ? <IconCheck /> : null}
                  {m.sharedAccess ? t("shared") : t("share")}
                </button>
                <button className="calev__x" type="button" aria-label={`${t("remove")}: ${m.name}`} onClick={() => void remove(m.id, m.name)}>
                  <IconClose />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <IdentityVerify />
      <FamilyModal open={famOpen} onClose={() => setFamOpen(false)} onSaved={reload} />
    </div>
  );
}

function PaymentsTab({ reloadKey, sub, loading }: { reloadKey: number; sub?: MySubscription; loading: boolean }) {
  const t = useTranslations("portal.client.profile");
  const tcm = useTranslations("portal.common");
  const locale = useLocale();
  const [key, setKey] = useState(0);
  const methods = useResource(() => listPaymentMethods(), [key, reloadKey]);
  const [cardOpen, setCardOpen] = useState(false);
  useAiModal("profile.cards.add-modal", () => setCardOpen(true));
  const reload = () => setKey((k) => k + 1);

  async function remove(id: string, label: string) {
    const ok = await confirmDialog({ title: t("confirmCardTitle"), text: t("confirmCardText", { card: label }), confirmLabel: t("remove"), tone: "danger" });
    if (!ok) return;
    try {
      await deletePaymentMethod(id);
      reload();
    } catch (e) {
      notify.error(t("notify.removeFailed"), { id: `card-remove-${id}`, error: e });
    }
  }

  return (
    <div className="cprofile__stack">
      <div className="pgrid2 cprofile__grid">
        <div className="ppanel" data-ai-target="profile:cards" data-ai-id="profile.cards" data-ai-type="section">
          <div className="ppanel__h">
            <b className="ppanel__t">
              <span className="pico">
                <IconCard />
              </span>
              {t("cards")}
            </b>
            {methods.data.length ? (
              <button className="btn btn--soft btn--sm" type="button" onClick={() => setCardOpen(true)} data-ai-id="profile.cards.add">
                <IconPlus />
                {t("addCard")}
              </button>
            ) : null}
          </div>
          {methods.status === "loading" ? (
            <Skeleton rows={2} />
          ) : methods.status === "error" ? (
            <ErrorState error={methods.error} onRetry={reload} compact />
          ) : !methods.data.length ? (
            <EmptyState size="sm" icon={<IconCard />} title={t("noCards")} text={t("noCardsText")} action={{ label: t("addCard"), onClick: () => setCardOpen(true), aiId: "profile.cards.add" }} />
          ) : (
            <div className="alist" data-ai-private>
              {methods.data.map((m) => {
                const label = [m.brand ? m.brand.toUpperCase() : t("cardFallback"), `•••• ${m.last4}`].join(" · ");
                return (
                  <div className="creq" key={m.id}>
                    <span className="creq__st" />
                    <div className="creq__m">
                      <b>{label}</b>
                      <span>{[m.expires, m.isDefault ? t("defaultCard") : ""].filter(Boolean).join(" · ")}</span>
                    </div>
                    <button className="calev__x" type="button" aria-label={`${t("remove")}: ${label}`} onClick={() => void remove(m.id, label)}>
                      <IconClose />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="ppanel" data-ai-target="profile:subscription" data-ai-id="profile.subscription" data-ai-type="section">
          <div className="ppanel__h">
            <b className="ppanel__t">
              <span className="pico">
                <IconSparkle />
              </span>
              {t("subscription")}
            </b>
            {sub ? (
              <Link href="/portal/client/subscription" className="btn btn--soft btn--sm" data-ai-id="profile.subscription.manage">
                {t("subManage")}
              </Link>
            ) : null}
          </div>
          {loading ? (
            <Skeleton rows={1} />
          ) : sub ? (
            <dl className="csub">
              <div>
                <dt>{t("subPlan")}</dt>
                <dd>{sub.planName}</dd>
              </div>
              <div>
                <dt>{t("subStatus")}</dt>
                <dd>{statusLabel(tcm, sub.status)}</dd>
              </div>
              {sub.renewsAt ? (
                <div>
                  <dt>{t("subRenews")}</dt>
                  <dd>{dateOnly(sub.renewsAt, locale)}</dd>
                </div>
              ) : null}
              {sub.autoRenew !== undefined ? (
                <div>
                  <dt>{t("subAuto")}</dt>
                  <dd>{sub.autoRenew ? t("subAutoOn") : t("subAutoOff")}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <EmptyState size="sm" icon={<IconSparkle />} title={t("noSub")} text={t("noSubText")} action={{ label: t("subChoose"), href: "/portal/client/subscription", aiId: "profile.subscription.choose" }} />
          )}
        </div>
      </div>

      <ClientPayments />
      <CardModal open={cardOpen} onClose={() => setCardOpen(false)} onSaved={reload} />
    </div>
  );
}

function SecurityTab() {
  const t = useTranslations("portal.client.profile");
  const locale = useLocale();
  const { logout } = useAuth();
  const [key, setKey] = useState(0);
  const sessions = useResource(() => listSessions(), [key]);
  const reload = () => setKey((k) => k + 1);

  async function revoke(id: string) {
    const current = sessions.data.find((x) => x.id === id)?.current;
    const flagged = sessions.data.some((x) => x.current !== undefined);
    try {
      await revokeSession(id);
      if (current) {
        logout();
        return;
      }
      if (!flagged) {
        try {
          await apiMe();
        } catch (e) {
          if (e instanceof ApiError && e.status === 401 && !hasStoredSession()) {
            logout();
            return;
          }
        }
      }
      reload();
    } catch (e) {
      notify.error(t("notify.revokeFailed"), { id: `session-revoke-${id}`, error: e });
    }
  }

  return (
    <div className="cprofile__stack">
      <div className="pgrid2 cprofile__grid">
        <TwoFactorCard />
        <TelegramLinkCard />
      </div>
      <div className="ppanel" data-ai-target="profile:sessions" data-ai-id="profile.sessions" data-ai-type="section">
        <div className="ppanel__h">
          <b className="ppanel__t">
            <span className="pico">
              <IconMonitor />
            </span>
            {t("sessions")}
          </b>
        </div>
        {sessions.status === "loading" ? (
          <Skeleton rows={2} />
        ) : sessions.status === "error" ? (
          <ErrorState error={sessions.error} onRetry={reload} compact />
        ) : !sessions.data.length ? (
          <EmptyState size="sm" icon={<IconMonitor />} title={t("noSessions")} />
        ) : (
          <div className="alist" data-ai-private>
            {sessions.data.map((s) => (
              <div className="creq" key={s.id}>
                <span className={`creq__st${s.current ? " is-on" : ""}`} />
                <div className="creq__m">
                  <b>
                    {s.deviceLabel || s.ip || t("device")}
                    {s.current ? <em className="csess__now">{t("thisDevice")}</em> : null}
                  </b>
                  <span>{[s.ip, s.lastUsedAt ? dateTimeFull(s.lastUsedAt, locale) : ""].filter(Boolean).join(" · ")}</span>
                </div>
                <button className="btn btn--line btn--sm" type="button" onClick={() => revoke(s.id)}>
                  {t("revoke")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <AccountAudit withSessions={false} />
    </div>
  );
}

function EditModal({
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
  const t = useTranslations("portal.client.profile");
  const tc = useTranslations("common");
  const uid = useId();
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [photo, setPhoto] = useState(initial.photo);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<{ name?: string; email?: string }>({});
  // Re-seed every field when a fresh `initial` arrives (the modal re-opening
  // with newer profile data) — otherwise stale local edits would linger.
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
      notify.success(t("saved"), { id: "profile-edit" });
      onSaved({ name: n, email: m });
      onClose();
    } catch (err) {
      notify.error(t("notify.saveFailed"), { id: "profile-edit", error: err });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("editTitle")}>
      <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit} noValidate data-ai-id="profile.personal.edit-modal" data-ai-type="modal" data-ai-label={t("editTitle")} data-ai-private>
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
            placeholder={t("namePh")}
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
            placeholder={t("emailPh")}
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

function FamilyModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("portal.client.profile");
  const tc = useTranslations("common");
  const uid = useId();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("");
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<{ name?: string; phone?: string }>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const n = name.trim();
    const ph = uzPhone(phone);
    const next = {
      name: !n ? tc("required") : n.length < 2 ? t("errors.nameShort") : undefined,
      phone: !phone.trim() ? tc("required") : !ph ? t("errors.phoneInvalid") : undefined,
    };
    if (next.name || next.phone || !ph) {
      setErrs(next);
      return;
    }
    setBusy(true);
    setErrs({});
    try {
      await addFamilyMember({ name: n, phone: ph, relation: relation.trim() || undefined });
      notify.success(t("saved"), { id: "family-add" });
      setName("");
      setPhone("");
      setRelation("");
      onSaved();
      onClose();
    } catch (err) {
      notify.error(t("notify.saveFailed"), { id: "family-add", error: err });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("addFamily")}>
      <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit} noValidate data-ai-id="profile.family.add-modal" data-ai-type="modal" data-ai-label={t("addFamily")} data-ai-private>
        <div>
          <label htmlFor={`${uid}-name`}>{t("memberName")}</label>
          <input
            id={`${uid}-name`}
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
              if (errs.name) setErrs((x) => ({ ...x, name: undefined }));
            }}
            placeholder={t("namePh")}
            aria-invalid={errs.name ? true : undefined}
            aria-describedby={errs.name ? `${uid}-name-err` : undefined}
          />
          <FieldError id={`${uid}-name-err`} msg={errs.name} />
        </div>
        <div>
          <label htmlFor={`${uid}-phone`}>{t("memberPhone")}</label>
          <input
            id={`${uid}-phone`}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (errs.phone) setErrs((x) => ({ ...x, phone: undefined }));
            }}
            placeholder="+998 __ ___ __ __"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={errs.phone ? true : undefined}
            aria-describedby={errs.phone ? `${uid}-phone-err` : undefined}
          />
          <FieldError id={`${uid}-phone-err`} msg={errs.phone} />
        </div>
        <div>
          <label htmlFor={`${uid}-rel`}>{t("relation")}</label>
          <input id={`${uid}-rel`} value={relation} maxLength={60} onChange={(e) => setRelation(e.target.value)} placeholder={t("relationPh")} />
        </div>
        <button className="btn btn--pri btn--full" type="submit" disabled={busy}>
          {busy ? t("saving") : t("save")}
        </button>
      </form>
    </Modal>
  );
}

function CardModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("portal.client.profile");
  const uid = useId();
  const [brand, setBrand] = useState("uzcard");
  const [last4, setLast4] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<{ last4?: string; expires?: string }>({});

  const brandOpts = ["uzcard", "humo", "visa", "mastercard"].map((v) => ({ value: v, label: v.toUpperCase() }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const l4 = last4.replace(/\D/g, "").slice(-4);
    const exp = expiresProblem(expires);
    const next = {
      last4: l4.length !== 4 ? t("last4Invalid") : undefined,
      expires: exp === "format" ? t("errors.expiresFormat") : exp === "past" ? t("errors.expiresPast") : undefined,
    };
    if (next.last4 || next.expires) {
      setErrs(next);
      return;
    }
    setBusy(true);
    setErrs({});
    try {
      await addPaymentMethod({ brand, last4: l4, expires: expires.trim() || undefined });
      notify.success(t("saved"), { id: "card-add" });
      setLast4("");
      setExpires("");
      onSaved();
      onClose();
    } catch (err) {
      notify.error(t("notify.saveFailed"), { id: "card-add", error: err });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("addCard")}>
      <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit} noValidate data-ai-id="profile.cards.add-modal" data-ai-type="modal" data-ai-label={t("addCard")} data-ai-private>
        <div>
          <label>{t("cardBrand")}</label>
          <Select value={brand} onChange={setBrand} options={brandOpts} ariaLabel={t("cardBrand")} />
        </div>
        <div>
          <label htmlFor={`${uid}-last4`}>{t("cardLast4")}</label>
          <input
            id={`${uid}-last4`}
            value={last4}
            onChange={(e) => {
              setLast4(e.target.value.replace(/\D/g, ""));
              if (errs.last4) setErrs((x) => ({ ...x, last4: undefined }));
            }}
            placeholder="1234"
            inputMode="numeric"
            maxLength={4}
            aria-invalid={errs.last4 ? true : undefined}
            aria-describedby={errs.last4 ? `${uid}-last4-err` : undefined}
          />
          <FieldError id={`${uid}-last4-err`} msg={errs.last4} />
        </div>
        <div>
          <label htmlFor={`${uid}-exp`}>{t("cardExpires")}</label>
          <input
            id={`${uid}-exp`}
            value={expires}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, "").slice(0, 4);
              setExpires(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
              if (errs.expires) setErrs((x) => ({ ...x, expires: undefined }));
            }}
            placeholder="MM/YY"
            inputMode="numeric"
            maxLength={5}
            aria-invalid={errs.expires ? true : undefined}
            aria-describedby={errs.expires ? `${uid}-exp-err` : undefined}
          />
          <FieldError id={`${uid}-exp-err`} msg={errs.expires} />
        </div>
        <button className="btn btn--pri btn--full" type="submit" disabled={busy}>
          {busy ? t("saving") : t("save")}
        </button>
      </form>
    </Modal>
  );
}
