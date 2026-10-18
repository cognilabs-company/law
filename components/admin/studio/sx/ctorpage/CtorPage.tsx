"use client";

import "../sx-core.css";
import "./sx-ctorpage.css";
import { useId, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useStudioAccess, useStudioRegistry, type StudioConstructor, type StudioGroup, type StudioRecordSource } from "@/lib/services/studio";
import { SxButton, SxLinkButton } from "../Button";
import { SearchIcon, PlusIcon } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxGuideButton } from "../layout/Guide";
import { SxNote } from "../layout/Note";
import { SxPage } from "../layout/Page";
import type { SxCrumb } from "../types";
import { useStudioLabels, type StudioLabels, type SxTranslate } from "../useStudioLabels";
import { groupOfCode } from "../home/groupModel";
import { journeyTypeOfCode } from "../shared/journeyLinks";
import { StartJourneyButton } from "../shared/StartJourney";
import { CategoryTreeTable } from "./CategoryTreeTable";
import { RecordTable } from "./RecordTable";
import { useCtorRecords } from "./useCtorRecords";
import { variantOf } from "./variants";

export type CtorQuery = { q: string; status: string; source: "" | StudioRecordSource; placement: string; page: number };

export type CtorPageProps = { code: string; initial: CtorQuery };

const enc = encodeURIComponent;

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

export function ctorCrumbs(code: string, ctor: StudioConstructor | null, groups: readonly StudioGroup[], items: readonly StudioConstructor[], labels: Pick<StudioLabels, "groupName">): SxCrumb[] {
  const key = ctor?.navigation?.groupKey || groupOfCode(code, groups, items);
  if (!key) return [];
  const group = groups.find((g) => g.key === key);
  return [{ label: labels.groupName(key, group?.title || ctor?.navigation?.groupTitle || ""), href: `/admin/studio/g/${enc(key)}` }];
}

type CreateProps = { code: string; ctor: StudioConstructor | null; createUrl: string; reason: string; aiId: string };

function CreateControl({ code, ctor, createUrl, reason, aiId }: CreateProps): ReactElement {
  const t = useTranslations("studio");
  const whyId = `${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-why`;
  const type = journeyTypeOfCode(code);
  const label = type === "package" ? t("sx.journeyRun.newPackage") : type === "service" ? t("sx.journeyRun.newService") : t("sx.cpage.create");
  if (type) return <StartJourneyButton type={type} variant="primary" label={label} aiId={aiId} disabledReason={reason || undefined} />;
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

type FrameProps = {
  code: string;
  ctor: StudioConstructor | null;
  canEdit: boolean;
  createUrl: string;
  children: (empty: ReactNode) => ReactNode;
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
  const blocked = blockedInfo(ctor, labels, reg.items, t);
  const crumbs = ctorCrumbs(code, ctor, reg.groups, reg.items, labels);
  const header = canEdit ? <CreateControl code={code} ctor={ctor} createUrl={createUrl} reason={blocked.reason} aiId="admin.studio.list.create" /> : null;
  const empty = canEdit ? <CreateControl code={code} ctor={ctor} createUrl={createUrl} reason={blocked.reason} aiId="admin.studio.list.empty.create" /> : null;
  const first = blocked.codes[0] ?? "";
  return (
    <SxPage
      title={labels.ctorName(code, ctor?.title)}
      section="home"
      crumbs={crumbs}
      lead={
        <>
          {labels.ctorWhat(code)} <SxGuideButton code={code} aiId="admin.studio.list.guide" />
        </>
      }
      actions={header}
      aiId="admin.studio.list"
    >
      {blocked.reason ? (
        <SxNote
          tone="warn"
          className="sx-cp-note"
          action={
            first ? (
              <SxLinkButton variant="secondary" size="sm" href={`/admin/studio/c/${enc(first)}`} aiId="admin.studio.list.goto-missing">
                {t("sx.cpage.goTo", { name: labels.ctorName(first, findCtor(reg.items, first)?.title) })}
              </SxLinkButton>
            ) : undefined
          }
        >
          {t("sx.guide.blocked", { list: blocked.list || "—" })}
        </SxNote>
      ) : null}
      {children(empty)}
    </SxPage>
  );
}

function RecordsScreen({ code, ctor, initial }: { code: string; ctor: StudioConstructor | null; initial: CtorQuery }): ReactElement {
  const acc = useStudioAccess();
  const variant = variantOf(code);
  const st = useCtorRecords(code, initial, { all: variant.kind === "k12promo" });
  return (
    <CtorFrame code={code} ctor={ctor} canEdit={acc.canEdit} createUrl={st.data?.createUrl ?? ""}>
      {(empty) => <RecordTable code={code} ctor={ctor} st={st} variant={variant} canEdit={acc.canEdit} canArchive={acc.canArchive} createControl={empty} />}
    </CtorFrame>
  );
}

function TreeScreen({ code, ctor, initial }: { code: string; ctor: StudioConstructor | null; initial: CtorQuery }): ReactElement {
  const acc = useStudioAccess();
  return (
    <CtorFrame code={code} ctor={ctor} canEdit={acc.canEdit} createUrl="">
      {(empty) => <CategoryTreeTable ctor={ctor} canEdit={acc.canEdit} canArchive={acc.canArchive} initial={initial} createControl={empty} />}
    </CtorFrame>
  );
}

export function CtorPage({ code, initial }: CtorPageProps): ReactElement {
  const t = useTranslations("studio");
  const reg = useStudioRegistry();
  const ctor = findCtor(reg.items, code);
  const realCode = ctor?.code ?? code;
  const missing = reg.avail === "on" && reg.items.length > 0 && !ctor;
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
