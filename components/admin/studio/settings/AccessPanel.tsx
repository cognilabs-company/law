"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FilterBar from "@/components/filters/FilterBar";
import { aiId } from "@/lib/ai/ids";
import { asDict, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { STUDIO_ROLES, listStudioAccess, saveStudioAccess, studioErrorOf, useStudioRegistry, type StudioAccessGrant } from "@/lib/services/studio";
import { STUDIO_CODES, ctorOrder } from "@/lib/studio/constructors";
import { StudioCodeChip, StudioEmpty, StudioLoading, useStudioErrorText, useStudioText } from "../bits";
import GrantModal, { grantLexgoId, type GrantMode, type GrantSaved } from "./GrantModal";
import { ConfirmModal, LoadProblem, PanelHead, initialsOf, matchesTerms, type Phase } from "./ui";
import { IconCircleCheck, IconCrown, IconEdit, IconEye, IconInfo, IconLock, IconRefresh, IconRocket, IconShieldCheck, IconUserPlus, IconUsers } from "@/components/icons";

type State = { phase: Phase; items: StudioAccessGrant[]; known: boolean; error: unknown };

const AI = "admin.studio.settings.access";
const LIST_KEYS = ["items", "grants", "access", "users", "data", "results"];
const ROLE_ICON = { studio_editor: IconEdit, studio_reviewer: IconEye, studio_publisher: IconRocket, studio_admin: IconCrown } as const;

function shapeKnown(raw: unknown, items: StudioAccessGrant[]): boolean {
  const listed = Array.isArray(raw) || LIST_KEYS.some((k) => Array.isArray(asDict(raw)[k]));
  return listed && items.every((g) => Boolean(g.userId));
}

export default function AccessPanel() {
  const { t, role, ctorName, num, day } = useStudioText();
  const errText = useStudioErrorText();
  const reg = useStudioRegistry();
  const [st, setSt] = useState<State>({ phase: "loading", items: [], known: true, error: null });
  const [busy, setBusy] = useState(false);
  const [writeOff, setWriteOff] = useState(false);
  const [modal, setModal] = useState<GrantMode | null>(null);
  const [ask, setAsk] = useState<StudioAccessGrant | null>(null);
  const [toggling, setToggling] = useState("");
  const [q, setQ] = useState("");
  const [roleF, setRoleF] = useState("");
  const [stateF, setStateF] = useState("");
  const seq = useRef(0);

  const load = useCallback(async (): Promise<StudioAccessGrant[] | null> => {
    const my = ++seq.current;
    try {
      const res = await listStudioAccess();
      if (my !== seq.current) return null;
      setSt({ phase: "ready", items: res.items, known: shapeKnown(res.raw, res.items), error: null });
      return res.items;
    } catch (e) {
      if (my !== seq.current) return null;
      setSt((cur) => (cur.phase === "ready" ? { ...cur, error: e } : { phase: "error", items: [], known: true, error: e }));
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setBusy(true);
    await load();
    setBusy(false);
  }

  async function onSaved(s: GrantSaved) {
    setModal(null);
    const fresh = await load();
    const seen = fresh?.find((g) => g.userId === s.input.userId);
    if (fresh && !seen) toast(t("settings.access.savedHidden"), { tone: "info", ms: 7000 });
    else toast(t("settings.access.saved", { name: s.userName }), { tone: "ok" });
  }

  function onMissing() {
    setModal(null);
    setWriteOff(true);
    toast(t("settings.access.writeMissing"), { tone: "info", ms: 7000 });
  }

  async function setActive(g: StudioAccessGrant, active: boolean) {
    setToggling(g.id || g.userId);
    try {
      await saveStudioAccess({ id: g.id || undefined, userId: g.userId, roles: g.roles, constructorCodes: g.constructorCodes, active });
      setAsk(null);
      await load();
      toast(active ? t("settings.access.resumed") : t("settings.access.paused"), { tone: "ok" });
    } catch (e) {
      logApiError("studio.access.toggle", e);
      setAsk(null);
      if (studioErrorOf(e).kind === "missing") onMissing();
      else toast(errText(e).text, { tone: "err" });
    } finally {
      setToggling("");
    }
  }

  const canWrite = st.phase === "ready" && st.known && !writeOff;
  const items = st.items;
  const codes = (reg.items.length ? reg.items.map((c) => c.code) : [...STUDIO_CODES]).sort((a, b) => ctorOrder(a) - ctorOrder(b));
  const activeN = items.filter((g) => g.active).length;

  const roleOpts = [
    { value: "", label: t("common.all") },
    ...STUDIO_ROLES.map((r) => ({ value: r, label: `${role(r)} (${num(items.filter((g) => g.roles.includes(r)).length)})` })),
  ];
  const stateOpts = [
    { value: "", label: t("common.all") },
    { value: "active", label: `${t("settings.access.active")} (${num(activeN)})` },
    { value: "paused", label: `${t("settings.access.pausedState")} (${num(items.length - activeN)})` },
  ];
  const shown = items.filter((g) => {
    if (roleF && !g.roles.includes(roleF)) return false;
    if (stateF === "active" && !g.active) return false;
    if (stateF === "paused" && g.active) return false;
    return matchesTerms([g.userName, g.phone, g.userId, grantLexgoId(g), ...g.roles.map(role), ...g.constructorCodes], q);
  });

  return (
    <div className="stu-set__stack">
      <section className="stu-card" data-ai-id={`${AI}.list`} data-ai-type="section" data-ai-label={t("settings.access.title")}>
        <PanelHead icon={IconUsers} title={t("settings.access.title")} text={t("settings.access.lead")}>
          {st.phase !== "loading" ? (
            <button type="button" className="btn btn--line btn--sm" onClick={() => void refresh()} disabled={busy} data-ai-id={`${AI}.refresh`} data-ai-type="button" data-ai-label={t("settings.common.refresh")}>
              <IconRefresh className={busy ? "stu-spinning" : undefined} aria-hidden />
              {t("settings.common.refresh")}
            </button>
          ) : null}
          {canWrite ? (
            <button type="button" className="btn btn--pri btn--sm" onClick={() => setModal({ kind: "new" })} data-ai-id={`${AI}.grant`} data-ai-type="button" data-ai-label={t("settings.access.grant")}>
              <IconUserPlus aria-hidden />
              {t("settings.access.grant")}
            </button>
          ) : null}
        </PanelHead>

        {st.phase === "ready" && (!st.known || writeOff) ? (
          <div className="stu-snote" role="note">
            <IconInfo aria-hidden />
            <p>{writeOff ? t("settings.access.readOnlyWrite") : t("settings.access.readOnlyShape")}</p>
          </div>
        ) : null}

        {st.phase === "loading" ? (
          <StudioLoading rows={3} />
        ) : st.phase === "error" ? (
          <LoadProblem error={st.error} onRetry={() => void refresh()} busy={busy} missingText={t("settings.access.missing")} />
        ) : (
          <>
            {st.error ? <LoadProblem error={st.error} onRetry={() => void refresh()} busy={busy} /> : null}
            {items.length ? (
              <FilterBar
                search={{ value: q, onChange: setQ, placeholder: t("settings.access.searchPh"), aiId: `${AI}.search.input`, aiLabel: t("settings.access.searchPh") }}
                fields={[
                  { key: "role", label: t("settings.access.filterRole"), value: roleF, onChange: setRoleF, options: roleOpts, aiId: `${AI}.filter.role` },
                  { key: "state", label: t("settings.access.filterState"), value: stateF, onChange: setStateF, options: stateOpts, aiId: `${AI}.filter.state` },
                ]}
                count={shown.length}
                aiId={`${AI}.filters`}
                aiLabel={t("settings.access.filterTitle")}
              />
            ) : null}
            {!items.length ? (
              <StudioEmpty icon={IconLock} title={t("settings.access.emptyTitle")} text={t("settings.access.emptyText")}>
                {canWrite ? (
                  <button type="button" className="btn btn--pri btn--sm" onClick={() => setModal({ kind: "new" })}>
                    <IconUserPlus aria-hidden />
                    {t("settings.access.grant")}
                  </button>
                ) : null}
              </StudioEmpty>
            ) : !shown.length ? (
              <StudioEmpty icon={IconUsers} title={t("settings.common.noMatch")} text={t("settings.common.noMatchText")} />
            ) : (
              <ul className="stu-sgrants">
                {shown.map((g) => {
                  const key = g.id || g.userId;
                  const name = g.userName || g.phone || g.userId || t("monitoring.unknownUser");
                  const lexgo = grantLexgoId(g);
                  return (
                    <li key={key} className={`stu-sgrant${g.active ? "" : " is-off"}`} data-ai-id={aiId(`${AI}.row`, key)} data-ai-type="row" data-ai-label={name}>
                      <span className="stu-sava" aria-hidden>
                        {initialsOf(name)}
                      </span>
                      <div className="stu-sgrant__m">
                        <div className="stu-sgrant__top">
                          <b>{name}</b>
                          <span className={`stu-spill${g.active ? " stu-spill--ok" : ""}`}>{g.active ? t("settings.access.active") : t("settings.access.pausedState")}</span>
                        </div>
                        <small>{[g.phone && g.phone !== name ? g.phone : "", lexgo ? `LexGo ID ${lexgo}` : "", g.createdAt ? t("settings.access.since", { d: day(g.createdAt) }) : ""].filter(Boolean).join(" · ")}</small>
                        <div className="stu-sgrant__chips">
                          {g.roles.length ? (
                            g.roles.map((r) => (
                              <span key={r} className="stu-srole">
                                {role(r)}
                              </span>
                            ))
                          ) : (
                            <span className="stu-hint">{t("settings.access.noRoles")}</span>
                          )}
                          <span className="stu-sgrant__sep" aria-hidden />
                          {g.constructorCodes.length ? (
                            g.constructorCodes.slice(0, 6).map((c) => (
                              <span key={c} title={ctorName(c)}>
                                <StudioCodeChip code={c} />
                              </span>
                            ))
                          ) : (
                            <span className="stu-hint">{t("settings.access.allCtors")}</span>
                          )}
                          {g.constructorCodes.length > 6 ? <span className="stu-hint">+{num(g.constructorCodes.length - 6)}</span> : null}
                        </div>
                      </div>
                      {canWrite && g.userId ? (
                        <div className="stu-sgrant__acts">
                          <button type="button" className="btn btn--soft btn--sm" onClick={() => setModal({ kind: "edit", grant: g })} disabled={Boolean(toggling)} data-ai-id={aiId(`${AI}.row`, key, "edit")} data-ai-type="button" data-ai-label={t("settings.access.edit")}>
                            <IconEdit aria-hidden />
                            {t("settings.access.edit")}
                          </button>
                          {g.active ? (
                            <button type="button" className="btn btn--line btn--sm" onClick={() => setAsk(g)} disabled={Boolean(toggling)} data-ai-id={aiId(`${AI}.row`, key, "pause")} data-ai-type="button" data-ai-label={t("settings.access.pause")}>
                              <IconLock aria-hidden />
                              {t("settings.access.pause")}
                            </button>
                          ) : (
                            <button type="button" className="btn btn--line btn--sm" onClick={() => void setActive(g, true)} disabled={Boolean(toggling)} data-ai-id={aiId(`${AI}.row`, key, "resume")} data-ai-type="button" data-ai-label={t("settings.access.resume")}>
                              {toggling === key ? <span className="stu-spin" aria-hidden /> : <IconCircleCheck aria-hidden />}
                              {t("settings.access.resume")}
                            </button>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="stu-card" data-ai-id={`${AI}.legend`} data-ai-type="section" data-ai-label={t("settings.roleInfo.title")}>
        <PanelHead icon={IconShieldCheck} title={t("settings.roleInfo.title")} text={t("settings.roleInfo.lead")} />
        <ul className="stu-slegend">
          {STUDIO_ROLES.map((r) => {
            const Glyph = ROLE_ICON[r];
            return (
              <li key={r} className={`stu-slegend__i stu-slegend__i--${r}`}>
                <span className="stu-slegend__ico" aria-hidden>
                  <Glyph />
                </span>
                <div>
                  <b>
                    {role(r)}
                  </b>
                  <p>{t(`settings.roleInfo.${r}.text`)}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="stu-hint">{t("settings.roleInfo.admins")}</p>
      </section>

      <GrantModal mode={modal} grants={items} codes={codes} onClose={() => setModal(null)} onSaved={(s) => void onSaved(s)} onMissing={onMissing} />
      <ConfirmModal
        open={ask !== null}
        title={t("settings.access.pauseTitle")}
        text={t("settings.access.pauseText", { name: ask ? ask.userName || ask.phone || ask.userId : "" })}
        confirmLabel={t("settings.access.pause")}
        icon={IconLock}
        tone="warn"
        busy={Boolean(toggling)}
        aiId={`${AI}.pause-confirm`}
        onConfirm={() => {
          if (ask) void setActive(ask, false);
        }}
        onClose={() => setAsk(null)}
      />
    </div>
  );
}
