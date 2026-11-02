"use client";

import "../panel/panel.css";
import "./profile.css";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useAuth, sessionRoles } from "@/lib/auth";
import { getClientProfile, listCcCalls, type ClientProfile } from "@/lib/services/backend";
import { useResourceOne } from "@/lib/useResource";
import { useCcNow, useCcShift } from "@/lib/callcenter/ccOperator";
import TwoFactorCard from "@/components/portal/TwoFactorCard";
import TelegramLinkCard from "@/components/portal/TelegramLinkCard";
import NotificationPrefsCard from "@/components/portal/NotificationPrefsCard";
import AccountAudit from "@/components/portal/AccountAudit";
import { Loading, Note } from "../panel/bits";
import { IcRefresh, IcShield, IcUser } from "../icons";
import ProfileForm, { type ProfileDraft } from "./ProfileForm";
import WorkPrefs from "./WorkPrefs";
import { ProfileHead, RolesCard, ShiftTiles } from "./parts";

const EMPTY: ClientProfile = { name: "", phone: "", email: "", avatarUrl: "" };

export default function CcxProfile() {
  const t = useTranslations("admin.profile");
  const ta = useTranslations("admin");
  const tc = useTranslations("common");
  const tp = useTranslations("admin.ccx.panel");
  const { session, update, logout } = useAuth();
  const shift = useCcShift();
  const now = useCcNow();
  const params = useSearchParams();
  const tab = params.get("section") ?? params.get("tab");
  const [key, setKey] = useState(0);
  const prof = useResourceOne(getClientProfile, [key]);
  const calls = useResourceOne(() => listCcCalls(), []);
  const [saved, setSaved] = useState<ClientProfile | null>(null);

  const p = prof.data ?? saved;
  const name = p?.name || session?.name || "";
  const email = p?.email || "";
  const photo = p?.avatarUrl || "";
  const phone = p?.phone || session?.phone || "";
  const lexgoId = session?.lexgoId || "";
  const roles = sessionRoles(session).map((r) => ({ key: r, label: ta.has(`roleBadges.${r}`) ? ta(`roleBadges.${r}`) : r }));
  const primary = (session?.backendRole ?? "").trim().toLowerCase();

  useEffect(() => {
    if (tab !== "security" && tab !== "notifications") return;
    const id = window.requestAnimationFrame(() => document.getElementById(`opx-pf-${tab}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
    return () => window.cancelAnimationFrame(id);
  }, [tab]);

  const onSaved = (d: ProfileDraft) => {
    if (d.name && session) update({ name: d.name });
    setSaved({ ...(p ?? EMPTY), name: d.name, email: d.email, avatarUrl: d.photo });
    setKey((k) => k + 1);
  };

  return (
    <div className="opx-pf" data-ai-target="callcenter:profile">
      <ProfileHead name={name} phone={phone} email={email} lexgoId={lexgoId} photo={photo} roles={roles} shift={shift} onLogout={logout} />

      <ShiftTiles shift={shift} now={now} calls={calls} me={session?.id ?? ""} />

      <div className="opx-pf-grid">
        <section className="opx-pf-card" id="opx-pf-personal" aria-labelledby="opx-pf-personal-t" data-ai-target="staff-profile:account" data-ai-id="staff-profile.account" data-ai-type="section">
          <header className="opx-pf-card__head">
            <span className="opx-pf-card__ic" aria-hidden="true">
              <IcUser size={18} />
            </span>
            <span className="opx-pf-card__t">
              <h3 id="opx-pf-personal-t">{t("accountTitle")}</h3>
            </span>
          </header>
          {p ? (
            <ProfileForm key={`${name}|${email}|${photo}`} initial={{ name, email, photo }} phone={phone} onSaved={onSaved} />
          ) : prof.status === "error" ? (
            <div className="opx-pf-fail">
              <Note tone="bad">{t("loadError")}</Note>
              <button type="button" className="opx-pbtn" onClick={() => setKey((k) => k + 1)}>
                <IcRefresh size={16} />
                {tc("retry")}
              </button>
            </div>
          ) : (
            <Loading label={tp("loading")} />
          )}
        </section>

        <WorkPrefs />
      </div>

      <div className="opx-pf-grid">
        <RolesCard roles={roles} primary={primary} permissions={session?.permissions ?? []} />
        <div className="opx-pf-legacy opx-pf-notif" id="opx-pf-notifications">
          <NotificationPrefsCard />
        </div>
      </div>

      <section className="opx-pf-block" id="opx-pf-security" aria-labelledby="opx-pf-security-t">
        <h3 className="opx-pf-block__t" id="opx-pf-security-t">
          <IcShield size={18} />
          {t("tabs.security")}
        </h3>
        <div className="opx-pf-legacy opx-pf-sec">
          <TwoFactorCard />
          <TelegramLinkCard />
        </div>
        <div className="opx-pf-legacy opx-pf-audit">
          <AccountAudit />
        </div>
      </section>
    </div>
  );
}
