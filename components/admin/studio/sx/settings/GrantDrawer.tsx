"use client";

import "../sx-core.css";
import "../sx-form.css";
import "../sx-tones.css";
import "./sx-settings.css";
import { useEffect, useId, useState, type FormEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useStudioText } from "@/components/admin/studio/bits";
import { aiId } from "@/lib/ai/ids";
import { logApiError } from "@/lib/http";
import { searchUsers, type UserSearchResult } from "@/lib/services/backend";
import { STUDIO_ROLES, isRetiredStudioCode, saveStudioAccess, studioErrorOf, useStudioRegistry, type StudioAccessGrant, type StudioAccessInput } from "@/lib/services/studio";
import { STUDIO_CODES } from "@/lib/studio/constructors";
import { SxButton } from "../Button";
import { SxDialogError } from "../editor/SxDialog";
import { useEditorErrorText } from "../editor/useEditorErrorText";
import { Field } from "../form/Field";
import { Picker } from "../form/Picker";
import { Switch } from "../form/Switch";
import { TextInput } from "../form/TextInput";
import { CheckIcon, CircleCheckIcon, InfoIcon, LayersIcon, ListChecksIcon, SearchIcon, ctorIcon, glyph } from "../icons";
import { SxDrawer } from "../layout/Drawer";
import { SxSegmented } from "../shared/Segmented";
import type { SxOption } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { ROLE_HUE, ROLE_ICON, SET_AI, USER_ID_RE, byCtorRank, grantLexgo, groupKeyOf, roleCodeOf } from "./model";
import { Avatar, useRoleName } from "./parts";
import { UserPlusIcon } from "lucide-react";

export type GrantMode = { kind: "new" } | { kind: "edit"; grant: StudioAccessGrant };
export type GrantSaved = { input: StudioAccessInput; grant: StudioAccessGrant; userName: string };

type Picked = { id: string; name: string; phone: string; lexgoId: string };
// A person by name, phone or LexGo ID — the bare user id only when it is all
// there is (an id the admin typed in by hand).
const whoOf = (p: { id: string; name: string; phone: string; lexgoId: string }) => p.name || p.phone || (p.lexgoId ? `LexGo ID ${p.lexgoId}` : "") || p.id;
type Found = { q: string; items: UserSearchResult[]; error: unknown };
type Scope = "all" | "some";

const AI = `${SET_AI}.access.modal`;

export type GrantDrawerProps = {
  mode: GrantMode | null;
  grants: readonly StudioAccessGrant[];
  onClose: () => void;
  onSaved: (s: GrantSaved) => void;
  onMissing: () => void;
};

export function GrantDrawer({ mode, grants, onClose, onSaved, onMissing }: GrantDrawerProps): ReactElement | null {
  if (!mode) return null;
  const key = mode.kind === "edit" ? `e-${mode.grant.id || mode.grant.userId}` : "new";
  return <GrantForm key={key} mode={mode} grants={grants} onClose={onClose} onSaved={onSaved} onMissing={onMissing} />;
}

function startRoles(base: StudioAccessGrant | null): string[] {
  if (!base) return ["studio_editor"];
  const out: string[] = [];
  for (const r of base.roles) {
    const c = roleCodeOf(r);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

function GrantForm({ mode, grants, onClose, onSaved, onMissing }: GrantDrawerProps & { mode: GrantMode }): ReactElement {
  const t = useTranslations("studio");
  const { fieldErr } = useStudioText();
  const labels = useStudioLabels();
  const roleName = useRoleName();
  const errText = useEditorErrorText();
  const reg = useStudioRegistry();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const formId = `sx-grant-${uid}`;
  const base = mode.kind === "edit" ? mode.grant : null;
  const [picked, setPicked] = useState<Picked | null>(() => (base ? { id: base.userId, name: base.userName, phone: base.phone, lexgoId: grantLexgo(base) } : null));
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [roles, setRoles] = useState<string[]>(() => startRoles(base));
  const [scope, setScope] = useState<Scope>(() => (base && base.constructorCodes.length && !base.constructorCodes.includes("*") ? "some" : "all"));
  const [picks, setPicks] = useState<string[]>(() => (base ? base.constructorCodes.filter((c) => c !== "*" && !isRetiredStudioCode(c)) : []));
  const [active, setActive] = useState(base ? base.active : true);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [serverErr, setServerErr] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);

  const term = q.trim();
  useEffect(() => {
    if (picked || term.length < 2) return;
    let alive = true;
    const id = setTimeout(() => {
      searchUsers(term, { limit: 8 })
        .then((items) => {
          if (alive) setFound({ q: term, items, error: null });
        })
        .catch((e) => {
          if (alive) setFound({ q: term, items: [], error: e });
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [term, picked]);

  const searching = !picked && term.length >= 2 && found?.q !== term;
  const results = !picked && found?.q === term ? found.items.filter((u) => u.id) : [];
  const existing = picked && mode.kind === "new" ? (grants.find((g) => g.userId === picked.id) ?? null) : null;

  const codes = [...new Set([...(reg.items.length ? reg.items.map((c) => c.code) : STUDIO_CODES), ...picks])].filter((c) => !isRetiredStudioCode(c)).sort(byCtorRank);
  const groupOrder = new Map(reg.groups.map((g) => [g.key, g.order]));
  const ctorOpts: SxOption[] = codes
    .map((code) => {
      const gk = groupKeyOf(code, reg.groups, reg.items);
      const g = reg.groups.find((x) => x.key === gk);
      const ctor = reg.items.find((c) => c.code === code);
      return { gk, opt: { value: code, label: labels.ctorName(code, ctor?.title), code, icon: ctorIcon(code, gk), group: gk ? labels.groupName(gk, g?.title) : t("sx.set.reg.otherGroup") } };
    })
    .sort((a, b) => (groupOrder.get(a.gk) ?? 999) - (groupOrder.get(b.gk) ?? 999) || byCtorRank(a.opt.value, b.opt.value))
    .map((x) => x.opt);

  const errs: Record<string, string> = {};
  if (!picked) errs.user = t("settings.access.errUser");
  if (!roles.length) errs.roles = t("settings.access.errRoles");
  if (scope === "some" && !picks.length) errs.codes = t("settings.access.errCodes");
  const show = (k: string) => (tried ? errs[k] : "") || (serverErr[k] ? fieldErr(serverErr[k]) : "");

  const touch = () => setTouched(true);
  const toggleRole = (r: string) => {
    touch();
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  };

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setTried(true);
    if (Object.keys(errs).length || !picked) return;
    const target = base ?? existing;
    const input: StudioAccessInput = {
      id: target?.id || undefined,
      userId: picked.id,
      roles: [...STUDIO_ROLES].filter((r) => roles.includes(r)),
      constructorCodes: scope === "all" ? [] : picks,
      active,
    };
    setBusy(true);
    setError(null);
    setServerErr({});
    try {
      const grant = await saveStudioAccess(input);
      onSaved({ input, grant, userName: whoOf(picked) });
    } catch (err) {
      logApiError("studio.access.save", err);
      const se = studioErrorOf(err);
      if (se.kind === "missing") {
        onMissing();
        return;
      }
      const fe = se.fieldErrors;
      setServerErr({
        user: fe.user_id || fe.user || "",
        roles: fe.roles || fe.role || "",
        codes: fe.constructor_codes || fe.constructors || "",
      });
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const title = mode.kind === "edit" ? t("settings.access.editTitle") : t("settings.access.newTitle");
  const userErr = show("user");
  const roleErr = show("roles");
  const codeErr = show("codes");

  return (
    <SxDrawer
      open
      onClose={onClose}
      title={title}
      description={t("sx.set.grant.lead")}
      size="lg"
      busy={busy}
      dirty={touched && !busy}
      aiId={AI}
      footer={
        <div className="sx-st-dwfoot">
          <SxButton onClick={onClose} disabled={busy} aiId={`${AI}.cancel`}>
            {t("sx.ui.cancel")}
          </SxButton>
          <SxButton type="submit" form={formId} variant="primary" icon={mode.kind === "edit" ? CircleCheckIcon : UserPlusIcon} busy={busy} aiId={`${AI}.save`}>
            {t("settings.access.save")}
          </SxButton>
        </div>
      }
    >
      <form id={formId} className="sx-st-grant" onSubmit={(e) => void submit(e)} noValidate>
        <section className="sx-st-gsec" data-ai-id={`${AI}.user`} data-ai-type="section" data-ai-label={t("settings.access.user")}>
          <p className="sx-st-gsec__label">
            <span className="sx-st-gsec__n" aria-hidden="true">
              1
            </span>
            {t("settings.access.user")}
            <span className="sx-field__req" aria-hidden="true">
              *
            </span>
          </p>
          {picked ? (
            <div className="sx-st-picked">
              <Avatar name={whoOf(picked)} size="lg" />
              <span className="sx-st-picked__m">
                <b>{whoOf(picked)}</b>
                <small>{[picked.phone, picked.lexgoId ? `LexGo ID ${picked.lexgoId}` : ""].filter(Boolean).join(" · ")}</small>
              </span>
              {mode.kind === "new" ? (
                <SxButton
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPicked(null);
                    touch();
                  }}
                  aiId={`${AI}.user.change`}
                >
                  {t("settings.access.changeUser")}
                </SxButton>
              ) : null}
            </div>
          ) : (
            <Field id={`${formId}-q`} label={t("settings.access.userPh")} hint={term.length < 2 ? t("settings.access.userHint") : ""} error={userErr} className="sx-st-gsearch">
              {(a) => (
                <TextInput
                  {...a}
                  type="search"
                  value={q}
                  onChange={(v) => {
                    setQ(v.slice(0, 80));
                    touch();
                  }}
                  placeholder={t("settings.access.userPh")}
                  autoComplete="off"
                  leading={SearchIcon}
                  trailing={searching ? <span className="sx-spin" aria-hidden="true" /> : undefined}
                  aiId={`${AI}.user.search`}
                  aiLabel={t("settings.access.userPh")}
                />
              )}
            </Field>
          )}
          {!picked && results.length ? (
            <ul className="sx-st-results" aria-label={t("settings.access.results")}>
              {results.map((u, i) => (
                <li key={u.id} className="sx-enter" data-enter="fade" style={{ ["--i" as string]: Math.min(i, 8) }}>
                  <button
                    type="button"
                    className="sx-st-result"
                    onClick={() => {
                      setPicked({ id: u.id, name: u.name, phone: u.phone, lexgoId: u.lexgoId });
                      touch();
                    }}
                    data-ai-id={aiId(`${AI}.user.pick`, u.id)}
                    data-ai-type="button"
                    data-ai-label={u.name || u.phone}
                  >
                    <Avatar name={u.name || u.phone} size="sm" />
                    <span className="sx-st-result__m">
                      <b>{whoOf(u)}</b>
                      <small>{[u.phone, u.lexgoId ? `LexGo ID ${u.lexgoId}` : "", u.role ? roleName(u.role) : ""].filter(Boolean).join(" · ")}</small>
                    </span>
                    {grants.some((g) => g.userId === u.id) ? <span className="sx-st-tag">{t("settings.access.hasGrant")}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {!picked && !searching && found?.q === term && term.length >= 2 && !results.length ? (
            <div className="sx-st-nores" role="status">
              {glyph(InfoIcon, { size: 16 })}
              <span>{found.error ? t("settings.access.searchFail") : t("settings.access.noUsers")}</span>
              {USER_ID_RE.test(term) ? (
                <SxButton
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setPicked({ id: term, name: "", phone: "", lexgoId: "" });
                    touch();
                  }}
                  aiId={`${AI}.user.by-id`}
                >
                  {t("settings.access.useId", { id: term })}
                </SxButton>
              ) : null}
            </div>
          ) : null}
          {picked && userErr ? <p className="sx-field__err">{userErr}</p> : null}
          {existing ? <p className="sx-st-hint">{t("settings.access.existing")}</p> : null}
        </section>

        <fieldset className="sx-st-gsec" aria-describedby={roleErr ? `${formId}-roles-err` : undefined} data-ai-id={`${AI}.roles`} data-ai-type="section" data-ai-label={t("settings.access.roles")}>
          <legend className="sx-st-gsec__label">
            <span className="sx-st-gsec__n" aria-hidden="true">
              2
            </span>
            {t("settings.access.roles")}
            <span className="sx-field__req" aria-hidden="true">
              *
            </span>
            <small>{t("sx.set.grant.rolesHint")}</small>
          </legend>
          <div className="sx-st-rcards">
            {STUDIO_ROLES.map((r, i) => {
              const on = roles.includes(r);
              const Icon = ROLE_ICON[r];
              return (
                <label key={r} className="sx-st-rcard sx-enter" data-enter="zoom" style={{ ["--i" as string]: i }} data-hue={ROLE_HUE[r]} data-on={on ? "" : undefined} data-ai-id={aiId(`${AI}.role`, r)} data-ai-type="checkbox" data-ai-label={roleName(r)}>
                  <input type="checkbox" className="sx-vh" checked={on} onChange={() => toggleRole(r)} />
                  <span className="sx-st-rcard__ico" aria-hidden="true">
                    <Icon size={20} />
                  </span>
                  <span className="sx-st-rcard__m">
                    <b>{roleName(r)}</b>
                    <small>{t(`settings.roleInfo.${r}.text`)}</small>
                  </span>
                  <span className="sx-st-rcard__box" aria-hidden="true">
                    {glyph(CheckIcon, { size: 14, strokeWidth: 2.5 })}
                  </span>
                </label>
              );
            })}
          </div>
          {roleErr ? (
            <p className="sx-field__err" id={`${formId}-roles-err`}>
              {roleErr}
            </p>
          ) : null}
        </fieldset>

        <fieldset className="sx-st-gsec" data-ai-id={`${AI}.scope`} data-ai-type="section" data-ai-label={t("settings.access.scope")}>
          <legend className="sx-st-gsec__label">
            <span className="sx-st-gsec__n" aria-hidden="true">
              3
            </span>
            {t("settings.access.scope")}
          </legend>
          <SxSegmented<Scope>
            items={[
              { value: "all", label: t("settings.access.allCtors"), icon: LayersIcon, aiId: aiId(`${AI}.scope`, "all") },
              { value: "some", label: t("settings.access.scope_some"), icon: ListChecksIcon, count: picks.length || null, aiId: aiId(`${AI}.scope`, "some") },
            ]}
            value={scope}
            onChange={(v) => {
              setScope(v);
              touch();
            }}
            label={t("settings.access.scope")}
            stretch
          />
          {scope === "some" ? (
            <Field id={`${formId}-codes`} label={t("sx.set.grant.pickCtors")} error={codeErr}>
              {(a) => (
                <Picker
                  {...a}
                  multiple
                  label={t("sx.set.grant.pickCtors")}
                  placeholder={t("sx.set.grant.pickCtorsPh")}
                  options={ctorOpts}
                  value={picks}
                  onChange={(v) => {
                    setPicks(v);
                    touch();
                  }}
                  searchable
                  aiId={`${AI}.codes`}
                />
              )}
            </Field>
          ) : (
            <p className="sx-st-hint">{t("settings.access.scopeAllHint")}</p>
          )}
        </fieldset>

        <section className="sx-st-gsec sx-st-gactive" data-ai-id={`${AI}.active`} data-ai-type="section" data-ai-label={t("settings.access.activeLabel")}>
          <Switch
            checked={active}
            onChange={(v) => {
              setActive(v);
              touch();
            }}
            label={t("settings.access.activeLabel")}
            aiId={`${AI}.active.switch`}
          />
          <p className="sx-st-hint">{active ? t("sx.set.grant.activeOn") : t("sx.set.grant.activeOff")}</p>
        </section>

        <SxDialogError error={error ? errText(error) : null} />
      </form>
    </SxDrawer>
  );
}
