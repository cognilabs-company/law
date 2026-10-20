"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Select from "@/components/Select";
import FilterBar from "@/components/filters/FilterBar";
import { aiId } from "@/lib/ai/ids";
import { logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { getEffectiveRoute, listApprovalRoutes, useStudioRegistry, type StudioRoute, type StudioRouteBoard, type StudioRouteScope } from "@/lib/services/studio";
import { STUDIO_CODES, ctorOrder } from "@/lib/studio/constructors";
import { ConstructorIcon, StudioEmpty, StudioLoading, useStudioLive } from "../bits";
import { useStudioHuman } from "../human";
import RouteChain from "../RouteChain";
import { useStudioLabels } from "../sx/useStudioLabels";
import RouteModal, { type RouteMode, type RouteSaved } from "./RouteModal";
import { LoadProblem, PanelHead, matchesTerms, type Phase } from "./ui";
import { IconEdit, IconFolder, IconGlobe, IconPlus, IconRefresh, IconSearch, IconShieldCheck, IconSliders } from "@/components/icons";

type State = { phase: Phase; board: StudioRouteBoard; error: unknown };
const EMPTY: StudioRouteBoard = { items: [], groups: [], primarySuperadmin: null };
const AI = "admin.studio.settings.routes";
// A route that is switched off stands in nobody's way: the next level applies.
const live = (r: StudioRoute) => r.status === "active";

// Three levels of one setting (contract §16): the general route, a route per
// section, an override per constructor — and, below, which of them a given
// constructor is approved by today.
export default function RoutesPanel() {
  const { t, num, day } = useStudioHuman();
  const labels = useStudioLabels();
  const reg = useStudioRegistry();
  const ctorName = (code: string, title?: string) => labels.ctorName(code, title || reg.items.find((c) => c.code === code)?.title);
  const groupTitle = (key: string, title?: string) => labels.groupName(key, title);
  const groupText = (key: string, text?: string) => labels.groupWhat(key, text);
  const [st, setSt] = useState<State>({ phase: "loading", board: EMPTY, error: null });
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<RouteMode | null>(null);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("");
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const board = await listApprovalRoutes();
      if (my !== seq.current) return;
      setSt({ phase: "ready", board, error: null });
    } catch (e) {
      if (my !== seq.current) return;
      setSt((cur) => (cur.phase === "ready" ? { ...cur, error: e } : { phase: "error", board: EMPTY, error: e }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const [pulse, setPulse] = useState(0);
  useStudioLive((e) => {
    if (e.event === "studio.approval_route_updated" || e.event === "studio.resync") {
      void load();
      setPulse((n) => n + 1);
    }
  });

  async function refresh() {
    setBusy(true);
    await load();
    setPulse((n) => n + 1);
    setBusy(false);
  }

  const { items, groups, primarySuperadmin } = st.board;
  const superName = primarySuperadmin?.name ?? "";
  const scopeName = (scope: StudioRouteScope, key: string) => (scope === "global" ? t("settings.routes.globalTitle") : scope === "group" ? groupTitle(key, groups.find((g) => g.key === key)?.title) : ctorName(key));

  async function onSaved(s: RouteSaved) {
    setModal(null);
    toast(t("settings.routes.saved", { code: scopeName(s.input.scopeType, s.input.scopeKey) }), { tone: "ok" });
    await load();
    setPulse((n) => n + 1);
  }

  const statusLabel = (s: string) => (t.has(`settings.routes.status_${s}`) ? t(`settings.routes.status_${s}`) : labels.status(s, "runtime"));
  const ctors = (reg.items.length ? reg.items.map((c) => ({ code: c.code, title: c.title })) : STUDIO_CODES.map((c) => ({ code: c as string, title: "" }))).sort((a, b) => ctorOrder(a.code) - ctorOrder(b.code));
  const codeChoices = ctors.map((c) => ({ code: c.code, label: ctorName(c.code, c.title) }));
  const taken = items.map((r) => `${r.scopeType}:${r.scopeKey}`);

  const global = items.find((r) => r.scopeType === "global") ?? null;
  const groupRoute = (key: string) => items.find((r) => r.scopeType === "group" && r.scopeKey === key) ?? null;
  const own = items.filter((r) => r.scopeType === "constructor").sort((a, b) => ctorOrder(a.constructorCode) - ctorOrder(b.constructorCode));
  const statuses = [...new Set(own.map((r) => r.status).filter(Boolean))];
  const shown = own.filter((r) => (!statusF || r.status === statusF) && matchesTerms([r.title, ctorName(r.constructorCode), ...r.steps.flatMap((s) => [s.title, ...s.approvers.map((p) => p.name)])], q));
  // What a level falls back to when it has no route of its own.
  const fallback = global && live(global) ? t("settings.routes.inheritsGlobal") : t("settings.routes.inheritsDefault");

  const editBtn = (r: StudioRoute | null, mode: RouteMode, id: string) => (
    <button type="button" className={`btn btn--sm ${r ? "btn--soft" : "btn--line"}`} onClick={() => setModal(r ? { kind: "edit", route: r } : mode)} data-ai-id={aiId(`${AI}.edit`, id)} data-ai-type="button" data-ai-label={r ? t("settings.routes.edit") : t("settings.routes.setup")}>
      {r ? <IconEdit aria-hidden /> : <IconPlus aria-hidden />}
      {r ? t("settings.routes.edit") : t("settings.routes.setup")}
    </button>
  );
  const body = (r: StudioRoute | null) =>
    r ? (
      <>
        <RouteChain route={r} superadmin={superName} />
        {!live(r) ? <span className="stu-hint">{fallback}</span> : null}
      </>
    ) : (
      <span className="stu-hint">{fallback}</span>
    );
  const pill = (r: StudioRoute | null) => (r ? <span className={`stu-spill${live(r) ? " stu-spill--ok" : ""}`}>{statusLabel(r.status)}</span> : null);

  return (
    <div className="stu-set__stack">
      <section className="stu-card" data-ai-id={`${AI}.global`} data-ai-type="section" data-ai-label={t("settings.routes.globalTitle")}>
        <PanelHead icon={IconShieldCheck} title={t("settings.routes.title")} text={t("settings.routes.lead")}>
          {st.phase !== "loading" ? (
            <button type="button" className="btn btn--line btn--sm" onClick={() => void refresh()} disabled={busy} data-ai-id={`${AI}.refresh`} data-ai-type="button" data-ai-label={t("settings.common.refresh")}>
              <IconRefresh className={busy ? "stu-spinning" : undefined} aria-hidden />
              {t("settings.common.refresh")}
            </button>
          ) : null}
        </PanelHead>
        {st.phase === "loading" ? (
          <StudioLoading rows={3} />
        ) : st.phase === "error" ? (
          <LoadProblem error={st.error} onRetry={() => void refresh()} busy={busy} missingText={t("settings.routes.missing")} />
        ) : (
          <>
            {st.error ? <LoadProblem error={st.error} onRetry={() => void refresh()} busy={busy} /> : null}
            <div className="stu-sroute stu-sroute--lvl">
              <span className="stu-slvl" aria-hidden>
                <IconGlobe />
              </span>
              <div className="stu-sroute__m">
                <div className="stu-sroute__top">
                  <b>{t("settings.routes.globalTitle")}</b>
                  {pill(global)}
                </div>
                <small>{t("settings.routes.globalText")}</small>
                {global ? body(global) : <span className="stu-hint">{t("settings.routes.inheritsDefault")}</span>}
              </div>
              {editBtn(global, { kind: "new", scope: "global", key: "*" }, "global")}
            </div>
          </>
        )}
      </section>

      {st.phase === "ready" ? (
        <>
          <section className="stu-card" data-ai-id={`${AI}.groups`} data-ai-type="section" data-ai-label={t("settings.routes.groupsTitle")}>
            <PanelHead icon={IconFolder} title={t("settings.routes.groupsTitle")} text={t("settings.routes.groupsText")} />
            <ul className="stu-sroutes">
              {groups.map((g) => {
                const r = groupRoute(g.key);
                return (
                  <li key={g.key} className={`stu-sroute stu-sroute--lvl${r && !live(r) ? " is-off" : ""}`} data-ai-id={aiId(`${AI}.group`, g.key)} data-ai-type="row" data-ai-label={groupTitle(g.key, g.title)}>
                    <span className="stu-slvl" aria-hidden>
                      <IconFolder />
                    </span>
                    <div className="stu-sroute__m">
                      <div className="stu-sroute__top">
                        <b>{groupTitle(g.key, g.title)}</b>
                        {pill(r)}
                      </div>
                      <small>
                        {t("settings.routes.groupCount", { n: num(g.codes.length) })}
                        {groupText(g.key, g.description) ? ` · ${groupText(g.key, g.description)}` : ""}
                      </small>
                      {body(r)}
                    </div>
                    {editBtn(r, { kind: "new", scope: "group", key: g.key }, g.key)}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="stu-card" data-ai-id={`${AI}.list`} data-ai-type="section" data-ai-label={t("settings.routes.ctorsTitle")}>
            <PanelHead icon={IconSliders} title={t("settings.routes.ctorsTitle")} text={t("settings.routes.ctorsText")}>
              <button type="button" className="btn btn--pri btn--sm" onClick={() => setModal({ kind: "new", scope: "constructor" })} data-ai-id={`${AI}.create`} data-ai-type="button" data-ai-label={t("settings.routes.addOverride")}>
                <IconPlus aria-hidden />
                {t("settings.routes.addOverride")}
              </button>
            </PanelHead>
            {own.length ? (
              <FilterBar
                search={{ value: q, onChange: setQ, placeholder: t("settings.routes.searchPh"), aiId: `${AI}.search.input`, aiLabel: t("settings.routes.searchPh") }}
                fields={[{ key: "status", label: t("settings.routes.filterStatus"), value: statusF, onChange: setStatusF, options: [{ value: "", label: t("common.all") }, ...statuses.map((s) => ({ value: s, label: `${statusLabel(s)} (${num(own.filter((r) => r.status === s).length)})` }))], aiId: `${AI}.filter.status`, hidden: statuses.length < 2 && !statusF }]}
                count={shown.length}
                aiId={`${AI}.filters`}
                aiLabel={t("settings.routes.filterTitle")}
              />
            ) : null}
            {!own.length ? (
              <StudioEmpty icon={IconShieldCheck} title={t("settings.routes.emptyTitle")} text={t("settings.routes.emptyText")} />
            ) : !shown.length ? (
              <StudioEmpty icon={IconShieldCheck} title={t("settings.common.noMatch")} text={t("settings.common.noMatchText")} />
            ) : (
              <ul className="stu-sroutes">
                {shown.map((r) => {
                  const key = r.id || r.scopeKey;
                  return (
                    <li key={key} className={`stu-sroute${live(r) ? "" : " is-off"}`} data-ai-id={aiId(`${AI}.row`, key)} data-ai-type="row" data-ai-label={r.title || ctorName(r.constructorCode)}>
                      <ConstructorIcon code={r.constructorCode} size="md" />
                      <div className="stu-sroute__m">
                        <div className="stu-sroute__top">
                          <b>{ctorName(r.constructorCode)}</b>
                          {pill(r)}
                        </div>
                        <small>
                          {r.title}
                          {r.updatedAt ? ` · ${t("settings.routes.updated", { d: day(r.updatedAt) })}` : ""}
                        </small>
                        <RouteChain route={r} superadmin={superName} />
                      </div>
                      {editBtn(r, { kind: "new", scope: "constructor", key: r.constructorCode }, key)}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <EffectiveRoute codes={codeChoices} superadmin={superName} pulse={pulse} />
        </>
      ) : null}

      <RouteModal mode={modal} codes={codeChoices} groups={groups} taken={taken} superadmin={primarySuperadmin} onClose={() => setModal(null)} onSaved={(s) => void onSaved(s)} />
    </div>
  );
}

// Which route a constructor is approved by today, and whose it is — the
// backend resolves it (constructor, then section, then general, then its
// own default); nothing is worked out here.
function EffectiveRoute({ codes, superadmin, pulse }: { codes: { code: string; label: string }[]; superadmin: string; pulse: number }) {
  const { t } = useStudioHuman();
  const [code, setCode] = useState("");
  const [got, setGot] = useState<{ key: string; route: StudioRoute | null; failed: boolean } | null>(null);
  const key = `${code}|${pulse}`;
  useEffect(() => {
    if (!code) return;
    const c = new AbortController();
    getEffectiveRoute(code, c.signal)
      .then((route) => setGot({ key, route, failed: false }))
      .catch((e: unknown) => {
        if (c.signal.aborted) return;
        logApiError("studio.route.effective", e);
        setGot({ key, route: null, failed: true });
      });
    return () => c.abort();
  }, [code, key]);
  const cur = got?.key === key ? got : null;
  return (
    <section className="stu-card" data-ai-id={`${AI}.effective`} data-ai-type="section" data-ai-label={t("settings.routes.effectiveTitle")}>
      <PanelHead icon={IconSearch} title={t("settings.routes.effectiveTitle")} text={t("settings.routes.effectiveText")} />
      <div className="stu-seff">
        <div className="stu-fld" data-ai-id={`${AI}.effective.constructor`} data-ai-type="select" data-ai-label={t("settings.routes.constructor")}>
          <Select value={code} onChange={setCode} options={codes.map((c) => ({ value: c.code, label: c.label }))} placeholder={t("settings.routes.pickCtor")} ariaLabel={t("settings.routes.constructor")} />
        </div>
        {!code ? null : !cur ? (
          <StudioLoading rows={1} />
        ) : cur.failed || !cur.route ? (
          <p className="stu-hint">{t("error.hint.other")}</p>
        ) : (
          <div className="stu-seff__r">
            <div className="stu-sroute__top">
              <span className="stu-spill stu-spill--brand">{t("settings.routes.effectiveFrom", { src: t(`settings.routes.source.${cur.route.source}`) })}</span>
              {cur.route.source !== "default" && cur.route.title ? <b>{cur.route.title}</b> : null}
            </div>
            <RouteChain route={cur.route} superadmin={superadmin} />
            <p className="stu-hint">{t("settings.routes.effectiveNote")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
