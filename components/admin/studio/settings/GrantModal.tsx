"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Modal from "@/components/admin/Modal";
import { aiId } from "@/lib/ai/ids";
import { logApiError } from "@/lib/http";
import { searchUsers, type UserSearchResult } from "@/lib/services/backend";
import { STUDIO_ROLES, saveStudioAccess, studioErrorOf, type StudioAccessGrant, type StudioAccessInput } from "@/lib/services/studio";
import { ctorOrder } from "@/lib/studio/constructors";
import { ConstructorIcon, StudioErrorNote, useStudioText } from "../bits";
import { initialsOf } from "./ui";
import { IconCheck, IconCircleCheck, IconSearch, IconUserPlus } from "@/components/icons";

export type GrantMode = { kind: "new" } | { kind: "edit"; grant: StudioAccessGrant };
export type GrantSaved = { input: StudioAccessInput; grant: StudioAccessGrant; userName: string };

type Picked = { id: string; name: string; phone: string; lexgoId: string };
type Found = { q: string; items: UserSearchResult[]; error: unknown };

const AI = "admin.studio.settings.access.modal";
const ID_RE = /^(\d{1,12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24})$/i;

export function grantLexgoId(g: StudioAccessGrant): string {
  const u = g.raw.user && typeof g.raw.user === "object" ? (g.raw.user as Record<string, unknown>) : {};
  const v = g.raw.lexgo_id ?? g.raw.lexgoId ?? u.lexgo_id;
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}

export default function GrantModal({
  mode,
  grants,
  codes,
  onClose,
  onSaved,
  onMissing,
}: {
  mode: GrantMode | null;
  grants: StudioAccessGrant[];
  codes: string[];
  onClose: () => void;
  onSaved: (s: GrantSaved) => void;
  onMissing: () => void;
}) {
  const { t } = useStudioText();
  const title = mode?.kind === "edit" ? t("settings.access.editTitle") : t("settings.access.newTitle");
  const key = mode ? (mode.kind === "edit" ? `e-${mode.grant.id || mode.grant.userId}` : "new") : "";
  return (
    <Modal open={mode !== null} onClose={onClose} title={title} aiId={AI}>
      {mode ? <GrantForm key={key} mode={mode} grants={grants} codes={codes} onClose={onClose} onSaved={onSaved} onMissing={onMissing} /> : null}
    </Modal>
  );
}

function GrantForm({
  mode,
  grants,
  codes,
  onClose,
  onSaved,
  onMissing,
}: {
  mode: GrantMode;
  grants: StudioAccessGrant[];
  codes: string[];
  onClose: () => void;
  onSaved: (s: GrantSaved) => void;
  onMissing: () => void;
}) {
  const { t, role, ctorName, fieldErr } = useStudioText();
  const uid = useId();
  const base = mode.kind === "edit" ? mode.grant : null;
  const [picked, setPicked] = useState<Picked | null>(() =>
    base ? { id: base.userId, name: base.userName, phone: base.phone, lexgoId: grantLexgoId(base) } : null,
  );
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [roles, setRoles] = useState<string[]>(() => (base ? base.roles.filter((r) => (STUDIO_ROLES as readonly string[]).includes(r)) : ["studio_editor"]));
  const [scope, setScope] = useState<"all" | "some">(() => (base && base.constructorCodes.length ? "some" : "all"));
  const [picks, setPicks] = useState<string[]>(() => (base ? base.constructorCodes : []));
  const [active, setActive] = useState(base ? base.active : true);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [serverErr, setServerErr] = useState<Record<string, string>>({});

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
  const existing = picked && mode.kind === "new" ? grants.find((g) => g.userId === picked.id) ?? null : null;
  const allCodes = [...new Set([...codes, ...picks])].sort((a, b) => ctorOrder(a) - ctorOrder(b));

  const errs: Record<string, string> = {};
  if (!picked) errs.user = t("settings.access.errUser");
  if (!roles.length) errs.roles = t("settings.access.errRoles");
  if (scope === "some" && !picks.length) errs.codes = t("settings.access.errCodes");
  const show = (k: string) => (tried ? errs[k] : "") || fieldErr(serverErr[k] || "");

  function toggle(list: string[], v: string): string[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
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
      onSaved({ input, grant, userName: picked.name || picked.phone || picked.id });
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

  return (
    <form className="stu-sform" onSubmit={submit} noValidate>
      <div className="stu-fld" data-ai-id={`${AI}.user`} data-ai-type="section" data-ai-label={t("settings.access.user")}>
        <span className="stu-fld__l">
          {t("settings.access.user")}
          <em className="stu-req">*</em>
        </span>
        {picked ? (
          <div className="stu-suser">
            <span className="stu-sava" aria-hidden>
              {initialsOf(picked.name || picked.phone)}
            </span>
            <span className="stu-suser__m">
              <b>{picked.name || picked.phone || picked.id}</b>
              <small>{[picked.phone, picked.lexgoId ? `LexGo ID ${picked.lexgoId}` : "", `ID ${picked.id}`].filter(Boolean).join(" · ")}</small>
            </span>
            {mode.kind === "new" ? (
              <button type="button" className="btn btn--soft btn--sm" onClick={() => setPicked(null)} data-ai-id={`${AI}.user.change`} data-ai-type="button" data-ai-label={t("settings.access.changeUser")}>
                {t("settings.access.changeUser")}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="stu-susearch">
              <IconSearch aria-hidden />
              <input
                id={`${uid}-q`}
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value.slice(0, 80))}
                placeholder={t("settings.access.userPh")}
                autoComplete="off"
                aria-invalid={Boolean(show("user"))}
                data-ai-id={`${AI}.user.search`}
                data-ai-type="input"
                data-ai-label={t("settings.access.userPh")}
              />
              {searching ? <span className="stu-spin" aria-hidden /> : null}
            </div>
            {results.length ? (
              <ul className="stu-sulist" aria-label={t("settings.access.results")}>
                {results.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => setPicked({ id: u.id, name: u.name, phone: u.phone, lexgoId: u.lexgoId })}
                      data-ai-id={aiId(`${AI}.user.pick`, u.id)}
                      data-ai-type="button"
                      data-ai-label={u.name || u.phone}
                    >
                      <span className="stu-sava stu-sava--sm" aria-hidden>
                        {initialsOf(u.name || u.phone)}
                      </span>
                      <span className="stu-suser__m">
                        <b>{u.name || u.phone || u.id}</b>
                        <small>{[u.phone, u.lexgoId ? `LexGo ID ${u.lexgoId}` : "", u.role].filter(Boolean).join(" · ")}</small>
                      </span>
                      {grants.some((g) => g.userId === u.id) ? <span className="stu-stag">{t("settings.access.hasGrant")}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {!searching && found?.q === term && term.length >= 2 && !results.length ? (
              <div className="stu-hint">
                {found.error ? t("settings.access.searchFail") : t("settings.access.noUsers")}
                {ID_RE.test(term) ? (
                  <button type="button" className="stu-slink" onClick={() => setPicked({ id: term, name: "", phone: "", lexgoId: "" })} data-ai-id={`${AI}.user.by-id`} data-ai-type="button" data-ai-label={t("settings.access.useId", { id: term })}>
                    {t("settings.access.useId", { id: term })}
                  </button>
                ) : null}
              </div>
            ) : null}
            {term.length < 2 ? <p className="stu-hint">{t("settings.access.userHint")}</p> : null}
          </>
        )}
        {show("user") ? <p className="stu-ferr">{show("user")}</p> : null}
        {existing ? <p className="stu-hint">{t("settings.access.existing")}</p> : null}
      </div>

      <fieldset className="stu-sfset" data-ai-id={`${AI}.roles`} data-ai-type="section" data-ai-label={t("settings.access.roles")}>
        <legend className="stu-fld__l">
          {t("settings.access.roles")}
          <em className="stu-req">*</em>
        </legend>
        <div className="stu-srpick">
          {STUDIO_ROLES.map((r) => (
            <label key={r} className={`stu-srpick__i${roles.includes(r) ? " on" : ""}`} data-ai-id={aiId(`${AI}.role`, r)} data-ai-type="checkbox" data-ai-label={role(r)}>
              <input type="checkbox" checked={roles.includes(r)} onChange={() => setRoles((cur) => toggle(cur, r))} />
              <span className="stu-srpick__box" aria-hidden>
                <IconCheck />
              </span>
              <span className="stu-srpick__m">
                <b>{role(r)}</b>
                <small>{t(`settings.roleInfo.${r}.short`)}</small>
              </span>
            </label>
          ))}
        </div>
        {show("roles") ? <p className="stu-ferr">{show("roles")}</p> : null}
      </fieldset>

      <fieldset className="stu-sfset" data-ai-id={`${AI}.scope`} data-ai-type="section" data-ai-label={t("settings.access.scope")}>
        <legend className="stu-fld__l">{t("settings.access.scope")}</legend>
        <div className="stu-seg" role="radiogroup" aria-label={t("settings.access.scope")}>
          {(["all", "some"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              className="stu-seg__b"
              aria-checked={scope === s}
              onClick={() => setScope(s)}
              data-ai-id={aiId(`${AI}.scope`, s)}
              data-ai-type="button"
              data-ai-label={t(`settings.access.scope_${s}`)}
            >
              {t(`settings.access.scope_${s}`)}
            </button>
          ))}
        </div>
        {scope === "some" ? (
          <div className="stu-scodes" role="group" aria-label={t("settings.access.scope_some")}>
            {allCodes.map((c) => (
              <button
                key={c}
                type="button"
                className={`stu-scodes__b${picks.includes(c) ? " on" : ""}`}
                aria-pressed={picks.includes(c)}
                onClick={() => setPicks((cur) => toggle(cur, c))}
                data-ai-id={aiId(`${AI}.code`, c)}
                data-ai-type="button"
                data-ai-label={`${c} ${ctorName(c)}`}
              >
                <ConstructorIcon code={c} size="sm" />
                <span>
                  <b>{c}</b>
                  <small>{ctorName(c)}</small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="stu-hint">{t("settings.access.scopeAllHint")}</p>
        )}
        {show("codes") ? <p className="stu-ferr">{show("codes")}</p> : null}
      </fieldset>

      <label className="stu-check" data-ai-id={`${AI}.active`} data-ai-type="checkbox" data-ai-label={t("settings.access.activeLabel")}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span>{t("settings.access.activeLabel")}</span>
      </label>

      {error ? <StudioErrorNote error={error} compact /> : null}

      <div className="stu-sform__acts">
        <button type="button" className="btn btn--line btn--sm" onClick={onClose} disabled={busy} data-ai-id={`${AI}.cancel`} data-ai-type="button" data-ai-label={t("actions.cancel")}>
          {t("actions.cancel")}
        </button>
        <button type="submit" className="btn btn--pri btn--sm" disabled={busy} data-ai-id={`${AI}.save`} data-ai-type="button" data-ai-label={t("settings.access.save")}>
          {busy ? <span className="stu-spin" aria-hidden /> : mode.kind === "edit" ? <IconCircleCheck aria-hidden /> : <IconUserPlus aria-hidden />}
          {t("settings.access.save")}
        </button>
      </div>
    </form>
  );
}
