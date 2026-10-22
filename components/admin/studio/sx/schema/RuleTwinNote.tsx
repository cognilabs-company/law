"use client";

import "./sx-rule-twin.css";
import { createContext, useContext, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { CopyCheck, ExternalLink, ScrollText } from "lucide-react";
import { SxButton, SxLinkButton } from "../Button";
import { pendingReferenceNow, usePendingReferences } from "../form/useReferenceOptions";
import { CheckIcon } from "../icons";
import { useStudioLabels } from "../useStudioLabels";
import { reportedDuplicate, twinsOf, useRuleList, type RuleTwin } from "./ruleDuplicates";

// Under a rule's name, when that name is already taken: the rule(s) it
// clashes with and a way to use one instead of creating a copy. In the
// drawer opened from a service's rule picker, "pick" selects the existing
// rule there and closes the drawer.

export type RulePick = (value: string, title: string) => void;
export const RulePickContext = createContext<RulePick | null>(null);

export type RuleTwinAction = { label: string; run: (twin: RuleTwin) => void };

export function RuleTwinNote({ title, self, action, aiId }: { title: unknown; self: readonly string[]; action?: RuleTwinAction; aiId: string }): ReactElement | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const pick = useContext(RulePickContext);
  const rules = useRuleList(true);
  usePendingReferences();
  const twins = twinsOf(rules, title, self);
  const rep = reportedDuplicate(title);
  // The rule a 409 named: from the loaded list, its draft, or by id alone.
  if (rep && !twins.some((x) => x.value === rep.id || x.objectId === rep.id)) {
    const known = rules?.find((x) => x.value === rep.id || x.objectId === rep.id);
    if (known) twins.push(known);
    else {
      const draft = rep.title ? null : pendingReferenceNow(rep.id);
      twins.push({ value: rep.id, objectId: draft ? rep.id : "", title: rep.title || draft?.label || t("sx.rtw.existing"), version: "", status: "", scope: "", published: false });
    }
  }
  if (!twins.length) return null;
  const act: RuleTwinAction | undefined = pick ? { label: t("sx.rtw.pick"), run: (x) => pick(x.value, x.title) } : action;
  return (
    <div className="sx-rtw" role="status" aria-live="polite" data-ai-id={aiId} data-ai-type="section">
      <p className="sx-rtw__head">
        <span className="sx-rtw__badge" aria-hidden="true">
          <CopyCheck size={16} strokeWidth={2} />
        </span>
        <span className="sx-rtw__text">
          <strong>{t("sx.rtw.title")}</strong>
          <span>{t("sx.rtw.lead")}</span>
        </span>
      </p>
      <ul className="sx-rtw__list">
        {twins.map((x) => {
          const chips = [x.version ? t("sx.rtw.version", { v: x.version }) : "", x.status ? labels.status(x.status) : "", x.scope ? labels.option(x.scope, { ctor: "K31", field: "scope_type" }) : ""].filter(Boolean);
          return (
            <li key={x.value} className="sx-rtw__row" data-published={x.published ? "" : undefined}>
              <span className="sx-rtw__icon" aria-hidden="true">
                <ScrollText size={16} strokeWidth={2} />
              </span>
              <span className="sx-rtw__name">
                <strong>{x.title}</strong>
                {chips.length ? (
                  <span className="sx-rtw__chips">
                    {chips.map((c) => (
                      <span key={c} className="sx-rtw__chip">
                        {c}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
              <span className="sx-rtw__acts">
                {act ? (
                  <SxButton variant="primary" size="sm" icon={CheckIcon} onClick={() => act.run(x)} aiId={`${aiId}.use`} aiLabel={act.label}>
                    {act.label}
                  </SxButton>
                ) : null}
                {x.objectId ? (
                  <SxLinkButton variant="ghost" size="sm" iconEnd={ExternalLink} href={`/admin/studio/o/${encodeURIComponent(x.objectId)}`} target="_blank" aiId={`${aiId}.open`}>
                    {t("sx.rtw.open")}
                  </SxLinkButton>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
