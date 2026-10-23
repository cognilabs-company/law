"use client";

import "../sx-core.css";
import "../sx-tones.css";
import "./sx-ctorpage.css";
import { useId, useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CircleCheckBigIcon, CircleHelpIcon, CircleXIcon, FootprintsIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { aiId as aiIdOf } from "@/lib/ai/ids";
import { useStudioAccess, useStudioRegistry, type StudioConstructor, type StudioGroup, type StudioRecordSource } from "@/lib/services/studio";
import { approvalsHref } from "../approvals/urlState";
import { SxButton, SxLinkButton } from "../Button";
import { BadgeCheckIcon, ChevronRightIcon, SearchIcon, ShieldCheckIcon, PlusIcon, SparklesIcon, ctorGlyph, glyph, groupIcon } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxGuide } from "../layout/Guide";
import { SxNote } from "../layout/Note";
import { SxPage } from "../layout/Page";
import { groupHue, type SxHue } from "../tones";
import type { SxCrumb } from "../types";
import { useStudioLabels, type StudioLabels, type SxTranslate } from "../useStudioLabels";
import { useCtorVisit } from "../home/ctorUsage";
import { groupOfCode } from "../home/groupModel";
import { journeyTypeOfCode } from "../shared/journeyLinks";
import { AddCategoryButton } from "../shared/CategoryKind";
import { AddRuleButton } from "../shared/RuleKind";
import { StartJourneyButton } from "../shared/StartJourney";
import { CategoryTreeTable } from "./CategoryTreeTable";
import { RecordTable } from "./RecordTable";
import { useCtorRecords } from "./useCtorRecords";
import type { CtorSort, CtorView } from "./urlState";
import { variantOf } from "./variants";

export type CtorQuery = { q: string; status: string; source: "" | StudioRecordSource; placement: string; page: number; view?: CtorView; sort?: CtorSort };

export type CtorPageProps = { code: string; initial: CtorQuery };

const enc = encodeURIComponent;
const PREREQ_MAX = 3;
const HERO_ID = "admin.studio.list";

export function findCtor(items: readonly StudioConstructor[], code: string): StudioConstructor | null {
  return items.find((c) => c.code === code) ?? items.find((c) => c.code.toUpperCase() === code.toUpperCase()) ?? null;
}

export function blockedCodes(ctor: StudioConstructor | null): string[] | null {
  if (!ctor) return null;
  if (ctor.missingRequired.length) return [...ctor.missingRequired];
  if (ctor.availability === "blocked") return [...(ctor.navigation?.requiredBefore ?? [])];
  return null;
}

export function createHrefOf(code: string, ctor: StudioConstructor | null, createUrl: string): string {
  const fc = ctor?.operations.formContextEndpoint ?? "";
  const ctx = createUrl || (fc ? `${fc}?mode=create` : "");
  return `/admin/studio/o/new?new=${enc(code)}${ctx ? `&ctx=${enc(ctx)}` : ""}`;
}

export function groupKeyOf(code: string, ctor: StudioConstructor | null, groups: readonly StudioGroup[], items: readonly StudioConstructor[]): string {
  return ctor?.navigation?.groupKey || groupOfCode(code, groups, items);
}

export function ctorCrumbs(code: string, ctor: StudioConstructor | null, groups: readonly StudioGroup[], items: readonly StudioConstructor[], labels: Pick<StudioLabels, "groupName">): SxCrumb[] {
  const key = groupKeyOf(code, ctor, groups, items);
  if (!key) return [];
  const group = groups.find((g) => g.key === key);
  return [{ label: labels.groupName(key, group?.title || ctor?.navigation?.groupTitle || ""), href: `/admin/studio/g/${enc(key)}` }];
}

export function stepOf(code: string, ctor: StudioConstructor | null, group: StudioGroup | undefined): { n: number; m: number } | null {
  const nav = ctor?.navigation;
  if (nav && nav.step > 0 && nav.steps >= nav.step) return { n: nav.step, m: nav.steps };
  const at = group ? group.codes.findIndex((c) => c.toUpperCase() === code.toUpperCase()) : -1;
  return group && at >= 0 ? { n: at + 1, m: group.codes.length } : null;
}

type CreateProps = { code: string; ctor: StudioConstructor | null; createUrl: string; reason: string; aiId: string };

function CreateControl({ code, ctor, createUrl, reason, aiId }: CreateProps): ReactElement {
  const t = useTranslations("studio");
  const whyId = `${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-why`;
  const type = journeyTypeOfCode(code);
  const label = type === "package" ? t("sx.journeyRun.newPackage") : type === "service" ? t("sx.journeyRun.newService") : t("sx.cpage.create");
  if (type) return <StartJourneyButton type={type} variant="primary" label={label} aiId={aiId} disabledReason={reason || undefined} />;
  if (code.toUpperCase() === "K31") return <AddRuleButton base={createHrefOf(code, ctor, createUrl)} label={t("sx.k31kind.add")} aiId={aiId} disabledReason={reason || undefined} />;
  if (code.toUpperCase() === "K01") return <AddCategoryButton base={createHrefOf(code, ctor, createUrl)} label={t("sx.k01kind.add")} aiId={aiId} disabledReason={reason || undefined} />;
  if (!reason) {
    return (
      <SxLinkButton variant="primary" icon={PlusIcon} href={createHrefOf(code, ctor, createUrl)} aiId={aiId}>
        {label}
      </SxLinkButton>
    );
  }
  return (
    <>
      <SxButton variant="primary" icon={PlusIcon} aria-disabled={true} aria-describedby={whyId} aiId={aiId} aiLabel={label}>
        {label}
      </SxButton>
      <span id={whyId} className="sx-vh">
        {reason}
      </span>
    </>
  );
}

function GuidePill({ code }: { code: string }): ReactElement {
  const t = useTranslations("studio");
  const [open, setOpen] = useState(false);
  const label = t("sx.guide.title");
  return (
    <>
      <button
        type="button"
        className="sx-cp-guide"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        data-ai-id={aiIdOf(HERO_ID, "guide")}
        data-ai-type="button"
        data-ai-label={label}
      >
        {glyph(CircleHelpIcon, { size: 16 })}
        <span>{label}</span>
      </button>
      <SxGuide code={code} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function CtorChip({ code, items, labels, t }: { code: string; items: readonly StudioConstructor[]; labels: StudioLabels; t: SxTranslate }): ReactElement {
  const dep = findCtor(items, code);
  const name = labels.ctorName(code, dep?.title);
  const ready = !!dep?.completed;
  return (
    <Link
      href={`/admin/studio/c/${enc(dep?.code ?? code)}`}
      className="sx-cp-chip sx-cp-chip--dep"
      data-ready={ready ? "" : undefined}
      aria-label={t(ready ? "sx.cp2.hero.ready" : "sx.cp2.hero.notReady", { name })}
      data-ai-id={aiIdOf(HERO_ID, "dep", code)}
      data-ai-type="link"
      data-ai-label={name}
    >
      {ctorGlyph(code, dep?.navigation?.groupKey, { size: 14 })}
      <span className="sx-cp-chip__text">{name}</span>
      {glyph(ready ? CircleCheckBigIcon : CircleXIcon, { size: 14, className: "sx-cp-chip__state" })}
    </Link>
  );
}

type HeroLeadProps = { code: string; ctor: StudioConstructor | null; groupKey: string; group: StudioGroup | undefined; hue: SxHue };

function HeroLead({ code, ctor, groupKey, group, hue }: HeroLeadProps): ReactElement {
  const t = useTranslations("studio") as SxTranslate;
  const labels = useStudioLabels();
  const reg = useStudioRegistry();
  const step = stepOf(code, ctor, group);
  const deps = ctor?.navigation?.requiredBefore ?? [];
  const groupName = groupKey ? labels.groupName(groupKey, group?.title || ctor?.navigation?.groupTitle || "") : "";
  return (
    <div className="sx-cp-hero__lead">
      <span className="sx-cp-hero__glow" data-hue={hue} aria-hidden="true" />
      <p className="sx-cp-hero__what">{labels.ctorWhat(code)}</p>
      <ul className="sx-cp-chips" aria-label={t("sx.cp2.hero.facts")}>
        <li>
          <GuidePill code={code} />
        </li>
        {groupKey ? (
          <li>
            <Link
              href={`/admin/studio/g/${enc(groupKey)}`}
              className="sx-cp-chip sx-cp-chip--group"
              data-hue={hue}
              aria-label={t("sx.cp2.hero.group", { name: groupName })}
              data-ai-id={aiIdOf(HERO_ID, "group")}
              data-ai-type="link"
              data-ai-label={groupName}
            >
              {glyph(groupIcon(groupKey), { size: 14 })}
              <span className="sx-cp-chip__text">{groupName}</span>
            </Link>
          </li>
        ) : null}
        {step ? (
          <li className="sx-cp-chip">
            {glyph(FootprintsIcon, { size: 14 })}
            <span className="sx-cp-chip__text">{t("sx.cp2.hero.step", { n: step.n, m: step.m })}</span>
          </li>
        ) : null}
        {ctor?.approvalRequired ? (
          <li className="sx-cp-chip sx-cp-chip--approval">
            {glyph(ShieldCheckIcon, { size: 14 })}
            <span className="sx-cp-chip__text">{t("sx.cp2.hero.approval")}</span>
          </li>
        ) : null}
        {deps.length ? (
          <li className="sx-cp-deps">
            <span className="sx-cp-deps__label">{t("sx.cp2.hero.before")}</span>
            {deps.slice(0, PREREQ_MAX).map((c) => (
              <CtorChip key={c} code={c} items={reg.items} labels={labels} t={t} />
            ))}
            {deps.length > PREREQ_MAX ? <span className="sx-cp-chip sx-cp-chip--more">{t("sx.cp2.hero.more", { n: deps.length - PREREQ_MAX })}</span> : null}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

type FrameProps = {
  code: string;
  ctor: StudioConstructor | null;
  canEdit: boolean;
  createUrl: string;
  children: (empty: ReactNode, scope: { hue: SxHue; group: string }) => ReactNode;
};

function blockedInfo(ctor: StudioConstructor | null, labels: StudioLabels, items: readonly StudioConstructor[], t: SxTranslate): { codes: string[]; list: string; reason: string } {
  const codes = blockedCodes(ctor);
  if (!codes) return { codes: [], list: "", reason: "" };
  const list = labels.list(
    codes.map((c) => labels.ctorName(c, findCtor(items, c)?.title)),
    5,
  );
  return { codes, list, reason: t("sx.cpage.blockedReason", { list: list || "—" }) };
}

function CtorFrame({ code, ctor, canEdit, createUrl, children }: FrameProps): ReactElement {
  const t = useTranslations("studio") as SxTranslate;
  const labels = useStudioLabels();
  const reg = useStudioRegistry();
  const acc = useStudioAccess();
  const blocked = blockedInfo(ctor, labels, reg.items, t);
  const crumbs = ctorCrumbs(code, ctor, reg.groups, reg.items, labels);
  const groupKey = groupKeyOf(code, ctor, reg.groups, reg.items);
  const group = reg.groups.find((g) => g.key === groupKey);
  const hue = groupHue(groupKey, group?.order ?? ctor?.navigation?.groupOrder ?? 1);
  const empty = canEdit ? <CreateControl code={code} ctor={ctor} createUrl={createUrl} reason={blocked.reason} aiId="admin.studio.list.empty.create" /> : null;
  const actions =
    canEdit || acc.canReview ? (
      <>
        {acc.canReview ? (
          <SxLinkButton variant="secondary" icon={BadgeCheckIcon} href={approvalsHref({ ctor: ctor?.code ?? code })} aiId={aiIdOf(HERO_ID, "approvals")}>
            {t("sx.nav.approvals")}
          </SxLinkButton>
        ) : null}
        {canEdit ? (
          <SxLinkButton variant="secondary" icon={SparklesIcon} href={`/admin/studio/ai?ctor=${encodeURIComponent(code)}`} aiId="admin.studio.list.ai">
            {t("sx.agent.fromCtor")}
          </SxLinkButton>
        ) : null}
        {canEdit ? <CreateControl code={code} ctor={ctor} createUrl={createUrl} reason={blocked.reason} aiId="admin.studio.list.create" /> : null}
      </>
    ) : null;
  const first = blocked.codes[0] ?? "";
  return (
    <SxPage
      title={labels.ctorName(code, ctor?.title)}
      section="home"
      crumbs={crumbs}
      icon={
        <span className="sx-cp-squircle" data-size="xl" data-hue={hue}>
          {ctorGlyph(code, groupKey, { size: 30 })}
        </span>
      }
      lead={<HeroLead code={code} ctor={ctor} groupKey={groupKey} group={group} hue={hue} />}
      actions={actions}
      aiId={HERO_ID}
    >
      {blocked.reason ? (
        <SxNote
          tone="warn"
          title={t("sx.cp2.blocked.title")}
          className="sx-cp-note sx-cp-blocked"
          action={
            first ? (
              <SxLinkButton variant="secondary" size="sm" iconEnd={ChevronRightIcon} href={`/admin/studio/c/${enc(first)}`} aiId="admin.studio.list.goto-missing">
                {t("sx.cpage.goTo", { name: labels.ctorName(first, findCtor(reg.items, first)?.title) })}
              </SxLinkButton>
            ) : undefined
          }
        >
          <p className="sx-cp-blocked__text">{t("sx.cp2.blocked.text")}</p>
          {blocked.codes.length ? (
            <ul className="sx-cp-blocked__list">
              {blocked.codes.map((c) => (
                <li key={c}>
                  <CtorChip code={c} items={reg.items} labels={labels} t={t} />
                </li>
              ))}
            </ul>
          ) : null}
        </SxNote>
      ) : null}
      {children(empty, { hue, group: groupKey })}
    </SxPage>
  );
}

function RecordsScreen({ code, ctor, initial }: { code: string; ctor: StudioConstructor | null; initial: CtorQuery }): ReactElement {
  const acc = useStudioAccess();
  const variant = variantOf(code);
  const st = useCtorRecords(code, initial, { all: variant.kind === "k12promo" });
  return (
    <CtorFrame code={code} ctor={ctor} canEdit={acc.canEdit} createUrl={st.data?.createUrl ?? ""}>
      {(empty, scope) => (
        <RecordTable code={code} ctor={ctor} st={st} variant={variant} canEdit={acc.canEdit} canArchive={acc.canArchive} createControl={empty} hue={scope.hue} group={scope.group} />
      )}
    </CtorFrame>
  );
}

function TreeScreen({ code, ctor, initial }: { code: string; ctor: StudioConstructor | null; initial: CtorQuery }): ReactElement {
  const acc = useStudioAccess();
  return (
    <CtorFrame code={code} ctor={ctor} canEdit={acc.canEdit} createUrl="">
      {(empty, scope) => <CategoryTreeTable ctor={ctor} canEdit={acc.canEdit} canArchive={acc.canArchive} initial={initial} createControl={empty} hue={scope.hue} group={scope.group} />}
    </CtorFrame>
  );
}

export function CtorPage({ code, initial }: CtorPageProps): ReactElement {
  const t = useTranslations("studio");
  const reg = useStudioRegistry();
  const ctor = findCtor(reg.items, code);
  const realCode = ctor?.code ?? code;
  const missing = reg.avail === "on" && reg.items.length > 0 && !ctor;
  useCtorVisit(ctor ? realCode : "", "records");
  if (missing) {
    return (
      <SxPage title={t("sx.editor.unknownTitle")} section="home" crumbs={[]} aiId="admin.studio.list">
        <SxEmpty
          icon={SearchIcon}
          title={t("sx.editor.unknownTitle")}
          text={t("sx.editor.unknownText")}
          action={
            <SxLinkButton variant="secondary" href="/admin/studio" aiId="admin.studio.list.missing.back">
              {t("sx.editor.toHome")}
            </SxLinkButton>
          }
        />
      </SxPage>
    );
  }
  if (realCode === "K01") return <TreeScreen key={realCode} code={realCode} ctor={ctor} initial={initial} />;
  return <RecordsScreen key={realCode} code={realCode} ctor={ctor} initial={initial} />;
}
