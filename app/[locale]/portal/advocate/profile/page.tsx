"use client";

import { useCallback, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useAuth } from "@/lib/auth";
import { legalServiceLabel, type CatalogLocale } from "@/lib/legalServices";
import {
  requestVerification,
  getLawyerServices,
  getMyLawyer,
  upsertMyLawyer,
} from "@/lib/services/backend";
import { scoreCompleteness } from "@/lib/services/registration";
import { useResource, useResourceOne } from "@/lib/useResource";
import type { AdvocateStats, ProfessionalProfile } from "@/lib/types";
import LegalServicePicker from "@/components/register/LegalServicePicker";
import StatsEditor from "@/components/register/StatsEditor";
import ProfilePreview from "@/components/register/ProfilePreview";
import TwoFactorCard from "@/components/portal/TwoFactorCard";
import TelegramLinkCard from "@/components/portal/TelegramLinkCard";
import { EmptyState, Skeleton } from "@/components/portal/DataState";
import { Notice } from "@/components/admin/AdminBits";
import {
  IconInfo,
  IconUser,
  IconShieldCheck,
  IconBriefcase,
} from "@/components/icons";

const ZERO_STATS: AdvocateStats = {
  totalCases: 0,
  fullyWonCases: 0,
  partiallyWonCases: 0,
  successRate: 0,
};

export default function AdvocateProfile() {
  const t = useTranslations("portal.advocate.profile");
  const res = useResourceOne(getMyLawyer, []);

  if (res.status === "loading") {
    return (
      <div className="ppanel">
        <div className="ppanel__h">
          <b>{t("title")}</b>
        </div>
        <Skeleton rows={4} />
      </div>
    );
  }
  if (res.status === "error" || !res.data) {
    return <EmptyState icon={<IconUser />} title={t("emptyTitle")} text={t("emptyText")} />;
  }
  return <ProfileEditor initial={res.data} />;
}

function ProfileEditor({ initial }: { initial: ProfessionalProfile }) {
  const t = useTranslations("portal.advocate.profile");
  const { session, update } = useAuth();
  const [areas, setAreas] = useState<string[]>(initial.practiceAreas ?? []);
  const [stats, setStats] = useState<AdvocateStats>(initial.stats ?? ZERO_STATS);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [vbusy, setVbusy] = useState(false);
  const [vnote, setVnote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [edit, setEdit] = useState(false);
  const locale = useLocale() as CatalogLocale;
  const ts = useTranslations("register.advocate.stats");

  function cancelEdit() {
    setAreas(initial.practiceAreas ?? []);
    setStats(initial.stats ?? ZERO_STATS);
    setNote(null);
    setEdit(false);
  }

  // Merge the backend profile with anything already known from sign-up (email,
  // photo, specialization aren't returned by GET /lawyers/me) plus live edits,
  // so both the preview and the completeness score stay honest.
  const merged: ProfessionalProfile = {
    ...(session?.profile ?? {}),
    ...initial,
    practiceAreas: areas,
    stats,
  };
  // Never let the ring drop below what the session already reported.
  const livePct = Math.max(session?.completeness ?? 0, scoreCompleteness("advocate", merged));

  async function save() {
    if (busy) return;
    // Backend rejects total_cases < wins + partial (422); catch it early.
    const won = (stats.fullyWonCases || 0) + (stats.partiallyWonCases || 0);
    if (stats.totalCases < won) {
      setNote({ ok: false, msg: t("statsError") });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      await upsertMyLawyer(merged, "advokat");
      update({ completeness: livePct, profile: merged });
      setNote({ ok: true, msg: t("saved") });
      setEdit(false);
    } catch {
      setNote({ ok: false, msg: t("saveError") });
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (vbusy) return;
    setVbusy(true);
    setVnote(null);
    try {
      await requestVerification();
      setVnote({ ok: true, msg: t("verifyRequested") });
    } catch {
      setVnote({ ok: false, msg: t("verifyError") });
    } finally {
      setVbusy(false);
    }
  }

  return (
    <div className="advprofile">
      <div className="ppanel">
        <div className="ppanel__h">
          <b>{t("title")}</b>
          <span className="advmuted">{t("visibility", { pct: livePct })}</span>
        </div>
        <div className="meter" style={{ marginBottom: 6 }}>
          <span style={{ width: `${livePct}%` }} />
        </div>
        <p className="advmuted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <IconInfo style={{ width: 16, height: 16, flex: "none" }} />
          {t("previewNote")}
        </p>
        <div className="pverify">
          <div>
            <b>{t("verifyTitle")}</b>
            <span>{t("verifyLead")}</span>
          </div>
          <button className="btn btn--pri btn--sm" type="button" onClick={verify} disabled={vbusy}>
            <IconShieldCheck />
            {vbusy ? t("verifySending") : t("verifyCta")}
          </button>
        </div>
        {vnote ? <Notice ok={vnote.ok} msg={vnote.msg} /> : null}
      </div>

      {/* Practice areas + case stats: read-only by default, edit on demand. */}
      <div className="ppanel">
        <div className="ppanel__h">
          <b style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconBriefcase style={{ width: 18, height: 18 }} />
            {t("detailsTitle")}
          </b>
          {edit ? (
            <button className="btn btn--soft btn--sm" type="button" onClick={cancelEdit}>{t("cancel")}</button>
          ) : (
            <button className="btn btn--line btn--sm" type="button" onClick={() => setEdit(true)}>{t("edit")}</button>
          )}
        </div>

        {edit ? (
          <>
            <label className="advmuted" style={{ display: "block", marginBottom: 8 }}>{t("directionsTitle")}</label>
            <LegalServicePicker value={areas} onChange={setAreas} isAdvocate />
            <label className="advmuted" style={{ display: "block", margin: "18px 0 8px" }}>{t("statsTitle")}</label>
            <StatsEditor value={stats} onChange={setStats} />
            <div className="pverify" style={{ marginTop: 16 }}>
              {note ? <Notice ok={note.ok} msg={note.msg} /> : <span />}
              <button className="btn btn--grad btn--sm" type="button" onClick={save} disabled={busy}>
                <IconShieldCheck />
                {busy ? t("saving") : t("save")}
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="advmuted" style={{ display: "block", marginBottom: 6 }}>{t("directionsTitle")}</label>
            {areas.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {areas.map((a) => <span className="chip" key={a}>{legalServiceLabel(a, locale)}</span>)}
              </div>
            ) : (
              <p className="advmuted" style={{ marginBottom: 16 }}>{t("emptyInfo")}</p>
            )}
            <label className="advmuted" style={{ display: "block", marginBottom: 6 }}>{t("statsTitle")}</label>
            <div className="amet">
              <div className="amet__c"><b>{stats.totalCases}</b><span className="amet__l">{ts("totalCases")}</span></div>
              <div className="amet__c"><b>{stats.fullyWonCases}</b><span className="amet__l">{ts("fullyWonCases")}</span></div>
              <div className="amet__c"><b>{stats.partiallyWonCases}</b><span className="amet__l">{ts("partiallyWonCases")}</span></div>
              <div className="amet__c"><b>{stats.successRate}%</b><span className="amet__l">{ts("successRate")}</span></div>
            </div>
          </>
        )}
      </div>

      <MyServices userId={session?.id ?? ""} />
      <TwoFactorCard />
      <TelegramLinkCard />
      <ProfilePreview p={merged} />
    </div>
  );
}

function MyServices({ userId }: { userId: string }) {
  const t = useTranslations("portal.advocate.profile");
  const load = useCallback(() => (userId ? getLawyerServices(userId) : Promise.resolve([])), [userId]);
  const svc = useResource(load, [userId]);
  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("servicesTitle")}</b>
        <span className="advmuted">{svc.data.length}</span>
      </div>
      {svc.status === "loading" ? (
        <Skeleton rows={2} />
      ) : !svc.data.length ? (
        <EmptyState icon={<IconBriefcase />} title={t("servicesEmpty")} text={t("servicesEmptyText")} />
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {svc.data.map((s) => (
            <span className="chip" key={s.id}>{s.name}</span>
          ))}
        </div>
      )}
    </div>
  );
}
