"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { initials } from "@/lib/lawyers";
import { CC_STATUSES, setCcStatus, shiftClock, type CcShift } from "@/lib/callcenter/ccOperator";
import type { CcCall } from "@/lib/services/backend";
import type { ResStatus } from "@/lib/useResource";
import { fmtInt } from "@/lib/date";
import { prettyPhone } from "../now/feed";
import { CopyButton } from "../now/NowFocus";
import { IcCheck, IcClock, IcLogout, IcPhone, IcShield, IcUser } from "../icons";

export type RoleItem = { key: string; label: string };

const PERM_SHOWN = 18;

const pad = (n: number) => String(n).padStart(2, "0");

function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sameDay(iso: string, now: number): boolean {
  const d = new Date(iso);
  const n = new Date(now);
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export function IcMail({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="opx-i" style={{ width: size, height: size }}>
      <rect className="opx-i__t" x="3" y="5.5" width="18" height="13" rx="2.5" />
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path className="opx-i__a" d="m4.5 7.5 7.5 5.5 7.5-5.5" />
    </svg>
  );
}

export function ProfileHead({
  name,
  phone,
  email,
  lexgoId,
  photo,
  roles,
  shift,
  onLogout,
}: {
  name: string;
  phone: string;
  email: string;
  lexgoId: string;
  photo: string;
  roles: RoleItem[];
  shift: CcShift;
  onLogout: () => void;
}) {
  const t = useTranslations("admin.profile");
  const tcc = useTranslations("admin.cc");
  const ta = useTranslations("admin");
  return (
    <section className="opx-pf-head" aria-label={t("title")} data-ai-target="staff-profile:head">
      <span className="opx-pf-av" data-st={shift.status} data-ai-private>
        {photo ? <span className="opx-pf-av__img" style={{ backgroundImage: `url(${JSON.stringify(photo)})` }} /> : <span className="opx-pf-av__ini">{initials(name || "A")}</span>}
        <i className="opx-pf-av__dot" aria-hidden="true" />
      </span>
      <div className="opx-pf-head__main">
        <div className="opx-pf-head__name">
          <h2>{name || "—"}</h2>
          {roles.slice(0, 2).map((r) => (
            <span className="opx-pf-role" key={r.key}>
              {r.label}
            </span>
          ))}
          {roles.length > 2 ? <span className="opx-pf-role">+{roles.length - 2}</span> : null}
        </div>
        <ul className="opx-pf-meta" data-ai-private>
          {lexgoId ? (
            <li>
              <IcUser size={16} />
              <span>{t("myId")}</span>
              <b className="opx-num">{lexgoId}</b>
              <CopyButton value={lexgoId} label={t("myId")} />
            </li>
          ) : null}
          {phone ? (
            <li>
              <IcPhone size={16} />
              <b className="opx-num">{prettyPhone(phone)}</b>
              <CopyButton value={phone} label={t("phone")} />
            </li>
          ) : null}
          <li className={email ? undefined : "is-miss"}>
            <IcMail size={16} />
            {email ? <b>{email}</b> : <span>{t("emailMissing")}</span>}
          </li>
          <li className="opx-pf-meta__st" data-st={shift.status}>
            <span className="opx-pf-dot" aria-hidden="true" />
            <b>{tcc(`status.${shift.status}`)}</b>
          </li>
        </ul>
      </div>
      <button type="button" className="opx-pbtn opx-pf-head__out" onClick={onLogout}>
        <IcLogout size={17} />
        {ta("logout")}
      </button>
    </section>
  );
}

export function ShiftTiles({ shift, now, calls, me }: { shift: CcShift; now: number; calls: { status: ResStatus; data: CcCall[] | null }; me: string }) {
  const tcc = useTranslations("admin.cc");
  const tm = useTranslations("admin.ccx.myProfile");
  const locale = useLocale();
  const mine = calls.data && me ? calls.data.filter((c) => c.operatorUserId === me) : [];
  const today = mine.filter((c) => sameDay(c.createdAt, now)).length;
  return (
    <div className="opx-pf-tiles" data-ai-target="staff-profile:shift">
      <div className="opx-pf-tile" data-tone="info" style={{ animationDelay: "0ms" }}>
        <span className="opx-pf-tile__ic" aria-hidden="true">
          <IcClock size={22} />
        </span>
        <span className="opx-pf-tile__txt">
          <small>{tcc("shift")}</small>
          <b className="opx-num">{shiftClock(shift.shiftStart, now)}</b>
          <span>{shift.shiftStart ? tm("shiftSince", { time: hhmm(shift.shiftStart) }) : ""}</span>
        </span>
      </div>

      <div className="opx-pf-tile opx-pf-tile--st" data-st={shift.status} style={{ animationDelay: "60ms" }}>
        <span className="opx-pf-tile__ic opx-pf-tile__ic--st" aria-hidden="true">
          <span className="opx-pf-dot" />
        </span>
        <span className="opx-pf-tile__txt">
          <small>{tcc("statusLabel")}</small>
          <b>{tcc(`status.${shift.status}`)}</b>
          <span className="opx-num">{shift.since ? tm("statusFor", { time: shiftClock(shift.since, now) }) : ""}</span>
        </span>
        <div className="opx-pf-sts" role="group" aria-label={tcc("statusLabel")}>
          {CC_STATUSES.map((s) => (
            <button key={s} type="button" data-st={s} aria-pressed={shift.status === s} className={shift.status === s ? "is-on" : undefined} title={tcc(`key.${s}`)} onClick={() => setCcStatus(s)}>
              <span className="opx-pf-dot" aria-hidden="true" />
              {tcc(`status.${s}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="opx-pf-tile" data-tone="ok" style={{ animationDelay: "120ms" }}>
        <span className="opx-pf-tile__ic" aria-hidden="true">
          <IcPhone size={22} />
        </span>
        <span className="opx-pf-tile__txt">
          <small>{tm("callsToday")}</small>
          {calls.status === "loading" ? <i className="opx-shim opx-pf-tile__shim" /> : <b className="opx-num">{calls.status === "error" ? "—" : fmtInt(today, locale)}</b>}
          <span>{calls.status === "error" ? tm("callsFailed") : calls.status === "ready" ? tm("callsMine", { n: mine.length }) : ""}</span>
        </span>
      </div>
    </div>
  );
}

export function RolesCard({ roles, primary, permissions }: { roles: RoleItem[]; primary: string; permissions: string[] }) {
  const t = useTranslations("admin.profile");
  const tm = useTranslations("admin.ccx.myProfile");
  const tp = useTranslations("common.pager");
  const [all, setAll] = useState(false);
  const perms = [...permissions].sort();
  const shown = all ? perms : perms.slice(0, PERM_SHOWN);
  const permLabel = (code: string) => {
    const key = `perm.${code.replace(/[^a-zA-Z0-9]+/g, "_")}`;
    return tm.has(key) ? tm(key) : "";
  };
  return (
    <section className="opx-pf-card" aria-labelledby="opx-pf-roles-t" data-ai-target="staff-profile:roles">
      <header className="opx-pf-card__head">
        <span className="opx-pf-card__ic" aria-hidden="true">
          <IcShield size={18} />
        </span>
        <span className="opx-pf-card__t">
          <h3 id="opx-pf-roles-t">{tm("rolesTitle")}</h3>
        </span>
      </header>

      <div className="opx-pf-sub">
        <span>{t("roles")}</span>
        <b className="opx-num">{roles.length}</b>
      </div>
      {roles.length ? (
        <ul className="opx-pf-roles">
          {roles.map((r) => (
            <li key={r.key}>
              <span className="opx-pf-roles__ic" aria-hidden="true">
                <IcUser size={18} />
              </span>
              <b>{r.label}</b>
              {r.key === primary ? <span className="opx-pill">{tm("primary")}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="opx-pf-none">—</p>
      )}

      <div className="opx-pf-sub">
        <span>{t("permissions")}</span>
        <b>{t("permCount", { n: permissions.length })}</b>
      </div>
      {perms.length ? (
        <ul className="opx-pf-perms">
          {shown.map((p) => {
            const label = permLabel(p);
            return (
              <li key={p} title={p} data-code={label ? undefined : ""}>
                <IcCheck size={14} />
                <span>{label || p}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="opx-pf-none">{tm("noPerms")}</p>
      )}
      {perms.length > PERM_SHOWN ? (
        <button type="button" className="opx-pf-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? tp("less") : tp("more", { n: perms.length - PERM_SHOWN })}
        </button>
      ) : null}
    </section>
  );
}
