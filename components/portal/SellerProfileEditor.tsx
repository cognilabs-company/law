"use client";

import { Component, Suspense, useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import PrivateTag from "@/components/ui/PrivateTag";
import { findContacts } from "@/lib/contactGuard";
import ContactGuardNote, { useContactStrip, type ContactRefusal } from "@/components/ui/ContactGuardNote";
import { useTranslations, useLocale } from "next-intl";
import { useAuth, type Role } from "@/lib/auth";
import { legalServiceLabel, type CatalogLocale } from "@/lib/legalServices";
import {
  requestVerification,
  getMyLawyer,
  upsertMyLawyer,
  getClientProfile,
  updateClientProfile,
} from "@/lib/services/backend";
import { scoreCompleteness } from "@/lib/services/registration";
import { useResourceOne } from "@/lib/useResource";
import { useUrlTab } from "@/lib/useUrlTab";
import { REGION_KEYS } from "@/lib/mock/catalog";
import { fmtUzs } from "@/lib/money";
import type { AdvocateStats, ProfessionalProfile, WorkEntry } from "@/lib/types";
import LegalServicePicker from "@/components/register/LegalServicePicker";
import StatsEditor from "@/components/register/StatsEditor";
import MarketPreviewModal from "@/components/services/MarketPreviewModal";
import type { PreviewDraft } from "@/lib/marketPreview";
import PhotoUpload from "@/components/register/PhotoUpload";
import ChipMulti from "@/components/register/ChipMulti";
import WorkHistoryEditor from "@/components/register/WorkHistoryEditor";
import Select, { type Option } from "@/components/Select";
import TimePicker from "@/components/TimePicker";
import { ApiError, contactBlockedOf } from "@/lib/http";
import { getMyAvailability, putMyAvailability, enabledDays, weeklyFrom, DEFAULT_DEADLINES, type ResponseDeadlines } from "@/lib/services/availability";
import TwoFactorCard from "@/components/portal/TwoFactorCard";
import IdentityVerify from "@/components/portal/IdentityVerify";
import TelegramLinkCard from "@/components/portal/TelegramLinkCard";
import NotificationPrefsCard from "@/components/portal/NotificationPrefsCard";
import AccountAudit from "@/components/portal/AccountAudit";
import { readVacation, writeVacation } from "@/components/portal/SellerMetrics";
import { EmptyState, Skeleton } from "@/components/portal/DataState";
import Tabs, { type TabItem } from "@/components/ui/Tabs";
import FieldError from "@/components/ui/FieldError";
import { Notice } from "@/components/admin/AdminBits";
import { IconEye, IconInfo, IconUser, IconShieldCheck, IconBriefcase, IconClock, IconSun, IconCard, IconEdit, IconAward, IconScale, IconMapPin, IconPhone, IconMail, IconCheck, IconBell } from "@/components/icons";
import ExperiencePanel from "./ExperiencePanel";
import AchievementsPanel from "./AchievementsPanel";
import ProfileServices from "./ProfileServices";

const ZERO_STATS: AdvocateStats = { totalCases: 0, fullyWonCases: 0, partiallyWonCases: 0, successRate: 0 };
const LANG_KEYS = ["uz", "ru", "en", "kaa", "tr", "ar"] as const;
const WEEK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DEFAULT_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat"];
// Recommended hourly range (so'm) per specialization until the catalogue
// provides one (T1-08); the allowed band is 70–100 % of the recommendation.
const PRICE_HINT: Record<string, [number, number]> = { criminalAdmin: [300000, 800000], economicCivil: [250000, 700000], both: [300000, 800000], lawyer: [150000, 500000] };
const PANEL_TARGET: Record<string, string> = { personal: "seller:profile-edit", professional: "profile:professional", areas: "profile:practice-areas", price: "profile:pricing", hours: "profile:work-hours", history: "profile:work-history" };
const EMAIL = /^[^s@]+@[^s@]+.[^s@]{2,}$/;
const SELLER_TABS = ["personal", "professional", "work", "security", "notifications"] as const;
type SellerTab = (typeof SELLER_TABS)[number];
const TAB_ICON: Record<SellerTab, typeof IconUser> = { personal: IconUser, professional: IconAward, work: IconClock, security: IconShieldCheck, notifications: IconBell };
const TAB_REVEAL: Record<SellerTab, RegExp> = {
  personal: /^(seller:profile-edit|button:request-verification|profile[.:](identity|verification))/,
  professional: /^profile[.:](professional|practice-areas|work-history|services)/,
  work: /^profile[.:](pricing|work-hours)/,
  security: /^profile[.:](two-factor|telegram|sessions|security-events|account-audit)/,
  notifications: /^profile[.:]notification-prefs/,
};

// Fields the backend profile (PUT /lawyers/me) has no columns for yet
// (reported: gender, work hours, work history). Kept per user in the browser
// so the cabinet, onboarding and the "Ish vaqtim" panel agree.
type Extras = { gender?: string; workDays: string[]; workFrom: string; workTo: string; workHistory: WorkEntry[] };
const EXTRA_KEY = (uid: string) => `lexgo_seller_extra_${uid}`;
function readExtras(uid: string): Extras {
  try {
    const raw = localStorage.getItem(EXTRA_KEY(uid));
    const s = raw ? (JSON.parse(raw) as Partial<Extras>) : {};
    return { gender: s.gender, workDays: s.workDays ?? DEFAULT_DAYS, workFrom: s.workFrom ?? "09:00", workTo: s.workTo ?? "19:00", workHistory: s.workHistory ?? [] };
  } catch {
    return { workDays: DEFAULT_DAYS, workFrom: "09:00", workTo: "19:00", workHistory: [] };
  }
}
function writeExtras(uid: string, e: Extras) { try { localStorage.setItem(EXTRA_KEY(uid), JSON.stringify(e)); } catch { /* ignore */ } }

type Draft = ProfessionalProfile & Extras;

// Full seller profile editor (advocate + yurist): personal data, professional
// data, practice areas / stats, pricing, working hours & vacation, work
// history, services, security, account audit and the live client-facing preview.
// Backed by GET/PUT /lawyers/me (professional), PUT /clients/me (name/e-mail/
// photo) and browser storage for fields the API does not keep yet.
export default function SellerProfileEditor({ role }: { role: Role }) {
  const t = useTranslations("portal.advocate.profile");
  const res = useResourceOne(getMyLawyer, []);
  const account = useResourceOne(getClientProfile, []);
  if (res.status === "loading" || account.status === "loading") {
    return (
      <div className="ppanel">
        <div className="ppanel__h"><b>{t("title")}</b></div>
        <Skeleton rows={4} />
      </div>
    );
  }
  if (res.status === "error" || !res.data) {
    return <EmptyState icon={<IconUser />} title={t("emptyTitle")} text={t("emptyText")} />;
  }
  const acc = account.data;
  return (
    <Suspense
      fallback={
        <div className="ppanel">
          <Skeleton rows={4} />
        </div>
      }
    >
      <Editor role={role} initial={{ ...res.data, name: acc?.name || res.data.name, email: acc?.email || res.data.email, photo: acc?.avatarUrl || res.data.photo }} />
    </Suspense>
  );
}

function splitName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts[1] ?? "", middleName: parts.slice(2).join(" ") };
}

function Editor({ role, initial }: { role: Role; initial: ProfessionalProfile }) {
  const t = useTranslations("portal.advocate.profile");
  const tp = useTranslations("portal.advocate.profile.form");
  const tr = useTranslations("register");
  const te = useTranslations("enums");
  const ts = useTranslations("register.advocate.stats");
  const tnone = useTranslations("common");
  const tv = useTranslations("register.advocate.review");
  const tcm = useTranslations("portal.common");
  const tc = useTranslations("common");
  const locale = useLocale() as CatalogLocale;
  const { session, update } = useAuth();
  const fid = useId();
  const [tab, pick] = useUrlTab(SELLER_TABS, "personal");
  const [tried, setTried] = useState(false);
  const uid = session?.id ?? "";
  const isAdvocate = role === "advocate";

  const base = useCallback((): Draft => {
    const sp = session?.profile;
    const names = initial.firstName || sp?.firstName
      ? { firstName: initial.firstName ?? sp?.firstName ?? "", lastName: initial.lastName ?? sp?.lastName ?? "", middleName: initial.middleName ?? sp?.middleName ?? "" }
      : splitName(initial.name || session?.name || "");
    return { ...(sp ?? {}), ...initial, ...names, name: initial.name || session?.name || "", practiceAreas: initial.practiceAreas ?? [], languages: initial.languages ?? [], services: initial.services ?? [], workHistory: [], stats: initial.stats ?? ZERO_STATS, workDays: DEFAULT_DAYS, workFrom: "09:00", workTo: "19:00" };
  }, [initial, session]);
  const [d, setD] = useState<Draft>(base);
  // Contact details in the "about me" text are refused as typed; the
  // backend refuses them again on save (platform_contact_blocked).
  const bioHits = useMemo(() => findContacts(d.bio ?? ""), [d.bio]);
  const [bioRefused, setBioRefused] = useState<ContactRefusal | null>(null);
  const bioStrip = useContactStrip((bio) => setD((x) => ({ ...x, bio })));
  const tcg = useTranslations("common.contactGuard");
  const [saved, setSaved] = useState<Draft>(base);
  const [vacation, setVacation] = useState(false);
  // Browser-kept extras load after mount (no localStorage during render).
  // Working hours + response deadlines live on the backend
  // (GET/PUT /lawyers/me/availability); the browser copy is only a fallback.
  const [deadlines, setDeadlines] = useState<ResponseDeadlines>(DEFAULT_DEADLINES);
  const [availSource, setAvailSource] = useState<"default" | "custom" | "local">("local");
  useEffect(() => {
    let alive = true;
    const h = setTimeout(() => {
      const e = readExtras(uid);
      setD((x) => ({ ...x, ...e }));
      setSaved((x) => ({ ...x, ...e }));
      setVacation(readVacation(uid));
    }, 0);
    getMyAvailability()
      .then((a) => {
        if (!alive) return;
        const first = a.weekly.find((w) => w.enabled) ?? a.weekly[0];
        const hours = { workDays: enabledDays(a), workFrom: first?.start ?? "09:00", workTo: first?.end ?? "19:00" };
        setD((x) => ({ ...x, ...hours }));
        setSaved((x) => ({ ...x, ...hours }));
        setDeadlines(a.deadlines);
        setAvailSource(a.source);
      })
      .catch(() => { /* older backend: keep the browser copy */ });
    return () => { alive = false; clearTimeout(h); };
  }, [uid]);
  const [section, setSection] = useState<string | null>(null); // the panel in edit mode
  const [live, setLive] = useState(false);
  const [warm, setWarm] = useState(false);
  const tl = useTranslations("sellerServices.preview");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [vbusy, setVbusy] = useState(false);
  const [vnote, setVnote] = useState<{ ok: boolean; msg: string } | null>(null);
  const hint = PRICE_HINT[isAdvocate ? d.specialization || "both" : "lawyer"] ?? PRICE_HINT.both;
  const quote = { min: Math.round(hint[0] * 0.7), max: hint[1] };

  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setName = (patch: { firstName?: string; lastName?: string; middleName?: string }) =>
    setD((x) => {
      const firstName = (patch.firstName ?? x.firstName ?? "").trimStart();
      const lastName = (patch.lastName ?? x.lastName ?? "").trimStart();
      const middleName = (patch.middleName ?? x.middleName ?? "").trimStart();
      return { ...x, firstName, lastName, middleName, name: `${firstName} ${lastName} ${middleName}`.replace(/\s+/g, " ").trim() };
    });
  const livePct = Math.max(session?.completeness ?? 0, scoreCompleteness(isAdvocate ? "advocate" : "lawyer", d));
  const nameErr = (v?: string) => (!v?.trim() ? tc("required") : v.trim().length < 2 ? t("errors.nameShort") : "");
  const errs = { lastName: nameErr(d.lastName), firstName: nameErr(d.firstName), email: d.email?.trim() && !EMAIL.test(d.email.trim()) ? t("errors.emailInvalid") : "" };
  const shown = (k: keyof typeof errs) => (tried && section === "personal" ? errs[k] : "");

  async function save() {
    if (busy) return;
    if (section === "personal" && (errs.lastName || errs.firstName || errs.email)) {
      setTried(true);
      return;
    }
    if (bioHits.length) {
      setNote({ ok: false, msg: tcg("title") });
      document.getElementById("spe-bio")?.focus();
      return;
    }
    const won = (d.stats?.fullyWonCases || 0) + (d.stats?.partiallyWonCases || 0);
    if ((d.stats?.totalCases ?? 0) < won) { setNote({ ok: false, msg: t("statsError") }); return; }
    if (d.hourlyPrice && (d.hourlyPrice < quote.min || d.hourlyPrice > quote.max)) { setNote({ ok: false, msg: tp("priceRange", { min: fmtUzs(quote.min), max: fmtUzs(quote.max) }) }); return; }
    setBusy(true);
    setNote(null);
    try {
      await upsertMyLawyer(d, isAdvocate ? "advokat" : "yurist");
      // Name / e-mail / photo live on the account record.
      if (d.name !== saved.name || d.email !== saved.email || d.photo !== saved.photo) {
        await updateClientProfile({
          ...(d.name !== saved.name ? { name: d.name } : {}),
          ...(d.email !== saved.email ? { email: d.email || "" } : {}),
          ...(d.photo !== saved.photo ? { avatar_url: d.photo || "" } : {}),
        });
      }
      writeExtras(uid, { gender: d.gender, workDays: d.workDays, workFrom: d.workFrom, workTo: d.workTo, workHistory: d.workHistory });
      writeVacation(uid, vacation);
      if (section === "hours") {
        try {
          const a = await putMyAvailability({ weekly: weeklyFrom(d.workDays, d.workFrom, d.workTo), deadlines });
          setAvailSource(a.source);
        } catch (e) {
          if (!(e instanceof ApiError && (e.status === 403 || e.status === 404 || e.status === 405))) throw e;
        }
      }
      setSaved(d);
      update({ completeness: livePct, profile: d, ...(d.name ? { name: d.name } : {}) });
      setNote({ ok: true, msg: t("saved") });
      setTried(false);
      setSection(null);
    } catch (e) {
      // The backend refuses contact details in the profile text too.
      const cb = contactBlockedOf(e);
      if (cb) setBioRefused({ message: cb.message, preview: cb.filteredPreview });
      setNote({ ok: false, msg: cb ? tcg("title") : t("saveError") });
    } finally {
      setBusy(false);
    }
  }
  function cancel() { setD(saved); setVacation(readVacation(uid)); setNote(null); setTried(false); setSection(null); }

  async function verify() {
    if (vbusy) return;
    setVbusy(true);
    setVnote(null);
    try { await requestVerification(); setVnote({ ok: true, msg: t("verifyRequested") }); }
    catch { setVnote({ ok: false, msg: t("verifyError") }); }
    finally { setVbusy(false); }
  }

  const regionOpts: Option[] = REGION_KEYS.filter((r) => r !== "all").map((r) => ({ value: r, label: te(`regions.${r}`) }));
  // Backend region may be a key ("tashkent") or plain text ("Toshkent",
  // "Toshkent shahri"): resolve to a key by label prefix, else keep the text.
  const regionKeyOf = (v?: string): string => {
    const s = (v ?? "").trim();
    if (!s) return "";
    if ((REGION_KEYS as readonly string[]).includes(s)) return s;
    const low = s.toLowerCase();
    const hit = REGION_KEYS.filter((r) => r !== "all").find((r) => { const l = te(`regions.${r}`).toLowerCase(); return l === low || l.startsWith(low) || low.startsWith(l) || low.includes(r); });
    return hit ?? s;
  };
  const regionLabel = (v?: string): string => { const k = regionKeyOf(v); return k && te.has(`regions.${k}`) ? te(`regions.${k}`) : (v ?? ""); };
  const specOpts: Option[] = (["criminalAdmin", "economicCivil", "both"] as const).map((k) => ({ value: k, label: tr(`advocate.specOptions.${k}`) }));
  const structureOpts: Option[] = (["byuro", "firma", "hayat"] as const).map((k) => ({ value: k, label: tr(`advocate.structureOptions.${k}`) }));
  const genderOpts: Option[] = (["female", "male"] as const).map((k) => ({ value: k, label: tp(`gender.${k}`) }));
  const langLabel = (k: string) => (tr.has(`languages.${k}`) ? tr(`languages.${k}`) : k);
  const dayLabel = (k: string) => tr(`advocate.expertise.days.${k}`);
  const years = (n?: number) => (n ? `${n} ${tv("yrs")}` : "");

  // Panel with a read view and an edit view; only one panel edits at a time.
  // Plain render helpers (not components) so inputs keep focus while typing.
  const panel = (id: string, icon: ReactNode, title: string, read: ReactNode, edit: ReactNode) => {
    const on = section === id;
    return (
      <div className="ppanel" data-ai-target={PANEL_TARGET[id]}>
        <div className="ppanel__h">
          <b className="ppanel__t">{icon}{title}</b>
          {on ? (
            <button className="btn btn--soft btn--sm" type="button" onClick={cancel}>{t("cancel")}</button>
          ) : (
            <button className="btn btn--line btn--sm" type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (section && section !== id) setD(saved); setNote(null); setSection(id); }}><IconEdit />{t("edit")}</button>
          )}
        </div>
        {on ? (
          <>
            <PanelBoundary onReset={cancel} label={t("saveError")}>{edit}</PanelBoundary>
            <div className="pverify" style={{ marginTop: 16 }}>
              {note ? <Notice ok={note.ok} msg={note.msg} /> : <span />}
              <span className="pverify__acts">
                <button className="btn btn--line btn--sm" type="button" onPointerEnter={() => setWarm(true)} onFocus={() => setWarm(true)} onClick={() => setLive(true)}><IconEye />{tl("open")}</button>
                <button className="btn btn--grad btn--sm" type="button" onClick={save} disabled={busy}><IconShieldCheck />{busy ? t("saving") : t("save")}</button>
              </span>
            </div>
          </>
        ) : read}
      </div>
    );
  };
  const kv = (items: [string, ReactNode, boolean?][]) => (
    <div className="pkv pkv--cols">
      {items.map(([k, v, wide]) => <div className={`pkv__i${wide ? " pkv__i--wide" : ""}${v ? "" : " pkv__i--empty"}`} key={k}><label>{k}</label><b>{v || "—"}</b></div>)}
    </div>
  );
  // Section icon in a soft gradient badge.
  const ico = (I: typeof IconUser) => <span className="pico"><I /></span>;

  const missing = [
    !d.photo && tp("f.photo"), !d.email && tp("f.email"), !d.region && tp("f.region"), !d.languages.length && tp("f.languages"),
    isAdvocate && !d.licenseNumber && tr("advocate.license"), !d.practiceAreas.length && t("directionsTitle"), !d.bio && tr("fields.bio"), !d.hourlyPrice && tp("f.price"),
  ].filter(Boolean) as string[];

  const pPersonal = panel("personal", ico(IconUser), tp("personal"),
    kv([
      [tr("fields.lastName"), d.lastName], [tr("fields.firstName"), d.firstName], [tr("fields.middleName"), d.middleName],
      [tr("fields.email"), d.email], [tr("fields.region"), regionLabel(d.region)], [tp("district"), d.district],
      [tp("genderLabel"), d.gender ? tp(`gender.${d.gender}`) : ""], [tr("fields.languages"), d.languages.map(langLabel).join(", "), true],
    ]),
    <div className="cform" style={{ maxWidth: "none" }}>
      <PhotoUpload value={d.photo} name={d.name} onChange={(u) => set({ photo: u })} label={tr("fields.photo")} hint={tr("fields.photoHint")} />
      <div className="cform__row3">
        <div><label htmlFor={`${fid}-lastName`}>{tr("fields.lastName")}</label><input id={`${fid}-lastName`} aria-invalid={shown("lastName") ? true : undefined} aria-describedby={shown("lastName") ? `${fid}-lastName-err` : undefined} value={d.lastName ?? ""} onChange={(e) => setName({ lastName: e.target.value })} /><FieldError id={`${fid}-lastName-err`} msg={shown("lastName")} /></div>
        <div><label htmlFor={`${fid}-firstName`}>{tr("fields.firstName")}</label><input id={`${fid}-firstName`} aria-invalid={shown("firstName") ? true : undefined} aria-describedby={shown("firstName") ? `${fid}-firstName-err` : undefined} value={d.firstName ?? ""} onChange={(e) => setName({ firstName: e.target.value })} /><FieldError id={`${fid}-firstName-err`} msg={shown("firstName")} /></div>
        <div><label>{tr("fields.middleName")}</label><input value={d.middleName ?? ""} onChange={(e) => setName({ middleName: e.target.value })} /></div>
      </div>
      <div className="cform__row2">
        <div><label htmlFor={`${fid}-email`}>{tr("fields.email")}</label><input id={`${fid}-email`} aria-invalid={shown("email") ? true : undefined} aria-describedby={shown("email") ? `${fid}-email-err` : undefined} type="email" value={d.email ?? ""} onChange={(e) => set({ email: e.target.value })} placeholder={tr("fields.emailPh")} /><FieldError id={`${fid}-email-err`} msg={shown("email")} /></div>
        <div><label>{tr("fields.phone")}</label><input value={session?.phone ?? ""} readOnly className="rf__ro" /></div>
      </div>
      <div className="cform__row3">
        <div><label>{tr("fields.region")}</label><Select value={regionKeyOf(d.region)} onChange={(v) => set({ region: v })} options={regionOpts} ariaLabel={tr("fields.region")} placeholder={tr("fields.regionPh")} /></div>
        <div><label>{tp("district")}</label><input value={d.district ?? ""} onChange={(e) => set({ district: e.target.value })} placeholder={tp("districtPh")} /></div>
        <div><label>{tp("genderLabel")}</label><Select value={d.gender ?? ""} onChange={(v) => set({ gender: v })} options={genderOpts} ariaLabel={tp("genderLabel")} placeholder={tp("genderPh")} /></div>
      </div>
      <div>
        <label>{tr("fields.languages")}</label>
        <ChipMulti options={LANG_KEYS.map((k) => ({ value: k, label: langLabel(k) }))} value={d.languages} onChange={(v) => set({ languages: v })} />
      </div>
    </div>,
  );

  const pProfessional = panel("professional", ico(IconAward), tp("professional"),
    kv([
      ...(isAdvocate ? ([
        [tr("advocate.license"), d.licenseNumber],
        [tr("advocate.specialization"), d.specialization ? (tr.has(`advocate.specOptions.${d.specialization}`) ? tr(`advocate.specOptions.${d.specialization}`) : d.specialization) : ""],
        [tr("advocate.structure"), d.advocateStructure ? (tr.has(`advocate.structureOptions.${d.advocateStructure}`) ? tr(`advocate.structureOptions.${d.advocateStructure}`) : d.advocateStructure) : ""],
        [tr("advocate.orgName"), d.orgName],
        [tr("advocate.advExp"), years(d.advocateYears)],
      ] as [string, ReactNode][]) : []),
      [isAdvocate ? tr("advocate.lawExp") : tr("lawyer.expLabel"), years(d.lawyerYears ?? d.experienceYears)],
      [tr("fields.education"), d.education, true], [tr("fields.bio"), d.bio, true],
    ]),
    <div className="cform" style={{ maxWidth: "none" }}>
      {isAdvocate ? (
        <>
          <div className="cform__row2">
            <div><label>{tr("advocate.license")}<PrivateTag /></label><input value={d.licenseNumber ?? ""} onChange={(e) => set({ licenseNumber: e.target.value })} placeholder={tr("advocate.licensePh")} /></div>
            <div><label>{tr("advocate.specialization")}</label><Select value={d.specialization ?? ""} onChange={(v) => set({ specialization: v })} options={specOpts} ariaLabel={tr("advocate.specialization")} placeholder={tr("advocate.specPlaceholder")} /></div>
          </div>
          <div className="cform__row2">
            <div><label>{tr("advocate.structure")}</label><Select value={d.advocateStructure ?? ""} onChange={(v) => set({ advocateStructure: v })} options={structureOpts} ariaLabel={tr("advocate.structure")} placeholder={tr("advocate.structurePlaceholder")} /></div>
            <div><label>{tr("advocate.orgName")}</label><input value={d.orgName ?? ""} onChange={(e) => set({ orgName: e.target.value })} placeholder={tr("advocate.orgNamePh")} /></div>
          </div>
          <div className="cform__row2">
            <div><label>{tr("advocate.advExp")}</label><input type="number" min={0} value={d.advocateYears ?? ""} onChange={(e) => set({ advocateYears: parseInt(e.target.value || "0", 10) || 0 })} /></div>
            <div><label>{tr("advocate.lawExp")}</label><input type="number" min={0} value={d.lawyerYears ?? ""} onChange={(e) => set({ lawyerYears: parseInt(e.target.value || "0", 10) || 0 })} /></div>
          </div>
          <div>
            <label>{tr("advocate.licenseDoc")}</label>
            <PhotoUpload value={d.licenseDoc?.startsWith("data:") ? d.licenseDoc : undefined} name="" capture="environment" onChange={(u) => set({ licenseDoc: u })} label={tr("advocate.upload")} hint={d.licenseDoc ? tr("advocate.uploaded") : tr("advocate.licenseHint")} />
          </div>
        </>
      ) : (
        <div className="cform__row2">
          <div><label>{tr("lawyer.expLabel")}</label><input type="number" min={0} value={d.lawyerYears ?? d.experienceYears ?? ""} onChange={(e) => { const n = parseInt(e.target.value || "0", 10) || 0; set({ lawyerYears: n, experienceYears: n }); }} /></div>
        </div>
      )}
      <div><label>{tr("fields.education")}<PrivateTag /></label><input value={d.education ?? ""} onChange={(e) => set({ education: e.target.value })} placeholder={tr("fields.educationPh")} /></div>
      <div>
        <label htmlFor="spe-bio">{tr("fields.bio")}</label>
        <textarea
          id="spe-bio"
          rows={4}
          value={d.bio ?? ""}
          onChange={(e) => {
            bioStrip.change(e.target.value, e);
            setBioRefused(null);
          }}
          onBlur={() => bioStrip.blur(d.bio ?? "")}
          placeholder={tr("fields.bioPh")}
          maxLength={1000}
          aria-describedby="spe-bio-g"
          aria-invalid={bioHits.length > 0 || !!bioRefused || undefined}
        />
        <ContactGuardNote id="spe-bio-g" hits={bioHits} removed={bioStrip.removed} server={bioRefused} />
      </div>
    </div>,
  );

  const pAreas = panel("areas", ico(IconScale), t("detailsTitle"),
    <>
      <label className="pkv__lbl">{t("directionsTitle")}</label>
      {d.practiceAreas.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>{d.practiceAreas.map((a) => <span className="chip" key={a}>{legalServiceLabel(a, locale)}</span>)}</div>
      ) : <p className="advmuted" style={{ marginBottom: 16 }}>{t("emptyInfo")}</p>}
      <label className="pkv__lbl">{t("statsTitle")}</label>
      {(d.stats?.totalCases ?? 0) < 5 ? <p className="advmuted" style={{ fontSize: ".82rem", marginBottom: 8 }}>{tp("statsCollecting", { n: d.stats?.totalCases ?? 0 })}</p> : null}
      <div className="amet">
        <div className="amet__c"><b>{d.stats?.totalCases ?? 0}</b><span className="amet__l">{ts("totalCases")}</span></div>
        <div className="amet__c"><b>{d.stats?.fullyWonCases ?? 0}</b><span className="amet__l">{ts("fullyWonCases")}</span></div>
        <div className="amet__c"><b>{d.stats?.partiallyWonCases ?? 0}</b><span className="amet__l">{ts("partiallyWonCases")}</span></div>
        <div className="amet__c"><b>{(d.stats?.totalCases ?? 0) >= 5 ? `${d.stats?.successRate ?? 0}%` : tnone("none")}</b><span className="amet__l">{ts("successRate")}</span></div>
      </div>
    </>,
    <>
      <label className="advmuted" style={{ display: "block", marginBottom: 8 }}>{t("directionsTitle")}</label>
      <LegalServicePicker value={d.practiceAreas} onChange={(v) => set({ practiceAreas: v })} isAdvocate={isAdvocate} />
      <label className="advmuted" style={{ display: "block", margin: "18px 0 8px" }}>{t("statsTitle")}</label>
      <StatsEditor value={d.stats ?? ZERO_STATS} onChange={(v) => set({ stats: v })} />
    </>,
  );

  const pPrice = panel("price", ico(IconCard), tp("pricing"),
    kv([[tp("f.price"), d.hourlyPrice ? `${fmtUzs(d.hourlyPrice)} ${tp("som")}` : ""], [tr("advocate.pricing.recommended"), tp("recommended", { min: fmtUzs(quote.min), max: fmtUzs(quote.max) })]]),
    <div className="cform" style={{ maxWidth: "none" }}>
      <div className="rf__benefit"><b>{tr("advocate.pricing.recommended")}</b><p>{tp("recommended", { min: fmtUzs(quote.min), max: fmtUzs(quote.max) })}</p></div>
      <div className="cform__row2">
        <div><label>{tp("f.price")}</label><input inputMode="numeric" value={d.hourlyPrice ? String(d.hourlyPrice) : ""} onChange={(e) => set({ hourlyPrice: parseInt(e.target.value.replace(/\D/g, "") || "0", 10) || 0 })} placeholder="500000" /><p className="rf__hint">{tp("priceHint")}</p></div>
      </div>
    </div>,
  );

  const pHours = panel("hours", ico(IconClock), tp("hours"),
    <>
      {kv([
        [tr("advocate.expertise.hours"), <span className="pdays" key="days">{WEEK_DAYS.map((k) => <i key={k} className={d.workDays.includes(k) ? "on" : ""}>{dayLabel(k)}</i>)}<em>{d.workFrom}–{d.workTo}</em></span>],
        [tp("vacation"), <span key="vac" className={`pstate ${vacation ? "pstate--off" : "pstate--on"}`}>{vacation ? <IconSun /> : <IconCheck />}{vacation ? tp("vacationOn") : tp("vacationOff")}</span>],
        [tp("deadlines"), <span key="dl" className="pdays"><i className="on">{tp("dlManual", { n: deadlines.manual })}</i><i className="on">{tp("dlAuto", { n: deadlines.auto })}</i><i className="on">{tp("dlSos", { n: deadlines.sos })}</i></span>],
      ])}
      <p className="rf__hint" style={{ marginTop: 8 }}>{availSource === "custom" ? tp("availCustom") : availSource === "default" ? tp("availDefault") : tp("availLocal")}</p>
      {vacation ? <p className="anote anote--err" style={{ marginTop: 10 }}>{tp("vacationNote")}</p> : null}
    </>,
    <div className="cform" style={{ maxWidth: "none" }}>
      <div>
        <label>{tr("advocate.expertise.hours")}</label>
        <ChipMulti options={WEEK_DAYS.map((k) => ({ value: k, label: dayLabel(k) }))} value={d.workDays} onChange={(v) => set({ workDays: v })} />
      </div>
      <div className="cform__row2">
        <div><label>{tr("advocate.expertise.from")}</label><TimePicker value={d.workFrom} onChange={(v) => set({ workFrom: v })} placeholder="09:00" ariaLabel={tr("advocate.expertise.from")} step={15} /></div>
        <div><label>{tr("advocate.expertise.to")}</label><TimePicker value={d.workTo} onChange={(v) => set({ workTo: v })} placeholder="18:00" ariaLabel={tr("advocate.expertise.to")} step={15} /></div>
      </div>
      <div>
        <label>{tp("deadlines")}</label>
        <div className="cform__row3">
          <div><label>{tp("dlManualLabel")}</label><input type="number" min={1} max={1440} value={deadlines.manual} onChange={(e) => setDeadlines((x) => ({ ...x, manual: Math.max(1, Math.min(1440, parseInt(e.target.value || "30", 10) || 30)) }))} /></div>
          <div><label>{tp("dlAutoLabel")}</label><input type="number" min={1} max={1440} value={deadlines.auto} onChange={(e) => setDeadlines((x) => ({ ...x, auto: Math.max(1, Math.min(1440, parseInt(e.target.value || "15", 10) || 15)) }))} /></div>
          <div><label>{tp("dlSosLabel")}</label><input type="number" min={1} max={1440} value={deadlines.sos} onChange={(e) => setDeadlines((x) => ({ ...x, sos: Math.max(1, Math.min(1440, parseInt(e.target.value || "5", 10) || 5)) }))} /></div>
        </div>
        <p className="rf__hint">{tp("deadlinesHint")}</p>
      </div>
      <label className={`vac${vacation ? " on" : ""}`} style={{ justifySelf: "start" }}>
        <input type="checkbox" checked={vacation} onChange={(e) => setVacation(e.target.checked)} />
        <IconSun />{vacation ? tp("vacationOn") : tp("vacationOff")}
      </label>
      <p className="rf__hint">{tp("vacationHint")}</p>
    </div>,
  );

  const pHistory = panel("history", ico(IconBriefcase), tr("advocate.work.title"),
    d.workHistory.length ? (
      <div className="alist">
        {d.workHistory.map((w) => (
          <div className="creq" key={w.id}><span className="creq__st" /><div className="creq__m"><b>{w.position} — {w.org}</b><span>{w.start}{w.current ? ` — ${tp("now")}` : w.end ? ` — ${w.end}` : ""}{w.achievements ? ` · ${w.achievements}` : ""}</span></div></div>
        ))}
      </div>
    ) : <p className="advmuted">{t("emptyInfo")}</p>,
    <WorkHistoryEditor value={d.workHistory} onChange={(v) => set({ workHistory: v })} />,
  );

  const verifyPanel = (
    <div className="ppanel" data-ai-target="profile:verification">
      <div className="pverify">
        <div><b>{t("verifyTitle")}</b><span>{t("verifyLead")}</span></div>
        <button className="btn btn--pri btn--sm" type="button" onClick={verify} disabled={vbusy} data-ai-target="button:request-verification"><IconShieldCheck />{vbusy ? t("verifySending") : t("verifyCta")}</button>
      </div>
      {vnote ? <Notice ok={vnote.ok} msg={vnote.msg} /> : null}
    </div>
  );
  const panels: Record<SellerTab, ReactNode> = {
    personal: (
      <div className="cprofile__stack">
        {pPersonal}
        {verifyPanel}
        <IdentityVerify />
      </div>
    ),
    professional: (
      <div className="cprofile__stack">
        {pProfessional}
        {pAreas}
        <ExperiencePanel />
        <AchievementsPanel />
        {pHistory}
        <ProfileServices role={isAdvocate ? "advocate" : "lawyer"} />
      </div>
    ),
    work: (
      <div className="cprofile__stack">
        {pPrice}
        {pHours}
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
  const items: TabItem<SellerTab>[] = SELLER_TABS.map((k) => {
    const Icon = TAB_ICON[k];
    return { key: k, label: t(`tabs.${k}`), icon: <Icon />, panel: panels[k], lazy: true };
  });
  const status = session?.accountStatus;
  const fullName = [saved.lastName, saved.firstName, saved.middleName].filter(Boolean).join(" ") || saved.name;

  return (
    <div className="advprofile">
      <section className="cprof cprof--seller" aria-label={t("title")}>
        <div className="cprof__av" data-ai-private>
          <PhotoUpload value={saved.photo} name={saved.name} onChange={() => {}} label="" hint="" readOnly />
        </div>
        <div className="cprof__main">
          <div className="cprof__name">
            <h2>{fullName || "—"}</h2>
            <span className="cprof__role">{isAdvocate ? tcm("roleAdvocate") : tcm("roleLawyer")}</span>
            {status === "active" ? (
              <span className="tfa__on">
                <IconShieldCheck />
                {t("statusVerified")}
              </span>
            ) : status === "pending" ? (
              <span className="cprof__pend">
                <IconClock />
                {t("statusPending")}
              </span>
            ) : null}
          </div>
          <ul className="cprof__meta" data-ai-private>
            {session?.lexgoId ? (
              <li className="cprof__id" title={t("myId")}>
                <span>{t("myId")}</span>
                <b>{session.lexgoId}</b>
              </li>
            ) : null}
            {session?.phone ? (
              <li>
                <IconPhone aria-hidden="true" />
                {session.phone}
              </li>
            ) : null}
            <li className={saved.email ? undefined : "is-miss"}>
              <IconMail aria-hidden="true" />
              {saved.email || t("emailMissing")}
            </li>
            {saved.region ? (
              <li>
                <IconMapPin aria-hidden="true" />
                {[regionLabel(saved.region), saved.district].filter(Boolean).join(", ")}
              </li>
            ) : null}
          </ul>
        </div>
        <div className="cprof__fill" data-ai-target="profile:visibility">
          <div className="cprof__fillh">
            <span>{t("completeness")}</span>
            <b>{livePct}%</b>
          </div>
          <div className="meter">
            <span style={{ width: `${livePct}%` }} />
          </div>
          <button className="btn btn--line btn--sm" type="button" onPointerEnter={() => setWarm(true)} onFocus={() => setWarm(true)} onClick={() => setLive(true)}>
            <IconEye />
            {tl("open")}
          </button>
        </div>
        {missing.length ? (
          <p className="cprof__miss">
            <IconInfo aria-hidden="true" />
            <span>{tp("missing")}: {missing.join(", ")}</span>
          </p>
        ) : null}
      </section>

      {note && !section ? <Notice ok={note.ok} msg={note.msg} /> : null}

      <Tabs<SellerTab> items={items} value={tab} onChange={pick} label={t("tabsLabel")} aiId="profile" className="cprofile__tabs" reveal={TAB_REVEAL} />

      {warm || live ? (
        <MarketPreviewModal
          open={live}
          draft={{
            kind: "profile",
            sellerId: uid,
            seed: { name: d.name, sellerType: isAdvocate ? "advokat" : "yurist", region: d.region ?? "", verified: false },
            service: null,
            ad: null,
            profile: {
              name: d.name.trim(),
              region: d.region ?? "",
              district: d.district ?? "",
              specializations: d.practiceAreas,
              languages: d.languages,
              bio: (d.bio ?? "").trim(),
              experienceYears: d.advocateYears || d.experienceYears || d.lawyerYears || 0,
              totalCases: d.stats?.totalCases ?? 0,
              winsCount: d.stats?.fullyWonCases ?? 0,
              partialWins: d.stats?.partiallyWonCases ?? 0,
              successRate: d.stats?.successRate ?? 0,
              barAssociation: (d.barAssociation ?? "").trim(),
              organizationName: (d.orgName ?? "").trim(),
            },
          } satisfies PreviewDraft}
          views={["profile", "market"]}
          subtitle={d.name}
          onClose={() => setLive(false)}
        />
      ) : null}
    </div>
  );
}

// Catches a render error inside an edit form and shows a message + Cancel
// instead of unmounting the whole profile page.
class PanelBoundary extends Component<{ children: ReactNode; onReset: () => void; label: string }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  componentDidCatch(e: unknown) { console.error("profile panel render failed", e); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="anote anote--err" role="alert" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <span>{this.props.label}</span>
        <button type="button" className="btn btn--line btn--sm" onClick={() => { this.setState({ err: false }); this.props.onReset(); }}>✕</button>
      </div>
    );
  }
}
