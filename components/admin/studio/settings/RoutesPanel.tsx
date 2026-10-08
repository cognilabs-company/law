"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FilterBar from "@/components/filters/FilterBar";
import { aiId } from "@/lib/ai/ids";
import { toast } from "@/lib/toast";
import { listApprovalRoutes, useStudioRegistry, type StudioRoute } from "@/lib/services/studio";
import { STUDIO_CODES, ctorOrder } from "@/lib/studio/constructors";
import { ConstructorIcon, StudioCodeChip, StudioEmpty, StudioLoading, useStudioLive, useStudioText } from "../bits";
import RouteModal, { DEFAULT_STEPS, type RouteMode, type RouteSaved } from "./RouteModal";
import { LoadProblem, PanelHead, matchesTerms, type Phase } from "./ui";
import { IconArrowRight, IconEdit, IconPlus, IconRefresh, IconRocket, IconShieldCheck } from "@/components/icons";

type State = { phase: Phase; items: StudioRoute[]; error: unknown };

const AI = "admin.studio.settings.routes";

export default function RoutesPanel() {
  const { t, role, ctorName, num, day } = useStudioText();
  const reg = useStudioRegistry();
  const [st, setSt] = useState<State>({ phase: "loading", items: [], error: null });
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<RouteMode | null>(null);
  const [q, setQ] = useState("");
  const [codeF, setCodeF] = useState("");
  const [statusF, setStatusF] = useState("");
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const items = await listApprovalRoutes();
      if (my !== seq.current) return;
      setSt({ phase: "ready", items, error: null });
    } catch (e) {
      if (my !== seq.current) return;
      setSt((cur) => (cur.phase === "ready" ? { ...cur, error: e } : { phase: "error", items: [], error: e }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useStudioLive((e) => {
    if (e.event === "studio.approval_route_updated" || e.event === "studio.resync") void load();
  });

  async function refresh() {
    setBusy(true);
    await load();
    setBusy(false);
  }

  async function onSaved(s: RouteSaved) {
    setModal(null);
    toast(t("settings.routes.saved", { code: s.input.constructorCode }), { tone: "ok" });
    await load();
  }

  const statusLabel = (s: string) => (t.has(`settings.routes.status_${s}`) ? t(`settings.routes.status_${s}`) : s);

  const ctors = reg.items.length
    ? reg.items.map((c) => ({ code: c.code, title: c.title, approvalFree: !c.approvalRequired }))
    : STUDIO_CODES.map((c) => ({ code: c as string, title: "", approvalFree: c === "K16" }));
  ctors.sort((a, b) => ctorOrder(a.code) - ctorOrder(b.code));
  const codeChoices = ctors.map((c) => ({ code: c.code, label: `${c.code} · ${ctorName(c.code, c.title)}`, approvalFree: c.approvalFree }));

  const items = [...st.items].sort((a, b) => ctorOrder(a.constructorCode) - ctorOrder(b.constructorCode));
  const taken = items.map((r) => r.constructorCode);
  const uncovered = ctors.filter((c) => !c.approvalFree && !taken.includes(c.code));
  const statuses = [...new Set(items.map((r) => r.status).filter(Boolean))];
  const present = [...new Set(taken.filter(Boolean))];
  if (codeF && !present.includes(codeF)) present.push(codeF);

  const codeOpts = [{ value: "", label: t("common.all") }, ...present.map((c) => ({ value: c, label: `${c} · ${ctorName(c)}` }))];
  const statusOpts = [
    { value: "", label: t("common.all") },
    ...statuses.map((s) => ({ value: s, label: `${statusLabel(s)} (${num(items.filter((r) => r.status === s).length)})` })),
  ];
  const shown = items.filter((r) => {
    if (codeF && r.constructorCode !== codeF) return false;
    if (statusF && r.status !== statusF) return false;
    return matchesTerms([r.title, r.constructorCode, ctorName(r.constructorCode), ...r.steps.flatMap((s) => [s.title, role(s.role)])], q);
  });

  return (
    <div className="stu-set__stack">
      <section className="stu-card" data-ai-id={`${AI}.list`} data-ai-type="section" data-ai-label={t("settings.routes.title")}>
        <PanelHead icon={IconShieldCheck} title={t("settings.routes.title")} text={t("settings.routes.lead")}>
          {st.phase !== "loading" ? (
            <button type="button" className="btn btn--line btn--sm" onClick={() => void refresh()} disabled={busy} data-ai-id={`${AI}.refresh`} data-ai-type="button" data-ai-label={t("settings.common.refresh")}>
              <IconRefresh className={busy ? "stu-spinning" : undefined} aria-hidden />
              {t("settings.common.refresh")}
            </button>
          ) : null}
          {st.phase === "ready" ? (
            <button type="button" className="btn btn--pri btn--sm" onClick={() => setModal({ kind: "new" })} data-ai-id={`${AI}.create`} data-ai-type="button" data-ai-label={t("settings.routes.create")}>
              <IconPlus aria-hidden />
              {t("settings.routes.create")}
            </button>
          ) : null}
        </PanelHead>

        <div className="stu-sdef" aria-label={t("settings.routes.defaultLabel")}>
          <span className="stu-sdef__l">{t("settings.routes.defaultLabel")}</span>
          <StepChain steps={DEFAULT_STEPS} />
        </div>

        {st.phase === "loading" ? (
          <StudioLoading rows={3} />
        ) : st.phase === "error" ? (
          <LoadProblem error={st.error} onRetry={() => void refresh()} busy={busy} missingText={t("settings.routes.missing")} />
        ) : (
          <>
            {st.error ? <LoadProblem error={st.error} onRetry={() => void refresh()} busy={busy} /> : null}
            {items.length ? (
              <FilterBar
                search={{ value: q, onChange: setQ, placeholder: t("settings.routes.searchPh"), aiId: `${AI}.search.input`, aiLabel: t("settings.routes.searchPh") }}
                fields={[
                  { key: "code", label: t("settings.routes.filterCtor"), value: codeF, onChange: setCodeF, options: codeOpts, aiId: `${AI}.filter.constructor` },
                  { key: "status", label: t("settings.routes.filterStatus"), value: statusF, onChange: setStatusF, options: statusOpts, aiId: `${AI}.filter.status`, hidden: statuses.length < 2 && !statusF },
                ]}
                count={shown.length}
                aiId={`${AI}.filters`}
                aiLabel={t("settings.routes.filterTitle")}
              />
            ) : null}
            {!items.length ? (
              <StudioEmpty icon={IconShieldCheck} title={t("settings.routes.emptyTitle")} text={t("settings.routes.emptyText")}>
                <button type="button" className="btn btn--pri btn--sm" onClick={() => setModal({ kind: "new" })}>
                  <IconPlus aria-hidden />
                  {t("settings.routes.create")}
                </button>
              </StudioEmpty>
            ) : !shown.length ? (
              <StudioEmpty icon={IconShieldCheck} title={t("settings.common.noMatch")} text={t("settings.common.noMatchText")} />
            ) : (
              <ul className="stu-sroutes">
                {shown.map((r) => {
                  const key = r.id || r.constructorCode;
                  const off = r.status !== "active";
                  return (
                    <li key={key} className={`stu-sroute${off ? " is-off" : ""}`} data-ai-id={aiId(`${AI}.row`, key)} data-ai-type="row" data-ai-label={r.title || r.constructorCode}>
                      <ConstructorIcon code={r.constructorCode} size="md" />
                      <div className="stu-sroute__m">
                        <div className="stu-sroute__top">
                          <StudioCodeChip code={r.constructorCode} />
                          <b>{r.title || ctorName(r.constructorCode)}</b>
                          <span className={`stu-spill${off ? "" : " stu-spill--ok"}`}>{statusLabel(r.status)}</span>
                        </div>
                        <small>
                          {ctorName(r.constructorCode)}
                          {r.updatedAt ? ` · ${t("settings.routes.updated", { d: day(r.updatedAt) })}` : ""}
                        </small>
                        {r.steps.length ? <StepChain steps={r.steps} /> : <span className="stu-hint">{t("settings.routes.noSteps")}</span>}
                      </div>
                      <button type="button" className="btn btn--soft btn--sm" onClick={() => setModal({ kind: "edit", route: r })} data-ai-id={aiId(`${AI}.row`, key, "edit")} data-ai-type="button" data-ai-label={t("settings.routes.edit")}>
                        <IconEdit aria-hidden />
                        {t("settings.routes.edit")}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>

      {st.phase === "ready" && uncovered.length ? (
        <section className="stu-card" data-ai-id={`${AI}.uncovered`} data-ai-type="section" data-ai-label={t("settings.routes.uncoveredTitle")}>
          <PanelHead icon={IconRocket} title={t("settings.routes.uncoveredTitle")} text={t("settings.routes.uncoveredText", { n: num(uncovered.length) })} />
          <div className="stu-suncov">
            {uncovered.map((c) => (
              <button
                key={c.code}
                type="button"
                className="stu-suncov__b"
                onClick={() => setModal({ kind: "new", code: c.code })}
                data-ai-id={aiId(`${AI}.setup`, c.code)}
                data-ai-type="button"
                data-ai-label={`${t("settings.routes.setup")} ${c.code}`}
              >
                <ConstructorIcon code={c.code} size="sm" />
                <span>
                  <b>{c.code}</b>
                  <small>{ctorName(c.code, c.title)}</small>
                </span>
                <IconPlus className="stu-suncov__plus" aria-hidden />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <RouteModal mode={modal} codes={codeChoices} taken={taken} onClose={() => setModal(null)} onSaved={(s) => void onSaved(s)} />
    </div>
  );
}

function StepChain({ steps }: { steps: { role: string; title: string }[] }) {
  const { role } = useStudioText();
  return (
    <ol className="stu-schain">
      {steps.map((s, i) => (
        <li key={`${i}-${s.role}`}>
          {i > 0 ? <IconArrowRight className="stu-schain__arr" aria-hidden /> : null}
          <span className="stu-schain__s">
            <em>{i + 1}</em>
            <span>
              <b>{s.title || role(s.role)}</b>
              {s.title && s.role ? <small>{role(s.role)}</small> : null}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
