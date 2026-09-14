"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError, errDetail, isOffline, isOtpExpired, isRateLimited, retryAfterSec } from "@/lib/http";
import { currentConsents, listLegalConsents, type RegisterStartResult } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { clearPendingRegistration, savePendingRegistration } from "@/lib/consents";
import { LEGAL_FALLBACK_ITEMS } from "@/lib/legal";
import { normUzPhone } from "@/lib/phone";
import { OTP_RESEND_SEC, fmtClock, useOtpTimer } from "@/lib/useOtpTimer";
import { OtpCountdown, OtpResendButton } from "@/components/auth/OtpStatus";
import {
  emptyDraft,
  type AccountType,
  type AdvocateStats,
  type ProfessionalProfile,
  type RegistrationDraft,
} from "@/lib/types";
import { REGION_KEYS } from "@/lib/mock/catalog";
import Select, { type Option } from "@/components/Select";
import { IconLogo, IconChevronLeft, IconArrowRight, IconCheck } from "../icons";
import PhoneStep from "./PhoneStep";
import AccountTypeCards from "./AccountTypeCards";
import PhotoUpload from "./PhotoUpload";
import WorkHistoryEditor from "./WorkHistoryEditor";
import ProfilePreview from "./ProfilePreview";
import PasswordInput from "../PasswordInput";
import ConsentChecklist from "../legal/ConsentChecklist";

const ZERO_STATS: AdvocateStats = {
  totalCases: 0,
  fullyWonCases: 0,
  partiallyWonCases: 0,
  successRate: 0,
};

const STEPS_BY_TYPE: Record<AccountType, string[]> = {
  client: ["clientInfo"],
  // Service selection moved out of registration → lawyers pick offered
  // services later in "My services" (app/[locale]/portal/lawyer/services).
  lawyer: ["lawyerBasic"],
  // NOTE: work history, practice-area (expertise) selection and case stats are
  // intentionally NOT collected at registration — they belong in the seller's
  // profile editor so sign-up stays short. See ADVOCATE_PROFILE_TODO.md.
  advocate: ["personal", "professional", "review"],
};

const ADV_STEPS = STEPS_BY_TYPE.advocate;

export default function RegisterFlow() {
  const t = useTranslations("register");
  const te = useTranslations("enums");
  const tc = useTranslations("common");
  const tOtp = useTranslations("register.otp");
  const router = useRouter();
  const { startRegistration, register, session, ready } = useAuth();

  // Already signed in → registration is off-limits until logout.
  useEffect(() => {
    if (ready && session) router.replace(`/portal/${session.role}`);
  }, [ready, session, router]);

  const [draft, setDraft] = useState<RegistrationDraft>(emptyDraft());
  const [idx, setIdx] = useState(0);
  const [creating, setCreating] = useState(false);
  const [missing, setMissing] = useState<string[]>([]); // shown in red when a gated button is tapped

  // OTP verification state
  const [verificationId, setVerificationId] = useState("");
  const [telegramLink, setTelegramLink] = useState("");
  const [otpMessage, setOtpMessage] = useState("");
  const [code, setCode] = useState("");
  const [starting, setStarting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyErr, setVerifyErr] = useState<string | null>(null);
  // Expiry / resend cooldown / wrong-code lock of the current code.
  const otp = useOtpTimer();
  const [resending, setResending] = useState(false);
  const [otpNote, setOtpNote] = useState<string | null>(null);
  // Registration details the pending code was issued for (see otpKey).
  const [issuedKey, setIssuedKey] = useState("");
  // Error from requesting the OTP (step 1). Shown in the footer on the profile
  // step, since verifyErr is only rendered on the later verify step.
  // wait = the server refused a new code for now (cooldown / daily quota).
  const [startErr, setStartErr] = useState<{ msg: string; login?: boolean; wait?: boolean } | null>(null);
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);

  // Explicit acceptance of each current legal document on the last profile
  // step. Placeholders (terms, privacy, disclaimer) while the list loads/fails.
  const tl = useTranslations("legal");
  const legalDocs = useResource(() => listLegalConsents().then(currentConsents), []);
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const consentItems = legalDocs.status === "ready" && legalDocs.data.length ? legalDocs.data : LEGAL_FALLBACK_ITEMS;
  const consentsOk = consentItems.every((c) => agreed[c.slug]);

  const steps = useMemo(
    () => ["phone", "type", ...(draft.accountType ? [...STEPS_BY_TYPE[draft.accountType], "verify"] : [])],
    [draft.accountType],
  );
  const step = steps[idx];
  const total = draft.accountType ? steps.length : steps.length + 3; // hint more to come

  const p = draft.profile;
  // The details a code is issued for; any change needs a new code.
  const otpKey = JSON.stringify([draft.accountType, draft.phone, p.firstName, p.lastName, p.middleName, draft.password]);
  function setProfile(patch: Partial<ProfessionalProfile>) {
    setDraft((d) => ({ ...d, profile: { ...d.profile, ...patch } }));
  }
  // First/last/middle name are separate inputs; keep `name` in sync for backend
  // + display ("First Last Middle").
  function setName(patch: { firstName?: string; lastName?: string; middleName?: string }) {
    setDraft((d) => {
      const firstName = (patch.firstName ?? d.profile.firstName ?? "").trimStart();
      const lastName = (patch.lastName ?? d.profile.lastName ?? "").trimStart();
      const middleName = (patch.middleName ?? d.profile.middleName ?? "").trimStart();
      return {
        ...d,
        profile: { ...d.profile, firstName, lastName, middleName, name: `${firstName} ${lastName} ${middleName}`.replace(/\s+/g, " ").trim() },
      };
    });
  }

  const pwField = (
    <div>
      <label>{t("fields.password")}</label>
      <PasswordInput
        value={draft.password}
        onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
        placeholder={t("fields.passwordPh")}
        autoComplete="new-password"
      />
      <p className="rf__hint">{t("fields.passwordHint")}</p>
    </div>
  );

  function next() {
    setMissing([]);
    setStartErr(null);
    setIdx((i) => Math.min(i + 1, steps.length - 1));
  }
  function back() {
    setMissing([]);
    setStartErr(null);
    setIdx((i) => Math.max(i - 1, 0));
  }
  // A gated primary button was tapped: continue if ready, else reveal what's missing.
  function tryAdvance(action: () => void) {
    const m = missingFields();
    if (m.length) {
      setMissing(m);
      return;
    }
    setMissing([]);
    action();
  }
  function chooseType(type: AccountType) {
    setMissing([]);
    setDraft((d) => ({
      ...d,
      accountType: type,
      profile: {
        ...d.profile,
        stats: type === "advocate" ? ZERO_STATS : d.profile.stats,
      },
    }));
    setIdx(2);
  }

  // Keep only the newest verification: a new code supersedes the old one, so
  // id, typed code, Telegram link and timer are replaced together.
  function applyIssue(r: RegisterStartResult) {
    setVerificationId(r.verificationId);
    setCode("");
    setTelegramLink(r.telegramBotLink);
    setOtpMessage(r.message);
    setIssuedKey(otpKey);
    otp.issue(r.expiresAt);
  }

  // Remember what was accepted (real ids/versions only, so nothing while the
  // list is unavailable — the gate then asks after the first login). Saved only
  // once the phone is verified; ConsentGate posts it once a token exists: right
  // after verify, or at the first login for approval-based / 2FA roles.
  function savePendingConsents() {
    if (legalDocs.status !== "ready") return;
    savePendingRegistration(normUzPhone(draft.phone), legalDocs.data.filter((d) => agreed[d.slug]));
  }

  // Last profile step → request the OTP, then advance to the verify step.
  async function startReg() {
    if (!draft.accountType || starting) return;
    // A still-valid code for the same details → reuse it instead of burning
    // the resend cooldown and the daily OTP quota.
    if (verificationId && issuedKey === otpKey && otp.issued && !otp.expired) {
      next();
      return;
    }
    if (startErr?.wait && otp.resendIn > 0) return;
    setStarting(true);
    setVerifyErr(null);
    setStartErr(null);
    try {
      const r = await startRegistration(draft);
      setStarting(false);
      if (!r.verificationId) {
        setStartErr({ msg: t("verify.startError") });
        return;
      }
      applyIssue(r);
      setOtpNote(null);
      next();
    } catch (e) {
      setStarting(false);
      // 409 = this phone already has an account → point the user to login.
      if (isRateLimited(e)) {
        otp.cooldown(retryAfterSec(e, OTP_RESEND_SEC));
        setStartErr({ msg: errDetail(e) || tc("rateLimited"), wait: true });
      } else if (e instanceof ApiError && e.status === 409) {
        setStartErr({ msg: t("verify.phoneExists"), login: true });
      } else {
        setStartErr({ msg: t("verify.startError") });
      }
    }
  }

  // Verify step → "Resend code": issue a new code for the same details.
  async function resend() {
    if (!draft.accountType || resending || verifying || otp.resendIn > 0) return;
    setResending(true);
    setVerifyErr(null);
    setOtpNote(null);
    try {
      const r = await startRegistration(draft);
      if (r.verificationId) {
        applyIssue(r);
        setOtpNote(tOtp("resent"));
      } else {
        setVerifyErr(tOtp("resendError"));
      }
    } catch (e) {
      if (isRateLimited(e)) {
        otp.cooldown(retryAfterSec(e, OTP_RESEND_SEC));
        setVerifyErr(errDetail(e) || tc("rateLimited"));
      } else if (e instanceof ApiError && e.status === 409) {
        setVerifyErr(t("verify.phoneExists"));
      } else {
        setVerifyErr(tOtp("resendError"));
      }
    } finally {
      setResending(false);
    }
  }

  // Verify step → confirm the code, create the session, go to the portal.
  async function doVerify() {
    if (verifying || resending) return;
    // Locked, or expired (the countdown already asks for a new code).
    if (otp.blockedIn > 0 || otp.expired || code.length !== 6) return;
    setVerifying(true);
    setVerifyErr(null);
    setOtpNote(null);
    setCreating(true);
    try {
      const s = await register(draft, verificationId, code);
      // Verified: runs before React renders the new session, so the gate finds it.
      savePendingConsents();
      // Seller roles come back pending admin approval — show a review screen
      // instead of entering a portal (no account exists yet).
      if ("pending" in s) {
        setPendingMsg(s.message);
        return;
      }
      // Account created, but its role needs 2FA at sign-in → sign in at /login
      // (the login form says why).
      if ("loginRequired" in s) {
        router.replace("/login");
        return;
      }
      router.replace(`/portal/${s.role}`);
    } catch (e) {
      setVerifying(false);
      setCreating(false);
      if (isRateLimited(e)) {
        // Too many wrong codes → locked; count down the server's wait.
        otp.block(retryAfterSec(e, OTP_RESEND_SEC));
        setVerifyErr(errDetail(e) || tc("rateLimited"));
      } else if (isOtpExpired(e)) {
        otp.expire();
      } else if (!(e instanceof ApiError)) {
        // Not an HTTP error (a bug, or a non-JSON 2xx): the server may have
        // been reached, so never claim it was unreachable.
        setVerifyErr(t("verify.error"));
      } else if (isOffline(e)) {
        // Network (status 0) / proxy 502: the code was never checked, keep it for a retry.
        setVerifyErr(tc("offline"));
      } else if (e.status >= 500) {
        setVerifyErr(t("verify.serverError"));
      } else {
        setVerifyErr(t("verify.incorrect"));
      }
    }
  }

  const regionOpts: Option[] = REGION_KEYS.filter((r) => r !== "all").map((r) => ({
    value: r,
    label: te(`regions.${r}`),
  }));
  const specOpts: Option[] = (["criminalAdmin", "economicCivil", "both"] as const).map((k) => ({
    value: k,
    label: t(`advocate.specOptions.${k}`),
  }));
  const structureOpts: Option[] = (["byuro", "firma", "hayat"] as const).map((k) => ({
    value: k,
    label: t(`advocate.structureOptions.${k}`),
  }));

  const pwOk = draft.password.length >= 8;
  // Required-field labels still missing on the current step (empty = ready).
  function missingFields(): string[] {
    const m: string[] = [];
    const needName = () => {
      if (!p.firstName?.trim()) m.push(t("fields.firstName"));
      if (!p.lastName?.trim()) m.push(t("fields.lastName"));
    };
    const needPw = () => {
      if (!pwOk) m.push(t("fields.password"));
    };
    switch (step) {
      case "clientInfo":
        needName();
        needPw();
        break;
      case "lawyerBasic":
      case "personal":
        needName();
        if (!p.region) m.push(t("fields.region"));
        needPw();
        break;
      case "professional":
        if (!p.licenseNumber?.trim()) m.push(t("advocate.license"));
        if (!p.specialization?.trim()) m.push(t("advocate.specialization"));
        break;
    }
    // Last profile step (lastProfileStep is declared below).
    if (draft.accountType && idx === steps.length - 2 && !consentsOk) m.push(tl("consent.missing"));
    return m;
  }
  const canContinue = () => missingFields().length === 0;

  // The last profile step is right before "verify".
  const lastProfileStep = !!draft.accountType && idx === steps.length - 2;
  const showFooter = !["phone", "type", "verify"].includes(step);

  // Advocate mini-stepper index
  const advPos = ADV_STEPS.indexOf(step);

  // Seller registration submitted → awaiting admin approval.
  if (pendingMsg) {
    return (
      <div className="rf">
        <div className="rf__bg" />
        <div className="rf__card">
          <div className="rf__step" style={{ textAlign: "center", alignItems: "center" }}>
            <span className="rf__ico rf__ico--brand">
              <IconCheck />
            </span>
            <h1 className="rf__title">{t("pending.title")}</h1>
            <p className="rf__sub">{pendingMsg}</p>
            <p className="rf__sub">{t("pending.hint")}</p>
            <button
              className="btn btn--grad btn--full btn--lg"
              type="button"
              onClick={() => router.replace("/login")}
              style={{ marginTop: 18 }}
            >
              {t("pending.toLogin")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rf">
      <div className="rf__bg" />
      <div className="rf__card">
        <div className="rf__top">
          <span className="rf__logo">
            <span className="logo__m">
              <IconLogo />
            </span>
            LexGo
          </span>
          {draft.accountType ? (
            <span className="rf__step-n">{t("progress", { n: idx + 1, total })}</span>
          ) : null}
        </div>
        <div className="rf__bar">
          <span style={{ width: `${((idx + 1) / total) * 100}%` }} />
        </div>

        {draft.accountType === "advocate" && advPos >= 0 ? (
          <div className="rf__stepper">
            {ADV_STEPS.map((s, i) => (
              <span
                key={s}
                className={`rf__stepper-i${i === advPos ? " on" : ""}${i < advPos ? " done" : ""}`}
              >
                <i>{i < advPos ? <IconCheck /> : i + 1}</i>
                {t(`advocate.steps.${s}`)}
              </span>
            ))}
          </div>
        ) : null}

        <div className="rf__body">
          {step === "phone" ? (
            <PhoneStep
              phone={draft.phone}
              onChange={(v) => setDraft((d) => ({ ...d, phone: v }))}
              onSent={next}
            />
          ) : null}

          {step === "verify" ? (
            <div className="rf__step">
              <span className="rf__ico rf__ico--brand">
                <span className="rf__otpnum">6</span>
              </span>
              <h1 className="rf__title">{t("verify.title")}</h1>
              <p className="rf__sub">{otpMessage || t("verify.subtitle", { phone: draft.phone })}</p>
              {telegramLink && !otp.expired ? (
                <a className="btn btn--line btn--full rf__tg" href={telegramLink} target="_blank" rel="noopener noreferrer">
                  {t("verify.telegramBtn")}
                </a>
              ) : null}
              <div className="otp">
                {Array.from({ length: 6 }).map((_, i) => (
                  <input
                    key={i}
                    className="otp__box"
                    inputMode="numeric"
                    maxLength={i === 0 ? 6 : 1}
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    value={code[i] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "");
                      if (i === 0 && v.length > 1) {
                        setCode(v.slice(0, 6));
                        return;
                      }
                      const arr = code.padEnd(6, " ").split("");
                      arr[i] = v.slice(-1) || " ";
                      setCode(arr.join("").replace(/\s/g, ""));
                    }}
                    aria-label={`digit ${i + 1}`}
                  />
                ))}
              </div>
              <OtpCountdown timer={otp} />
              {verifyErr ? <p className="rf__otpmsg rf__otpmsg--err">{verifyErr}</p> : null}
              {otpNote ? <p className="rf__otpmsg rf__otpmsg--ok">{otpNote}</p> : null}
              <button
                className="btn btn--grad btn--full btn--lg"
                type="button"
                onClick={doVerify}
                disabled={verifying || resending || code.length !== 6 || otp.expired || otp.blockedIn > 0}
                style={{ marginTop: 18 }}
              >
                {verifying ? t("verify.verifying") : t("verify.submit")}
                {verifying ? null : <IconCheck />}
              </button>
              <div className="rf__otpactions">
                <button type="button" className="rf__link rf__link--muted" onClick={back}>
                  <IconChevronLeft />
                  {t("verify.change")}
                </button>
                <OtpResendButton timer={otp} busy={resending} onResend={resend} />
              </div>
            </div>
          ) : null}

          {step === "type" ? (
            <div className="rf__step rf__step--wide">
              <button type="button" className="rf__back" onClick={back}>
                <IconChevronLeft />
                {t("back")}
              </button>
              <h1 className="rf__title">{t("type.title")}</h1>
              <p className="rf__sub">{t("type.subtitle")}</p>
              <AccountTypeCards onChoose={chooseType} />
            </div>
          ) : null}

          {step === "clientInfo" ? (
            <div className="rf__step">
              <h1 className="rf__title">{t("client.title")}</h1>
              <p className="rf__sub">{t("client.subtitle")}</p>
              <div className="cform" style={{ maxWidth: "none", marginTop: 20 }}>
                <div className="cform__row2">
                  <div>
                    <label>{t("fields.firstName")}</label>
                    <input value={p.firstName ?? ""} onChange={(e) => setName({ firstName: e.target.value })} placeholder={t("fields.firstNamePh")} autoFocus />
                  </div>
                  <div>
                    <label>{t("fields.lastName")}</label>
                    <input value={p.lastName ?? ""} onChange={(e) => setName({ lastName: e.target.value })} placeholder={t("fields.lastNamePh")} />
                  </div>
                  <div>
                    <label>{t("fields.middleName")} <span className="rf__opt">{t("optional")}</span></label>
                    <input value={p.middleName ?? ""} onChange={(e) => setName({ middleName: e.target.value })} placeholder={t("fields.middleNamePh")} />
                  </div>
                </div>
                <div>
                  <label>
                    {t("fields.email")} <span className="rf__opt">{t("optional")}</span>
                  </label>
                  <input type="email" value={p.email ?? ""} onChange={(e) => setProfile({ email: e.target.value })} placeholder={t("fields.emailPh")} />
                </div>
                {pwField}
              </div>
              <p className="rf__wow">{t("client.wow")}</p>
            </div>
          ) : null}

          {step === "lawyerBasic" ? (
            <div className="rf__step rf__step--wide">
              <h1 className="rf__title">{t("lawyer.basicTitle")}</h1>
              <p className="rf__sub">{t("lawyer.basicSubtitle")}</p>
              <div className="cform" style={{ maxWidth: "none", marginTop: 8 }}>
                <div className="cform__row2">
                  <div>
                    <label>{t("fields.firstName")}</label>
                    <input value={p.firstName ?? ""} onChange={(e) => setName({ firstName: e.target.value })} placeholder={t("fields.firstNamePh")} autoFocus />
                  </div>
                  <div>
                    <label>{t("fields.lastName")}</label>
                    <input value={p.lastName ?? ""} onChange={(e) => setName({ lastName: e.target.value })} placeholder={t("fields.lastNamePh")} />
                  </div>
                  <div>
                    <label>{t("fields.middleName")} <span className="rf__opt">{t("optional")}</span></label>
                    <input value={p.middleName ?? ""} onChange={(e) => setName({ middleName: e.target.value })} placeholder={t("fields.middleNamePh")} />
                  </div>
                </div>
                <div className="cform__row2">
                  <div>
                    <label>{t("fields.region")}</label>
                    <Select value={p.region ?? ""} onChange={(v) => setProfile({ region: v })} options={regionOpts} ariaLabel={t("fields.region")} placeholder={t("fields.regionPh")} />
                  </div>
                  <div>
                    <label>{t("lawyer.expLabel")}</label>
                    <input type="number" min={0} value={p.experienceYears ?? ""} onChange={(e) => setProfile({ experienceYears: parseInt(e.target.value || "0", 10) || 0 })} placeholder={t("fields.experiencePh")} />
                  </div>
                </div>
                <div className="rf__benefit">
                  <b>{t("advocate.expBenefitTitle")}</b>
                  <p>{t("lawyer.expBenefit")}</p>
                </div>
                {pwField}
              </div>
            </div>
          ) : null}

          {step === "personal" ? (
            <div className="rf__step rf__step--wide">
              <h1 className="rf__title">{t("advocate.personalTitle")}</h1>
              <p className="rf__sub">{t("advocate.personalSubtitle")}</p>
              <PhotoUpload value={p.photo} name={p.name} onChange={(u) => setProfile({ photo: u })} label={t("fields.photo")} hint={t("fields.photoHint")} />
              <div className="cform" style={{ maxWidth: "none" }}>
                <div className="cform__row2">
                  <div>
                    <label>{t("fields.firstName")}</label>
                    <input value={p.firstName ?? ""} onChange={(e) => setName({ firstName: e.target.value })} placeholder={t("fields.firstNamePh")} />
                  </div>
                  <div>
                    <label>{t("fields.lastName")}</label>
                    <input value={p.lastName ?? ""} onChange={(e) => setName({ lastName: e.target.value })} placeholder={t("fields.lastNamePh")} />
                  </div>
                  <div>
                    <label>{t("fields.middleName")} <span className="rf__opt">{t("optional")}</span></label>
                    <input value={p.middleName ?? ""} onChange={(e) => setName({ middleName: e.target.value })} placeholder={t("fields.middleNamePh")} />
                  </div>
                </div>
                <div className="cform__row2">
                  <div>
                    <label>{t("fields.email")}</label>
                    <input type="email" value={p.email ?? ""} onChange={(e) => setProfile({ email: e.target.value })} placeholder={t("fields.emailPh")} />
                  </div>
                  <div>
                    <label>{t("fields.phone")}</label>
                    <input value={draft.phone} readOnly className="rf__ro" />
                  </div>
                </div>
                <div className="cform__row2">
                  <div>
                    <label>{t("fields.region")}</label>
                    <Select value={p.region ?? ""} onChange={(v) => setProfile({ region: v })} options={regionOpts} ariaLabel={t("fields.region")} placeholder={t("fields.regionPh")} />
                  </div>
                  <div />
                </div>
                {pwField}
              </div>
            </div>
          ) : null}

          {step === "professional" ? (
            <div className="rf__step rf__step--wide">
              <h1 className="rf__title">{t("advocate.professionalTitle")}</h1>
              <p className="rf__sub">{t("advocate.professionalSubtitle")}</p>
              <div className="cform" style={{ maxWidth: "none" }}>
                <div className="cform__row2">
                  <div>
                    <label>{t("advocate.license")}</label>
                    <input value={p.licenseNumber ?? ""} onChange={(e) => setProfile({ licenseNumber: e.target.value })} placeholder={t("advocate.licensePh")} />
                  </div>
                  <div>
                    <label>{t("advocate.specialization")}</label>
                    <Select value={p.specialization ?? ""} onChange={(v) => setProfile({ specialization: v })} options={specOpts} ariaLabel={t("advocate.specialization")} placeholder={t("advocate.specPlaceholder")} />
                  </div>
                </div>
                <div className="cform__row2">
                  <div>
                    <label>{t("advocate.structure")}</label>
                    <Select value={p.advocateStructure ?? ""} onChange={(v) => setProfile({ advocateStructure: v })} options={structureOpts} ariaLabel={t("advocate.structure")} placeholder={t("advocate.structurePlaceholder")} />
                  </div>
                  <div>
                    <label>{t("advocate.orgName")}</label>
                    <input value={p.orgName ?? ""} onChange={(e) => setProfile({ orgName: e.target.value })} placeholder={t("advocate.orgNamePh")} />
                  </div>
                </div>
                <div>
                  <label>{t("advocate.licenseDoc")}</label>
                  <PhotoUpload value={undefined} name="" onChange={() => setProfile({ licenseDoc: "license.pdf" })} label={t("advocate.upload")} hint={p.licenseDoc ? t("advocate.uploaded") : t("advocate.licenseHint")} />
                </div>
                <div className="cform__row2">
                  <div>
                    <label>{t("advocate.advExp")}</label>
                    <input type="number" min={0} value={p.advocateYears ?? ""} onChange={(e) => setProfile({ advocateYears: parseInt(e.target.value || "0", 10) || 0 })} placeholder={t("fields.experiencePh")} />
                  </div>
                  <div>
                    <label>{t("advocate.lawExp")}</label>
                    <input type="number" min={0} value={p.lawyerYears ?? ""} onChange={(e) => setProfile({ lawyerYears: parseInt(e.target.value || "0", 10) || 0 })} placeholder={t("fields.experiencePh")} />
                  </div>
                </div>
                <div className="rf__benefit">
                  <b>{t("advocate.expBenefitTitle")}</b>
                  <p>{t("advocate.expBenefit")}</p>
                </div>
                <div className="rf__wh">
                  <label>{t("advocate.work.title")}</label>
                  <p className="rf__hint">{t("advocate.work.subtitle")}</p>
                  <WorkHistoryEditor value={p.workHistory} onChange={(v) => setProfile({ workHistory: v })} />
                </div>
              </div>
            </div>
          ) : null}

          {step === "review" ? (
            <div className="rf__step rf__step--wide">
              <h1 className="rf__title">{t("advocate.review.title")}</h1>
              <p className="rf__sub">{t("advocate.review.subtitle")}</p>
              <div className="rf__previewnote">{t("advocate.review.previewNote")}</div>
              <ProfilePreview p={p} />
            </div>
          ) : null}

          {lastProfileStep ? (
            <ConsentChecklist
              items={consentItems}
              checked={agreed}
              onToggle={(slug, on) => {
                setAgreed((a) => ({ ...a, [slug]: on }));
                // Unticked again: no earlier acceptance for this phone may linger.
                if (!on) clearPendingRegistration(normUzPhone(draft.phone));
              }}
              hint
            />
          ) : null}
        </div>

        {showFooter ? (
          <>
            {missing.length ? (
              <div className="rf__missing" role="alert">
                <b>{t("fillFirst")}</b>
                <span>{missing.join(", ")}</span>
              </div>
            ) : null}
            {startErr ? (
              <div className="rf__missing" role="alert">
                <b>{startErr.msg}</b>
                {startErr.login ? (
                  <button type="button" className="rf__inlinelink" onClick={() => router.push("/login")}>
                    {t("verify.goLogin")}
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="rf__foot">
              <button type="button" className="btn btn--ghost" onClick={back}>
                <IconChevronLeft />
                {t("back")}
              </button>
              {lastProfileStep ? (
                <button
                  type="button"
                  className={`btn btn--grad btn--lg${canContinue() ? "" : " btn--gated"}`}
                  aria-disabled={!canContinue()}
                  onClick={() => (starting ? null : tryAdvance(startReg))}
                >
                  {starting
                    ? t("verify.sending")
                    : startErr?.wait && otp.resendIn > 0
                      ? tOtp("resendIn", { time: fmtClock(otp.resendIn) })
                      : t("verify.getCode")}
                  {starting ? null : <IconArrowRight />}
                </button>
              ) : (
                <button
                  type="button"
                  className={`btn btn--grad btn--lg${canContinue() ? "" : " btn--gated"}`}
                  aria-disabled={!canContinue()}
                  onClick={() => tryAdvance(next)}
                >
                  {t("continue")}
                  <IconArrowRight />
                </button>
              )}
            </div>
          </>
        ) : null}
      </div>

      {creating ? (
        <div className="rf__creating">
          <div className="rf__creating-c">
            <span className="rf__spinner" />
            <b>{t("done.creating")}</b>
          </div>
        </div>
      ) : null}
    </div>
  );
}
