"use client";

import "../sx-core.css";
import "../sx-form.css";
import "./sx-shared.css";
import { useEffect, useId, useMemo, useState, type FormEvent, type ReactElement } from "react";
import { getStudioReference } from "@/lib/services/studio";
import { logApiError } from "@/lib/http";
import type { SxPayload } from "../contract";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { SxButton, SxLinkButton, type SxButtonVariant } from "../Button";
import { SxDialog } from "../editor/SxDialog";
import { ChoiceCards, type ChoiceCard } from "../form/ChoiceCards";
import { Field, FormGrid } from "../form/Field";
import { TextInput } from "../form/TextInput";
import { ArrowRightIcon, ChevronDownIcon, ChevronRightIcon, GitBranchIcon, PlusIcon, ScrollTextIcon, SearchIcon, SparklesIcon, glyph } from "../icons";
import { SxPage } from "../layout/Page";
import { SxNote } from "../layout/Note";
import { RULE_SOURCE, normRuleTitle, useRuleList, type RuleTwin } from "../schema/ruleDuplicates";
import { useStudioLabels } from "../useStudioLabels";

// "Add rule" asks first what is being made: a rule of its own, or the next
// version of one that exists. Both open the create form: a new rule empty
// (creation_mode "new"), a new version filled from the published rule it
// continues (creation_mode "new_version", existing_rule_id), the backend
// giving that version its number. Every way into a new rule ends at this
// choice.

export type RuleKind = "new" | "version";

const enc = encodeURIComponent;

// The plain "new rule" link marks the answer, so the form opens without the
// question coming back; a new version also names the rule it continues.
export const ruleKindHref = (base: string, kind: RuleKind, from = ""): string =>
  `${base}${base.includes("?") ? "&" : "?"}rule=${kind}${kind === "version" && from ? `&from=${enc(from)}` : ""}`;

function useRuleChoice() {
  const [kind, setKind] = useState<RuleKind | "">("");
  const [rule, setRule] = useState("");
  const [tried, setTried] = useState(false);
  return {
    kind,
    rule,
    setKind: (k: RuleKind) => setKind(k),
    setRule,
    tried,
    check: () => (setTried(true), kind === "new" || (kind === "version" && !!rule)),
    kindMissing: !kind,
    ruleMissing: kind === "version" && !rule,
  };
}
type ChoiceState = ReturnType<typeof useRuleChoice>;

// Rules that can take a new version: the published ones, which the backend
// lists as /studio/reference/service-rules (a draft has no lineage yet).
function pickable(r: RuleTwin): boolean {
  return r.published;
}

function RuleList({ state, rules, idPrefix, aiBase, invalid, describedBy }: { state: ChoiceState; rules: readonly RuleTwin[] | null; idPrefix: string; aiBase: string; invalid: boolean; describedBy?: string }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const want = normRuleTitle(q);
    const list = (rules ?? []).filter((r) => !want || normRuleTitle(r.title).includes(want));
    return [...list].sort((a, b) => Number(pickable(b)) - Number(pickable(a)) || a.title.localeCompare(b.title));
  }, [rules, q]);
  if (rules === null) {
    return (
      <div className="sx-rk-list" aria-busy="true">
        {Array.from({ length: 3 }, (_, i) => (
          <span key={i} className="sx-rk-row sx-rk-row--ghost" />
        ))}
      </div>
    );
  }
  if (!rules.length) {
    return (
      <div className="sx-rk-empty">
        {glyph(ScrollTextIcon, { size: 22 })}
        <strong>{t("sx.k31kind.none")}</strong>
        <span>{t("sx.k31kind.noneText")}</span>
        <SxButton size="sm" variant="add" icon={PlusIcon} onClick={() => state.setKind("new")} aiId={`${aiBase}.none.new`}>
          {t("sx.k31kind.new")}
        </SxButton>
      </div>
    );
  }
  return (
    <div className="sx-rk-pick">
      {rules.length > 4 ? (
        <TextInput value={q} onChange={setQ} leading={SearchIcon} placeholder={t("sx.k31kind.search")} aria-label={t("sx.k31kind.search")} aiId={`${aiBase}.search`} size="sm" />
      ) : null}
      <div className="sx-rk-list" role="radiogroup" id={`${idPrefix}-rules`} aria-invalid={invalid || undefined} aria-describedby={describedBy} aria-label={t("sx.k31kind.which")}>
        {shown.length ? (
          shown.map((r, i) => {
            const ok = pickable(r);
            const on = state.rule === r.value && ok;
            return (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on || (!state.rule && i === 0) ? 0 : -1}
                className="sx-rk-row"
                data-on={on ? "" : undefined}
                disabled={!ok}
                title={ok ? undefined : t("sx.k31kind.noRecord")}
                onClick={() => ok && state.setRule(r.value)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                  e.preventDefault();
                  const list = shown.filter(pickable);
                  const at = list.findIndex((x) => x.value === state.rule);
                  const next = list[(at + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length];
                  if (next) {
                    state.setRule(next.value);
                    (e.currentTarget.parentElement?.querySelector(`[data-rule="${CSS.escape(next.value)}"]`) as HTMLElement | null)?.focus();
                  }
                }}
                data-rule={ok ? r.value : undefined}
                data-ai-id={`${aiBase}.rule.${r.value}`}
              >
                <span className="sx-rk-row__dot" aria-hidden="true" />
                <span className="sx-rk-row__ic" aria-hidden="true">
                  {glyph(ScrollTextIcon, { size: 16 })}
                </span>
                <span className="sx-rk-row__t">
                  <strong>{r.title || t("sx.ui.untitled")}</strong>
                  <span className="sx-rk-row__meta">
                    {r.version ? <span className="sx-rk-chip sx-rk-chip--v">{ok && r.nextVersion ? `v${r.version} → v${r.nextVersion}` : `v${r.version}`}</span> : null}
                    {r.scope ? <span className="sx-rk-chip">{labels.option(r.scope, { ctor: "K31", field: "scope_type" })}</span> : null}
                    <span className="sx-rk-chip" data-tone={r.published ? "ok" : "draft"}>
                      {r.published ? t("sx.k31kind.published") : t("sx.k31kind.draft")}
                    </span>
                    {!ok ? <span className="sx-rk-chip" data-tone="muted">{t("sx.k31kind.noRecord")}</span> : null}
                  </span>
                </span>
              </button>
            );
          })
        ) : (
          <p className="sx-rk-nohit">{t("sx.k31kind.noHit", { q })}</p>
        )}
      </div>
    </div>
  );
}

// What will come out: Rules › (existing rule › v1.0 →) the new one.
function RulePath({ state, rules }: { state: ChoiceState; rules: readonly RuleTwin[] | null }): ReactElement {
  const t = useTranslations("studio");
  const base = state.kind === "version" ? (rules ?? []).find((r) => r.value === state.rule && r.published) : undefined;
  const sep = glyph(ChevronRightIcon, { size: 14, className: "sx-ck-path__sep" });
  return (
    <div className="sx-ck-path" data-kind={state.kind || undefined} aria-live="polite">
      <span className="sx-ck-path__label">{t("sx.k31kind.result")}</span>
      <ol className="sx-ck-path__trail">
        <li className="sx-ck-path__node">{t("sx.k31kind.rules")}</li>
        {state.kind === "version" ? (
          <li className={`sx-ck-path__node${base ? "" : " is-empty"}`}>
            {sep}
            {glyph(ScrollTextIcon, { size: 14 })}
            <span>{base ? `${base.title}${base.version ? ` · v${base.version}` : ""}` : t("sx.k31kind.rulePending")}</span>
          </li>
        ) : null}
        <li className="sx-ck-path__node is-new">
          {sep}
          {glyph(state.kind === "version" ? GitBranchIcon : SparklesIcon, { size: 14 })}
          <span>{state.kind === "version" ? (base?.nextVersion ? t("sx.k31kind.newVersionN", { v: base.nextVersion }) : t("sx.k31kind.newVersion")) : state.kind === "new" ? t("sx.k31kind.newRule") : t("sx.k31kind.newAny")}</span>
        </li>
      </ol>
    </div>
  );
}

function RuleKindFields({ idPrefix, state, aiBase, rules }: { idPrefix: string; state: ChoiceState; aiBase: string; rules: readonly RuleTwin[] | null }): ReactElement {
  const t = useTranslations("studio");
  const options: readonly ChoiceCard[] = [
    { value: "new", title: t("sx.k31kind.new"), description: t("sx.k31kind.newWhat"), icon: SparklesIcon, meta: t("sx.k31kind.newExample") },
    { value: "version", title: t("sx.k31kind.version"), description: t("sx.k31kind.versionWhat"), icon: GitBranchIcon, meta: t("sx.k31kind.versionExample") },
  ];
  const kindErr = state.tried && state.kindMissing ? t("sx.k31kind.kindRequired") : "";
  const ruleErr = state.tried && state.ruleMissing ? t("sx.k31kind.ruleRequired") : "";
  return (
    <FormGrid>
      <Field id={`${idPrefix}-kind`} label={t("sx.k31kind.question")} as="fieldset" required error={kindErr}>
        {(a) => (
          <ChoiceCards
            id={`${idPrefix}-kind`}
            value={state.kind}
            onChange={(v) => state.setKind(v === "version" ? "version" : "new")}
            options={options}
            columns={2}
            required
            invalid={!!kindErr}
            aria-labelledby={a["aria-labelledby"]}
            aria-describedby={a["aria-describedby"]}
            aiId={`${aiBase}.kind`}
          />
        )}
      </Field>
      {state.kind === "version" ? (
        <div className="sx-ck-parent sx-rk">
          <Field id={`${idPrefix}-rule`} label={t("sx.k31kind.which")} as="fieldset" required help={t("sx.k31kind.whichHelp")} error={ruleErr}>
            {(a) => <RuleList state={state} rules={rules} idPrefix={idPrefix} aiBase={aiBase} invalid={!!ruleErr} describedBy={a["aria-describedby"]} />}
          </Field>
          <SxNote tone="warn" role="note">
            {t("sx.warn.K31__reaccept")}
          </SxNote>
        </div>
      ) : state.kind === "new" ? (
        <p className="sx-ck-note">
          {glyph(SparklesIcon, { size: 16 })}
          <span>{t("sx.k31kind.newNote")}</span>
        </p>
      ) : null}
      <RulePath state={state} rules={rules} />
    </FormGrid>
  );
}

// Makes the choice happen: the create form, empty or for the chosen rule.
function useRuleGo(base: string, replace: boolean) {
  const router = useRouter();
  const rules = useRuleList(true);
  const [busy, setBusy] = useState(false);
  const go = async (state: ChoiceState) => {
    if (busy || !state.check()) return;
    setBusy(true);
    (replace ? router.replace : router.push)(ruleKindHref(base, state.kind === "version" ? "version" : "new", state.rule));
  };
  return { rules, busy, go };
}

function RuleKindDialog({ base, label, aiId, onClose }: { base: string; label: string; aiId: string; onClose: () => void }): ReactElement {
  const t = useTranslations("studio");
  const formId = `${useId()}-form`;
  const modalAi = `${aiId}-modal`;
  const state = useRuleChoice();
  const run = useRuleGo(base, false);
  function submit(e: FormEvent) {
    e.preventDefault();
    void run.go(state);
  }
  return (
    <SxDialog
      open
      onClose={onClose}
      title={label}
      description={t("sx.k31kind.lead")}
      busy={run.busy}
      dirty={!!state.kind}
      aiId={modalAi}
      footer={
        <>
          <SxButton variant="secondary" onClick={onClose} disabled={run.busy} aiId={`${modalAi}.cancel`}>
            {t("sx.ui.cancel")}
          </SxButton>
          <SxButton type="submit" form={formId} variant="primary" icon={state.kind === "version" ? GitBranchIcon : undefined} iconEnd={state.kind === "version" ? undefined : ArrowRightIcon} busy={run.busy} aiId={`${modalAi}.confirm`}>
            {state.kind === "version" ? t("sx.k31kind.makeVersion") : t("sx.k31kind.continue")}
          </SxButton>
        </>
      }
    >
      <form id={formId} className="sx-dlg__form sx-ck" onSubmit={submit} noValidate>
        <RuleKindFields idPrefix="sx-rk-dlg" state={state} aiBase={modalAi} rules={run.rules} />
      </form>
    </SxDialog>
  );
}

export function AddRuleButton({ base, variant = "primary", size = "md", label, disabledReason, aiId }: { base: string; variant?: SxButtonVariant; size?: "md" | "sm"; label: string; disabledReason?: string; aiId: string }): ReactElement {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const why = String(disabledReason ?? "").trim();
  return (
    <>
      <SxButton
        variant={variant}
        size={size}
        icon={PlusIcon}
        // Opens a choice (what kind to add), not an empty form straight away.
        iconEnd={why ? undefined : ChevronDownIcon}
        aria-expanded={why ? undefined : open}
        aria-disabled={why ? true : undefined}
        aria-describedby={why ? `${uid}-why` : undefined}
        aria-haspopup={why ? undefined : "dialog"}
        onClick={() => {
          if (!why) setOpen(true);
        }}
        aiId={aiId}
        aiLabel={label}
      >
        {label}
      </SxButton>
      {why ? (
        <span id={`${uid}-why`} className="sx-vh">
          {why}
        </span>
      ) : null}
      {open && !why ? <RuleKindDialog base={base} label={label} aiId={aiId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

// A new rule opened by a plain link (home, guides, search) asks the same
// question on the page before the form appears.
export function RuleKindGate({ base, listHref, listLabel }: { base: string; listHref: string; listLabel: string }): ReactElement {
  const t = useTranslations("studio");
  const state = useRuleChoice();
  const run = useRuleGo(base, true);
  const ai = "admin.studio.editor.rule-kind";
  function submit(e: FormEvent) {
    e.preventDefault();
    void run.go(state);
  }
  return (
    <SxPage title={t("sx.k31kind.add")} section="home" crumbs={[{ label: listLabel, href: listHref }, { label: t("sx.k31kind.add") }]} aiId={ai}>
      <form className="sx-ck sx-ck--page" onSubmit={submit} noValidate>
        <p className="sx-ck__lead">{t("sx.k31kind.lead")}</p>
        <RuleKindFields idPrefix="sx-rk-page" state={state} aiBase={ai} rules={run.rules} />
        <div className="sx-ck__acts">
          <SxLinkButton variant="secondary" href={listHref} aiId={`${ai}.cancel`}>
            {t("sx.ui.cancel")}
          </SxLinkButton>
          <SxButton type="submit" variant="primary" icon={state.kind === "version" ? GitBranchIcon : undefined} iconEnd={state.kind === "version" ? undefined : ArrowRightIcon} busy={run.busy} aiId={`${ai}.confirm`}>
            {state.kind === "version" ? t("sx.k31kind.makeVersion") : t("sx.k31kind.continue")}
          </SxButton>
        </div>
      </form>
    </SxPage>
  );
}

// Shown above a new rule's form: what is being made, and a way back to the
// choice. A new version names the rule it continues and the number the
// backend will give it.
export function RuleKindBar({ base, fromId = "" }: { base: string; fromId?: string }): ReactElement {
  const t = useTranslations("studio");
  const rules = useRuleList(!!fromId);
  const hit = fromId ? (rules ?? []).find((r) => r.value === fromId && r.published) : undefined;
  const from = fromId ? { title: hit?.title ?? "…", version: hit?.version ?? "", nextVersion: hit?.nextVersion ?? "" } : null;
  return (
    <p className="sx-ck-bar" data-kind={from ? "version" : "new"}>
      <span className="sx-ck-bar__icon">{glyph(from ? GitBranchIcon : SparklesIcon, { size: 16 })}</span>
      <span className="sx-ck-bar__text">
        <strong>{from ? t("sx.k31kind.versionBarTitle", { name: from.title }) : t("sx.k31kind.new")}</strong>
        <span>{from ? (from.nextVersion ? t("sx.k31kind.versionBar", { from: from.version || "—", to: from.nextVersion }) : t("sx.k31kind.versionBarNoN")) : t("sx.k31kind.newBar")}</span>
      </span>
      <Link href={base} className="sx-ck-bar__change" data-ai-id="admin.studio.editor.rule-kind.change" data-ai-type="link">
        {t("sx.k31kind.change")}
      </Link>
    </p>
  );
}

// A new version's form starts from the published rule it continues, as the
// backend lists it (/studio/reference/service-rules): its text, audience,
// scope and options, its key, and the next version number the backend gives
// it — shown, never worked out here (the backend sets it again on save).
const RULE_FIELDS = ["title", "body", "audience", "scope_type", "seller_selectable"] as const;

function versionStartOf(value: string, raw: Record<string, unknown>): SxPayload {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
  const out: SxPayload = { creation_mode: "new_version", existing_rule_id: value };
  for (const k of RULE_FIELDS) if (raw[k] !== undefined && raw[k] !== null && raw[k] !== "") out[k] = raw[k];
  const scope = str(raw.scope_type);
  if (scope === "service" && str(raw.service_id || raw.scope_id)) out.service_id = str(raw.service_id || raw.scope_id);
  if (scope === "category" && str(raw.category_id || raw.scope_id)) out.category_id = str(raw.category_id || raw.scope_id);
  if (str(raw.rule_key)) out.rule_key = str(raw.rule_key);
  if (str(raw.next_version)) out.version = str(raw.next_version);
  return out;
}

export function RuleVersionStart({ from, gate, render }: { from: string; gate: string; render: (start: SxPayload) => ReactElement }): ReactElement {
  const t = useTranslations("studio");
  const [start, setStart] = useState<SxPayload | "missing" | "failed" | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    let alive = true;
    getStudioReference(RULE_SOURCE, "", 100).then(
      (items) => {
        const hit = items.find((x) => x.value === from || x.id === from);
        if (alive) setStart(hit ? versionStartOf(hit.value || hit.id, hit.raw) : "missing");
      },
      (e: unknown) => {
        logApiError("studio.sx.k31kind.from", e);
        if (alive) setStart("failed");
      },
    );
    return () => {
      alive = false;
    };
  }, [from, round]);
  if (start && typeof start === "object") return render(start);
  const ai = "admin.studio.editor.rule-version";
  return (
    <SxPage title={t("sx.k31kind.version")} section="home" crumbs={[{ label: t("sx.k31kind.rules"), href: "/admin/studio/c/K31" }, { label: t("sx.k31kind.version") }]} aiId={ai}>
      {start === null ? (
        <div className="sx-rk-list" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className="sx-rk-row sx-rk-row--ghost" />
          ))}
        </div>
      ) : (
        <div className="sx-ck sx-ck--page">
          <SxNote tone="warn" role="alert">
            {t(start === "missing" ? "sx.k31kind.fromGone" : "sx.k31kind.fromFailed")}
          </SxNote>
          <div className="sx-ck__acts">
            {start === "failed" ? (
              <SxButton variant="secondary" onClick={() => (setStart(null), setRound((n) => n + 1))} aiId={`${ai}.retry`}>
                {t("sx.k31kind.retry")}
              </SxButton>
            ) : null}
            <SxLinkButton variant="primary" href={gate} aiId={`${ai}.pick`}>
              {t("sx.k31kind.pickAgain")}
            </SxLinkButton>
          </div>
        </div>
      )}
    </SxPage>
  );
}
