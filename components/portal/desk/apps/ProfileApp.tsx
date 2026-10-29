"use client";

import { useEffect, useState, type ReactNode } from "react";
import { findContacts } from "@/lib/contactGuard";
import ContactGuardNote, { useContactStrip, type ContactRefusal } from "@/components/ui/ContactGuardNote";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { contactBlockedOf } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { dateOnly, shortDateTime } from "@/lib/date";
import { REGION_KEYS } from "@/lib/mock/catalog";
import { scoreCompleteness } from "@/lib/services/registration";
import { disable2fa, enableTotp, getClientProfile, getSellerCabinet, getMyLawyer, getNotificationPreferences, listMyActivity, listSecurityEvents, listSessions, NOTIF_KEYS, requestVerification, revokeSession, setupTotp, start2fa, startTelegramLink, updateClientProfile, updateNotificationPreferences, upsertMyLawyer, verify2fa, type ActivityEntry, type NotifPrefs, type TotpSetup, type UserSession } from "@/lib/services/backend";
import { enabledDays, getMyAvailability, putMyAvailability, weeklyFrom, DEFAULT_DEADLINES, type ResponseDeadlines } from "@/lib/services/availability";
import { readVacation, writeVacation } from "@/components/portal/SellerMetrics";
import type { ProfessionalProfile } from "@/lib/types";
import { verificationStatusOf } from "@/lib/services/advocatePractice";
import { IconAward, IconBell, IconBriefcase, IconClock, IconCopy, IconExternal, IconHistory, IconLock, IconSend, IconShieldCheck, IconSun, IconUser } from "@/components/icons";
import { App, Avatar, Btn, Check, Empty, Field, Group, Input, Loading, Progress, Select, SettingRow, Sidebar, Tag, TextArea, Toggle, Toolbar, useOs, useToast, type NavSection } from "../kit/kit";
import { TimeField } from "../kit/pickers";
import type { NativeProps } from "../native";
import "./profile.css";

// The profile as a desktop program, the way a computer's settings are:
// the sections on the side (account, professional, hours, security,
// notifications), each a page of grouped rows. Edits are kept in a draft
// and saved with one button; security and notifications act at once.

type Sec = "account" | "pro" | "hours" | "security" | "notes";
const LANGS = ["uz", "ru", "en", "kaa", "tr", "ar"] as const;
const AREAS = ["criminal", "economic", "civil", "family", "labor", "administrative", "tax", "ip", "migration", "realEstate"] as const;
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const SPECS = ["criminalAdmin", "economicCivil", "both"] as const;
type Draft = ProfessionalProfile & { workDays: string[]; workFrom: string; workTo: string };

export default function ProfileApp(_props: NativeProps) {
  void _props;
  const t = useTranslations("portal.advocate.profile");
  const d = useTranslations("portal.desk.profile");
  const os = useOs();
  const { session, update } = useAuth();
  const isAdvocate = session?.role !== "lawyer";
  const [sec, setSec] = useState<Sec>("account");
  const [saved, setSaved] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // The backend's refusal of contact details in "about me", shown under it.
  const [bioRefused, setBioRefused] = useState<ContactRefusal | null>(null);
  const tcg = useTranslations("common.contactGuard");
  const [vacation, setVacation] = useState(false);
  const [deadlines, setDeadlines] = useState<ResponseDeadlines>(DEFAULT_DEADLINES);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, say] = useToast();
  const uid = session?.id ?? "";

  useEffect(() => {
    let alive = true;
    Promise.all([getMyLawyer(), getClientProfile().catch(() => null)])
      .then(([p, acc]) => {
        if (!alive || !p) return setFailed(true);
        const full = acc?.name || p.name || "";
        const parts = full.trim().split(/\s+/);
        const base: Draft = { ...p, name: full, firstName: p.firstName ?? parts[0] ?? "", lastName: p.lastName ?? parts[1] ?? "", middleName: p.middleName ?? parts.slice(2).join(" "), email: acc?.email || p.email, photo: acc?.avatarUrl || p.photo, practiceAreas: p.practiceAreas ?? [], languages: p.languages ?? [], services: p.services ?? [], workHistory: p.workHistory ?? [], workDays: ["mon", "tue", "wed", "thu", "fri", "sat"], workFrom: "09:00", workTo: "19:00" };
        setSaved(base);
        setDraft(base);
        setVacation(readVacation(uid));
      })
      .catch(() => alive && setFailed(true));
    getMyAvailability()
      .then((a) => {
        if (!alive) return;
        const first = a.weekly.find((w) => w.enabled) ?? a.weekly[0];
        const hours = { workDays: enabledDays(a), workFrom: first?.start ?? "09:00", workTo: first?.end ?? "19:00" };
        setSaved((x) => (x ? { ...x, ...hours } : x));
        setDraft((x) => (x ? { ...x, ...hours } : x));
        setDeadlines(a.deadlines);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [uid]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved) || vacation !== readVacationSafe(uid);
  const set = (p: Partial<Draft>) =>
    setDraft((x) => {
      if (!x) return x;
      const n = { ...x, ...p };
      return { ...n, name: `${n.firstName ?? ""} ${n.lastName ?? ""} ${n.middleName ?? ""}`.replace(/\s+/g, " ").trim() };
    });
  const pct = draft ? Math.max(session?.completeness ?? 0, scoreCompleteness(isAdvocate ? "advocate" : "lawyer", draft)) : 0;

  async function save() {
    if (!draft || !saved || busy) return;
    if (!draft.firstName?.trim() || !draft.lastName?.trim()) return say(d("nameNeeded"), "err");
    const won = (draft.stats?.fullyWonCases || 0) + (draft.stats?.partiallyWonCases || 0);
    if ((draft.stats?.totalCases ?? 0) < won) return say(t("statsError"), "err");
    if (findContacts(draft.bio ?? "").length) return say(tcg("title"), "err");
    setBusy(true);
    try {
      await upsertMyLawyer(draft, isAdvocate ? "advokat" : "yurist");
      if (draft.name !== saved.name || draft.email !== saved.email) await updateClientProfile({ ...(draft.name !== saved.name ? { name: draft.name } : {}), ...(draft.email !== saved.email ? { email: draft.email || "" } : {}) });
      if (draft.workDays.join() !== saved.workDays.join() || draft.workFrom !== saved.workFrom || draft.workTo !== saved.workTo) await putMyAvailability({ weekly: weeklyFrom(draft.workDays, draft.workFrom, draft.workTo), deadlines }).catch(() => undefined);
      writeVacation(uid, vacation);
      setSaved(draft);
      update({ completeness: pct, profile: draft, ...(draft.name ? { name: draft.name } : {}) });
      say(t("saved"));
    } catch (e) {
      const cb = contactBlockedOf(e);
      if (cb) setBioRefused({ message: cb.message, preview: cb.filteredPreview });
      say(cb ? tcg("title") : t("saveError"), "err");
    } finally {
      setBusy(false);
    }
  }

  const icon = (k: Sec): ReactNode => ({ account: <IconUser />, pro: <IconAward />, hours: <IconClock />, security: <IconShieldCheck />, notes: <IconBell /> })[k];
  const label = (k: Sec) => ({ account: d("account"), pro: d("pro"), hours: d("hours"), security: d("security"), notes: d("notes") })[k];
  const sections: NavSection[] = [{ id: "s", items: (["account", "pro", "hours", "security", "notes"] as Sec[]).map((k) => ({ id: k, label: label(k), icon: icon(k) })) }];
  const header = draft ? (
    <div className="dxq-me">
      <Avatar name={draft.name || "?"} size={os === "mac" ? 44 : 40} />
      <span>
        <b>{draft.name || "—"}</b>
        <small>{session?.phone}</small>
      </span>
    </div>
  ) : null;

  return (
    <App name="profile" sidebar={<Sidebar label={t("title")} header={header} sections={sections} value={sec} onChange={(s) => setSec(s as Sec)} />}>
      <Toolbar title={label(sec)} end={(sec === "account" || sec === "pro" || sec === "hours") && dirty ? <span className="dxq-save"><Btn small onClick={() => (setDraft(saved), setVacation(readVacationSafe(uid)))}>{t("cancel")}</Btn><Btn small kind="primary" busy={busy} onClick={() => void save()}>{t("save")}</Btn></span> : undefined} />
      <div className="dxq dx-scroll">
        {sec === "security" ? (
          <Security say={say} />
        ) : sec === "notes" ? (
          <Notes />
        ) : failed ? (
          <Empty icon={<IconUser />} title={t("emptyTitle")} text={t("emptyText")} />
        ) : !draft ? (
          <Loading label={d("loading")} />
        ) : sec === "account" ? (
          <Account draft={draft} set={set} pct={pct} />
        ) : sec === "pro" ? (
          <Pro
            draft={draft}
            set={(p) => {
              set(p);
              if ("bio" in p) setBioRefused(null);
            }}
            isAdvocate={isAdvocate}
            bioRefused={bioRefused}
          />
        ) : sec === "hours" ? (
          <Hours draft={draft} set={set} vacation={vacation} setVacation={setVacation} deadlines={deadlines} />
        ) : sec === "security" ? (
          <Security say={say} />
        ) : (
          <Notes />
        )}
      </div>
      {toast}
    </App>
  );
}
const readVacationSafe = (uid: string) => {
  try {
    return readVacation(uid);
  } catch {
    return false;
  }
};

function Account({ draft, set, pct }: { draft: Draft; set: (p: Partial<Draft>) => void; pct: number }) {
  const t = useTranslations("portal.advocate.profile");
  const tf = useTranslations("portal.advocate.profile.form");
  const tr = useTranslations("register.fields");
  const te = useTranslations("enums");
  const d = useTranslations("portal.desk.profile");
  const { session } = useAuth();
  const [vbusy, setVbusy] = useState(false);
  const [vmsg, setVmsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    let alive = true;
    getSellerCabinet()
      .then((c) => alive && setVerified(c.verification.verified))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return (
    <>
      <Group>
        <SettingRow icon={<IconUser />} title={t("completeness")} desc={t("visibility", { pct })}>
          <span className="dxq-pct">
            <Progress value={pct} label={t("completeness")} />
          </span>
        </SettingRow>
        <SettingRow icon={<IconShieldCheck />} title={t("verifyTitle")} desc={vmsg?.text || t("verifyLead")}>
          {verified ? (
            <Tag tone="ok">{t("statusVerified")}</Tag>
          ) : (
            <Btn
              small
              busy={vbusy}
              onClick={async () => {
                setVbusy(true);
                try {
                  await requestVerification();
                  setVmsg({ ok: true, text: t("verifyRequested") });
                } catch {
                  setVmsg({ ok: false, text: t("verifyError") });
                } finally {
                  setVbusy(false);
                }
              }}
            >
              {t("verifyCta")}
            </Btn>
          )}
        </SettingRow>
      </Group>
      <Group title={tf("personal")}>
        <div className="dxq-form">
          <Field label={tr("lastName")}>
            <Input value={draft.lastName ?? ""} onChange={(v) => set({ lastName: v })} placeholder={tr("lastNamePh")} />
          </Field>
          <Field label={tr("firstName")}>
            <Input value={draft.firstName ?? ""} onChange={(v) => set({ firstName: v })} placeholder={tr("firstNamePh")} />
          </Field>
          <Field label={tr("middleName")}>
            <Input value={draft.middleName ?? ""} onChange={(v) => set({ middleName: v })} placeholder={tr("middleNamePh")} />
          </Field>
          <Field label={tr("email")}>
            <Input type="email" value={draft.email ?? ""} onChange={(v) => set({ email: v })} placeholder={tr("emailPh")} />
          </Field>
          <Field label={tr("phone")}>
            <Input value={session?.phone ?? ""} onChange={() => undefined} ariaLabel={tr("phone")} />
          </Field>
          <Field label={tr("region")}>
            <Select ariaLabel={tr("region")} value={draft.region ?? ""} onChange={(v) => set({ region: v })} options={[{ value: "", label: tr("regionPh") }, ...REGION_KEYS.filter((r) => r !== "all").map((r) => ({ value: r, label: te(`regions.${r}`) }))]} />
          </Field>
          <Field label={tf("district")}>
            <Input value={draft.district ?? ""} onChange={(v) => set({ district: v })} placeholder={tf("districtPh")} />
          </Field>
          <Field label={tf("genderLabel")}>
            <Select ariaLabel={tf("genderLabel")} value={draft.gender ?? ""} onChange={(v) => set({ gender: v })} options={[{ value: "", label: tf("genderPh") }, { value: "female", label: tf("gender.female") }, { value: "male", label: tf("gender.male") }]} />
          </Field>
        </div>
        <p className="dxq-note">{d("phoneNote")}</p>
      </Group>
    </>
  );
}

function Pro({ draft, set, isAdvocate, bioRefused }: { draft: Draft; set: (p: Partial<Draft>) => void; isAdvocate: boolean; bioRefused: ContactRefusal | null }) {
  const bioHits = findContacts(draft.bio ?? "");
  const bioStrip = useContactStrip((bio) => set({ bio }));
  const tcg = useTranslations("common.contactGuard");
  const t = useTranslations("portal.advocate.profile");
  const tf = useTranslations("portal.advocate.profile.form");
  const tr = useTranslations("register");
  const ta = useTranslations("register.advocate");
  // License number and education never reach the public profile.
  const tpv = useTranslations("common.privateField");
  const tpr = useTranslations("portal.practice");
  const te = useTranslations("enums");
  const st = draft.stats ?? { totalCases: 0, fullyWonCases: 0, partiallyWonCases: 0, successRate: 0 };
  const num = (v: string) => Math.max(0, Number(v.replace(/\D/g, "")) || 0);
  const rate = st.totalCases ? Math.round(((st.fullyWonCases + st.partiallyWonCases * 0.5) / st.totalCases) * 100) : 0;
  return (
    <>
      <Group title={tf("professional")}>
        <div className="dxq-form">
          {isAdvocate ? (
            <>
              <Field label={ta("specialization")}>
                <Select ariaLabel={ta("specialization")} value={draft.specialization ?? ""} onChange={(v) => set({ specialization: v })} options={[{ value: "", label: ta("specPlaceholder") }, ...SPECS.map((s) => ({ value: s, label: ta(`specOptions.${s}`) }))]} />
              </Field>
              <Field label={ta("bar")}>
                <Input value={draft.barAssociation ?? ""} onChange={(v) => set({ barAssociation: v })} placeholder={ta("barPh")} />
              </Field>
              {/* Read-only: counted by the backend from the verified
                  certificate (2026-10-29 §4); set in "Advokatlik amaliyoti". */}
              <Field label={ta("advExp")} hint={tpr("readOnlyNote")}>
                <Tag tone={draft.advocateStatusVerification === "approved" || draft.advocateStatusVerification === "verified" ? "ok" : "neutral"}>
                  {draft.advocateActiveYears !== null && draft.advocateActiveYears !== undefined ? tpr("yearsN", { n: draft.advocateActiveYears }) : tpr(`status.${verificationStatusOf(draft.advocateStatusVerification)}`)}
                </Tag>
              </Field>
            </>
          ) : null}
          <Field label={tr("fields.experience")}>
            <Input value={String(draft.experienceYears ?? "")} onChange={(v) => set({ experienceYears: num(v) })} placeholder={tr("fields.experiencePh")} />
          </Field>
          <Field label={tr("fields.education")} hint={tpv("hint")}>
            <Input value={draft.education ?? ""} onChange={(v) => set({ education: v })} placeholder={tr("fields.educationPh")} />
          </Field>
          <Field label={tf("f.price")} hint={tf("priceHint")}>
            <Input value={draft.hourlyPrice ? fmtUzs(draft.hourlyPrice) : ""} onChange={(v) => set({ hourlyPrice: num(v) })} />
          </Field>
        </div>
        <Field label={tr("fields.bio")} error={bioHits.length || bioRefused ? tcg("field") : undefined}>
          <TextArea value={draft.bio ?? ""} onChange={bioStrip.change} onBlur={() => bioStrip.blur(draft.bio ?? "")} rows={4} placeholder={tr("fields.bioPh")} maxLength={2000} />
        </Field>
        <ContactGuardNote hits={bioHits} removed={bioStrip.removed} server={bioRefused} />
      </Group>
      <Group title={tr("fields.languages")}>
        <div className="dxq-chips">
          {LANGS.map((l) => (
            <Check key={l} checked={draft.languages.includes(l)} onChange={(v) => set({ languages: v ? [...draft.languages, l] : draft.languages.filter((x) => x !== l) })} label={tr(`languages.${l}`)}>
              {tr(`languages.${l}`)}
            </Check>
          ))}
        </div>
      </Group>
      <Group title={t("directionsTitle")} footer={t("directionsSub")}>
        <div className="dxq-chips">
          {AREAS.map((a) => (
            <Check key={a} checked={draft.practiceAreas.includes(a)} onChange={(v) => set({ practiceAreas: v ? [...draft.practiceAreas, a] : draft.practiceAreas.filter((x) => x !== a) })} label={te(`areas.${a}`)}>
              {te(`areas.${a}`)}
            </Check>
          ))}
        </div>
      </Group>
      <Group title={t("statsTitle")} footer={t("statsSub")}>
        <div className="dxq-form dxq-form--4">
          <Field label={ta("stats.totalCases")}>
            <Input value={String(st.totalCases || "")} onChange={(v) => set({ stats: { ...st, totalCases: num(v) } })} />
          </Field>
          <Field label={ta("stats.fullyWonCases")}>
            <Input value={String(st.fullyWonCases || "")} onChange={(v) => set({ stats: { ...st, fullyWonCases: num(v) } })} />
          </Field>
          <Field label={ta("stats.partiallyWonCases")}>
            <Input value={String(st.partiallyWonCases || "")} onChange={(v) => set({ stats: { ...st, partiallyWonCases: num(v) } })} />
          </Field>
          <div className="dxq-rate">
            <small>{ta("stats.successRate")}</small>
            <b>{rate}%</b>
          </div>
        </div>
      </Group>
    </>
  );
}

function Hours({ draft, set, vacation, setVacation, deadlines }: { draft: Draft; set: (p: Partial<Draft>) => void; vacation: boolean; setVacation: (v: boolean) => void; deadlines: ResponseDeadlines }) {
  const tf = useTranslations("portal.advocate.profile.form");
  const d = useTranslations("portal.desk.profile");
  return (
    <>
      <Group title={tf("hours")}>
        <div className="dxq-days">
          {DAYS.map((k) => (
            <button key={k} type="button" aria-pressed={draft.workDays.includes(k)} className={draft.workDays.includes(k) ? "is-on" : ""} onClick={() => set({ workDays: draft.workDays.includes(k) ? draft.workDays.filter((x) => x !== k) : [...draft.workDays, k] })}>
              {d(`days.${k}`)}
            </button>
          ))}
        </div>
        <div className="dxq-form">
          <Field label={d("from")}>
            <TimeField value={draft.workFrom} onChange={(v) => set({ workFrom: v })} ariaLabel={d("from")} />
          </Field>
          <Field label={d("to")}>
            <TimeField value={draft.workTo} onChange={(v) => set({ workTo: v })} ariaLabel={d("to")} />
          </Field>
        </div>
      </Group>
      <Group>
        <SettingRow icon={<IconSun />} title={tf("vacation")} desc={tf("vacationHint")}>
          <Toggle checked={vacation} onChange={setVacation} label={tf("vacation")} onText={tf("vacationOn")} offText={tf("vacationOff")} />
        </SettingRow>
      </Group>
      <Group title={tf("deadlines")} footer={tf("deadlinesHint")}>
        <SettingRow icon={<IconClock />} title={tf("dlManualLabel")}>
          <Tag>{deadlines.manual}</Tag>
        </SettingRow>
        <SettingRow icon={<IconClock />} title={tf("dlAutoLabel")}>
          <Tag>{deadlines.auto}</Tag>
        </SettingRow>
        <SettingRow icon={<IconClock />} title={tf("dlSosLabel")}>
          <Tag>{deadlines.sos}</Tag>
        </SettingRow>
      </Group>
    </>
  );
}

// Two-step sign-in, the Telegram link, the sessions and what happened.
export function Security({ say }: { say: (text: string, tone?: "ok" | "err") => void }) {
  const t = useTranslations("portal.common.twofa");
  const tg = useTranslations("portal.common.telegram");
  const ta = useTranslations("portal.accountAudit");
  const d = useTranslations("portal.desk.profile");
  const locale = useLocale();
  const { session, update } = useAuth();
  const on = !!session?.twoFactorEnabled;
  const [stage, setStage] = useState<"" | "sms" | "totp">("");
  const [vid, setVid] = useState("");
  const [totp, setTotp] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [link, setLink] = useState("");
  const [sessions, setSessions] = useState<UserSession[] | null>(null);
  const [events, setEvents] = useState<ActivityEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    listSessions()
      .then((l) => alive && setSessions(l))
      .catch(() => alive && setSessions([]));
    Promise.all([listSecurityEvents().catch(() => [] as ActivityEntry[]), listMyActivity().catch(() => [] as ActivityEntry[])]).then(([a, b]) => alive && setEvents([...a, ...b].sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(0, 40)));
    return () => {
      alive = false;
    };
  }, []);
  const done = (method: string) => {
    update({ twoFactorEnabled: true, twoFactorMethod: method });
    setStage("");
    setCode("");
    say(t("enabled"));
  };
  async function startSms() {
    setBusy(true);
    setErr("");
    try {
      const r = await start2fa();
      setVid(r.verificationId);
      setStage("sms");
    } catch {
      setErr(t("errStart"));
    } finally {
      setBusy(false);
    }
  }
  async function startTotp() {
    setBusy(true);
    setErr("");
    try {
      setTotp(await setupTotp());
      setStage("totp");
    } catch {
      setErr(t("errStart"));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (code.length !== 6) return;
    setBusy(true);
    setErr("");
    try {
      if (stage === "sms") {
        await verify2fa(vid, code);
        done(session?.telegramLinked === false ? "sms" : "telegram");
      } else if (totp) {
        await enableTotp(totp.setupId, code);
        done("totp");
      }
    } catch {
      setErr(t("errVerify"));
    } finally {
      setBusy(false);
    }
  }
  async function off() {
    setBusy(true);
    try {
      await disable2fa();
      update({ twoFactorEnabled: false, twoFactorMethod: "" });
      say(t("disabledMsg"));
    } catch {
      say(t("mandatory"), "err");
    } finally {
      setBusy(false);
    }
  }
  async function telegram() {
    setBusy(true);
    try {
      const r = await startTelegramLink();
      if (r.url) setLink(r.url);
      else if (r.linked) {
        update({ telegramLinked: true });
        say(tg("linkedMsg"));
      }
    } catch {
      say(tg("errStart"), "err");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Group title={t("title")} footer={t("desc")}>
        <SettingRow icon={<IconLock />} title={on ? t("enabledBadge") : t("title")} desc={on ? t("currentMethod", { method: session?.twoFactorMethod === "totp" ? t("methodTotp") : t("methodTelegram") }) : undefined}>
          {on ? (
            <Btn small busy={busy} onClick={() => void off()}>
              {t("disable")}
            </Btn>
          ) : stage ? null : (
            <span className="dxq-row-btns">
              <Btn small busy={busy} onClick={() => void startSms()}>
                {t("chooseSms")}
              </Btn>
              <Btn small kind="primary" busy={busy} onClick={() => void startTotp()}>
                {t("chooseTotp")}
              </Btn>
            </span>
          )}
        </SettingRow>
      </Group>
      {stage ? (
        <Group title={stage === "totp" ? t("totpSetupTitle") : t("codeLabel")}>
          <div className="dxq-2fa">
            {stage === "totp" && totp ? (
              <div className="dxq-qr">
                {totp.qrCode ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the backend's own QR image
                  <img src={totp.qrCode} alt={t("qrAlt")} width={160} height={160} />
                ) : null}
                <small>{t("scanHint")}</small>
                {totp.secret ? (
                  <code>{totp.secret}</code>
                ) : null}
              </div>
            ) : null}
            <Field label={stage === "totp" ? t("totpCodeLabel") : t("codeLabel")} error={err || undefined}>
              <Input value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} placeholder={t("codePh")} autoFocus />
            </Field>
            <span className="dxq-row-btns">
              <Btn onClick={() => (setStage(""), setCode(""), setErr(""))}>{t("back")}</Btn>
              <Btn kind="primary" busy={busy} disabled={code.length !== 6} onClick={() => void confirm()}>
                {t("verify")}
              </Btn>
            </span>
          </div>
        </Group>
      ) : null}
      <Group title={tg("title")} footer={tg("desc")}>
        <SettingRow icon={<IconSend />} title={session?.telegramLinked ? tg("linked") : tg("title")} desc={session?.telegramLinked ? tg("linkedText") : link ? tg("hint") : undefined}>
          {link ? (
            <span className="dxq-row-btns">
              <Btn small icon={<IconCopy />} onClick={() => void navigator.clipboard?.writeText(link).then(() => say(tg("copied")))}>
                {tg("copy")}
              </Btn>
              <Btn small kind="primary" icon={<IconExternal />} onClick={() => window.open(link, "_blank", "noopener")}>
                {tg("open")}
              </Btn>
            </span>
          ) : (
            <Btn small busy={busy} onClick={() => void telegram()}>
              {session?.telegramLinked ? tg("relink") : tg("connect")}
            </Btn>
          )}
        </SettingRow>
      </Group>
      <Group title={ta("sessions")}>
        {sessions === null ? (
          <Loading label={ta("sessions")} />
        ) : !sessions.length ? (
          <SettingRow title={ta("noSessions")} />
        ) : (
          sessions.map((s) => (
            <SettingRow key={s.id} icon={<IconBriefcase />} title={`${s.deviceLabel || ta("device")}${s.current ? ` · ${ta("thisDevice")}` : ""}`} desc={[s.ip, s.lastUsedAt ? shortDateTime(s.lastUsedAt, locale) : ""].filter(Boolean).join(" · ")}>
              {s.current ? null : (
                <Btn
                  small
                  onClick={async () => {
                    await revokeSession(s.id).catch(() => undefined);
                    setSessions((l) => (l ?? []).filter((x) => x.id !== s.id));
                  }}
                >
                  {ta("revoke")}
                </Btn>
              )}
            </SettingRow>
          ))
        )}
      </Group>
      <Group title={ta("activity")}>
        {events === null ? (
          <Loading label={ta("activity")} />
        ) : !events.length ? (
          <SettingRow title={ta("noActivity")} desc={ta("noActivityText")} />
        ) : (
          events.map((e) => <SettingRow key={e.id} icon={<IconHistory />} title={e.titleUz || (ta.has(`types.${e.action}`) ? ta(`types.${e.action}`) : e.action)} desc={[e.descriptionUz || e.detail, e.ip, e.createdAt ? dateOnly(e.createdAt, locale) : ""].filter(Boolean).join(" · ")} />)
        )}
      </Group>
      <p className="dxq-note">{d("securityNote")}</p>
    </>
  );
}

export function Notes() {
  const t = useTranslations("portal.client.profile");
  const { session } = useAuth();
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  useEffect(() => {
    let alive = true;
    getNotificationPreferences()
      .then((p) => alive && setPrefs(p))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  if (!prefs) return <Loading label={t("notifPrefs")} />;
  return (
    <Group title={t("notifPrefs")}>
      {NOTIF_KEYS.map((k) => (
        <SettingRow key={k} icon={<IconBell />} title={t.has(`notif.${k}`) ? t(`notif.${k}`) : k} desc={k === "telegram" && session?.telegramLinked === false ? t("notifTelegramHint") : undefined}>
          <Toggle
            checked={!!prefs[k]}
            label={k}
            onChange={async (v) => {
              const before = prefs;
              setPrefs({ ...prefs, [k]: v });
              await updateNotificationPreferences({ [k]: v }).catch(() => setPrefs(before));
            }}
          />
        </SettingRow>
      ))}
    </Group>
  );
}
