"use client";

import { useState } from "react";
import FilterBar from "@/components/filters/FilterBar";
import { aiId } from "@/lib/ai/ids";
import { logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { syncStudioConstructors, useStudioRegistry } from "@/lib/services/studio";
import { STUDIO_GROUPS, ctorMeta, ctorOrder } from "@/lib/studio/constructors";
import { ConstructorIcon, StudioCodeChip, StudioEmpty, StudioErrorNote, StudioLoading, useStudioErrorText, useStudioText } from "../bits";
import { ConfirmModal, PanelHead, matchesTerms } from "./ui";
import { IconCircleCheck, IconLayers, IconRefresh, IconRocket } from "@/components/icons";

const AI = "admin.studio.settings.registry";
const SHOW_REQ = 4;

export default function RegistryPanel() {
  const { t, ctorName, group, num } = useStudioText();
  const errText = useStudioErrorText();
  const reg = useStudioRegistry();
  const [ask, setAsk] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [q, setQ] = useState("");
  const [groupF, setGroupF] = useState("");
  const [apprF, setApprF] = useState("");

  async function sync() {
    setSyncing(true);
    try {
      const res = await syncStudioConstructors();
      setAsk(false);
      toast(res.count ? t("settings.registry.synced", { n: num(res.count) }) : t("settings.registry.syncedNoCount"), { tone: "ok" });
    } catch (e) {
      logApiError("studio.registry.sync", e);
      setAsk(false);
      toast(errText(e).text || t("settings.registry.syncFail"), { tone: "err" });
    } finally {
      setSyncing(false);
    }
  }

  const items = [...reg.items].sort((a, b) => ctorOrder(a.code) - ctorOrder(b.code));
  const freeN = items.filter((c) => !c.approvalRequired).length;
  const groupOpts = [
    { value: "", label: t("common.all") },
    ...STUDIO_GROUPS.map((g) => ({ value: g, label: `${group(g)} (${num(items.filter((c) => ctorMeta(c.code).group === g).length)})` })),
  ];
  const apprOpts = [
    { value: "", label: t("common.all") },
    { value: "yes", label: `${t("settings.registry.approvalYes")} (${num(items.length - freeN)})` },
    { value: "no", label: `${t("settings.registry.approvalNo")} (${num(freeN)})` },
  ];
  const shown = items.filter((c) => {
    if (groupF && ctorMeta(c.code).group !== groupF) return false;
    if (apprF === "yes" && !c.approvalRequired) return false;
    if (apprF === "no" && c.approvalRequired) return false;
    return matchesTerms([c.code, c.title, ctorName(c.code, c.title), c.runtimeTarget, ...c.schema.required], q);
  });

  return (
    <div className="stu-set__stack">
      <section className="stu-card" data-ai-id={`${AI}.list`} data-ai-type="section" data-ai-label={t("settings.registry.title")}>
        <PanelHead icon={IconLayers} title={t("settings.registry.title")} text={t("settings.registry.lead", { n: num(items.length) })}>
          <button type="button" className="btn btn--pri btn--sm" onClick={() => setAsk(true)} disabled={syncing} data-ai-id={`${AI}.sync`} data-ai-type="button" data-ai-label={t("settings.registry.sync")}>
            <IconRefresh className={syncing ? "stu-spinning" : undefined} aria-hidden />
            {t("settings.registry.sync")}
          </button>
        </PanelHead>

        {reg.error && items.length ? <StudioErrorNote error={reg.error} onRetry={() => void reg.reload()} compact /> : null}

        {reg.avail === "checking" ? (
          <StudioLoading rows={3} />
        ) : !items.length ? (
          <StudioEmpty icon={IconLayers} title={t("settings.registry.emptyTitle")} text={t("settings.registry.emptyText")}>
            <button type="button" className="btn btn--pri btn--sm" onClick={() => setAsk(true)} disabled={syncing}>
              <IconRefresh aria-hidden />
              {t("settings.registry.sync")}
            </button>
          </StudioEmpty>
        ) : (
          <>
            <FilterBar
              search={{ value: q, onChange: setQ, placeholder: t("settings.registry.searchPh"), aiId: `${AI}.search.input`, aiLabel: t("settings.registry.searchPh") }}
              fields={[
                { key: "group", label: t("settings.registry.filterGroup"), value: groupF, onChange: setGroupF, options: groupOpts, aiId: `${AI}.filter.group` },
                { key: "approval", label: t("settings.registry.filterApproval"), value: apprF, onChange: setApprF, options: apprOpts, aiId: `${AI}.filter.approval` },
              ]}
              count={shown.length}
              aiId={`${AI}.filters`}
              aiLabel={t("settings.registry.filterTitle")}
            />
            {!shown.length ? (
              <StudioEmpty icon={IconLayers} title={t("settings.common.noMatch")} text={t("settings.common.noMatchText")} />
            ) : (
              <div className="stu-sreg" role="table" aria-label={t("settings.registry.title")}>
                <div className="stu-sreg__row stu-sreg__row--head" role="row">
                  <span role="columnheader">{t("settings.registry.col.ctor")}</span>
                  <span role="columnheader">{t("settings.registry.col.target")}</span>
                  <span role="columnheader">{t("settings.registry.col.approval")}</span>
                  <span role="columnheader">{t("settings.registry.col.required")}</span>
                </div>
                {shown.map((c) => {
                  const name = ctorName(c.code, c.title);
                  const req = c.schema.required;
                  return (
                    <div key={c.code} className="stu-sreg__row" role="row" data-ai-id={aiId(`${AI}.row`, c.code)} data-ai-type="row" data-ai-label={`${c.code} ${name}`}>
                      <span className="stu-sreg__ctor" role="cell">
                        <ConstructorIcon code={c.code} size="sm" />
                        <span>
                          <span className="stu-sreg__nm">
                            <StudioCodeChip code={c.code} />
                            <b>{name}</b>
                          </span>
                          {c.title && c.title !== name ? <small>{c.title}</small> : null}
                        </span>
                      </span>
                      <span role="cell" className="stu-sreg__cell">
                        <em className="stu-sreg__lbl">{t("settings.registry.col.target")}</em>
                        {c.runtimeTarget ? <code className="stu-sreg__code">{c.runtimeTarget}</code> : <span className="stu-hint">—</span>}
                      </span>
                      <span role="cell" className="stu-sreg__cell">
                        <em className="stu-sreg__lbl">{t("settings.registry.col.approval")}</em>
                        {c.approvalRequired ? (
                          <span className="stu-spill stu-spill--brand">
                            <IconCircleCheck aria-hidden />
                            {t("settings.registry.approvalYes")}
                          </span>
                        ) : (
                          <span className="stu-spill stu-spill--ok">
                            <IconRocket aria-hidden />
                            {t("settings.registry.approvalNo")}
                          </span>
                        )}
                      </span>
                      <span role="cell" className="stu-sreg__cell stu-sreg__req">
                        <em className="stu-sreg__lbl">{t("settings.registry.col.required")}</em>
                        {req.length ? (
                          <>
                            {req.slice(0, SHOW_REQ).map((f) => (
                              <code key={f} className="stu-sreg__f">
                                {f}
                              </code>
                            ))}
                            {req.length > SHOW_REQ ? <span className="stu-hint" title={req.slice(SHOW_REQ).join(", ")}>+{num(req.length - SHOW_REQ)}</span> : null}
                          </>
                        ) : (
                          <span className="stu-hint">{t("common.none")}</span>
                        )}
                        <small className="stu-sreg__all">{t("settings.registry.fieldsN", { n: num(c.schema.fields.length) })}</small>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      <ConfirmModal
        open={ask}
        title={t("settings.registry.confirmTitle")}
        text={t("settings.registry.confirmText")}
        points={[t("settings.registry.confirmP1"), t("settings.registry.confirmP2")]}
        confirmLabel={t("settings.registry.sync")}
        icon={IconRefresh}
        busy={syncing}
        aiId={`${AI}.sync-confirm`}
        onConfirm={() => void sync()}
        onClose={() => setAsk(false)}
      />
    </div>
  );
}
