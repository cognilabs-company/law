"use client";

import "./rules.css";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SxDrawer } from "@/components/admin/studio/sx/layout/Drawer";
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import { SxButton } from "@/components/admin/studio/sx/Button";
import { ArrowsClockwiseIcon, CaretDownIcon, CheckCircleIcon, ScrollIcon, ShieldWarningIcon, glyph } from "@/components/admin/studio/sx/icons";
import { aiId } from "@/lib/ai/ids";
import { fmtDate } from "@/lib/date";
import { deviceLabel, type ServiceRule } from "@/lib/services/marketRuntime";
import { acceptRule, closeRulesDrawer, refreshRulesGate, rulesGateSnapshot, useRulesDrawerHost, useRulesGateState } from "@/lib/services/rulesGate";
import RuleBody from "./RuleBody";

const SCOPES = new Set(["global", "service", "category"]);
const noop = () => () => {};
const readDevice = () => deviceLabel();
const emptyDevice = () => "";

function isFuture(iso: string): boolean {
  const at = Date.parse(iso);
  return Number.isFinite(at) && at > Date.now();
}

function orderRules(rules: readonly ServiceRule[], focusIds: readonly string[]): ServiceRule[] {
  const focus = new Set(focusIds);
  const blocking = focusIds.map((id) => rules.find((r) => r.id === id)).filter((r): r is ServiceRule => !!r && !r.accepted);
  return [...blocking, ...rules.filter((r) => !r.accepted && !focus.has(r.id)), ...rules.filter((r) => r.accepted)];
}

export default function RulesDrawer(): ReactElement | null {
  const host = useRulesDrawerHost();
  const gate = useRulesGateState();
  const t = useTranslations("sellerServices");
  const tm = useTranslations("marketplace");
  const locale = useLocale();
  const base = useId();
  const device = useSyncExternalStore(noop, readDevice, emptyDevice);
  const [live, setLive] = useState("");
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const pending = useRef("");
  const { open, focusIds } = gate.drawer;
  const focusKey = focusIds.join("|");
  const accId = (id: string) => `${base}-acc-${id}`;
  const doneId = `${base}-done`;
  const deviceId = `${base}-device`;

  const focusTarget = open && focusIds.length ? accId(focusIds[0]) : "";

  useEffect(() => {
    pending.current = focusTarget;
  }, [focusTarget, focusKey]);

  useEffect(() => {
    const target = pending.current;
    if (!open || !target) return;
    const el = document.getElementById(target);
    if (!el) return;
    pending.current = "";
    el.closest("article")?.scrollIntoView?.({ block: "nearest" });
    el.focus({ preventScroll: true });
  });

  if (!host) return null;

  const rules = orderRules(gate.rules, focusIds);
  const focus = new Set(focusIds);
  const lists = Object.values(gate.lists);
  const busy = gate.accepting.length > 0;
  const loading = !rules.length && (!lists.length || lists.some((l) => l.status === "loading"));
  const failed = !rules.length && !loading && lists.some((l) => l.status === "error" || l.status === "denied") && !lists.some((l) => l.status === "ready");
  const pendingCount = gate.missing.length;

  const close = () => {
    setLive("");
    closeRulesDrawer();
  };

  const errorText = (code: string) => (code && tm.has(`errors.${code}`) ? tm(`errors.${code}`, { n: pendingCount, list: "" }) : t("rules.acceptError"));

  const accept = async (rule: ServiceRule) => {
    const ok = await acceptRule(rule.id);
    if (!ok) return;
    setLive(t("rules.acceptedLive", { title: rule.title || rule.ruleKey }));
    const now = rulesGateSnapshot();
    const order = orderRules(now.rules, now.drawer.focusIds).filter((r) => !r.accepted);
    pending.current = order.length ? accId(order[0].id) : doneId;
  };

  const footer = (
    <>
      <SxButton variant="secondary" onClick={close} disabled={busy}>
        {t("rules.close")}
      </SxButton>
      {pendingCount === 0 && gate.rules.length ? (
        <SxButton id={doneId} variant="primary" icon={CheckCircleIcon} onClick={close} disabled={busy}>
          {t("rules.done")}
        </SxButton>
      ) : null}
    </>
  );

  return (
    <SxDrawer open={open} onClose={close} title={t("rules.drawerTitle")} description={t("rules.drawerLead")} size="md" aiId="seller.rules.drawer" busy={busy} footer={footer}>
      <div className="svr">
        <p className="sx-vh" role="status" aria-live="polite">
          {live}
        </p>
        {loading ? (
          <div className="svr-sk" aria-busy="true">
            <span className="sx-sk" />
            <span className="sx-sk" />
            <span className="sx-sk" />
          </div>
        ) : failed ? (
          <SxNote
            tone="error"
            title={t("rules.loadError")}
            action={
              <SxButton size="sm" icon={ArrowsClockwiseIcon} onClick={() => void refreshRulesGate({ force: true })}>
                {t("retry")}
              </SxButton>
            }
          />
        ) : !rules.length ? (
          <p className="svr-empty">{t("rules.empty")}</p>
        ) : (
          <>
            {pendingCount ? <SxNote tone="warn" title={t("rules.summaryPending", { n: pendingCount })} /> : <SxNote tone="success" title={t("rules.summaryDone")} />}
            {pendingCount && device ? (
              <p id={deviceId} className="svr-device">
                {t("rules.deviceNote", { device })}
              </p>
            ) : null}
            <div className="svr-list">
              {rules.map((r) => {
                const blocking = !r.accepted && focus.has(r.id);
                const state = r.accepted ? "accepted" : blocking ? "blocking" : "missing";
                const expanded = shown[r.id] ?? !r.accepted;
                const hid = `${base}-h-${r.id}`;
                const bid = `${base}-b-${r.id}`;
                const eid = `${base}-e-${r.id}`;
                const code = gate.acceptErrors[r.id];
                const hasErr = code !== undefined;
                const date = r.effectiveAt ? fmtDate(r.effectiveAt, locale) : "";
                const scope = SCOPES.has(r.scopeType) ? t(`rules.scope.${r.scopeType}`) : "";
                const accepting = gate.accepting.includes(r.id);
                return (
                  <article key={r.id} className="svr-rule" data-state={state} data-ai-id={aiId("seller.rules.rule", r.id)} data-ai-type="card" aria-labelledby={hid}>
                    <div className="svr-rule__head">
                      <span className="svr-rule__ic" aria-hidden="true">
                        {glyph(r.accepted ? CheckCircleIcon : blocking ? ShieldWarningIcon : ScrollIcon, { size: 18 })}
                      </span>
                      <div className="svr-rule__ht">
                        <h3 id={hid}>{r.title || r.ruleKey}</h3>
                        <p className="svr-rule__meta">
                          {r.version ? <span>{t("rules.version", { version: r.version })}</span> : null}
                          {date ? <span>{isFuture(r.effectiveAt) ? t("rules.effectiveFrom", { date }) : t("rules.effectiveSince", { date })}</span> : null}
                          {scope ? <span>{scope}</span> : null}
                        </p>
                      </div>
                    </div>
                    <p className="svr-rule__state">
                      {r.accepted ? (
                        <span className="svr-chip" data-tone="ok">
                          {glyph(CheckCircleIcon, { size: 14 })}
                          {r.acceptedAt ? t("rules.stateAcceptedAt", { date: fmtDate(r.acceptedAt, locale) }) : t("rules.stateAccepted")}
                        </span>
                      ) : (
                        <span className="svr-chip" data-tone="new">
                          {t("rules.stateNew")}
                        </span>
                      )}
                      {blocking ? (
                        <span className="svr-chip" data-tone="danger">
                          {glyph(ShieldWarningIcon, { size: 14 })}
                          {t("rules.blocking")}
                        </span>
                      ) : null}
                    </p>
                    <button
                      type="button"
                      className="svr-rule__toggle"
                      aria-expanded={expanded}
                      aria-controls={bid}
                      onClick={() => setShown((cur) => ({ ...cur, [r.id]: !expanded }))}
                    >
                      {glyph(CaretDownIcon, { size: 16 })}
                      {expanded ? t("rules.hideText") : t("rules.showText")}
                    </button>
                    <div id={bid} className="svr-rule__body" hidden={!expanded}>
                      <RuleBody html={r.body} />
                    </div>
                    {r.accepted ? null : (
                      <div className="svr-rule__act">
                        <SxButton
                          id={accId(r.id)}
                          variant="primary"
                          icon={CheckCircleIcon}
                          busy={accepting}
                          aiId={aiId("seller.rules.rule", r.id, "accept")}
                          aria-describedby={[pendingCount && device ? deviceId : "", hasErr ? eid : ""].filter(Boolean).join(" ") || undefined}
                          onClick={() => void accept(r)}
                        >
                          {t("rules.accept")}
                        </SxButton>
                        {hasErr ? (
                          <p id={eid} className="svr-rule__err" role="alert">
                            {errorText(code)}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    </SxDrawer>
  );
}
